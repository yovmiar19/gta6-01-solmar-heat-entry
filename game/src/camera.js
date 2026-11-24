// The third-person chase camera: it orbits the hero on a drag, follows him
// smoothly from behind, and always looks at his head. Movement is relative to
// where the camera looks, and the hero turns to face the direction he moves in.
//
// Angles: yaw 0 puts the camera south of the hero, looking north (-z). Pitch is
// how high the camera sits above the hero (0 = level, ~1 = almost overhead).

export function createChaseCamera(camera) {
  let yaw = 0;
  let pitch = 0.32;
  let distance = 5.5;
  const lookHeight = 1.5; // the camera looks at the hero's head height
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let targetFov = 60; // the field of view the camera eases toward (aim narrows it)
  let kick = 0; // a jump take-off kick: 1 just after launch, decaying to 0
  let kickTime = 0; // seconds since the kick started (drives the wobble)

  /** Shortest signed angle from `from` to `to`. */
  function angleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  return {
    /** Orbit the camera by a drag (dx, dy in pixels). */
    orbit(dx, dy) {
      yaw -= dx * 0.005;
      pitch = Math.max(0.06, Math.min(1.05, pitch + dy * 0.004));
    },
    /** Set the orbit outright (used by the screenshot scenes). */
    setView(nextYaw, nextPitch, nextDistance) {
      yaw = nextYaw; pitch = nextPitch; distance = nextDistance;
    },
    /** Pull the camera back or in (driving sits further out than walking). */
    setDistance(nextDistance) { distance = nextDistance; },
    /** Ease the field of view toward a target (aim narrows it: a zoom-in). */
    setTargetFov(fov) { targetFov = fov; },
    /**
     * A jump take-off kick (step 14): the camera pulls back and wobbles
     * for a beat as the ride leaves the ramp, then settles again. The
     * kick decays over about 0.7 s, so a landing never inherits it.
     */
    jumpKick() {
      kick = 1;
      kickTime = 0;
    },
    /** How strong the take-off kick is right now (1 just after launch, 0 at rest). */
    get kick() { return kick; },
    /** The camera's current field of view, in degrees. */
    get fov() { return camera.fov; },
    /** Ease the camera's yaw toward a heading (the car pulls it behind it). */
    yawToward(targetYaw, dt) {
      yaw += angleDelta(yaw, targetYaw) * Math.min(1, dt * 2.2);
    },
    /** The camera's yaw, so movement can be camera-relative. */
    get yaw() { return yaw; },
    /** Ground direction the camera looks in (unit, x/z). */
    forward() {
      return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    },
    /** Ground direction to the camera's right (unit, x/z). */
    right() {
      return { x: Math.cos(yaw), z: -Math.sin(yaw) };
    },
    /**
     * Follow `target` (the hero's feet position). `snap` puts the camera on its
     * spot at once (screenshots); otherwise it chases smoothly.
     */
    update(dt, target, snap) {
      // Ease the field of view toward its target, so aiming zooms in
      // smoothly instead of snapping (and leaving aim zooms back out).
      const nextFov = camera.fov + (targetFov - camera.fov) * Math.min(1, dt * 10);
      if (Math.abs(nextFov - camera.fov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
      // A take-off kick pulls the camera back a few metres and wobbles
      // it side to side, fading over about 0.7 s.
      if (kick > 0) {
        kickTime += dt;
        kick = Math.max(0, 1 - kickTime / 0.7);
      }
      const kickDistance = 3.5 * kick;
      const wobbleYaw = yaw + Math.sin(kickTime * 22) * 0.025 * kick;
      const horizontal = Math.cos(pitch) * (distance + kickDistance);
      desired.set(
        target.x + Math.sin(wobbleYaw) * horizontal,
        target.y + lookHeight + Math.sin(pitch) * (distance + kickDistance),
        target.z + Math.cos(wobbleYaw) * horizontal,
      );
      if (snap) {
        camera.position.copy(desired);
      } else {
        // A smooth chase: fast enough to keep up, slow enough to feel weighty.
        const t = 1 - Math.exp(-dt * 7);
        camera.position.lerp(desired, t);
      }
      lookAt.set(target.x, target.y + lookHeight, target.z);
      camera.lookAt(lookAt);
    },
  };
}
