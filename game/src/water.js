// Step 9 — the beach and the bay: sand, palms, umbrellas, a lighthouse,
// the animated sea, its foam shoreline, and the boats Raka can steal.
// The beach runs along the south end of the city (past the avenue's end),
// the sea beyond it. Everything here is generated in code, so the same
// seed always builds the same shore.
//
// Layout: the dry sand runs z = 56 to 78, the waterline is z = 78, and the
// sea runs z = 78 to 120. The water is a plane at y ~ 0.12 whose vertices
// rise and fall in waves; the depth is a function of z alone, so the game
// loop can ask how deep Raka stands: ankle-deep wading, waist-deep wading,
// and deep enough to swim past z = 92.

const WATERLINE_Z = 78; // where the sand meets the sea
const SWIM_Z = 92; // past this the water is deep enough to swim in
const SEA_MAX_Z = 116; // the far edge Raka (or a boat) may reach
const BEACH_Z = 62; // where a drowned Raka washes back up

/** The depth of the water at a spot (0 on dry land, in metres). */
export function depthAt(x, z) {
  if (z <= WATERLINE_Z) return 0;
  if (z <= 84) return ((z - WATERLINE_Z) / 6) * 0.5; // ankle-deep
  if (z <= SWIM_Z) return 0.5 + ((z - 84) / 8) * 0.9; // waist-deep
  return Math.min(3, 1.4 + (z - SWIM_Z) * 0.12); // deep, and deeper out
}

/** The height of the sea surface at a spot and a time (waves included). */
export function waveHeight(x, z, t) {
  return 0.12
    + 0.10 * Math.sin(x * 0.15 + t * 1.2)
    + 0.08 * Math.sin(z * 0.22 + t * 0.9);
}

function box(width, height, depth, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** A palm tree on the sand: a leaning trunk and six drooping leaves. */
function addPalm(scene, x, z, lean) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 4.6, 8), trunkMat);
  trunk.position.y = 2.3; trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.6), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.1, 4.9, Math.sin(angle) * 1.1);
    leaf.rotation.y = -angle;
    leaf.rotation.x = 0.5;
    leaf.castShadow = true;
    palm.add(leaf);
  }
  palm.rotation.z = lean;
  palm.position.set(x, 0, z);
  scene.add(palm);
}

/** A beach umbrella: a pole and a bright striped canopy. */
function addUmbrella(scene, x, z, color) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }),
  );
  pole.position.y = 1.15; pole.castShadow = true;
  group.add(pole);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.7, 0.7, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
  );
  canopy.position.y = 2.5; canopy.castShadow = true;
  group.add(canopy);
  group.position.set(x, 0, z);
  scene.add(group);
}

/** A beach chair: a low seat and a tilted back, waiting for the sun. */
function addChair(scene, x, z, yaw, color) {
  const group = new THREE.Group();
  group.add(box(0.65, 0.08, 1.1, color, 0, 0.28, 0));
  const back = box(0.65, 0.9, 0.08, color, 0, 0.6, -0.55);
  back.rotation.x = -0.5;
  group.add(back);
  for (const [lx, lz] of [[-0.28, 0.45], [0.28, 0.45], [-0.28, -0.45], [0.28, -0.45]]) {
    group.add(box(0.06, 0.28, 0.06, 0x8a7a5e, lx, 0.14, lz));
  }
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
}

/** A surfboard stuck upright in the sand, nose to the sky. */
function addSurfboard(scene, x, z, yaw, color) {
  const board = box(0.55, 1.9, 0.07, color, x, 0.85, z, { roughness: 0.4 });
  board.rotation.z = 0.35;
  board.rotation.y = yaw;
  scene.add(board);
}

/** The lighthouse at the east end of the beach: white tower, red bands. */
function addLighthouse(scene, x, z) {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc23a2e, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 9, 12), white);
  tower.position.y = 4.5; tower.castShadow = true;
  group.add(tower);
  for (const y of [2.5, 6.5]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.08, 1.1, 12), red);
    band.position.y = y; band.castShadow = true;
    group.add(band);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 12), red);
  cap.position.y = 9.2; cap.castShadow = true;
  group.add(cap);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffc46b, emissiveIntensity: 2 }),
  );
  lamp.position.y = 9.8;
  group.add(lamp);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7 }),
  );
  roof.position.y = 10.6; roof.castShadow = true;
  group.add(roof);
  group.position.set(x, 0, z);
  scene.add(group);
}

/**
 * A boat Raka can steal and drive: a low-poly speedboat with a white hull,
 * a teal stripe, a dark windshield and an outboard motor. It drives like
 * the arcade cars (W gas, S brake/reverse, A/D steer) but turns slower and
 * bobs on the waves; it cannot leave the water (the shore stops it).
 */
