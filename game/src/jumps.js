// Step 14 — stunt jumps: ten ramps around Solmar Bay, painted hot
// pink with yellow chevrons and a STUNT sign, so they read in a
// screenshot from down the street. Hit one at 60 km/h or more and the
// ride launches: the camera pulls back, the nose rises, and the air
// time, the spin and the landing all count. A clean landing — wheels
// down within about 15 degrees of a square 90-degree spin, no wall
// clipped on the way, still rolling — pays cash scaled by air time
// and flips, and chaining clean jumps in a row multiplies the payout.
// A rough landing pays half the score and no cash; clipping a building
// mid-air ends the run with a crash. Each ramp rests 20 seconds after
// a launch, and the best score on every ramp (and overall) is saved.

const MIN_SPEED = 16.67; // metres per second: about 60 km/h, the trigger
const GRAVITY = 12; // floatier than the street's, so the air lasts 0.8–2 s
const TRIGGER_DIST = 3.2; // metres from the ramp's centre that still counts
const TRIGGER_DOT = 0.7; // the ride must be heading roughly along the ramp
const COOLDOWN = 20; // seconds a ramp rests after a launch
const CLEAN_YAW_TOL = 0.26; // radians: about 15 deg off a square spin
const CLEAN_MIN_SPEED = 8; // metres per second still rolling at touchdown
const FLIP_BONUS = 150; // points per full 90 degrees spun in the air
const CLEAN_BONUS = 100; // points for a clean landing
const CHAIN_WINDOW = 30; // seconds between clean landings to keep the chain
const CHAIN_STEP = 0.25; // +25% cash per link in the chain

// The ramps: (x, z, yaw, launch angle). Yaw 0 faces south (+z), PI
// faces north (-z), PI/2 faces east (+x). The first three sit on the
// main coastal highway (the avenue) for long air; two on the boardwalk
// sand (one short, one long over the open sand); two on the hill cross
// streets over blind crests; one off the harbour dock toward the
// moored Speedboat; one by the east car park; one bonus by the north
// fence. Every landing zone is open road, sand or sea — no building
// stands in the way of a straight flight.
const RAMPS = [
  { id: 'avenue-north', name: 'Avenue North', x: 0, z: -40, yaw: Math.PI, angle: 18 },
  { id: 'avenue-south', name: 'Avenue South', x: 0, z: 20, yaw: 0, angle: 18 },
  { id: 'avenue-beach', name: 'Beach Run', x: 0, z: 44, yaw: 0, angle: 20 },
  { id: 'boardwalk-short', name: 'Boardwalk Short', x: -20, z: 64, yaw: Math.PI / 2, angle: 16 },
  { id: 'boardwalk-long', name: 'Boardwalk Long', x: 20, z: 70, yaw: -Math.PI / 2, angle: 24 },
  { id: 'hill-north', name: 'Hill Crest North', x: -30, z: -30, yaw: Math.PI / 2, angle: 20 },
  { id: 'hill-south', name: 'Hill Crest South', x: 30, z: 30, yaw: -Math.PI / 2, angle: 20 },
  { id: 'harbour-dock', name: 'Harbour Dock', x: 12, z: 80, yaw: 0, angle: 22 },
  { id: 'car-park', name: 'Car Park Ramp', x: 48, z: -8, yaw: Math.PI, angle: 18 },
  { id: 'airfield-fence', name: 'Airfield Fence', x: -48, z: -48, yaw: Math.PI / 2, angle: 18 },
];

