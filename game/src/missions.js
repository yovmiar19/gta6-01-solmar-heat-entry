// Step 6 — missions and a story to chase. Raka takes jobs in Solmar Bay:
// steal a ride, drive it to the pier, prove his aim on the range, then lose
// the police. A glowing cyan marker on the avenue starts the chain; each
// job shows a yellow marker at its target (in the world and on the radar),
// and finishing one pays cash and starts the next straight away. The cash
// total rides on the HUD, and a banner calls out each completion.
//
// The jobs, in order:
//   1. First Wheels ($300) — steal a civilian vehicle (any ride but his own).
//   2. Pier Run ($800) — drive to the drop-off at the north end of the avenue.
//   3. Target Practice ($600) — hit the practice dummy three times.
//   4. Lose the Heat ($1,200) — get wanted, then lose the police.
const MISSIONS = [
  {
    id: 'wheels',
    name: 'First Wheels',
    reward: 300,
    objective: 'Steal a civilian vehicle — press E near one',
  },
  {
    id: 'pier',
    name: 'Pier Run',
    reward: 800,
    objective: 'Drive to the pier drop-off at the north end',
    target: { x: 0, z: -48 },
  },
  {
    id: 'practice',
    name: 'Target Practice',
    reward: 600,
    objective: 'Hit the practice dummy 3 times',
    target: { x: 0, z: 2 },
  },
  {
    id: 'heat',
    name: 'Lose the Heat',
    reward: 1200,
    objective: 'Get wanted, then lose the police',
  },
];

const START = { x: 0, z: 16 }; // the job marker on the avenue, north of Raka
const START_RANGE = 3; // how close Raka must be to take the job
const TARGET_RANGE = 4; // how close counts as reaching a target
const PRACTICE_HITS = 3; // dummy hits the range job needs

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
  // or the Target Practice marker (which stands on the dummy) would eat
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
  return { group, column, ring };
}

/**
 * Build the mission system. `scene` is the city the markers stand in.
 * `state` each update is { x, z, driving, vehicle, wanted, dummyHits,
 * vehicles }: where Raka is, what he is driving, the heat, how many rounds
 * have hit the dummy, and the civilian rides (for the nearest stealable
 * one). The game loop reads `active`, `cash` and `takeBanner()` for the HUD.
 */
