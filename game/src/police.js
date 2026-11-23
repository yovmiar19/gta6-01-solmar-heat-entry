// The Solmar Bay police: a wanted level (0–5 stars), black-and-white patrol
// cars that chase Raka when the heat is on, and a helicopter circling
// overhead at 3 stars and up. Crimes are speeding and smashing into
// buildings; lay low out of sight and the heat cools off. Get caught and it
// is BUSTED: the wanted level clears and Raka is hauled back to the start.

const MAX_WANTED = 5;
const SPEED_LIMIT = 14; // metres per second, about 50 km/h
const SPEED_TIME = 3; // seconds over the limit earns a star
const CRIME_COOLDOWN = 4; // seconds between one star and the next
const DECAY_QUIET = 12; // seconds with no crime before the heat cools
const DECAY_STEP = 8; // seconds per star lost while cooling off
const LOSE_RANGE = 20; // a police car closer than this keeps the heat on
const BUST_RANGE = 2.4; // a police car this close is on top of the player
const BUST_TIME_FOOT = 1.0; // seconds pinned on foot before the bust lands
const BUST_TIME_CAR = 2.5; // seconds boxed in while driving
const CAR_RADIUS = 1.6; // collision circle around a police car
const RAM_RANGE = 2.6; // a police car this close rams the player's car
const RAM_COOLDOWN = 0.6; // seconds between rams from the same chase
const RAM_DAMAGE = 12; // health a ram costs Raka, jolted in his seat
const PIN_DAMAGE = 25; // health a second while a patrol car sits on Raka on foot
const POLICE_TOP = 17; // base top speed; +1 per star, so they keep up
const HELI_HEIGHT = 26; // how high the helicopter circles
const HELI_RADIUS = 14; // how wide its circle is around the player

const BODY_BLACK = 0x14161a;
const BODY_WHITE = 0xf2f2f2;
const GLASS = 0x1c2530;
const TRIM = 0x232326;
const TYRE = 0x141414;
const HUB = 0xb8bcc2;
const RED = 0xff2a1a;
const BLUE = 0x2a6bff;
const HEADLIGHT = 0xfff2c0;

