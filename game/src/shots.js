// The screenshot scenes behind ?shot=chase|street|closeup|title. Each one puts
// Raka and the camera on a fixed, deterministic spot (the world is seeded, so
// the same seed always gives the same frame) and freezes his pose mid-stride,
// so the frame is what the game really looks like and a screenshot of it is
// reproducible. The cover is the chase shot: Raka walking north up the main
// avenue, the camera behind him in third person.

const SHOTS = {
  // The cover: third person, Raka walking into the city.
  chase: { hero: [0, 10], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.32, 6] },
  // A wider street view: buildings, lamps and palms on both sides.
  street: { hero: [-3, 2], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0.4, 0.28, 11] },
  // Close on the hero: the humanoid, jacket and jeans readable.
  closeup: { hero: [0, 6], face: 0.9, phase: 0, lean: 0, cam: [0.9, 0.22, 3.4] },
  // A high, wide hero shot: Raka small in frame, city and sky behind him.
  title: { hero: [0, 18], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.5, 15] },
};

/**
 * Stage the named scene (any other name is the chase) and freeze the pose.
 * Returns true so the game loop knows to hold this frame instead of playing.
 */
export function stageShot(name, hero, camera) {
  const shot = SHOTS[name] || SHOTS.chase;
  hero.group.position.set(shot.hero[0], 0, shot.hero[1]);
  hero.face(shot.face);
  // Face at once (no smooth turn) so the staged frame is exact.
  hero.group.rotation.y = shot.face;
  hero.setPose(shot.phase, shot.lean);
  camera.setView(shot.cam[0], shot.cam[1], shot.cam[2]);
  return true;
}