function createBoat(spec) {
  const group = new THREE.Group();
  const HULL = 0xf2f2ee;
  const STRIPE = 0x2e7f8a;
  const GLASS = 0x1c2530;
  const TRIM = 0x232326;

  // --- hull: a long shell, a pointed bow, a teal stripe along the side ---
  group.add(box(1.8, 0.55, 3.6, HULL, 0, 0.35, -0.4, { roughness: 0.35, metalness: 0.1 }));
  const bow = box(1.8, 0.55, 1.4, HULL, 0, 0.35, 1.9, { roughness: 0.35, metalness: 0.1 });
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(0.72, 1, 0.72);
  group.add(bow);
  group.add(box(1.84, 0.12, 3.6, STRIPE, 0, 0.5, -0.4, { roughness: 0.4 }));
  group.add(box(1.6, 0.3, 1.6, HULL, 0, 0.75, -0.9, { roughness: 0.4 })); // deck
  // --- windshield, seats, outboard motor ----------------------------------
  const shield = box(1.4, 0.5, 0.08, GLASS, 0, 1.05, 0.2, { roughness: 0.15, metalness: 0.5 });
  shield.rotation.x = -0.35;
  group.add(shield);
  group.add(box(0.9, 0.35, 0.5, TRIM, 0, 0.85, -0.5)); // helm seat
  group.add(box(0.9, 0.35, 0.5, TRIM, 0, 0.85, -1.2)); // rear bench
  group.add(box(0.4, 0.7, 0.3, TRIM, 0, 0.35, -2.35)); // outboard motor

  let yaw = spec.yaw ?? 0;
  let speed = 0; // signed, metres per second; positive is forward
  let steer = 0; // smoothed steering angle
  let stolen = false;
  group.position.set(spec.x, waveHeight(spec.x, spec.z, 0), spec.z);
  group.rotation.y = yaw;

  return {
    group,
    /** The name the HUD shows while driving it ("Speedboat"). */
    name: spec.name,
    /** 'Boat': the only water ride. */
    type: 'Boat',
    /** The prompt shown when Raka stands next to it. */
    prompt: spec.prompt,
    /** Taking it is a crime (a wanted star). Always true for the boats. */
    steal: true,
    /** The circle the radar and the enter range use. */
    radius: 2.2,
    /** How far the chase camera sits while driving it. */
    camDistance: 10,
    get yaw() { return yaw; },
    get speed() { return speed; },
    /** Boats never scrape a building: the sea has none. */
    get hits() { return 0; },
    get stolen() { return stolen; },
    set stolen(v) { stolen = v; },
    /** A police ram (from the helicopter's wash, or a bump): cut the speed. */
    ram() { speed *= 0.45; },
    /** Put the boat on a heading at once (spawn / staging). */
    setHeading(nextYaw) {
      yaw = nextYaw;
      group.rotation.y = yaw;
    },
    /** Stop the boat dead (used when Raka gets out). */
    halt() { speed = 0; },
    /**
     * Drive one frame. `input` carries the keys; `water` carries the sea
     * bounds. The boat turns slower than a car (a long hull) and bobs on
     * the waves; the shore (z = 80) stops it from beaching itself.
     */
    update(dt, input, water) {
      const throttle = input.forward; // +1 W, -1 S
      const steerInput = input.strafe; // +1 D (right), -1 A (left)
      const TOP_SPEED = 17; // about 60 km/h
      const REVERSE_TOP = 4;
      if (throttle > 0) speed += 6 * dt;
      else if (throttle < 0) {
        if (speed > 0.5) speed -= 10 * dt;
        else speed -= 4 * dt;
      } else {
        const drag = 2 * dt; // the water drags the hull to a stop
        speed = Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
      }
      speed = Math.max(-REVERSE_TOP, Math.min(TOP_SPEED, speed));
      if (Math.abs(speed) < 0.02) speed = 0;

      // A long hull turns lazily: the yaw rate follows the speed over a
      // 4.5-metre wheelbase, and the turn eases in like a car's.
      const steerTarget = steerInput * 0.45 / (1 + Math.abs(speed) * 0.05);
      steer += (steerTarget - steer) * Math.min(1, dt * 6);
      yaw -= (speed / 4.5) * Math.tan(steer) * dt;
      group.rotation.y = yaw;

      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      group.position.x += fx * speed * dt;
      group.position.z += fz * speed * dt;
      // Stay in the bay: the shore to the north, the open sea to the south.
      group.position.x = Math.max(-58, Math.min(58, group.position.x));
      if (group.position.z < 80) { group.position.z = 80; speed *= 0.5; }
      if (group.position.z > SEA_MAX_Z) { group.position.z = SEA_MAX_Z; speed *= 0.5; }

      // Bob on the waves and lean into the turn, like a hull in a swell.
      const t = performance.now() / 1000;
      group.position.y = waveHeight(group.position.x, group.position.z, t);
      group.rotation.z = Math.sin(t * 0.9 + group.position.x * 0.1) * 0.04 - steer * 0.12;
      group.rotation.x = Math.sin(t * 0.7 + group.position.z * 0.12) * 0.03;
    },
  };
}

