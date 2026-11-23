// SOLMAR HEAT, step 5 — the entrypoint. It builds the renderer, the city,
// Raka, his Sunset GT and the third-person camera, then runs the loop: on
// foot, read the input, move Raka camera-relative and chase him; near a ride,
// E gets him in, and driving switches to arcade car controls with the camera
// easing in behind it. E again, stopped, gets him back out beside it. The
// street has pedestrians who walk the sidewalks and run when provoked, and
// civilian rides Raka can steal — sedans, a motorbike, a truck and a bus —
// and taking one is a crime, so the heat goes up a star. On foot a click
// fires his Pistol and R reloads it; his health and stamina and the weapon
// readouts ride on the HUD, and while driving the HUD names the ride he is
// in. With ?shot=chase|street|closeup|drive|shoot&seed=7 in the URL it stages
// one deterministic screenshot scene instead and holds the frame.

import { createWorld } from './world.js';
import { createProtagonist } from './character.js';
import { createCar } from './car.js';
import { createPolice } from './police.js';
import { createTraffic } from './traffic.js';
import { createCombat } from './combat.js';
import { createVitals } from './vitals.js';
import { createChaseCamera } from './camera.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const WALK_SPEED = 3.2; // metres per second
const RUN_SPEED = 5.8;
const ENTER_RANGE = 4; // how close Raka must be to get in the car
const FOOT_CAM_DISTANCE = 5.5;
const CAR_CAM_DISTANCE = 8.5;
const SPEED_LIMIT = 14; // metres per second, about 50 km/h: over it is a crime
const BUSTED_HOLD = 2.5; // seconds the BUSTED screen stays up before respawn
const WASTED_HOLD = 2.5; // seconds the WASTED screen stays up before respawn

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot');

// --- renderer ---------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);

// --- the city, the hero, the car, the camera, the input, the HUD ------------
const world = createWorld(scene, seed);
const hero = createProtagonist();
hero.group.position.set(0, 0, 10);
hero.face(Math.PI); // north, up the main avenue into the city
hero.group.rotation.y = Math.PI;
scene.add(hero.group);

const car = createCar();
car.group.position.set(2.2, 0, 4.5); // parked on the avenue, ahead of Raka
car.setHeading(Math.PI); // facing north, up the avenue
scene.add(car.group);

const police = createPolice(scene, world);
const traffic = createTraffic(scene, world, police);

const chase = createChaseCamera(camera);
const hud = createHud();
const vitals = createVitals();
const combat = createCombat(scene, hero, police, () => hud.showHit(), (x, z) => traffic.noteShot(x, z));
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));

// --- driving state ----------------------------------------------------------
let driving = false;
let speed = 0; // Raka's ground speed on foot, smoothed toward the target
let vehicle = null; // the ride Raka is driving (his Sunset GT or a stolen one)
let vehicleName = 'Sunset GT'; // the ride's name, shown on the HUD

// --- busted state -----------------------------------------------------------
// A patrol car pinned Raka: controls freeze, the BUSTED screen goes up, and
// after a beat he is hauled back to the start with the heat cleared.
let busted = false;
let bustedTimer = 0;
let lastVehicleHits = 0; // the vehicle.hits count the last crime check saw

function startBusted() {
  busted = true;
  bustedTimer = 0;
  hud.showBusted(true);
}

// WASTED: Raka's health ran out. Controls freeze, the WASTED screen goes up,
// and after a beat he is patched up and back at the start, full health.
let wasted = false;
let wastedTimer = 0;

function startWasted() {
  wasted = true;
  wastedTimer = 0;
  hud.showWasted(true);
}

function respawn() {
  driving = false;
  vehicle = null;
  vehicleName = 'Sunset GT';
  car.halt();
  car.group.position.set(2.2, 0, 4.5);
  car.setHeading(Math.PI);
  hero.group.position.set(0, 0, 10);
  hero.group.visible = true;
  hero.face(Math.PI);
  hero.group.rotation.y = Math.PI;
  speed = 0;
  lastVehicleHits = car.hits;
  police.reset();
  traffic.reset();
  vitals.reset();
  combat.reset();
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setWanted(0);
  hud.showBusted(false);
  hud.showWasted(false);
  hud.setPrompt(null);
  busted = false;
  bustedTimer = 0;
  wasted = false;
  wastedTimer = 0;
}

