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
      const horizontal = Math.cos(pitch) * distance;
      desired.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + lookHeight + Math.sin(pitch) * distance,
        target.z + Math.cos(yaw) * horizontal,
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
