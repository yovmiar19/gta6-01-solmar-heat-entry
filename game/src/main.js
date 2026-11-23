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
import { createRadar } from './radar.js';
import { createMissions } from './missions.js';
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
const radar = createRadar();
const missions = createMissions(scene);
const vitals = createVitals();
const combat = createCombat(scene, hero, police, () => hud.showHit(), (x, z) => traffic.noteShot(x, z));
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));

// --- driving state ----------------------------------------------------------
let driving = false;
let speed = 0; // Raka's ground speed on foot, smoothed toward the target
let vehicle = null; // the ride Raka is driving (his Sunset GT or a stolen one)
let vehicleName = 'Sunset GT'; // the ride's name, shown on the HUD
let ridingBike = false; // true while Raka rides the motorbike in the open

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
  ridingBike = false;
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
  missions.reset();
  vitals.reset();
  combat.reset();
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setWanted(0);
  hud.showBusted(false);
  hud.showWasted(false);
  hud.setPrompt(null);
  hud.setMission(null, null);
  hud.setCash(missions.cash);
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
  // A motorbike has no cabin: Raka stays visible, seated on it (see the
  // driving branch, which puts him on the seat every frame). Every other
  // ride hides him inside, as before.
  if (ride.type === 'Motorbike') {
    ridingBike = true;
    hero.group.visible = true;
  } else {
    ridingBike = false;
    hero.group.visible = false;
  }
  chase.setDistance(ride.camDistance ?? CAR_CAM_DISTANCE);
  hud.setPrompt(null);
}

function exitVehicle() {
  driving = false;
  ridingBike = false;
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
  hero.stand(); // limbs back to neutral (a rider's bent pose must not follow him on foot)
  hero.face(vehicle.yaw);
  vehicle = null;
  vehicleName = 'Sunset GT';
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setPrompt(null);
}

/** The radar's inputs: Raka, the heat, the street and the mission target. */
function radarState() {
  return {
    x: hero.group.position.x,
    z: hero.group.position.z,
    yaw: hero.yaw,
    police: police.patrolPositions,
    heli: police.heliPos,
    vehicles: traffic.vehicles,
    npcs: traffic.npcs,
    sunset: { x: car.group.position.x, z: car.group.position.z },
    target: missions.target,
    time: performance.now() / 1000,
  };
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
  } else if (shotName === 'mission') {
    // The Pier Run is in progress: its gold marker stands at the north
    // end of the avenue, the radar shows the target diamond, and the
    // mission panel names the job. Raka stands on foot below the marker.
    missions.stageMissionShot();
    hud.updateFoot(0, false, false);
    hud.setMission('Pier Run', 'Drive to the pier drop-off at the north end');
    hud.setCash(missions.cash);
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
    // Hold the staged frame: camera exactly on its spot. The radar still
    // draws (it is part of the frame) and the markers still pulse.
    chase.update(dt, shotFocus, true);
    radar.update(radarState());
    missions.pulse(dt);
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
    // On a motorbike Raka rides in the open: seat him on it — hips on the
    // seat (local z -0.5, y 0.07 so his hips sit on the seat top), facing
    // the way it goes, so he turns and leans with the bike.
    if (ridingBike) {
      hero.group.position.set(
        vehicle.group.position.x - Math.sin(vehicle.yaw) * 0.5,
        0.07,
        vehicle.group.position.z - Math.cos(vehicle.yaw) * 0.5,
      );
      hero.ride(vehicle.yaw);
    }
    // The camera eases in BEHIND the ride: its yaw is the car's heading
    // plus half a turn, so it sits on the side opposite to where the car
    // faces and looks the way the car is going. (The car's yaw is the
    // direction it faces; the camera's yaw is the direction from the car
    // to the camera — the same number would park the camera in FRONT of
    // the car, looking back at it.)
    chase.yawToward(vehicle.yaw + Math.PI, dt);
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

  // --- the jobs: start one at the marker, finish one at its target --------
  // A job pays cash and starts the next straight away; the banner calls
  // out each completion and the panel names the job in progress.
  missions.update(dt, {
    x: player.x,
    z: player.z,
    driving,
    vehicle: driving ? vehicle : null,
    wanted: police.wanted,
    dummyHits: combat.dummyHits,
    vehicles: traffic.vehicles,
  });
  const banner = missions.takeBanner();
  if (banner) hud.showMissionBanner(banner);
  hud.setMission(
    missions.active ? missions.active.name : null,
    missions.active ? missions.active.objective : null,
  );
  hud.setCash(missions.cash);

  // --- the radar: Raka, the heat, the street and the mission target --------
  radar.update(radarState());
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
  get vehicleType() { return driving ? (vehicle.type ?? 'Car') : null; },
  get ridingBike() { return ridingBike; },
  get heroVisible() { return hero.group.visible; },
  get heroPos3() {
    return { x: hero.group.position.x, y: hero.group.position.y, z: hero.group.position.z };
  },
  get npcCount() { return traffic.npcCount; },
  get fleeingCount() { return traffic.fleeingCount; },
  get cash() { return missions.cash; },
  get mission() {
    return {
      active: missions.active ? missions.active.name : null,
      objective: missions.active ? missions.active.objective : null,
      cash: missions.cash,
      completed: missions.completedCount,
      target: missions.target,
    };
  },
  get radarPlayer() { return radar.player; },
  get radarTarget() { return radar.target; },
  get trafficVehicles() {
    return traffic.vehicles.map((v) => ({
      name: v.name, type: v.type,
      x: v.group.position.x, z: v.group.position.z,
      yaw: v.yaw, speed: v.speed, stolen: v.stolen,
    }));
  },
  hero, car, police, vitals, combat, traffic, missions, radar, chase,
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
    /** Put Raka on a spot on foot, facing a direction (staging). */
    toPos(x, z, yaw = Math.PI) {
      if (driving) return false;
      hero.group.position.set(x, 0, z);
      hero.face(yaw);
      hero.group.rotation.y = yaw;
      speed = 0;
      return true;
    },
    /** Put Raka beside the mission start marker, facing it. */
    toMissionStart() {
      if (driving) return false;
      const s = missions.start;
      hero.group.position.set(s.x, 0, s.z + 2.5);
      hero.face(Math.PI);
      hero.group.rotation.y = Math.PI;
      speed = 0;
      return true;
    },
    /** Put Raka (or the ride he is driving) beside the active target. */
    toTarget() {
      const t = missions.target;
      if (!t) return false;
      if (driving) {
        vehicle.group.position.set(t.x, 0, t.z + 2);
        vehicle.setHeading(Math.PI);
        vehicle.halt();
      } else {
        hero.group.position.set(t.x, 0, t.z + 2);
        hero.face(Math.PI);
        hero.group.rotation.y = Math.PI;
        speed = 0;
      }
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