/** The nearest ride Raka can get into: his Sunset GT or a civilian one. */
function nearestRide() {
  const hx = hero.group.position.x;
  const hz = hero.group.position.z;
  let best = null;
  let bestDist = ENTER_RANGE;
  const dCar = Math.hypot(hx - car.group.position.x, hz - car.group.position.z);
  if (dCar < bestDist) { best = car; bestDist = dCar; }
  const t = traffic.nearestEnterable(hx, hz, ENTER_RANGE);
  if (t && t.dist < bestDist) { best = t.vehicle; bestDist = t.dist; }
  return best;
}

function enterVehicle(ride) {
  driving = true;
  vehicle = ride;
  vehicleName = ride.name ?? 'Sunset GT';
  lastVehicleHits = ride.hits;
  // Taking a civilian ride is theft: the heat goes up a star, and a
  // self-driving sedan stops cruising once it is Raka's.
  if (ride.steal) {
    ride.stolen = true;
    police.noteTheft();
  }
  hero.group.visible = false;
  chase.setDistance(ride.camDistance ?? CAR_CAM_DISTANCE);
  hud.setPrompt(null);
}

function exitVehicle() {
  driving = false;
  vehicle.halt();
  speed = 0;
  // Step out beside the ride (its right side) and face the way it was going.
  const rightX = Math.cos(vehicle.yaw);
  const rightZ = -Math.sin(vehicle.yaw);
  hero.group.position.set(
    Math.max(-world.bounds, Math.min(world.bounds, vehicle.group.position.x + rightX * 2.4)),
    0,
    Math.max(-world.bounds, Math.min(world.bounds, vehicle.group.position.z + rightZ * 2.4)),
  );
  hero.group.visible = true;
  hero.face(vehicle.yaw);
  vehicle = null;
  vehicleName = 'Sunset GT';
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setPrompt(null);
}

// A screenshot scene freezes the pose and holds the frame; play mode moves.
const shotFocus = shotName ? stageShot(shotName, hero, chase, car, police, traffic) : null;
const frozen = shotFocus !== null;
if (frozen) {
  // The HUD reads for the staged frame: the drive shot shows the car rolling,
  // the pursuit shot shows the chase at 3 wanted stars, the shoot shot shows
  // Raka aiming with one round already down the range (11 in the magazine).
  if (shotName === 'drive') {
    hud.updateDriving(11); // about 40 km/h, mid-avenue
    hud.setPrompt(null);
  } else if (shotName === 'pursuit') {
    hud.updateDriving(11); // about 40 km/h, fleeing the patrol cars
    hud.setWanted(3);
    hud.setPrompt(null);
  } else if (shotName === 'shoot') {
    combat.stageShoot(); // tracer held on the frame, magazine 11 / 24
    hud.updateFoot(0, false, false);
    hud.setPrompt(null);
  } else {
    hud.updateFoot(0, false, false);
    hud.setPrompt(null);
  }
  hud.setHealth(vitals.health, vitals.maxHealth);
  hud.setStamina(vitals.stamina, vitals.maxStamina);
  hud.setWeapon(combat.weaponName, combat.weaponType, combat.mag, combat.reserve, combat.reloading);
}

