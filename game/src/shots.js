// The screenshot scenes behind ?shot=chase|pursuit|closeup|drive|shoot|street.
// Each one puts Raka, the car and the camera on fixed, deterministic spots (the
// world is seeded, so the same seed always gives the same frame) and freezes
// the pose, so the frame is what the game really looks like and a screenshot
// of it is reproducible. The cover is the chase shot: Raka walking north up
// the main avenue toward his parked Sunset GT, the camera behind him in third
// person. The pursuit shot stages the chase: the Sunset GT rolling north with
// three patrol cars on its tail and the helicopter overhead at 3 stars. The
// shoot shot stages combat: Raka aiming his Pistol at the practice dummy on
// the avenue, a tracer in the air, the survival panel showing health,
// stamina, weapon and ammo. The street shot stages street life: Raka walking
// north with pedestrians on the sidewalks and the motorbike, the truck, the
// bus and the cruising sedan up the avenue.

const SHOTS = {
  // The cover: third person, Raka walking into the city, his car ahead.
  chase: { hero: [0, 10], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.32, 6], car: [2.2, 4.5] },
  // The pursuit: the Sunset GT fleeing north, three patrol cars behind it,
  // the helicopter overhead, 3 wanted stars on the HUD. The camera sits
  // NORTH-WEST of the car (yaw -2.5) and looks south-east, so the frame holds
  // the car in the middle and the patrol cars behind it in the distance —
  // a camera south of the car would put the chase behind the lens.
  pursuit: { hero: null, car: [0, -8], carYaw: Math.PI, cam: [-2.5, 0.34, 9.5], police: 3 },
  // Close on the hero: the humanoid, jacket and jeans readable.
  closeup: { hero: [0, 6], face: 0.9, phase: 0, lean: 0, cam: [0.9, 0.22, 3.4], car: [2.2, 4.5] },
  // Driving: the Sunset GT rolling north down the avenue, camera chasing it
  // from the south-west so the golden-hour sun lights its orange flank.
  drive: { hero: null, car: [0, -8], carYaw: Math.PI, cam: [-0.35, 0.3, 8.5] },
  // Shooting: Raka on the avenue aiming his Pistol north at the practice
  // dummy, the camera close behind his right shoulder so he reads large and
  // the dummy sits ahead of him in the frame.
  shoot: { hero: [0, 10], face: Math.PI, phase: 0, lean: 0, cam: [0.35, 0.24, 4.8], car: [2.2, 4.5], aim: true },
  // Street life: Raka walking north up the avenue, pedestrians mid-stride
  // on the sidewalks, the motorbike on the right edge, the truck and the
  // bus further up the avenue and the red sedan cruising toward him.
  street: { hero: [0, 14], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.32, 6], car: [2.2, 4.5], street: true },
  // The mission: Raka on foot below the Pier Run's gold marker, the target
  // column standing at the north end of the avenue, the radar up top-right
  // showing the target diamond, and the street alive around him.
  mission: { hero: [0, 20], face: Math.PI, phase: 0.9, lean: 0.03, cam: [0, 0.32, 6], car: [2.2, 4.5], street: true },
};

/**
 * Stage the named scene (any other name is the chase) and freeze the pose.
 * Returns the position the camera follows (the hero's, or the car's for the
 * drive and pursuit shots) so the game loop knows what to hold the frame on.
 */
export function stageShot(name, hero, camera, car, police, traffic) {
  const shot = SHOTS[name] || SHOTS.chase;
  // The car is parked on the avenue in every shot but the drive and pursuit,
  // where it is the subject, mid-avenue with the camera chasing it.
  if (shot.car) {
    car.group.position.set(shot.car[0], 0, shot.car[1]);
    car.setHeading(shot.carYaw ?? Math.PI);
    car.halt();
  }
  // The pursuit shot brings the police: patrol cars fanned out behind the
  // player's car and the helicopter overhead.
  if (shot.police && police) {
    police.stage(shot.police, shot.car[0], shot.car[1], shot.carYaw ?? Math.PI);
  }
  // The street shot brings the traffic: pedestrians mid-stride on the
  // sidewalks and the motorbike, truck, bus and cruising sedan up the avenue.
  if (shot.street && traffic) {
    traffic.stageStreet();
  }
  if (shot.hero) {
    hero.group.position.set(shot.hero[0], 0, shot.hero[1]);
    hero.face(shot.face);
    // Face at once (no smooth turn) so the staged frame is exact.
    hero.group.rotation.y = shot.face;
    hero.setPose(shot.phase, shot.lean);
    // The shooting scene holds the aim pose: the right arm points forward.
    if (shot.aim) hero.aim(true);
    hero.group.visible = true;
  } else {
    // The drive and pursuit shots are about the car: Raka is inside it.
    hero.group.visible = false;
  }
  camera.setView(shot.cam[0], shot.cam[1], shot.cam[2]);
  return shot.hero ? hero.group.position : car.group.position;
}
