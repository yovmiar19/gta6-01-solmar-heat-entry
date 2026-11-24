// Step 5 — street life: pedestrians who walk the sidewalks and flee when
// provoked, and civilian vehicles Raka can steal and drive: sedans, a
// motorbike, a truck and a bus. Stealing one is a crime (a wanted star);
// hitting a pedestrian with a vehicle or a round is one too. The traffic
// system owns the pedestrians and the civilian vehicles; the game loop
// drives the one Raka is in and asks traffic for the nearest enterable ride.

import { mulberry32 } from './world.js';

const SHIRTS = [0x3a8ab0, 0xb03a2e, 0xe8b93a, 0x4a8a4a, 0x7a5a9a, 0xf5f0e6, 0xd97a2e, 0xd87a9a];
const PANTS = [0x2b3a55, 0x8a7a5a, 0x1a1a1a, 0x5a5a5a];
const SKINS = [0xc98d64, 0x8a5a3a, 0xe8b88a, 0x6a4a2a];
const HAIRS = [0x1f1a17, 0x3a2a1a, 0x6a6a6a, 0x8a5a2a];

const WALK_SPEED = 1.3; // metres per second, a stroll
const FLEE_SPEED = 3.6; // metres per second, running away
const FLEE_TIME = 3; // seconds a scare keeps them running
const BUMP_RANGE = 1.1; // Raka this close on foot makes one flinch away
const SHOT_SCARE = 8; // a round landing this close makes them run

function pbox(width, height, depth, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Shortest signed angle from `from` to `to` (so a turn never spins the long way). */
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Push a ground position out of every building footprint (a circle shove). */
function pushOutOfBuildings(world, x, z, radius) {
  for (const b of world.colliders) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < radius) {
      if (d > 0.001) {
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        z = b.maxZ + radius;
      }
    }
  }
  return { x, z };
}

/**
 * One pedestrian: a low-poly walker with their own shirt, skin and hair,
 * strolling a straight path (a sidewalk, or a cross street) and turning at
 * the ends. A scare — Raka bumping into them, a vehicle bearing down, a
 * round landing nearby — makes them run away from it for a few seconds.
 * `path` is { axis: 'x' | 'z', fixed, min, max, dir, speed, idle }.
 */