// --- movement ----------------------------------------------------------------
function step(dt) {
  world.update(dt);
  if (frozen) {
    // Hold the staged frame: camera exactly on its spot.
    chase.update(dt, shotFocus, true);
    return;
  }

  // Busted: the controls are frozen and the overlay is up; after a beat the
  // game hauls Raka back to the start with the heat cleared.
  if (busted) {
    bustedTimer += dt;
    if (bustedTimer >= BUSTED_HOLD) respawn();
    return;
  }

  // Wasted: the same freeze, on the WASTED screen; after a beat he is patched
  // up and back at the start with full health.
  if (wasted) {
    wastedTimer += dt;
    if (wastedTimer >= WASTED_HOLD) respawn();
    return;
  }

  if (driving) {
    // --- behind the wheel ---------------------------------------------------
    vehicle.update(dt, input, world);
    chase.yawToward(vehicle.yaw, dt); // the camera eases in behind the ride
    chase.update(dt, vehicle.group.position, false);
    hud.updateDriving(vehicle.speed, vehicleName);
    hud.setPrompt(Math.abs(vehicle.speed) < 1 ? 'Press E to get out' : null);
    if (input.takeAction() && Math.abs(vehicle.speed) < 1) exitVehicle();
  } else {
    // --- on foot -------------------------------------------------------------
    const f = input.forward;
    const s = input.strafe;
    const moving = input.moving;
    // Running needs stamina: run dry and he is winded, walking only until
    // it has come back a little.
    const running = input.running && vitals.canRun;
    vitals.update(dt, running && moving);

    // Camera-relative move direction on the ground.
    const forward = chase.forward();
    const right = chase.right();
    let moveX = forward.x * f + right.x * s;
    let moveZ = forward.z * f + right.z * s;
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) { moveX /= length; moveZ /= length; }

    // Ease toward the target speed (walk, run, or stop).
    const target = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;
    speed += (target - speed) * Math.min(1, dt * 8);
    if (speed < 0.05) speed = 0;

    if (moving && speed > 0.05) {
      hero.group.position.x += moveX * speed * dt;
      hero.group.position.z += moveZ * speed * dt;
      // Stay inside the city.
      hero.group.position.x = Math.max(-world.bounds, Math.min(world.bounds, hero.group.position.x));
      hero.group.position.z = Math.max(-world.bounds, Math.min(world.bounds, hero.group.position.z));
      // Face where he moves.
      hero.face(Math.atan2(moveX, moveZ));
    }

    hero.update(dt, speed, moving);
    chase.update(dt, hero.group.position, false);
    hud.updateFoot(speed, moving, running);

    // --- the Pistol: a click fires, R reloads --------------------------------
    // A round landing near a pedestrian scares them into running (the combat
    // rig tells the street where it landed, through its onShot callback).
    if (input.takeShot()) combat.shoot();
    if (input.takeReload()) combat.reload();

    // --- a ride: near one, E gets in -----------------------------------------
    const ride = nearestRide();
    hud.setPrompt(ride ? (ride.prompt ?? 'Press E to enter the Sunset GT') : null);
    if (input.takeAction() && ride) enterVehicle(ride);
  }

  // --- combat timers (cooldown, reload, tracer, flash, spark) ---------------
  combat.update(dt);

  // --- the survival readouts: health, stamina, weapon, bullets --------------
  hud.setHealth(vitals.health, vitals.maxHealth);
  hud.setStamina(vitals.stamina, vitals.maxStamina);
  hud.setWeapon(combat.weaponName, combat.weaponType, combat.mag, combat.reserve, combat.reloading);

  // --- the heat: crimes, the chase, the bust --------------------------------
  // Speeding and smashing into buildings earn stars; the patrol cars answer
  // them, and a car that pins Raka ends the run with BUSTED.
  if (driving) {
    police.noteSpeeding(dt, Math.abs(vehicle.speed) > SPEED_LIMIT);
    if (vehicle.hits > lastVehicleHits) {
      lastVehicleHits = vehicle.hits;
      police.noteCollision();
    }
  }
  const player = driving
    ? { x: vehicle.group.position.x, z: vehicle.group.position.z, driving: true, speed: vehicle.speed, car: vehicle, vehicle }
    : { x: hero.group.position.x, z: hero.group.position.z, driving: false, speed, car: null, vehicle: null };
  // --- the street: the cruiser drives itself, pedestrians walk and flee -----
  traffic.update(dt, player, car);
  const damage = police.update(dt, player);
  if (damage > 0) vitals.damage(damage);
  hud.setWanted(police.wanted);
  if (police.busted) startBusted();
  else if (vitals.wasted) startWasted();
}

// --- the loop -----------------------------------------------------------------
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__solmarReady = true; // the test harness waits for this
  }
}
loop();