/**
 * Build the beach and the bay into `scene` and return the rig the game
 * loop drives: the boats, the depth and wave helpers, and the update step
 * (the waves roll, the foam breathes, the parked boats bob).
 */
export function createWater(scene, world) {
  // --- the sand: a warm strip along the south end of the city -------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 22),
    new THREE.MeshStandardMaterial({ color: 0xdcc48f, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, 67);
  sand.receiveShadow = true;
  scene.add(sand);

  // --- the sea: a wide plane whose vertices rise and fall in waves --------
  const seaGeo = new THREE.PlaneGeometry(240, 44, 48, 12);
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x1e6f9e, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.85,
  });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.12, 98); // z = 76 to 120
  sea.receiveShadow = true;
  scene.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();

  // --- the foam: a white breath at the waterline ---------------------------
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xf4fbff, transparent: true, opacity: 0.4, depthWrite: false,
  });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(240, 1.6), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.16, WATERLINE_Z);
  scene.add(foam);

  // --- the beach furniture --------------------------------------------------
  addPalm(scene, -14, 60, 0.08);
  addPalm(scene, -6, 70, -0.06);
  addPalm(scene, 10, 62, 0.1);
  addPalm(scene, 22, 70, -0.08);
  addPalm(scene, 34, 62, 0.06);
  addPalm(scene, -30, 68, -0.05);
  addUmbrella(scene, -12, 64, 0xff5fa2);
  addUmbrella(scene, 6, 70, 0x35e0ff);
  addUmbrella(scene, 24, 62, 0xff9a3d);
  addChair(scene, -11, 66, Math.PI, 0xff5fa2);
  addChair(scene, 7, 72, Math.PI, 0x35e0ff);
  addChair(scene, 25, 64, Math.PI, 0xff9a3d);
  addSurfboard(scene, -8, 63, 0.4, 0x35e0ff);
  addSurfboard(scene, 16, 68, -0.3, 0xff9a3d);
  addLighthouse(scene, 48, 66);

  // --- the boats: two of them, moored off the beach ------------------------
  const boats = [
    createBoat({ name: 'Speedboat', prompt: 'Press E to take the Speedboat', x: 12, z: 96, yaw: Math.PI / 2 }),
    createBoat({ name: 'Fishing Boat', prompt: 'Press E to take the Fishing Boat', x: -16, z: 104, yaw: -Math.PI / 2 }),
  ];
  for (const boat of boats) scene.add(boat.group);

  let time = 0;

  return {
    /** The boats Raka can steal (the radar draws them, the loop enters them). */
    boats,
    /** Where the sand meets the sea. */
    waterlineZ: WATERLINE_Z,
    /** Past this the water is deep enough to swim in. */
    swimZ: SWIM_Z,
    /** The far edge of the bay. */
    seaMaxZ: SEA_MAX_Z,
    /** Where a drowned Raka washes back up. */
    beachSpawn: { x: 0, z: BEACH_Z },
    /** The depth of the water at a spot (0 on dry land). */
    depthAt,
    /** The height of the sea surface at a spot and a time. */
    waveHeight,
    /** The nearest boat Raka can get into, or null. */
    nearestBoat(x, z, range) {
      let best = null;
      let bestDist = range;
      for (const boat of boats) {
        const d = Math.hypot(x - boat.group.position.x, z - boat.group.position.z);
        if (d < bestDist) { best = boat; bestDist = d; }
      }
      return best ? { vehicle: best, dist: bestDist } : null;
    },
    /** Put the boats back where they moored, un-stolen (a fresh start). */
    reset() {
      boats[0].group.position.set(12, waveHeight(12, 96, time), 96);
      boats[0].setHeading(Math.PI / 2);
      boats[0].halt();
      boats[0].stolen = false;
      boats[1].group.position.set(-16, waveHeight(-16, 104, time), 104);
      boats[1].setHeading(-Math.PI / 2);
      boats[1].halt();
      boats[1].stolen = false;
    },
    /**
     * One frame: the waves roll (each vertex rises and falls), the foam
     * breathes at the waterline, and the parked boats bob. A staged
     * screenshot frame holds the sea still. `driven` is the boat Raka is
     * driving, if any: its own update sets its height, so it is skipped
     * here and never double-bobbed.
     */
    update(dt, { driven = null, frozen = false } = {}) {
      if (!frozen) time += dt;
      const pos = seaGeo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const lx = seaBase[i * 3];
        const ly = seaBase[i * 3 + 1];
        const wx = lx; // the sea is centred on x = 0
        const wz = 98 - ly; // local +y maps to world -z after the rotation
        pos.array[i * 3 + 2] = waveHeight(wx, wz, time) - 0.12;
      }
      pos.needsUpdate = true;
      seaGeo.computeVertexNormals();
      foamMat.opacity = 0.3 + 0.18 * Math.sin(time * 1.5);
      for (const boat of boats) {
        if (boat === driven) continue;
        boat.group.position.y = waveHeight(
          boat.group.position.x, boat.group.position.z, time,
        );
      }
    },
  };
}