function createPedestrian(scene, rand, path) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const shirt = SHIRTS[Math.floor(rand() * SHIRTS.length)];
  const pants = PANTS[Math.floor(rand() * PANTS.length)];
  const skin = SKINS[Math.floor(rand() * SKINS.length)];
  const hair = HAIRS[Math.floor(rand() * HAIRS.length)];

  body.add(pbox(0.3, 0.32, 0.28, skin, 0, 1.55, 0)); // head
  body.add(pbox(0.32, 0.1, 0.3, hair, 0, 1.74, -0.01)); // hair cap
  body.add(pbox(0.5, 0.55, 0.28, shirt, 0, 1.05, 0)); // torso
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.32 * side, 1.28, 0);
    pivot.add(pbox(0.14, 0.5, 0.16, shirt, 0, -0.25, 0));
    pivot.add(pbox(0.12, 0.12, 0.12, skin, 0, -0.54, 0));
    body.add(pivot);
    return pivot;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.13 * side, 0.78, 0);
    pivot.add(pbox(0.18, 0.72, 0.2, pants, 0, -0.36, 0));
    pivot.add(pbox(0.18, 0.1, 0.3, 0x1a1a1a, 0, -0.74, 0.05));
    group.add(pivot);
    return pivot;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // The walking path: a straight line, back and forth. `pos` is the moving
  // coordinate along `axis`; `fixed` is the other one (the sidewalk's line).
  // A path may pin `pos` (an idle pedestrian waiting on one spot).
  let pos = path.pos ?? path.min + rand() * (path.max - path.min);
  let dir = path.dir || (rand() < 0.5 ? 1 : -1);
  let yaw = path.axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  let walkPhase = rand() * 6;
  let state = path.idle ? 'idle' : 'walk';
  let fleeTimer = 0;
  let fleeX = 0;
  let fleeZ = 0;
  let assaultCooldown = 0; // seconds until this pedestrian can earn another star

  function place() {
    if (path.axis === 'z') group.position.set(path.fixed, 0, pos);
    else group.position.set(pos, 0, path.fixed);
    group.rotation.y = yaw;
  }
  place();
  scene.add(group);

  const rig = {
    group,
    /** 'walk', 'idle' or 'flee'. */
    get state() { return state; },
    /** True while running away from a scare. */
    get fleeing() { return state === 'flee'; },
    /** Seconds until this pedestrian can earn another wanted star. */
    get assaultCooldown() { return assaultCooldown; },
    set assaultCooldown(v) { assaultCooldown = v; },
    /** Put the pedestrian on a spot, facing a direction (staging). */
    setPose(x, z, nextYaw) {
      group.position.set(x, 0, z);
      yaw = nextYaw;
      group.rotation.y = yaw;
      if (path.axis === 'z') pos = z;
      else pos = x;
      state = 'walk';
      fleeTimer = 0;
    },
    /** Hold a mid-stride pose (a frozen screenshot frame). */
    pose(phase) {
      walkPhase = phase;
      legL.rotation.x = Math.sin(phase) * 0.5;
      legR.rotation.x = -Math.sin(phase) * 0.5;
      armL.rotation.x = -Math.sin(phase) * 0.4;
      armR.rotation.x = Math.sin(phase) * 0.4;
    },
    /**
     * Scare this pedestrian: run away from (tx, tz) for a few seconds.
     * The run keeps going while the threat stays close.
     */
    fleeFrom(tx, tz) {
      const dx = group.position.x - tx;
      const dz = group.position.z - tz;
      const d = Math.hypot(dx, dz) || 1;
      fleeX = dx / d;
      fleeZ = dz / d;
      fleeTimer = FLEE_TIME;
      state = 'flee';
    },
    /** One frame: walk the path, or run from the scare, legs swinging. */
    update(dt, world) {
      assaultCooldown = Math.max(0, assaultCooldown - dt);
      if (state === 'idle') {
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        armL.rotation.x *= 0.8; armR.rotation.x *= 0.8;
        body.rotation.x *= 0.8;
        return;
      }
      if (state === 'flee') {
        fleeTimer -= dt;
        const nx = group.position.x + fleeX * FLEE_SPEED * dt;
        const nz = group.position.z + fleeZ * FLEE_SPEED * dt;
        const out = pushOutOfBuildings(world, nx, nz, 0.5);
        group.position.x = Math.max(-world.bounds, Math.min(world.bounds, out.x));
        group.position.z = Math.max(-world.bounds, Math.min(world.bounds, out.z));
        const wantYaw = Math.atan2(fleeX, fleeZ);
        yaw += angleDelta(yaw, wantYaw) * Math.min(1, dt * 8);
        group.rotation.y = yaw;
        walkPhase += dt * FLEE_SPEED * 2.4;
        const swing = 0.7;
        legL.rotation.x = Math.sin(walkPhase) * swing;
        legR.rotation.x = -Math.sin(walkPhase) * swing;
        armL.rotation.x = -Math.sin(walkPhase) * swing * 0.8;
        armR.rotation.x = Math.sin(walkPhase) * swing * 0.8;
        body.rotation.x = 0.12; // leaning into the run
        if (fleeTimer <= 0) {
          state = 'walk';
          body.rotation.x = 0;
          // Pick the walk back up from wherever the run ended.
          if (path.axis === 'z') pos = group.position.z;
          else pos = group.position.x;
        }
        return;
      }
      // Walking: along the path, turning at the ends. Only the coordinate
      // along the path is driven here, so a pedestrian who ran sideways
      // keeps walking on the line they ended up on, with no snap back.
      // The building push-out keeps them out of the plots: a pedestrian
      // who fled onto one walks around it instead of through it.
      pos += dir * path.speed * dt;
      if (pos > path.max) { pos = path.max; dir = -1; }
      if (pos < path.min) { pos = path.min; dir = 1; }
      yaw = path.axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let nx = path.axis === 'z' ? group.position.x : pos;
      let nz = path.axis === 'z' ? pos : group.position.z;
      const out = pushOutOfBuildings(world, nx, nz, 0.5);
      nx = Math.max(-world.bounds, Math.min(world.bounds, out.x));
      nz = Math.max(-world.bounds, Math.min(world.bounds, out.z));
      group.position.x = nx;
      group.position.z = nz;
      if (path.axis === 'z') pos = nz;
      else pos = nx;
      group.rotation.y = yaw;
      walkPhase += dt * path.speed * 4.5;
      legL.rotation.x = Math.sin(walkPhase) * 0.5;
      legR.rotation.x = -Math.sin(walkPhase) * 0.5;
      armL.rotation.x = -Math.sin(walkPhase) * 0.4;
      armR.rotation.x = Math.sin(walkPhase) * 0.4;
    },
  };
  // The combat raycast finds the pedestrian it hit through this tag.
  group.traverse((child) => { child.userData.npc = rig; });
  return rig;
}