function pbox(width, height, depth, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.5,
      metalness: opts.metalness ?? 0.25,
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

/** Shortest signed angle from `from` to `to` (so a turn never spins the long way). */
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** One patrol car: black body, white doors and roof, a flashing light bar. */
function createPatrolCar() {
  const group = new THREE.Group();
  group.userData.policeCar = true; // the combat raycast knows what it hit

  // --- body: black shell, white doors, white roof, dark glass --------------
  group.add(pbox(1.9, 0.55, 4.4, BODY_BLACK, 0, 0.55, 0));
  group.add(pbox(1.92, 0.4, 1.6, BODY_WHITE, 0, 0.62, 0.3)); // white doors
  group.add(pbox(1.7, 0.42, 2.0, BODY_WHITE, 0, 1.02, -0.2, { roughness: 0.4, metalness: 0.3 })); // white roof
  group.add(pbox(1.6, 0.38, 1.4, GLASS, 0, 1.0, -0.2, { roughness: 0.15, metalness: 0.5 })); // glass
  group.add(pbox(1.92, 0.22, 0.3, TRIM, 0, 0.32, 2.2)); // front bumper
  group.add(pbox(1.92, 0.22, 0.3, TRIM, 0, 0.32, -2.2)); // rear bumper

  // --- lights: warm headlights, red taillights ------------------------------
  group.add(pbox(0.34, 0.12, 0.06, HEADLIGHT, -0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(pbox(0.34, 0.12, 0.06, HEADLIGHT, 0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(pbox(0.34, 0.1, 0.06, RED, -0.6, 0.62, -2.21, { emissive: RED, emissiveIntensity: 1.6 }));
  group.add(pbox(0.34, 0.1, 0.06, RED, 0.6, 0.62, -2.21, { emissive: RED, emissiveIntensity: 1.6 }));

  // --- light bar: dark base, red on the left, blue on the right -------------
  group.add(pbox(1.2, 0.12, 0.4, TRIM, 0, 1.32, 0));
  const redMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2.6 });
  const blueMat = new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 0.25 });
  const redBar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.34), redMat);
  redBar.position.set(-0.32, 1.42, 0);
  group.add(redBar);
  const blueBar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.34), blueMat);
  blueBar.position.set(0.32, 1.42, 0);
  group.add(blueBar);

  // --- wheels: steer at the front, spin with the speed ----------------------
  const wheels = [];
  function makeWheel(x, z, steers) {
    const steerGroup = new THREE.Group();
    steerGroup.position.set(x, 0.34, z);
    const spinGroup = new THREE.Group();
    steerGroup.add(spinGroup);
    const tyre = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14),
      new THREE.MeshStandardMaterial({ color: TYRE, roughness: 0.95 }),
    );
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    spinGroup.add(tyre);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10),
      new THREE.MeshStandardMaterial({ color: HUB, roughness: 0.35, metalness: 0.7 }),
    );
    hub.rotation.z = Math.PI / 2;
    spinGroup.add(hub);
    group.add(steerGroup);
    wheels.push({ steerGroup, spinGroup, steers });
    return { steerGroup, spinGroup, steers };
  }
  makeWheel(-0.85, 1.45, true);
  makeWheel(0.85, 1.45, true);
  makeWheel(-0.85, -1.45, false);
  makeWheel(0.85, -1.45, false);

  let yaw = Math.PI; // facing north (-z) at the start
  let speed = 0;
  let steer = 0; // smoothed steering angle, for the front wheels
  let spin = 0; // wheel roll angle

  return {
    group,
    /** The direction the car faces (radians, 0 = +z, PI = -z / north). */
    get yaw() { return yaw; },
    /** Signed speed in metres per second. */
    get speed() { return speed; },
    /** Put the car on a spot and a heading at once (spawn / staging). */
    setPose(x, z, nextYaw) {
      group.position.set(x, 0, z);
      yaw = nextYaw;
      group.rotation.y = yaw;
      speed = 0;
    },
    /** Stop the car dead (the bust freezes the chase). */
    halt() { speed = 0; },
    /** Flash the light bar: red and blue take turns. */
    flash(time) {
      const redOn = (time % 0.5) < 0.25;
      redMat.emissiveIntensity = redOn ? 2.6 : 0.25;
      blueMat.emissiveIntensity = redOn ? 0.25 : 2.6;
    },
    /**
     * Chase one frame. Steer toward the target, hold `closePace` up close so
     * the car stays on the bumper, and never drive through a building.
     */
    chase(dt, tx, tz, topSpeed, world, closePace) {
      const dx = tx - group.position.x;
      const dz = tz - group.position.z;
      const dist = Math.hypot(dx, dz);
      // Turn toward the target, at most ~2.2 radians a second.
      const desired = Math.atan2(dx, dz);
      const turn = angleDelta(yaw, desired);
      const maxTurn = 2.2 * dt;
      yaw += Math.max(-maxTurn, Math.min(maxTurn, turn));
      group.rotation.y = yaw;
      // Close in fast from far away; hold the pace up close.
      const want = dist > 4 ? topSpeed : closePace;
      if (speed < want) speed = Math.min(want, speed + 8 * dt);
      else speed = Math.max(want, speed - 10 * dt);
      if (Math.abs(speed) < 0.02) speed = 0;

      // Move, then keep the car out of the buildings (same push-out as the
      // player's car: shortest way out, half the speed scrubbed).
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      group.position.x += fx * speed * dt;
      group.position.z += fz * speed * dt;
      group.position.x = Math.max(-world.bounds, Math.min(world.bounds, group.position.x));
      group.position.z = Math.max(-world.bounds, Math.min(world.bounds, group.position.z));
      for (const b of world.colliders) {
        const cx = Math.max(b.minX, Math.min(group.position.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(group.position.z, b.maxZ));
        const ox = group.position.x - cx;
        const oz = group.position.z - cz;
        const d = Math.hypot(ox, oz);
        if (d < CAR_RADIUS) {
          if (d > 0.001) {
            group.position.x = cx + (ox / d) * CAR_RADIUS;
            group.position.z = cz + (oz / d) * CAR_RADIUS;
          } else {
            group.position.z = b.maxZ + CAR_RADIUS;
          }
          speed *= 0.5;
        }
      }

      // Wheels: front pair steers toward the target, all four roll.
      spin += (speed * dt) / 0.34;
      const steerTarget = Math.max(-0.5, Math.min(0.5, turn * 0.9));
      steer += (steerTarget - steer) * Math.min(1, dt * 6);
      for (const wheel of wheels) {
        wheel.spinGroup.rotation.x = spin;
        if (wheel.steers) wheel.steerGroup.rotation.y = steer;
      }
    },
  };
}