// A small handle for the play-test: what mode the game is in, and the rigs.
window.__solmar = {
  get driving() { return driving; },
  get heroPos() { return { x: hero.group.position.x, z: hero.group.position.z }; },
  get carPos() { return { x: car.group.position.x, z: car.group.position.z }; },
  get carSpeed() { return car.speed; },
  get wanted() { return police.wanted; },
  get policeCount() { return police.count; },
  get busted() { return busted; },
  get wasted() { return wasted; },
  get health() { return vitals.health; },
  get stamina() { return vitals.stamina; },
  get canRun() { return vitals.canRun; },
  get mag() { return combat.mag; },
  get reserve() { return combat.reserve; },
  get reloading() { return combat.reloading; },
  get weapon() { return { name: combat.weaponName, type: combat.weaponType }; },
  get hits() { return combat.hits; },
  get shotsFired() { return combat.shotsFired; },
  get vehicleName() { return driving ? vehicleName : null; },
  get npcCount() { return traffic.npcCount; },
  get fleeingCount() { return traffic.fleeingCount; },
  get trafficVehicles() {
    return traffic.vehicles.map((v) => ({
      name: v.name, type: v.type,
      x: v.group.position.x, z: v.group.position.z,
      speed: v.speed, stolen: v.stolen,
    }));
  },
  hero, car, police, vitals, combat, traffic,
  // Test helpers: set the heat at once, put a patrol car beside the player,
  // or force the bust, without waiting for a real crime and chase.
  debug: {
    setWanted(n) { police.setWanted(n); },
    placeNear() {
      const p = driving ? vehicle.group.position : hero.group.position;
      police.placeNear(p.x, p.z);
    },
    forceBust() { police.forceBust(); },
    damage(n) { vitals.damage(n); },
    shoot() { combat.shoot(); },
    reload() { combat.reload(); },
    /** Put Raka beside the named ride (Motor, Truk, Bus, Sedan). */
    toVehicle(name) {
      const v = traffic.vehicles.find((ride) => ride.name === name);
      if (!v) return false;
      hero.group.position.set(v.group.position.x + 2.4, 0, v.group.position.z);
      hero.group.visible = true;
      hero.face(Math.atan2(v.group.position.x - hero.group.position.x, v.group.position.z - hero.group.position.z));
      return true;
    },
    /** Enter the nearest ride at once, as if Raka pressed E. */
    enter() {
      const ride = nearestRide();
      if (ride) enterVehicle(ride);
      return ride ? (ride.name ?? 'Sunset GT') : null;
    },
    /** Put the nearest pedestrian a step ahead of Raka, facing him. */
    npcNear() {
      let best = null;
      let bestDist = Infinity;
      for (const npc of traffic.npcs) {
        const d = Math.hypot(
          npc.group.position.x - hero.group.position.x,
          npc.group.position.z - hero.group.position.z,
        );
        if (d < bestDist) { best = npc; bestDist = d; }
      }
      if (!best) return false;
      const fx = Math.sin(hero.yaw);
      const fz = Math.cos(hero.yaw);
      best.setPose(hero.group.position.x + fx * 1.5, hero.group.position.z + fz * 1.5, Math.atan2(-fx, -fz));
      return true;
    },
    /** Turn Raka toward the nearest pedestrian, so a shot can reach them. */
    aimNpc() {
      let best = null;
      let bestDist = Infinity;
      for (const npc of traffic.npcs) {
        const d = Math.hypot(
          npc.group.position.x - hero.group.position.x,
          npc.group.position.z - hero.group.position.z,
        );
        if (d < bestDist) { best = npc; bestDist = d; }
      }
      if (!best) return false;
      hero.face(Math.atan2(
        best.group.position.x - hero.group.position.x,
        best.group.position.z - hero.group.position.z,
      ));
      hero.group.rotation.y = hero.yaw;
      return true;
    },
    /** Put a pedestrian right ahead of the ride Raka is driving. */
    npcAhead() {
      if (!driving) return false;
      const npc = traffic.npcs.find((n) => !n.fleeing);
      if (!npc) return false;
      const fx = Math.sin(vehicle.yaw);
      const fz = Math.cos(vehicle.yaw);
      npc.setPose(
        vehicle.group.position.x + fx * (vehicle.radius + 3),
        vehicle.group.position.z + fz * (vehicle.radius + 3),
        Math.atan2(-fx, -fz),
      );
      return true;
    },
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
