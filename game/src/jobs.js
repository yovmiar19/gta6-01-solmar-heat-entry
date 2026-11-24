// Step 13 — side jobs, the phone's work board. Seven paid jobs built
// on what the game can already do: drive to a spot (or two), hit the
// practice dummy, steal a ride, lose the heat, take a boat out to sea.
// One job at a time, taken from the phone's JOBS tab; a story mission
// can still run alongside. A finished job pays cash, warms up its home
// district and banks RP. Jobs are repeatable — the bay always needs
// another driver — but the board marks each one DONE once it has paid.
//
// A job is { id, name, desc, reward, district, kind, ... }:
//   drive — reach each stage target in turn (on foot or in a ride)
//   shoot — land `hits` rounds on the practice dummy since taking the job
//   steal — get behind the wheel of a civilian ride
//   heat  — get wanted once, then lose the police
//   boat  — drive a boat into the target spot at sea

const JOBS = [
  {
    id: 'taxi',
    name: 'Night Taxi',
    desc: 'Pick up a fare on the avenue, drop them at Market Row. No small talk, no questions.',
    reward: 250,
    district: 'lantawa',
    districtName: 'Lantawa Centre',
    kind: 'drive',
    stages: [{ x: 0, z: -15 }, { x: -20, z: 30 }],
    stageText: ['Pick up the fare on the avenue', 'Drop the fare at Market Row'],
  },
  {
    id: 'parcel',
    name: 'Parcel Run',
    desc: 'A package for the west end. Drive it there, no questions asked, no stops.',
    reward: 180,
    district: 'market',
    districtName: 'Market Row',
    kind: 'drive',
    stages: [{ x: -45, z: 0 }],
    stageText: ['Deliver the parcel to the west end'],
  },
  {
    id: 'range',
    name: 'Range Contract',
    desc: 'The range master wants proof: three rounds on the practice dummy. The dummy is at the avenue marker.',
    reward: 220,
    district: 'banyan',
    districtName: 'Banyan Green',
    kind: 'shoot',
    hits: 3,
    target: { x: 0, z: 2 },
  },
  {
    id: 'getaway',
    name: 'Getaway Driver',
    desc: 'Get the KPD on your tail, then lose them. Clean — no witnesses, no scratches.',
    reward: 400,
    district: 'oldpasaru',
    districtName: 'Old Pasaru',
    kind: 'heat',
  },
  {
    id: 'boat',
    name: 'Boat Delivery',
    desc: 'Take a boat out to the buoy at sea. Mind the swell — and the KPD does not patrol the water.',
    reward: 500,
    district: 'kumala',
    districtName: 'Kumala Strand',
    kind: 'boat',
    target: { x: 20, z: 110 },
  },
  {
    id: 'chop',
    name: 'Chop Shop Order',
    desc: 'The shop needs a ride — any civilian ride. Bring one in and the cash is yours.',
    reward: 300,
    district: 'wanaru',
    districtName: 'Wanaru Terraces',
    kind: 'steal',
  },
  {
    id: 'lifeguard',
    name: 'Beach Lifeguard',
    desc: 'A swimmer is in trouble off Kumala Strand. Get to the beach — fast.',
    reward: 350,
    district: 'kumala',
    districtName: 'Kumala Strand',
    kind: 'drive',
    stages: [{ x: 0, z: 70 }],
    stageText: ['Reach the beach at Kumala Strand'],
  },
];

const TARGET_RANGE = 4; // how close counts as reaching a target
const MARKER_COLOR = 0x35e0ff; // cyan: a job target, never the mission's gold

/** A glowing marker: a tall column of light and a ring on the ground. */
function makeMarker(scene, color) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 14, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  column.position.y = 7;
  // A marker is light, not a wall: a round must fly straight through it,
  // or the range job's marker (which stands on the dummy) would eat
  // every shot meant for the dummy.
  column.raycast = () => {};
  group.add(column);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.3, 2.0, 24),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.raycast = () => {};
  group.add(ring);
  group.visible = false;
  scene.add(group);
  return { group, ring };
}

