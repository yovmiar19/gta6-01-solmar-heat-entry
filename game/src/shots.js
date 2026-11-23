// The screenshot scenes behind ?shot=chase|street|closeup|drive. Each one puts
// Raka, the car and the camera on fixed, deterministic spots (the world is
// seeded, so the same seed always gives the same frame) and freezes the pose,
// so the frame is what the game really looks like and a screenshot of it is
// reproducible. The cover is the chase shot: Raka walking north up the main
// avenue toward his parked Sunset GT, the camera behind him in third person.
// The drive shot stages the car mid-avenue with the camera chasing it.

const SHOTS = {
  // The cover: third person, Raka walking into the city, his car ahead.
  chase: { hero: [0, 10], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.32, 6], car: [2.2, 4.5] },
  // A wider street view: buildings, lamps and palms on both sides.
  street: { hero: [-3, 2], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0.4, 0.28, 11], car: [2.2, 4.5] },
  // Close on the hero: the humanoid, jacket and jeans readable.
  closeup: { hero: [0, 6], face: 0.9, phase: 0, lean: 0, cam: [0.9, 0.22, 3.4], car: [2.2, 4.5] },
  // Driving: the Sunset GT rolling north down the avenue, camera chasing it
  // from the south-west so the golden-hour sun lights its orange flank.
  drive: { hero: null, car: [0, -8], carYaw: Math.PI, cam: [-0.35, 0.3, 8.5] },
};

/**
 * Stage the named scene (any other name is the chase) and freeze the pose.
 * Returns the position the camera follows (the hero's, or the car's for the
 * drive shot) so the game loop knows what to hold the frame on.
 */
export function stageShot(name, hero, camera, car) {
  const shot = SHOTS[name] || SHOTS.chase;
  // The car is parked on the avenue in every shot but the drive, where it is
  // the subject, mid-avenue with the camera chasing it from behind.
  if (shot.car) {
    car.group.position.set(shot.car[0], 0, shot.car[1]);
    car.setHeading(shot.carYaw ?? Math.PI);
    car.halt();
  }
  if (shot.hero) {
    hero.group.position.set(shot.hero[0], 0, shot.hero[1]);
    hero.face(shot.face);
    // Face at once (no smooth turn) so the staged frame is exact.
    hero.group.rotation.y = shot.face;
    hero.setPose(shot.phase, shot.lean);
    hero.group.visible = true;
  } else {
    // The drive shot is about the car: Raka is inside it, out of frame.
    hero.group.visible = false;
  }
  camera.setView(shot.cam[0], shot.cam[1], shot.cam[2]);
  return shot.hero ? hero.group.position : car.group.position;
}
