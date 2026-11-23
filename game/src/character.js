// Raka, the protagonist: a low-poly humanoid built from boxes, with readable
// clothing colours (teal jacket, cream shirt, dark jeans, dark shoes). The arms
// and legs swing from shoulder and hip pivots, so a walk and a run read clearly
// from the third-person camera. The body turns smoothly to face the direction
// it moves in.

const SKIN = 0xc98d64;
const HAIR = 0x1f1a17;
const JACKET = 0x3a8ab0; // bright teal, so Raka reads against the dark road
const SHIRT = 0xf5f0e6;
const JEANS = 0x2b3a55;
const SHOES = 0x1a1a1a;

function box(width, height, depth, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Build Raka and return the rig the game loop drives. */
export function createProtagonist() {
  const group = new THREE.Group();
  const body = new THREE.Group(); // the whole upper body, for the run lean
  group.add(body);

  // --- head + hair ----------------------------------------------------------
  const head = box(0.34, 0.36, 0.32, SKIN, 0, 1.62, 0);
  body.add(head);
  body.add(box(0.36, 0.12, 0.34, HAIR, 0, 1.84, -0.01)); // hair cap
  body.add(box(0.36, 0.1, 0.08, HAIR, 0, 1.72, -0.16)); // hair at the back

  // --- torso: teal jacket over a cream shirt --------------------------------
  body.add(box(0.62, 0.62, 0.34, JACKET, 0, 1.15, 0));
  body.add(box(0.4, 0.5, 0.03, SHIRT, 0, 1.14, 0.18)); // shirt front
  body.add(box(0.64, 0.1, 0.36, JACKET, 0, 1.5, 0)); // collar/shoulder line

  // --- arms, pivoted at the shoulders ---------------------------------------
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.4 * side, 1.44, 0);
    pivot.add(box(0.18, 0.58, 0.2, JACKET, 0, -0.29, 0)); // sleeve
    pivot.add(box(0.16, 0.14, 0.16, SKIN, 0, -0.64, 0)); // hand
    body.add(pivot);
    return pivot;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // --- legs, pivoted at the hips --------------------------------------------
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.16 * side, 0.84, 0);
    pivot.add(box(0.22, 0.78, 0.24, JEANS, 0, -0.39, 0)); // jeans
    pivot.add(box(0.22, 0.12, 0.38, SHOES, 0, -0.8, 0.06)); // shoe, toe forward
    group.add(pivot);
    return pivot;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  let yaw = Math.PI; // facing north (-z) at the start
  let targetYaw = yaw;
  let walkPhase = 0;
  let idleTime = 0;
  let aiming = false; // the right arm points forward (shooting), held by the game loop

  /** Shortest signed angle from `from` to `to` (so the turn never spins the long way). */
  function angleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  return {
    group,
    /** The direction Raka faces (radians, 0 = +z, PI = -z / north). */
    get yaw() { return yaw; },
    /** Ask Raka to face a direction; he turns smoothly toward it. */
    face(directionYaw) { targetYaw = directionYaw; },
    /** Hold the aim pose (right arm forward, as if holding the pistol) or drop it. */
    aim(on) {
      aiming = on;
      // Apply at once, so a staged screenshot holds the pose even when the
      // animation never runs (the frozen frame); the live loop re-applies it
      // every frame anyway.
      if (on) armR.rotation.x = -1.5;
    },
    /** True while Raka is holding the aim pose. */
    get aiming() { return aiming; },
    /** Freeze the pose (used by the screenshot scenes). */
    setPose(phase, lean) {
      walkPhase = phase;
      legL.rotation.x = Math.sin(phase) * 0.55;
      legR.rotation.x = -Math.sin(phase) * 0.55;
      armL.rotation.x = -Math.sin(phase) * 0.45;
      armR.rotation.x = Math.sin(phase) * 0.45;
      body.rotation.x = lean;
    },
    /**
     * Sit on a motorbike: face `nextYaw` at once (the rider turns with the
     * bike, no lag), thighs bent forward astride the tank and splayed a
     * touch so the legs clear it, arms reaching forward for the bars, and
     * a slight forward lean. The game loop calls this every frame while
     * he rides, so the pose holds against the walk animation.
     */
    ride(nextYaw) {
      targetYaw = nextYaw;
      yaw = nextYaw;
      group.rotation.y = nextYaw;
      legL.rotation.x = -1.25; legR.rotation.x = -1.25;
      legL.rotation.z = -0.18; legR.rotation.z = 0.18;
      armL.rotation.x = -1.15; armR.rotation.x = -1.15;
      body.rotation.x = 0.12;
    },
    /**
     * Swim: a front crawl — the body leans forward, the arms reach overhead
     * in turns and the legs kick behind. `fast` strokes harder. The game
     * loop calls this instead of update() while Raka is in deep water, so
     * the walk animation never fights it.
     */
    swim(dt, fast) {
      walkPhase += dt * (fast ? 9 : 6);
      const stroke = Math.sin(walkPhase);
      const kick = Math.sin(walkPhase * 2);
      // Arms overhead in turns, like a crawl stroke.
      armL.rotation.x = -2.2 + stroke * 0.6;
      armR.rotation.x = -2.2 - stroke * 0.6;
      // Legs kick behind him.
      legL.rotation.x = kick * 0.5;
      legR.rotation.x = -kick * 0.5;
      // A slight forward lean, and the turn still eases toward the target.
      yaw += angleDelta(yaw, targetYaw) * Math.min(1, dt * 10);
      group.rotation.y = yaw;
      body.rotation.x = 0.3;
    },
    /** Back on his feet: limbs and lean to neutral (the idle update settles them too). */
    stand() {
      legL.rotation.x = 0; legR.rotation.x = 0;
      legL.rotation.z = 0; legR.rotation.z = 0;
      armL.rotation.x = 0; armR.rotation.x = 0;
      body.rotation.x = 0;
      group.position.y = 0;
    },
    /**
     * Advance the animation. `speed` is the current ground speed (0 when idle);
     * `moving` says whether a move key is held. Called every frame.
     */
    update(dt, speed, moving) {
      // Turn smoothly toward the target facing.
      yaw += angleDelta(yaw, targetYaw) * Math.min(1, dt * 10);
      group.rotation.y = yaw;

      if (moving && speed > 0.1) {
        walkPhase += dt * (speed > 5 ? 11 : 7.5);
        const swing = Math.min(1, speed / 6);
        legL.rotation.x = Math.sin(walkPhase) * 0.55 * swing;
        legR.rotation.x = -Math.sin(walkPhase) * 0.55 * swing;
        armL.rotation.x = -Math.sin(walkPhase) * 0.45 * swing;
        // Aiming holds the right arm forward (the pistol); otherwise it swings.
        armR.rotation.x = aiming ? -1.5 : Math.sin(walkPhase) * 0.45 * swing;
        // A slight forward lean at a run.
        body.rotation.x = speed > 5 ? 0.1 : 0.03;
        // A small vertical bob with each step.
        group.position.y = Math.abs(Math.sin(walkPhase)) * 0.05;
      } else {
        // Idle: limbs settle, breathing bob. The aim pose holds through it.
        idleTime += dt;
        legL.rotation.x *= 0.8; legR.rotation.x *= 0.8;
        armL.rotation.x *= 0.8;
        armR.rotation.x = aiming ? -1.5 : armR.rotation.x * 0.8;
        body.rotation.x *= 0.8;
        group.position.y = Math.sin(idleTime * 2) * 0.015;
      }
    },
  };
}