/**
 * Build the job board. `scene` is the city the marker stands in.
 * `state` each update is { x, z, driving, vehicle, wanted, dummyHits,
 * vehicles }: where Raka is, what he is driving, the heat, how many
 * rounds have hit the dummy, and the civilian rides. The game loop
 * reads `active`, `target` and `takePayout()` for the HUD and the bank.
 */
export function createJobs(scene) {
  const marker = makeMarker(scene, MARKER_COLOR);

  let active = null; // the job in progress, or null
  let stageIndex = 0; // which stage of a drive job Raka is on
  let armed = false; // the getaway job: Raka has been wanted at least once
  let baselineHits = null; // dummy hits when the range job started
  let completedCount = 0; // jobs finished in total (repeats count)
  const doneIds = new Set(); // jobs finished at least once (the DONE tag)
  let payout = null; // a finished job's payout the loop has not taken yet
  let pulseTime = 0;

  /** The job's current target spot, or null while it has none. */
  function targetPos() {
    if (!active) return null;
    if (active.kind === 'drive') return active.stages[stageIndex] ?? null;
    if (active.kind === 'shoot' || active.kind === 'boat') return active.target ?? null;
    if (active.kind === 'steal') {
      // The nearest ride Raka can still steal.
      let best = null;
      let bestDist = Infinity;
      for (const v of stateVehicles) {
        if (v.stolen) continue;
        const d = Math.hypot(v.group.position.x - playerX, v.group.position.z - playerZ);
        if (d < bestDist) { best = v; bestDist = d; }
      }
      return best ? { x: best.group.position.x, z: best.group.position.z } : null;
    }
    return null; // the getaway job has no spot to reach
  }

  // The update's inputs, kept so targetPos can find the nearest ride.
  let stateVehicles = [];
  let playerX = 0;
  let playerZ = 0;

  /** The objective line for the active job (the HUD tracker reads this). */
  function objectiveText() {
    if (!active) return null;
    if (active.kind === 'drive') return active.stageText[stageIndex] ?? active.stageText[0];
    if (active.kind === 'shoot') {
      const done = baselineHits === null ? 0 : Math.max(0, lastDummyHits - baselineHits);
      return `Hit the practice dummy ${active.hits} times (${done} / ${active.hits})`;
    }
    if (active.kind === 'steal') return 'Steal a civilian vehicle — press E near one';
    if (active.kind === 'heat') {
      return armed ? 'Lose the police — get the heat to zero' : 'Get wanted, then lose the police';
    }
    if (active.kind === 'boat') return 'Take a boat to the buoy at sea';
    return active.desc;
  }

  let lastDummyHits = 0;

  return {
    /** Every job on the board, with its state (for the phone's JOBS tab). */
    get list() {
      return JOBS.map((j) => ({
        id: j.id,
        name: j.name,
        desc: j.desc,
        reward: j.reward,
        district: j.district,
        districtName: j.districtName,
        kind: j.kind,
        done: doneIds.has(j.id),
        isActive: active ? active.id === j.id : false,
      }));
    },
    /** The job in progress, or null while Raka is between jobs. */
    get active() { return active; },
    /** Which stage of a drive job Raka is on (0-based). */
    get stageIndex() { return stageIndex; },
    /** The active job's objective line, or null. */
    get objective() { return objectiveText(); },
    /** How many jobs are finished in total (repeats count). */
    get completedCount() { return completedCount; },
    /** The active job's target spot, or null (for the radar and the phone map). */
    get target() { return targetPos(); },

    /**
     * Take a job from the board. False when another job is already
     * active, or the id is unknown. A job can be taken again after it
     * paid out — the bay always needs another driver.
     */
    accept(id) {
      if (active) return false;
      const job = JOBS.find((j) => j.id === id);
      if (!job) return false;
      active = job;
      stageIndex = 0;
      armed = false;
      baselineHits = null;
      return true;
    },

    /** Drop the active job (no pay, no penalty). */
    abandon() {
      if (!active) return false;
      active = null;
      stageIndex = 0;
      armed = false;
      baselineHits = null;
      marker.group.visible = false;
      return true;
    },

    /**
     * A finished job's payout the game loop has not taken yet, or null.
     * Each payout is handed out once: { name, reward, district, districtName }.
     */
    takePayout() {
      const p = payout;
      payout = null;
      return p;
    },

    /** Back to between jobs (a respawn keeps the cash, drops the job). */
    reset() {
      active = null;
      stageIndex = 0;
      armed = false;
      baselineHits = null;
      payout = null;
      marker.group.visible = false;
    },

    /**
     * Step 13: put a saved game's job back. `savedActive` is
     * { id, stage } or null; `done` is the total completions. A job
     * restored mid-way picks up at its saved stage, and the range
     * job's dummy count starts fresh from the next frame.
     */
    restore(savedActive, done) {
      completedCount = Math.max(0, done ?? 0);
      active = null;
      stageIndex = 0;
      armed = false;
      baselineHits = null;
      payout = null;
      marker.group.visible = false;
      if (savedActive && typeof savedActive.id === 'string') {
        const job = JOBS.find((j) => j.id === savedActive.id);
        if (job) {
          active = job;
          stageIndex = Math.max(0, Math.min((job.stages?.length ?? 1) - 1, savedActive.stage ?? 0));
        }
      }
    },

    /** Advance the marker pulse (the frozen frame calls this, not update). */
    pulse(dt) {
      pulseTime += dt;
      const s = 1 + 0.12 * Math.sin(pulseTime * 3);
      if (marker.group.visible) marker.ring.scale.set(s, s, 1);
    },

    /**
     * One frame: move the target marker and check the active job's
     * finish. `state` is { x, z, driving, vehicle, wanted, dummyHits,
     * vehicles }.
     */
    update(dt, state) {
      pulseTime += dt;
      lastDummyHits = state.dummyHits;
      stateVehicles = state.vehicles;
      playerX = state.x;
      playerZ = state.z;
      if (baselineHits === null && active && active.kind === 'shoot') {
        baselineHits = state.dummyHits;
      }

      // --- the target marker follows the active job ------------------------
      const target = targetPos();
      if (target) {
        marker.group.position.set(target.x, 0, target.z);
        marker.group.visible = true;
      } else {
        marker.group.visible = false;
      }
      const s = 1 + 0.12 * Math.sin(pulseTime * 3);
      if (marker.group.visible) marker.ring.scale.set(s, s, 1);

      // --- the finish: each kind's own condition ----------------------------
      if (!active) return;
      let done = false;
      if (active.kind === 'drive') {
        const t = active.stages[stageIndex];
        if (t && Math.hypot(state.x - t.x, state.z - t.z) < TARGET_RANGE) {
          stageIndex += 1;
          if (stageIndex >= active.stages.length) done = true;
        }
      } else if (active.kind === 'shoot') {
        done = (state.dummyHits - (baselineHits ?? state.dummyHits)) >= active.hits;
      } else if (active.kind === 'steal') {
        done = state.driving && !!state.vehicle && !!state.vehicle.steal;
      } else if (active.kind === 'heat') {
        if (state.wanted >= 1) armed = true;
        done = armed && state.wanted === 0;
      } else if (active.kind === 'boat') {
        done = state.driving && !!state.vehicle && state.vehicle.type === 'Boat'
          && Math.hypot(state.x - active.target.x, state.z - active.target.z) < TARGET_RANGE;
      }
      if (!done) return;

      // --- paid: the loop takes the payout, the board marks it done -------
      payout = {
        name: active.name,
        reward: active.reward,
        district: active.district,
        districtName: active.districtName,
      };
      completedCount += 1;
      doneIds.add(active.id);
      active = null;
      stageIndex = 0;
      armed = false;
      baselineHits = null;
      marker.group.visible = false;
    },
  };
}