/** The helicopter: a dark fuselage with a spinning rotor and a searchlight. */
function createHelicopter() {
  const group = new THREE.Group();
  group.userData.helicopter = true; // the combat raycast knows what it hit
  group.add(pbox(2.2, 1.0, 3.2, 0x20262e, 0, 0, 0)); // fuselage
  group.add(pbox(1.6, 0.7, 1.0, GLASS, 0, 0.2, 1.4, { roughness: 0.15, metalness: 0.5 })); // glass nose
  group.add(pbox(0.4, 0.4, 3.4, 0x20262e, 0, 0.3, -2.8)); // tail boom
  group.add(pbox(0.3, 1.0, 0.2, RED, 0, 0.5, -4.4, { emissive: RED, emissiveIntensity: 1 })); // tail fin
  const rotor = new THREE.Group();
  rotor.position.y = 0.75;
  rotor.add(pbox(7.5, 0.08, 0.35, TRIM, 0, 0, 0));
  rotor.add(pbox(0.35, 0.08, 7.5, TRIM, 0, 0, 0));
  group.add(rotor);
  // A translucent searchlight cone, apex at the helicopter, base near the
  // ground. It hangs straight down; the circle keeps it close to the player.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 24, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -12;
  cone.castShadow = false;
  group.add(cone);

  let angle = 0;
  return {
    group,
    /** Park the helicopter above a spot (screenshot staging). */
    setPose(px, pz) {
      angle = 0;
      group.position.set(px + HELI_RADIUS, HELI_HEIGHT, pz);
      group.rotation.y = 0;
    },
    /** Circle the player, rotor spinning, searchlight hanging below. */
    orbit(dt, px, pz) {
      angle += dt * 0.3;
      group.position.set(px + Math.cos(angle) * HELI_RADIUS, HELI_HEIGHT, pz + Math.sin(angle) * HELI_RADIUS);
      group.rotation.y = -angle;
      rotor.rotation.y += dt * 14;
    },
  };
}

/**
 * The wanted system and the police that answer it. `scene` and `world` are
 * the city the patrol cars drive in; `player` (each update) is where Raka
 * is, whether he is driving, how fast, and his car rig (or null on foot).
 */