// --- vehicle bodies ----------------------------------------------------------
function vbox(width, height, depth, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.5,
      metalness: opts.metalness ?? 0.25,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** One wheel: a steering group, a spinning group, a tyre and a hub. */
function makeWheel(group, x, z, radius, width, steers, wheels) {
  const steerGroup = new THREE.Group();
  steerGroup.position.set(x, radius, z);
  const spinGroup = new THREE.Group();
  steerGroup.add(spinGroup);
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 14),
    new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  );
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  spinGroup.add(tyre);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width + 0.02, 10),
    new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.7 }),
  );
  hub.rotation.z = Math.PI / 2;
  spinGroup.add(hub);
  group.add(steerGroup);
  wheels.push({ steerGroup, spinGroup, steers });
}

const GLASS = 0x1c2530;
const TRIM = 0x232326;
const HEADLIGHT = 0xfff2c0;
const TAILLIGHT = 0xff2a1a;

/** A civilian sedan: same shape as the Sunset GT, another colour. */
function buildSedanBody(group, color, wheels) {
  group.add(vbox(1.9, 0.55, 4.4, color, 0, 0.55, 0));
  group.add(vbox(1.7, 0.5, 2.2, GLASS, 0, 1.05, -0.2, { roughness: 0.15, metalness: 0.5 }));
  group.add(vbox(1.92, 0.22, 0.3, TRIM, 0, 0.32, 2.2));
  group.add(vbox(1.92, 0.22, 0.3, TRIM, 0, 0.32, -2.2));
  group.add(vbox(0.34, 0.12, 0.06, HEADLIGHT, -0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.34, 0.12, 0.06, HEADLIGHT, 0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.34, 0.1, 0.06, TAILLIGHT, -0.6, 0.62, -2.21, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  group.add(vbox(0.34, 0.1, 0.06, TAILLIGHT, 0.6, 0.62, -2.21, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  makeWheel(group, -0.85, 1.45, 0.34, 0.26, true, wheels);
  makeWheel(group, 0.85, 1.45, 0.34, 0.26, true, wheels);
  makeWheel(group, -0.85, -1.45, 0.34, 0.26, false, wheels);
  makeWheel(group, 0.85, -1.45, 0.34, 0.26, false, wheels);
}

/** A motorbike: narrow, two wheels, quick. Raka rides it in the open — the game loop seats him on it (see main.js enterVehicle). */
function buildBikeBody(group, color, wheels) {
  group.add(vbox(0.5, 0.35, 2.0, color, 0, 0.55, 0)); // frame
  group.add(vbox(0.45, 0.28, 0.7, TRIM, 0, 0.82, 0.25)); // tank
  group.add(vbox(0.45, 0.12, 0.6, 0x1a1a1a, 0, 0.85, -0.5)); // seat
  group.add(vbox(0.7, 0.06, 0.06, TRIM, 0, 1.0, 0.85)); // handlebar
  group.add(vbox(0.06, 0.5, 0.06, TRIM, 0, 0, 0.85)); // fork
  group.add(vbox(0.2, 0.12, 0.06, HEADLIGHT, 0, 0.72, 1.02, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.2, 0.1, 0.06, TAILLIGHT, 0, 0.72, -1.02, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  makeWheel(group, 0, 0.85, 0.32, 0.14, true, wheels);
  makeWheel(group, 0, -0.85, 0.32, 0.14, false, wheels);
}

/** A box truck: a cab up front, a big cargo box behind, slow and heavy. */
function buildTruckBody(group, color, wheels) {
  group.add(vbox(2.3, 1.7, 1.9, color, 0, 1.0, 2.4)); // cab
  group.add(vbox(2.0, 0.8, 0.12, GLASS, 0, 1.35, 3.32, { roughness: 0.15, metalness: 0.5 })); // windshield
  group.add(vbox(2.4, 2.2, 4.6, 0xe8e4da, 0, 1.35, -1.2)); // cargo box
  group.add(vbox(2.42, 0.18, 4.62, TRIM, 0, 0.28, -1.2)); // cargo skirt
  group.add(vbox(0.4, 0.14, 0.06, HEADLIGHT, -0.7, 0.62, 3.36, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.4, 0.14, 0.06, HEADLIGHT, 0.7, 0.62, 3.36, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.4, 0.12, 0.06, TAILLIGHT, -0.7, 0.62, -3.52, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  group.add(vbox(0.4, 0.12, 0.06, TAILLIGHT, 0.7, 0.62, -3.52, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  makeWheel(group, -1.0, 2.3, 0.45, 0.34, true, wheels);
  makeWheel(group, 1.0, 2.3, 0.45, 0.34, true, wheels);
  makeWheel(group, -1.0, -2.6, 0.45, 0.34, false, wheels);
  makeWheel(group, 1.0, -2.6, 0.45, 0.34, false, wheels);
}

/** A city bus: long, tall, a band of windows down each side. */
function buildBusBody(group, color, wheels) {
  group.add(vbox(2.5, 2.3, 9.0, color, 0, 1.35, 0)); // body
  group.add(vbox(2.52, 0.7, 8.2, GLASS, 0, 1.75, 0, { roughness: 0.15, metalness: 0.5 })); // window band
  group.add(vbox(2.3, 0.9, 0.12, GLASS, 0, 1.6, 4.52, { roughness: 0.15, metalness: 0.5 })); // windshield
  group.add(vbox(2.52, 0.25, 9.02, TRIM, 0, 0.35, 0)); // skirt
  group.add(vbox(0.4, 0.14, 0.06, HEADLIGHT, -0.8, 0.62, 4.52, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.4, 0.14, 0.06, HEADLIGHT, 0.8, 0.62, 4.52, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(vbox(0.4, 0.12, 0.06, TAILLIGHT, -0.8, 0.62, -4.52, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  group.add(vbox(0.4, 0.12, 0.06, TAILLIGHT, 0.8, 0.62, -4.52, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  makeWheel(group, -1.05, 3.2, 0.42, 0.32, true, wheels);
  makeWheel(group, 1.05, 3.2, 0.42, 0.32, true, wheels);
  makeWheel(group, -1.05, -3.2, 0.42, 0.32, false, wheels);
  makeWheel(group, 1.05, -3.2, 0.42, 0.32, false, wheels);
}

/**
 * One civilian vehicle Raka can steal and drive. `spec` is
 * { name, type, prompt, steal, body, color, topSpeed, reverseTop, engine,
 *   brake, wheelbase, wheelRadius, radius, camDistance, cruise, x, z, yaw,
 *   dir }. `cruise` is 0 for a parked ride; a cruiser drives itself along
 * the avenue and U-turns at the ends until Raka steals it. The driving
 * physics are the same arcade model as the Sunset GT, parameterised.
 */
function createDrivableVehicle(spec) {
  const group = new THREE.Group();
  const wheels = [];
  if (spec.body === 'sedan') buildSedanBody(group, spec.color, wheels);
  else if (spec.body === 'bike') buildBikeBody(group, spec.color, wheels);
  else if (spec.body === 'truck') buildTruckBody(group, spec.color, wheels);
  else if (spec.body === 'bus') buildBusBody(group, spec.color, wheels);
  let yaw = spec.yaw ?? Math.PI;
  let speed = 0;
  let steer = 0;
  let spin = 0;
  let hits = 0;
  let wasColliding = false;
  let stolen = false;
  let aiDir = spec.dir ?? 1; // +1 north, -1 south (the cruiser's direction)
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = yaw;
  const ai = (spec.cruise ?? 0) > 0;

  /** Move, push out of buildings, spin the wheels (shared by every mode). */
  function integrate(dt, world) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let nx = group.position.x + fx * speed * dt;
    let nz = group.position.z + fz * speed * dt;
    let collided = false;
    for (const b of world.colliders) {
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - cx;
      const dz = nz - cz;
      const d = Math.hypot(dx, dz);
      if (d < spec.radius) {
        if (d > 0.001) {
          nx = cx + (dx / d) * spec.radius;
          nz = cz + (dz / d) * spec.radius;
        } else {
          nz = b.maxZ + spec.radius;
        }
        if (Math.abs(speed) > 2 && !wasColliding) hits += 1;
        speed *= 0.5;
        collided = true;
      }
    }
    wasColliding = collided;
    group.position.x = Math.max(-world.bounds, Math.min(world.bounds, nx));
    group.position.z = Math.max(-world.bounds, Math.min(world.bounds, nz));
    group.rotation.y = yaw;
    spin += (speed / spec.wheelRadius) * dt;
    for (const w of wheels) {
      w.spinGroup.rotation.x = spin;
      w.steerGroup.rotation.y = w.steers ? steer : 0;
    }
  }

  const rig = {
    group,
    /** The name the HUD shows while driving it ("Motor", "Truk", ...). */
    name: spec.name,
    /** 'Sedan' | 'Motorbike' | 'Truck' | 'Bus'. */
    type: spec.type,
    /** The prompt shown when Raka stands next to it. */
    prompt: spec.prompt,
    /** Taking it is a crime (a wanted star). Always true for these rides. */
    steal: spec.steal,
    /** True while it drives itself (a cruiser that has not been stolen). */
    get ai() { return ai && !stolen; },
    /** The circle the building and vehicle collisions use. */
    radius: spec.radius,
    /** How far the chase camera sits while driving it. */
    camDistance: spec.camDistance,
    get yaw() { return yaw; },
    get speed() { return speed; },
    get hits() { return hits; },
    get stolen() { return stolen; },
    set stolen(v) { stolen = v; },
    /** A police ram: cut the speed nearly in half. */
    ram() { speed *= 0.45; },
    setHeading(nextYaw) { yaw = nextYaw; group.rotation.y = yaw; },
    halt() { speed = 0; },
    setPose(x, z, nextYaw) {
      group.position.set(x, 0, z);
      yaw = nextYaw;
      group.rotation.y = yaw;
      speed = 0;
      steer = 0;
    },
    /**
     * One frame. `input` is the input rig while Raka drives this vehicle;
     * null means it drives itself (a cruiser) or sits parked.
     */
    update(dt, input, world) {
      if (input) {
        const throttle = input.forward;
        const steerInput = input.strafe;
        if (throttle > 0) {
          if (speed < 0) speed = Math.min(0, speed + spec.brake * dt);
          else speed = Math.min(spec.topSpeed, speed + spec.engine * throttle * dt);
        } else if (throttle < 0) {
          if (speed > 0) speed = Math.max(0, speed + spec.brake * throttle * dt);
          else speed = Math.max(spec.reverseTop, speed + spec.engine * throttle * dt);
        } else {
          const drag = 4 * dt;
          if (Math.abs(speed) <= drag) speed = 0;
          else speed -= Math.sign(speed) * drag;
        }
        const steerTarget = steerInput * (0.5 / (1 + Math.abs(speed) * 0.06));
        steer += (steerTarget - steer) * Math.min(1, dt * 8);
        yaw -= (speed / spec.wheelbase) * Math.tan(steer) * dt;
      } else if (ai && !stolen) {
        // Self-driving: cruise the avenue, U-turn at the ends.
        const targetYaw = aiDir > 0 ? Math.PI : 0;
        const turn = angleDelta(yaw, targetYaw);
        const maxTurn = 1.2 * dt;
        yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
        steer = Math.max(-0.5, Math.min(0.5, turn * 0.5));
        const want = Math.abs(turn) > 0.25 ? 3 : spec.cruise;
        if (speed < want) speed = Math.min(want, speed + 8 * dt);
        else speed = Math.max(want, speed - 10 * dt);
        if (aiDir > 0 && group.position.z <= -48) aiDir = -1;
        else if (aiDir < 0 && group.position.z >= 48) aiDir = 1;
      } else {
        const drag = 4 * dt;
        if (Math.abs(speed) <= drag) speed = 0;
        else speed -= Math.sign(speed) * drag;
        steer += (0 - steer) * Math.min(1, dt * 8);
      }
      integrate(dt, world);
    },
  };
  return rig;
}

/**
 * The street: pedestrians and civilian rides, seeded so the layout is the
 * same every run. `player` is { x, z, driving, speed, vehicle } and
 * `heroCar` is the Sunset GT, so the player's ride cannot pass through the
 * other parked rides.
 */
export function createTraffic(scene, world, police, onCrime) {
  const rand = mulberry32(7);
  const npcs = [];
  const vehicles = [];
  const npcSpawn = [];
  const vehicleSpawn = [];

  // Pedestrians: six strolling the avenue sidewalks, four on the cross
  // streets, two standing still (one waiting on each sidewalk).
  const paths = [
    { axis: 'z', fixed: -7.5, min: -50, max: 50, dir: 1, speed: WALK_SPEED },
    { axis: 'z', fixed: -7.5, min: -50, max: 50, dir: -1, speed: WALK_SPEED },
    { axis: 'z', fixed: -7.5, min: -50, max: 50, dir: 1, speed: WALK_SPEED * 0.9 },
    { axis: 'z', fixed: 7.5, min: -50, max: 50, dir: -1, speed: WALK_SPEED },
    { axis: 'z', fixed: 7.5, min: -50, max: 50, dir: 1, speed: WALK_SPEED * 1.1 },
    { axis: 'z', fixed: 7.5, min: -50, max: 50, dir: -1, speed: WALK_SPEED * 0.95 },
    { axis: 'x', fixed: -30, min: -45, max: 45, dir: 1, speed: WALK_SPEED },
    { axis: 'x', fixed: -30, min: -45, max: 45, dir: -1, speed: WALK_SPEED },
    { axis: 'x', fixed: 0, min: -45, max: 45, dir: 1, speed: WALK_SPEED * 1.05 },
    { axis: 'x', fixed: 0, min: -45, max: 45, dir: -1, speed: WALK_SPEED },
    { axis: 'z', fixed: -7.5, min: -50, max: 50, dir: 1, speed: WALK_SPEED, idle: true, pos: 22 },
    { axis: 'z', fixed: 7.5, min: -50, max: 50, dir: -1, speed: WALK_SPEED, idle: true, pos: -18 },
  ];
  for (const path of paths) {
    const npc = createPedestrian(scene, rand, path);
    npcs.push(npc);
    npcSpawn.push({ npc, x: npc.group.position.x, z: npc.group.position.z, yaw: npc.group.rotation.y });
  }

  // Civilian rides: two parked sedans, one self-driving sedan cruising the
  // avenue, a motorbike, a truck and a bus. All of them can be stolen.
  const specs = [
    { name: 'Sedan', type: 'Sedan', prompt: 'Press E to steal the Sedan', steal: true, body: 'sedan', color: 0x2e7f8a, topSpeed: 20, reverseTop: -6, engine: 8, brake: 12, wheelbase: 2.8, wheelRadius: 0.34, radius: 1.6, camDistance: 8.5, cruise: 0, x: -2.5, z: -12, yaw: Math.PI },
    { name: 'Sedan', type: 'Sedan', prompt: 'Press E to steal the Sedan', steal: true, body: 'sedan', color: 0xe8dcc0, topSpeed: 20, reverseTop: -6, engine: 8, brake: 12, wheelbase: 2.8, wheelRadius: 0.34, radius: 1.6, camDistance: 8.5, cruise: 0, x: -18, z: 0, yaw: Math.PI / 2 },
    { name: 'Sedan', type: 'Sedan', prompt: 'Press E to steal the Sedan', steal: true, body: 'sedan', color: 0xb03a2e, topSpeed: 20, reverseTop: -6, engine: 8, brake: 12, wheelbase: 2.8, wheelRadius: 0.34, radius: 1.6, camDistance: 8.5, cruise: 6, x: -2.5, z: 40, yaw: Math.PI, dir: 1 },
    { name: 'Motor', type: 'Motorbike', prompt: 'Press E to take the Motorbike', steal: true, body: 'bike', color: 0xe8b93a, topSpeed: 26, reverseTop: -5, engine: 12, brake: 12, wheelbase: 1.6, wheelRadius: 0.32, radius: 1.0, camDistance: 7, cruise: 0, x: 6.5, z: 18, yaw: Math.PI },
    { name: 'Truk', type: 'Truck', prompt: 'Press E to steal the Truk', steal: true, body: 'truck', color: 0x5a6a7a, topSpeed: 14, reverseTop: -5, engine: 5, brake: 10, wheelbase: 4.2, wheelRadius: 0.45, radius: 2.6, camDistance: 11, cruise: 0, x: 20, z: 30, yaw: Math.PI / 2 },
    { name: 'Bus', type: 'Bus', prompt: 'Press E to steal the Bus', steal: true, body: 'bus', color: 0x4a8a5a, topSpeed: 15, reverseTop: -5, engine: 5, brake: 10, wheelbase: 5.0, wheelRadius: 0.42, radius: 3.2, camDistance: 12, cruise: 0, x: -22, z: -30, yaw: -Math.PI / 2 },
  ];
  for (const spec of specs) {
    const v = createDrivableVehicle(spec);
    scene.add(v.group);
    vehicles.push(v);
    vehicleSpawn.push({ vehicle: v, x: spec.x, z: spec.z, yaw: spec.yaw });
  }

  return {
    get npcCount() { return npcs.length; },
    get vehicleCount() { return vehicles.length; },
    get fleeingCount() { return npcs.filter((n) => n.fleeing).length; },
    npcs,
    vehicles,
    /** The nearest civilian ride within `range` of (x, z), or null. */
    nearestEnterable(x, z, range) {
      let best = null;
      let bestDist = range;
      for (const v of vehicles) {
        const d = Math.hypot(x - v.group.position.x, z - v.group.position.z);
        if (d < bestDist) { best = v; bestDist = d; }
      }
      return best ? { vehicle: best, dist: bestDist } : null;
    },
    /** A round landed at (x, z): everyone close by runs away from it. */
    noteShot(x, z) {
      for (const npc of npcs) {
        const d = Math.hypot(npc.group.position.x - x, npc.group.position.z - z);
        if (d < SHOT_SCARE) npc.fleeFrom(x, z);
      }
    },
    /**
     * Stage the street-life shot: pedestrians mid-stride on the sidewalks
     * ahead of Raka, the cruiser mid-avenue, the motorbike on the right
     * edge, the truck and the bus further up the avenue.
     */
    stageStreet() {
      const spots = [
        [-7.5, 6, Math.PI], [7.5, 2, 0], [-7.5, -6, Math.PI],
        [7.5, -14, 0], [-7.5, -20, Math.PI],
      ];
      spots.forEach(([x, z, yaw], i) => {
        const npc = npcs[i];
        if (npc) { npc.setPose(x, z, yaw); npc.pose(0.9); }
      });
      const cruiser = vehicles.find((v) => v.ai);
      if (cruiser) cruiser.setPose(-2.5, -2, Math.PI);
      const bike = vehicles.find((v) => v.type === 'Motorbike');
      if (bike) bike.setPose(5.5, 6, Math.PI);
      const truck = vehicles.find((v) => v.type === 'Truck');
      if (truck) truck.setPose(4.5, -22, Math.PI);
      const bus = vehicles.find((v) => v.type === 'Bus');
      if (bus) bus.setPose(-4, -36, Math.PI);
    },
    /** Back to the seeded layout: rides parked, pedestrians walking. */
    reset() {
      for (const s of vehicleSpawn) {
        s.vehicle.setPose(s.x, s.z, s.yaw);
        s.vehicle.stolen = false;
      }
      for (const s of npcSpawn) s.npc.setPose(s.x, s.z, s.yaw);
    },
    /** One frame: self-driving rides, vehicle separation, pedestrians. */
    update(dt, player, heroCar) {
      for (const v of vehicles) {
        if (player.vehicle === v) continue;
        v.update(dt, null, world);
      }
      // The player's ride must not pass through the other parked rides:
      // push the other one out of the overlap and scrub the player's speed.
      if (player.vehicle) {
        const pv = player.vehicle;
        const others = [...vehicles, heroCar].filter((v) => v && v !== pv);
        for (const other of others) {
          const dx = other.group.position.x - pv.group.position.x;
          const dz = other.group.position.z - pv.group.position.z;
          const d = Math.hypot(dx, dz);
          const min = pv.radius + (other.radius ?? 1.6);
          if (d < min && d > 0.001) {
            const push = min - d;
            other.group.position.x += (dx / d) * push;
            other.group.position.z += (dz / d) * push;
            pv.ram();
          }
        }
      }
      // Pedestrians: a threat makes them run; a vehicle hitting one is a crime.
      for (const npc of npcs) {
        if (player.driving && player.vehicle) {
          const v = player.vehicle;
          const d = Math.hypot(
            npc.group.position.x - v.group.position.x,
            npc.group.position.z - v.group.position.z,
          );
          if (d < v.radius + 0.9 && Math.abs(v.speed) > 0.5) {
            npc.fleeFrom(v.group.position.x, v.group.position.z);
            if (npc.assaultCooldown <= 0) {
              police.noteAssault();
              // Step 13: running a pedestrian over sours the district he stands in.
              if (onCrime) onCrime(npc.group.position.x, npc.group.position.z);
              npc.assaultCooldown = 5;
            }
          }
        } else if (!player.driving) {
          const d = Math.hypot(npc.group.position.x - player.x, npc.group.position.z - player.z);
          if (d < BUMP_RANGE) npc.fleeFrom(player.x, player.z);
        }
        npc.update(dt, world);
      }
    },
  };
}
