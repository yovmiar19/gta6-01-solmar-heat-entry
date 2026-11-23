// SOLMAR HEAT, step 4 — the entrypoint. It builds the renderer, the city,
// Raka, his Sunset GT and the third-person camera, then runs the loop: on
// foot, read the input, move Raka camera-relative and chase him; near the car,
// E gets him in, and driving switches to arcade car controls with the camera
// easing in behind the car. E again, stopped, gets him back out beside it.
// On foot a click fires his Pistol and R reloads it; his health and stamina
// and the weapon readouts ride on the HUD. With ?shot=chase|street|closeup|
// drive|shoot&seed=7 in the URL it stages one deterministic screenshot scene
// instead and holds the frame.

import { createWorld } from './world.js';
import { createProtagonist } from './character.js';
import { createCar } from './car.js';
import { createPolice } from './police.js';
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

const chase = createChaseCamera(camera);
const hud = createHud();
const vitals = createVitals();
const combat = createCombat(scene, hero, police, () => hud.showHit());
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));

// --- driving state ----------------------------------------------------------
let driving = false;
let speed = 0; // Raka's ground speed on foot, smoothed toward the target

// --- busted state -----------------------------------------------------------
// A patrol car pinned Raka: controls freeze, the BUSTED screen goes up, and
// after a beat he is hauled back to the start with the heat cleared.
let busted = false;
let bustedTimer = 0;
let lastCarHits = 0; // the car.hits count the last crime check already saw

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
  car.halt();
  car.group.position.set(2.2, 0, 4.5);
  car.setHeading(Math.PI);
  hero.group.position.set(0, 0, 10);
  hero.group.visible = true;
  hero.face(Math.PI);
  hero.group.rotation.y = Math.PI;
  speed = 0;
  lastCarHits = car.hits;
  police.reset();
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

function enterCar() {
  driving = true;
  hero.group.visible = false;
  chase.setDistance(CAR_CAM_DISTANCE);
  hud.setPrompt(null);
}

function exitCar() {
  driving = false;
  car.halt();
  speed = 0;
  // Step out beside the car (its right side) and face the way it was going.
  const rightX = Math.cos(car.yaw);
  const rightZ = -Math.sin(car.yaw);
  hero.group.position.set(
    Math.max(-world.bounds, Math.min(world.bounds, car.group.position.x + rightX * 2.4)),
    0,
    Math.max(-world.bounds, Math.min(world.bounds, car.group.position.z + rightZ * 2.4)),
  );
  hero.group.visible = true;
  hero.face(car.yaw);
  chase.setDistance(FOOT_CAM_DISTANCE);
  hud.setPrompt(null);
}

// A screenshot scene freezes the pose and holds the frame; play mode moves.
const shotFocus = shotName ? stageShot(shotName, hero, chase, car, police) : null;
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
    car.update(dt, input, world);
    chase.yawToward(car.yaw, dt); // the camera eases in behind the car
    chase.update(dt, car.group.position, false);
    hud.updateDriving(car.speed);
    hud.setPrompt(Math.abs(car.speed) < 1 ? 'Press E to get out' : null);
    if (input.takeAction() && Math.abs(car.speed) < 1) exitCar();
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
    if (input.takeShot()) combat.shoot();
    if (input.takeReload()) combat.reload();

    // --- the car: near it, E gets in ----------------------------------------
    const nearCar = Math.hypot(
      hero.group.position.x - car.group.position.x,
      hero.group.position.z - car.group.position.z,
    ) < ENTER_RANGE;
    hud.setPrompt(nearCar ? 'Press E to enter the Sunset GT' : null);
    if (input.takeAction() && nearCar) enterCar();
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
    police.noteSpeeding(dt, Math.abs(car.speed) > SPEED_LIMIT);
    if (car.hits > lastCarHits) {
      lastCarHits = car.hits;
      police.noteCollision();
    }
  }
  const player = driving
    ? { x: car.group.position.x, z: car.group.position.z, driving: true, speed: car.speed, car }
    : { x: hero.group.position.x, z: hero.group.position.z, driving: false, speed, car: null };
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
  hero, car, police, vitals, combat,
  // Test helpers: set the heat at once, put a patrol car beside the player,
  // or force the bust, without waiting for a real crime and chase.
  debug: {
    setWanted(n) { police.setWanted(n); },
    placeNear() {
      const p = driving ? car.group.position : hero.group.position;
      police.placeNear(p.x, p.z);
    },
    forceBust() { police.forceBust(); },
    damage(n) { vitals.damage(n); },
    shoot() { combat.shoot(); },
    reload() { combat.reload(); },
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
