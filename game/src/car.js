// The Sunset GT: Raka's ride, a low-poly orange sedan parked on the main
// avenue. Arcade driving — W accelerates, S brakes or reverses, A/D steer —
// with a top speed, a reverse gear, drag when coasting, and a simple
// circle-vs-building collision so the car cannot drive through the blocks.
// The wheels steer at the front and spin with the speed.

const BODY = 0xe8641e; // sunset orange, so the car pops against the asphalt
const GLASS = 0x1c2530; // dark windows
const TRIM = 0x232326; // bumpers and trim
const TYRE = 0x141414;
const HUB = 0xb8bcc2;
const HEADLIGHT = 0xfff2c0;
const TAILLIGHT = 0xff2a1a;

const TOP_SPEED = 22; // metres per second, about 80 km/h
const REVERSE_TOP = 6;
const ENGINE = 9; // acceleration, m/s^2
const BRAKE = 14;
const REVERSE_ACCEL = 5;
const WHEELBASE = 2.8;
const RADIUS = 1.6; // collision circle around the car's centre

function box(width, height, depth, color, x, y, z, opts = {}) {
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

/** Build the Sunset GT and return the rig the game loop drives. */
export function createCar() {
  const group = new THREE.Group();

  // --- body: a long low shell, a cabin with dark glass, dark bumpers --------
  group.add(box(1.9, 0.55, 4.4, BODY, 0, 0.55, 0)); // main shell
  group.add(box(1.7, 0.5, 2.2, GLASS, 0, 1.05, -0.2, { roughness: 0.15, metalness: 0.5 })); // cabin
  group.add(box(1.92, 0.22, 0.3, TRIM, 0, 0.32, 2.2)); // front bumper
  group.add(box(1.92, 0.22, 0.3, TRIM, 0, 0.32, -2.2)); // rear bumper
  group.add(box(1.92, 0.08, 4.42, TRIM, 0, 0.86, 0)); // side skirt line

  // --- lights: warm headlights at the front, red at the back ----------------
  group.add(box(0.34, 0.12, 0.06, HEADLIGHT, -0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(box(0.34, 0.12, 0.06, HEADLIGHT, 0.6, 0.62, 2.21, { emissive: HEADLIGHT, emissiveIntensity: 2.2 }));
  group.add(box(0.34, 0.1, 0.06, TAILLIGHT, -0.6, 0.62, -2.21, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));
  group.add(box(0.34, 0.1, 0.06, TAILLIGHT, 0.6, 0.62, -2.21, { emissive: TAILLIGHT, emissiveIntensity: 1.6 }));

  // --- wheels: steer at the front, spin with the speed ----------------------
  // steer group (turns with A/D, front only) > spin group (rolls) > tyre.
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
    tyre.rotation.z = Math.PI / 2; // cylinder axis along x (the axle)
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
  let speed = 0; // signed, metres per second; positive is forward
  let steer = 0; // smoothed steering angle, radians
  let spin = 0; // wheel roll angle

  /** Shortest signed angle from `from` to `to`. */
  function angleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  return {
    group,
    /** The direction the car faces (radians, 0 = +z, PI = -z / north). */
    get yaw() { return yaw; },
    /** Signed speed in metres per second. */
    get speed() { return speed; },
    /** Put the car on a heading at once (spawn / screenshot staging). */
    setHeading(nextYaw) {
      yaw = nextYaw;
      group.rotation.y = yaw;
    },
    /** Stop the car dead (used when the player gets out). */
    halt() { speed = 0; },
    /**
     * Drive one frame. `input` carries the keys; `world` carries the bounds
     * and the building colliders. The car steers around its own heading.
     */
    update(dt, input, world) {
      const throttle = input.forward; // +1 W, -1 S
      const steerInput = input.strafe; // +1 D (right), -1 A (left)

      // --- longitudinal: engine, brake, reverse, drag -----------------------
      if (throttle > 0) {
        speed += ENGINE * dt;
      } else if (throttle < 0) {
        if (speed > 0.5) speed -= BRAKE * dt; // braking while moving forward
        else speed -= REVERSE_ACCEL * dt; // reverse gear once nearly stopped
      } else {
        // Coasting: rolling drag pulls the car to a stop.
        const drag = 2.5 * dt;
        speed = Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
      }
      speed = Math.max(-REVERSE_TOP, Math.min(TOP_SPEED, speed));
      if (Math.abs(speed) < 0.02) speed = 0;

      // --- steering: eases in, tightens at low speed, steadies at speed -----
      const steerTarget = steerInput * 0.5 / (1 + Math.abs(speed) * 0.06);
      steer += (steerTarget - steer) * Math.min(1, dt * 7);
      // The yaw rate follows the speed, so reversing flips the turn: D turns
      // the nose right (yaw falls from north toward east) while going forward.
      yaw -= (speed / WHEELBASE) * Math.tan(steer) * dt;
      group.rotation.y = yaw;

      // --- move, then keep the car out of the buildings ---------------------
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      group.position.x += fx * speed * dt;
      group.position.z += fz * speed * dt;
      group.position.x = Math.max(-world.bounds, Math.min(world.bounds, group.position.x));
      group.position.z = Math.max(-world.bounds, Math.min(world.bounds, group.position.z));
      for (const box of world.colliders) {
        const cx = Math.max(box.minX, Math.min(group.position.x, box.maxX));
        const cz = Math.max(box.minZ, Math.min(group.position.z, box.maxZ));
        const dx = group.position.x - cx;
        const dz = group.position.z - cz;
        const dist = Math.hypot(dx, dz);
        if (dist < RADIUS) {
          if (dist > 0.001) {
            // Push out along the shortest way and scrub half the speed.
            group.position.x = cx + (dx / dist) * RADIUS;
            group.position.z = cz + (dz / dist) * RADIUS;
          } else {
            group.position.z = box.maxZ + RADIUS;
          }
          speed *= 0.5;
        }
      }

      // --- wheels: front pair steers, all four roll with the speed ----------
      spin += (speed * dt) / 0.34;
      for (const wheel of wheels) {
        wheel.spinGroup.rotation.x = spin;
        if (wheel.steers) wheel.steerGroup.rotation.y = steer;
      }
    },
  };
}