/** A STUNT sign texture: pink board, yellow chevrons, white letters. */
function makeSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff2a7a'; ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#f2c94c';
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(10 + i * 20, 84); ctx.lineTo(26 + i * 20, 84);
    ctx.lineTo(40 + i * 20, 66); ctx.lineTo(24 + i * 20, 66);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('STUNT', 128, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Shortest signed angle from `from` to `to`, so a spin never jumps the long way. */
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createJumps(scene, hooks = {}) {
  const onEvent = hooks.onEvent ?? (() => {});
  const signTexture = makeSignTexture();
  const cooldowns = new Map(); // ramp id -> game seconds left resting
  const best = new Map(); // ramp id -> best score on that ramp
  let totalBest = 0; // best single-jump score anywhere
  let chain = 0; // clean landings in a row, inside the chain window
  let lastCleanAt = -Infinity; // game seconds of the last clean landing
  let flight = null; // the jump in the air, or null
  let slowmoUntil = -Infinity; // game seconds the slow-mo pulse runs to
  let now = 0; // game seconds, advanced by update()
  const puffs = []; // landing dust, fading out

  // --- the ramps: a sloped pink wedge, yellow edge strips, a sign ------
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xff2a7a, roughness: 0.6 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.6, metalness: 0.4 });
  for (const ramp of RAMPS) {
    const group = new THREE.Group();
    // The wedge: a box tilted up toward the launch direction. Its top
    // edge stands about 1.9 m, so a car rolling up it reads as a ramp
    // and the launch angle matches the tilt.
    const slope = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 6.5), rampMat);
    slope.position.set(0, 0.95, 0);
    slope.rotation.x = -((ramp.angle * Math.PI) / 180);
    slope.castShadow = true; slope.receiveShadow = true;
    group.add(slope);
    // Yellow chevron strips along both edges of the slope.
    for (const sx of [-1.9, 1.9]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 6.5), edgeMat);
      strip.position.set(sx, 0.98, 0);
      strip.rotation.x = -((ramp.angle * Math.PI) / 180);
      group.add(strip);
    }
    // A STUNT sign on a pole beside the ramp's foot, facing the approach.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), poleMat);
    pole.position.set(3.2, 1.3, -3.4);
    group.add(pole);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.0),
      new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide, toneMapped: false }),
    );
    sign.position.set(3.2, 3.0, -3.4);
    sign.rotation.y = Math.PI;
    group.add(sign);
    group.position.set(ramp.x, 0, ramp.z);
    group.rotation.y = ramp.yaw;
    scene.add(group);
    ramp.group = group;
  }

  /** A burst of dust (or spray, over the sea) where the wheels touch down. */
  function spawnPuffs(x, y, z, overWater) {
    for (let i = 0; i < 8; i += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 8, 6),
        new THREE.MeshBasicMaterial({
          color: overWater ? 0xeaf6ff : 0xcfc8b8, transparent: true, opacity: 0.8,
        }),
      );
      puff.position.set(
        x + (Math.random() - 0.5) * 3,
        y + 0.2 + Math.random() * 0.3,
        z + (Math.random() - 0.5) * 3,
      );
      scene.add(puff);
      puffs.push({ mesh: puff, life: 0.9 });
    }
  }

  /** The dust ages: it swells and fades, then leaves the scene. */
  function updatePuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i -= 1) {
      const p = puffs[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        puffs.splice(i, 1);
        continue;
      }
      const k = 1 + (0.9 - p.life) * 1.6;
      p.mesh.scale.set(k, k * 0.7, k);
      p.mesh.material.opacity = Math.max(0, (p.life / 0.9) * 0.8);
    }
  }

  /**
   * Launch a flight off a ramp. `speed` is the ride's speed in m/s;
   * a test hook may pass one in instead of reading the ride.
   */
  function startFlight(vehicle, ramp, speed) {
    const angle = (ramp.angle * Math.PI) / 180;
    const vy0 = speed * Math.sin(angle);
    flight = {
      ramp,
      vehicle,
      t: 0,
      total: (2 * vy0) / GRAVITY, // seconds until the wheels meet the ground
      vy0,
      yaw0: vehicle.yaw,
      prevYaw: vehicle.yaw,
      totalYaw: 0,
      hits0: vehicle.hits ?? 0,
      speed0: speed,
    };
    cooldowns.set(ramp.id, COOLDOWN);
    vehicle.group.position.y = 0.05;
    onEvent({ type: 'takeoff', ramp: ramp.id, name: ramp.name, speed });
  }

  /** Touch down: score the flight, pay the chain, reset the camera. */
  function landFlight(chase) {
    const f = flight;
    flight = null;
    const vehicle = f.vehicle;
    const airTime = Math.max(0, f.t);
    const overWater = vehicle.group.position.z > 78;
    // How square the spin is: the nearest multiple of 90 degrees, and
    // how far off it the car landed. A full spin counts as flips.
    const nearest90 = Math.round(f.totalYaw / (Math.PI / 2)) * (Math.PI / 2);
    const aligned = Math.abs(f.totalYaw - nearest90) <= CLEAN_YAW_TOL;
    const flips = Math.abs(nearest90) / (Math.PI / 2);
    const hit = (vehicle.hits ?? 0) > f.hits0;
    const speedNow = Math.abs(vehicle.speed ?? f.speed0);
    vehicle.group.position.y = 0;
    vehicle.group.rotation.x = 0;
    vehicle.group.rotation.z = 0;
    if (chase) {
      chase.setDistance(8.5);
      chase.setTargetFov(60);
    }
    spawnPuffs(vehicle.group.position.x, 0, vehicle.group.position.z, overWater);
    if (hit) {
      chain = 0;
      onEvent({ type: 'crash', ramp: f.ramp.id, name: f.ramp.name, airTime, flips });
      return { type: 'crash', airTime, flips, score: 0, cash: 0 };
    }
    if (aligned && speedNow >= CLEAN_MIN_SPEED) {
      const score = Math.round(airTime * 100) + flips * FLIP_BONUS + CLEAN_BONUS;
      chain = (now - lastCleanAt <= CHAIN_WINDOW) ? chain + 1 : 1;
      lastCleanAt = now;
      const cash = Math.round((score / 10) * (1 + CHAIN_STEP * (chain - 1)));
      if (score > (best.get(f.ramp.id) ?? 0)) best.set(f.ramp.id, score);
      if (score > totalBest) totalBest = score;
      slowmoUntil = now + 0.7; // a brief slow-motion pulse on a clean landing
      onEvent({
        type: 'clean', ramp: f.ramp.id, name: f.ramp.name,
        airTime, flips, score, cash, chain, overWater,
      });
      return { type: 'clean', airTime, flips, score, cash, chain };
    }
    chain = 0;
    const score = Math.round(airTime * 50) + flips * 50;
    if (score > (best.get(f.ramp.id) ?? 0)) best.set(f.ramp.id, score);
    if (score > totalBest) totalBest = score;
    onEvent({
      type: 'rough', ramp: f.ramp.id, name: f.ramp.name,
      airTime, flips, score, cash: 0,
    });
    return { type: 'rough', airTime, flips, score, cash: 0 };
  }

  return {
    /** The ramps, with their spots and headings (for the tests and the HUD). */
    get list() {
      return RAMPS.map((r) => ({
        id: r.id, name: r.name, x: r.x, z: r.z, yaw: r.yaw, angle: r.angle,
        best: best.get(r.id) ?? 0, cooldown: cooldowns.get(r.id) ?? 0,
      }));
    },
    /** True while a ride is in the air off a ramp. */
    get flying() { return flight !== null; },
    /** The flight in progress, or null: ramp, air time, spin so far. */
    get flightInfo() {
      if (!flight) return null;
      return {
        ramp: flight.ramp.id, name: flight.ramp.name,
        airTime: flight.t, totalYaw: flight.totalYaw,
      };
    },
    /** True while the clean-landing slow-motion pulse is running. */
    slowmoActive() { return now < slowmoUntil; },
    /** The best single-jump score anywhere. */
    get bestScore() { return totalBest; },
    /** The clean-landing chain running right now. */
    get chain() { return chain; },
    /** The best score on one ramp, or 0. */
    bestOn(rampId) { return best.get(rampId) ?? 0; },
    /** Seconds a ramp still rests, or 0 when it is ready. */
    cooldownOn(rampId) { return cooldowns.get(rampId) ?? 0; },

    /**
     * One frame. `ctx` is { driving, vehicle, chase }: the ride Raka
     * drives (or null on foot) and the chase camera. While a flight
     * runs the ride's height, pitch and roll are this module's — the
     * car's own update never touches y, so the two never fight.
     */
    update(dt, ctx = {}) {
      now += dt;
      for (const [id, left] of [...cooldowns.entries()]) {
        const next = left - dt;
        if (next <= 0) cooldowns.delete(id);
        else cooldowns.set(id, next);
      }
      updatePuffs(dt);
      const { driving, vehicle, chase } = ctx;
      if (flight) {
        flight.t += dt;
        const f = flight;
        // The spin: steering in the air turns the car, and the total
        // yaw turned is what the landing is judged on.
        const dyaw = angleDelta(f.prevYaw, vehicle.yaw);
        f.totalYaw += dyaw;
        f.prevYaw = vehicle.yaw;
        const y = f.vy0 * f.t - 0.5 * GRAVITY * f.t * f.t;
        if (y <= 0 && f.t > 0.15) {
          landFlight(chase);
          return;
        }
        vehicle.group.position.y = Math.max(0, y);
        // The nose rises off the ramp and settles level by touchdown,
        // with a small wobble while it flies.
        const k = Math.min(1, f.t / f.total);
        const pitch = ((RAMPS.find((r) => r.id === f.ramp.id)?.angle ?? 18) * Math.PI) / 180;
        vehicle.group.rotation.x = pitch * (1 - k);
        vehicle.group.rotation.z = Math.sin(f.t * 9) * 0.03;
        return;
      }
      if (!driving || !vehicle) return;
      const speed = Math.abs(vehicle.speed ?? 0);
      if (speed < MIN_SPEED) return;
      const fx = Math.sin(vehicle.yaw);
      const fz = Math.cos(vehicle.yaw);
      for (const ramp of RAMPS) {
        if (cooldowns.has(ramp.id)) continue;
        const dx = vehicle.group.position.x - ramp.x;
        const dz = vehicle.group.position.z - ramp.z;
        if (Math.hypot(dx, dz) > TRIGGER_DIST) continue;
        const rx = Math.sin(ramp.yaw);
        const rz = Math.cos(ramp.yaw);
        if (fx * rx + fz * rz < TRIGGER_DOT) continue;
        startFlight(vehicle, ramp, speed);
        if (chase) {
          chase.setDistance(11.5); // the camera pulls back off the ramp
          chase.setTargetFov(66);
        }
        return;
      }
    },

    /**
     * Launch a flight off a ramp at once (the test harness stages a
     * jump without driving up to the ramp at 60 km/h first).
     */
    debugLaunch(vehicle, rampId, speed = 20) {
      const ramp = RAMPS.find((r) => r.id === rampId);
      if (!ramp || !vehicle || flight) return false;
      cooldowns.delete(ramp.id);
      startFlight(vehicle, ramp, speed);
      return true;
    },

    /** The best scores and the chain state, for a save. */
    snapshot() {
      return {
        best: Object.fromEntries(best),
        totalBest,
      };
    },
    /** Put saved best scores back (a load). Foreign values are ignored. */
    restore(saved) {
      if (!saved || typeof saved !== 'object') return;
      const savedBest = saved.best;
      if (savedBest && typeof savedBest === 'object') {
        for (const ramp of RAMPS) {
          const v = savedBest[ramp.id];
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            best.set(ramp.id, Math.round(v));
          }
        }
      }
      if (typeof saved.totalBest === 'number' && Number.isFinite(saved.totalBest)) {
        totalBest = Math.max(0, Math.round(saved.totalBest));
      }
    },
    /** Back to a fresh start (a respawn never clears bests — only a reset does). */
    reset() {
      cooldowns.clear();
      best.clear();
      totalBest = 0;
      chain = 0;
      lastCleanAt = -Infinity;
      flight = null;
      slowmoUntil = -Infinity;
    },
  };
}