export function createMissions(scene) {
  const startMarker = makeMarker(scene, 0x4ad8e8); // cyan: the job marker
  const targetMarker = makeMarker(scene, 0xf2c94c); // gold: the target
  startMarker.group.position.set(START.x, 0, START.z);
  startMarker.group.visible = true;

  let active = null; // the job in progress, or null
  let nextIndex = 0; // which job the marker hands out next
  let cash = 0; // dollars banked from finished jobs
  let banner = null; // a completion line the HUD has not shown yet
  let armed = false; // the heat job: Raka has been wanted at least once
  let baselineHits = 0; // dummy hits when the range job started
  let pulseTime = 0;

  /** The job's target spot, or null while it has none (the heat job). */
  function targetPos() {
    if (!active) return null;
    if (active.id === 'wheels') {
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
    return active.target ?? null;
  }

  // The update's inputs, kept so targetPos can find the nearest ride.
  let stateVehicles = [];
  let playerX = 0;
  let playerZ = 0;

  /** Start the next job in the chain (or restart it after the last). */
  function startNext() {
    if (nextIndex >= MISSIONS.length) nextIndex = 0;
    active = MISSIONS[nextIndex];
    armed = false;
    baselineHits = lastDummyHits;
    startMarker.group.visible = false;
  }

  let lastDummyHits = 0;

  return {
    /** The job in progress, or null while Raka is between jobs. */
    get active() { return active; },
    /** Dollars banked from finished jobs. */
    get cash() { return cash; },
    /** How many jobs are finished in this chain (0–4). */
    get completedCount() { return nextIndex; },
    /** The active job's target spot, or null (for the radar). */
    get target() { return targetPos(); },
    /** The job marker's spot (for tests and staging). */
    get start() { return { x: START.x, z: START.z }; },

    /**
     * A completion line the HUD has not shown yet, or null. Each line is
     * handed out once, so the game loop calls this every frame.
     */
    takeBanner() {
      const text = banner;
      banner = null;
      return text;
    },

    /** Back to between jobs (a respawn): the cash stays banked. */
    reset() {
      active = null;
      nextIndex = 0;
      armed = false;
      banner = null;
      startMarker.group.visible = true;
      targetMarker.group.visible = false;
    },

    /**
     * Step 12: put a saved game's progress back. `done` is how many jobs
     * were finished (0–4); the next job in the chain becomes active, or
     * none when all four are done (the marker comes back, and touching
     * it starts the chain over). The cash stays banked, as it was.
     */
    restore(savedCash, done) {
      cash = Math.max(0, savedCash ?? 0);
      nextIndex = Math.max(0, Math.min(MISSIONS.length, done ?? 0));
      armed = false;
      banner = null;
      if (nextIndex >= MISSIONS.length) {
        active = null;
        startMarker.group.visible = true;
        targetMarker.group.visible = false;
      } else {
        active = MISSIONS[nextIndex];
        baselineHits = lastDummyHits;
        startMarker.group.visible = false;
      }
    },

    /**
     * Stage the mission screenshot: the Pier Run is in progress, its gold
     * marker standing at the north end of the avenue, Raka on foot below
     * it. The street stays staged around him.
     */
    stageMissionShot() {
      nextIndex = 1;
      active = MISSIONS[1];
      armed = false;
      baselineHits = lastDummyHits;
      startMarker.group.visible = false;
      targetMarker.group.position.set(MISSIONS[1].target.x, 0, MISSIONS[1].target.z);
      targetMarker.group.visible = true;
    },

    /** Advance the marker pulse (the frozen frame calls this, not update). */
    pulse(dt) {
      pulseTime += dt;
      const s = 1 + 0.12 * Math.sin(pulseTime * 3);
      if (startMarker.group.visible) startMarker.ring.scale.set(s, s, 1);
      if (targetMarker.group.visible) targetMarker.ring.scale.set(s, s, 1);
    },

    /**
     * One frame: start a job at the marker, move the target marker, and
     * check the active job's finish. `state` is { x, z, driving, vehicle,
     * wanted, dummyHits, vehicles }.
     */
    update(dt, state) {
      pulseTime += dt;
      lastDummyHits = state.dummyHits;
      stateVehicles = state.vehicles;
      playerX = state.x;
      playerZ = state.z;

      // --- between jobs: the marker hands one out on touch -----------------
      if (!active) {
        const d = Math.hypot(state.x - START.x, state.z - START.z);
        if (d < START_RANGE) startNext();
      }

      // --- the target marker follows the active job ------------------------
      const target = targetPos();
      if (target) {
        targetMarker.group.position.set(target.x, 0, target.z);
        targetMarker.group.visible = true;
      } else {
        targetMarker.group.visible = false;
      }
      const s = 1 + 0.12 * Math.sin(pulseTime * 3);
      if (startMarker.group.visible) startMarker.ring.scale.set(s, s, 1);
      if (targetMarker.group.visible) targetMarker.ring.scale.set(s, s, 1);

      // --- the finish: each job's own condition ----------------------------
      if (!active) return;
      let done = false;
      if (active.id === 'wheels') {
        // In a stolen civilian ride: the job is done.
        done = state.driving && !!state.vehicle && !!state.vehicle.steal;
      } else if (active.id === 'pier') {
        // Drove into the drop-off, in any vehicle.
        done = state.driving && Math.hypot(state.x - active.target.x, state.z - active.target.z) < TARGET_RANGE;
      } else if (active.id === 'practice') {
        // Three rounds on the dummy since the job started.
        done = state.dummyHits - baselineHits >= PRACTICE_HITS;
      } else if (active.id === 'heat') {
        // Wanted once, then the heat gone: he lost them.
        if (state.wanted >= 1) armed = true;
        done = armed && state.wanted === 0;
      }
      if (!done) return;

      // --- paid, and the next job starts straight away ---------------------
      cash += active.reward;
      banner = `MISSION COMPLETE — ${active.name} +$${active.reward}`;
      nextIndex += 1;
      if (nextIndex >= MISSIONS.length) {
        active = null;
        banner = `ALL MISSIONS COMPLETE — $${cash} banked`;
        startMarker.group.visible = true;
        targetMarker.group.visible = false;
      } else {
        active = MISSIONS[nextIndex];
        armed = false;
        baselineHits = state.dummyHits;
        startMarker.group.visible = false;
      }
    },
  };
}