export function createPolice(scene, world) {
  const cars = []; // patrol cars in the scene
  let heli = null;
  let wanted = 0;
  let busted = false;
  let flashTime = 0;
  let speedTime = 0; // seconds continuously over the limit
  let cooldown = 0; // seconds until another star can be earned
  let quietTime = 0; // seconds since the last crime
  let decayTimer = 0;
  let bustTimer = 0;
  let ramTimer = 0;

  /** How many patrol cars the current heat calls for. */
  function wantedCount() {
    return wanted === 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : 3;
  }

  /** Push a spawn point out of any building footprint. */
  function placeOnStreet(x, z) {
    for (const b of world.colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if (Math.hypot(x - cx, z - cz) < CAR_RADIUS + 0.5) {
        const dx = x - cx;
        const dz = z - cz;
        if (Math.abs(dx) > Math.abs(dz)) x = cx + Math.sign(dx || 1) * (CAR_RADIUS + 0.5);
        else z = cz + Math.sign(dz || 1) * (CAR_RADIUS + 0.5);
      }
    }
    return {
      x: Math.max(-world.bounds, Math.min(world.bounds, x)),
      z: Math.max(-world.bounds, Math.min(world.bounds, z)),
    };
  }

  function spawnCar(px, pz) {
    const car = createPatrolCar();
    const spot = placeOnStreet(px, pz);
    car.setPose(spot.x, spot.z, Math.PI);
    scene.add(car.group);
    cars.push(car);
    return car;
  }

  /** Keep the right number of patrol cars out, and the helicopter at 3+. */
  function syncCars(px, pz) {
    const need = wantedCount();
    while (cars.length < need) {
      const i = cars.length;
      spawnCar(px + (i % 2 === 0 ? 2.5 : -2.5), pz + 26 + i * 7);
    }
    while (cars.length > need) {
      scene.remove(cars.pop().group);
    }
    if (wanted >= 3 && !heli) {
      heli = createHelicopter();
      heli.setPose(px, pz);
      scene.add(heli.group);
    }
    if (wanted < 3 && heli) {
      scene.remove(heli.group);
      heli = null;
    }
  }

  /** Earn a star, unless one was just earned (the cooldown) or at the cap. */
  function earnStar() {
    if (cooldown > 0 || wanted >= MAX_WANTED) return;
    wanted = Math.min(MAX_WANTED, wanted + 1);
    cooldown = CRIME_COOLDOWN;
    quietTime = 0;
    decayTimer = 0;
  }

  return {
    /** The wanted level, 0–5 stars. */
    get wanted() { return wanted; },
    /** How many patrol cars are on the road right now. */
    get count() { return cars.length; },
    /** True once a patrol car has pinned the player: the bust has landed. */
    get busted() { return busted; },
    /**
     * Speeding: call every frame while driving; `over` says the player is
     * over the limit right now. A few seconds of it earns a star.
     */
    noteSpeeding(dt, over) {
      if (busted) return;
      if (over) {
        quietTime = 0;
        speedTime += dt;
        if (speedTime >= SPEED_TIME) {
          speedTime = 0;
          earnStar();
        }
      } else {
        speedTime = 0;
      }
    },
    /** A building hit: one scrape can earn a star (cooled down between stars). */
    noteCollision() {
      if (busted) return;
      quietTime = 0;
      earnStar();
    },
    /** A round fired at a patrol car: shooting the police is a crime too. */
    noteShooting() {
      if (busted) return;
      quietTime = 0;
      earnStar();
    },
    /** Raka stole a civilian ride: that is a crime, one star. */
    noteTheft() {
      if (busted) return;
      quietTime = 0;
      earnStar();
    },
    /** Raka hit a pedestrian (with a vehicle, or with a round): a crime. */
    noteAssault() {
      if (busted) return;
      quietTime = 0;
      earnStar();
    },
    /** Set the wanted level at once (tests and screenshot staging). */
    setWanted(n) {
      wanted = Math.max(0, Math.min(MAX_WANTED, n));
      cooldown = 0;
      quietTime = 0;
      decayTimer = 0;
      speedTime = 0;
    },
    /** Test helper: force the bust on the next update. */
    forceBust() { bustTimer = BUST_TIME_CAR; },
    /** Test helper: put the first patrol car right beside the player. */
    placeNear(px, pz) {
      if (cars.length === 0) spawnCar(px + 3, pz + 3);
      cars[0].setPose(px + 1.2, pz + 1.2, Math.PI);
    },
    /**
     * Stage a screenshot: `level` stars, the player's car at (px, pz) heading
     * `yaw`, patrol cars fanned out behind it and the helicopter overhead.
     */
    stage(level, px, pz, yaw) {
      this.setWanted(level);
      syncCars(px, pz);
      const spots = [[2.5, 8], [-2.5, 13], [0.5, 19]];
      cars.forEach((car, i) => {
        const s = spots[i % spots.length];
        const spot = placeOnStreet(px + s[0], pz + s[1]);
        car.setPose(spot.x, spot.z, yaw);
      });
      if (heli) heli.setPose(px, pz);
    },
    /** Clear the heat: no stars, no cars, no helicopter, no bust. */
    reset() {
      wanted = 0;
      busted = false;
      speedTime = 0;
      cooldown = 0;
      quietTime = 0;
      decayTimer = 0;
      bustTimer = 0;
      ramTimer = 0;
      while (cars.length > 0) scene.remove(cars.pop().group);
      if (heli) {
        scene.remove(heli.group);
        heli = null;
      }
    },
    /** Stop every patrol car where it is (the bust freezes the chase). */
    haltAll() {
      for (const car of cars) car.halt();
    },
    /**
     * One frame: cool the heat down when the player lays low and out of
     * sight, keep the right number of patrol cars on the road, chase the
     * player, ram the car when close, and call the bust when a car pins them.
     * Returns the health the police cost Raka this frame (a ram while
     * driving, a patrol car sitting on him on foot).
     */
    update(dt, player) {
      if (busted) return 0;
      flashTime += dt;
      cooldown = Math.max(0, cooldown - dt);
      quietTime += dt;
      ramTimer = Math.max(0, ramTimer - dt);
      let damage = 0;

      // --- cooling off: no crime for a while and no police car close -------
      if (wanted > 0 && quietTime > DECAY_QUIET) {
        let nearest = Infinity;
        for (const car of cars) {
          nearest = Math.min(
            nearest,
            Math.hypot(car.group.position.x - player.x, car.group.position.z - player.z),
          );
        }
        if (nearest > LOSE_RANGE) {
          decayTimer += dt;
          if (decayTimer >= DECAY_STEP) {
            wanted -= 1;
            decayTimer = 0;
            quietTime = 0;
          }
        } else {
          decayTimer = 0;
        }
      }

      syncCars(player.x, player.z);

      // --- the chase: steer at the player, ram the car, pin the player ------
      // Up close the patrol car matches the player's pace so it stays on the
      // bumper; on foot there is no pace to match, so it keeps coming.
      const topSpeed = POLICE_TOP + wanted;
      const closePace = player.driving ? Math.max(3, Math.abs(player.speed)) : topSpeed;
      let pinned = false;
      for (const car of cars) {
        car.chase(dt, player.x, player.z, topSpeed, world, closePace);
        car.flash(flashTime);
        const d = Math.hypot(car.group.position.x - player.x, car.group.position.z - player.z);
        if (d < BUST_RANGE) {
          pinned = true;
          // On foot a patrol car sitting on Raka hurts him, second by second.
          if (!player.driving) damage += PIN_DAMAGE * dt;
        }
        if (player.driving && player.car && d < RAM_RANGE && ramTimer <= 0) {
          player.car.ram();
          damage += RAM_DAMAGE;
          ramTimer = RAM_COOLDOWN;
        }
      }
      if (heli) heli.orbit(dt, player.x, player.z);

      // --- the bust: pinned long enough, on foot or boxed in ---------------
      const bustTime = player.driving ? BUST_TIME_CAR : BUST_TIME_FOOT;
      if (pinned) {
        bustTimer += dt;
        if (bustTimer >= bustTime) {
          busted = true;
          this.haltAll();
        }
      } else {
        bustTimer = 0;
      }
      return damage;
    },
  };
}
