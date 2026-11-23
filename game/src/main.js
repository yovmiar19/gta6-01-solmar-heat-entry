// SOLMAR HEAT, step 1 — the entrypoint. It builds the renderer, the city, Raka
// and the third-person camera, then runs the loop: read the input, move Raka
// camera-relative, turn him to face where he moves, chase him with the camera,
// and refresh the HUD. With ?shot=chase|street|closeup|title&seed=7 in the URL
// it stages one deterministic screenshot scene instead and holds the frame.

import { createWorld } from './world.js';
import { createProtagonist } from './character.js';
import { createChaseCamera } from './camera.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const WALK_SPEED = 3.2; // metres per second
const RUN_SPEED = 5.8;

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

// --- the city, the hero, the camera, the input, the HUD ----------------------
const world = createWorld(scene, seed);
const hero = createProtagonist();
hero.group.position.set(0, 0, 10);
hero.face(Math.PI); // north, up the main avenue into the city
hero.group.rotation.y = Math.PI;
scene.add(hero.group);

const chase = createChaseCamera(camera);
const hud = createHud();
const input = createInput(canvas, (dx, dy) => chase.orbit(dx, dy));

// A screenshot scene freezes the pose and holds the frame; play mode moves.
const frozen = shotName ? stageShot(shotName, hero, chase) : false;

// --- movement ----------------------------------------------------------------
let speed = 0; // current ground speed, smoothed toward the target

function step(dt) {
  world.update(dt);
  if (frozen) {
    // Hold the staged frame: camera exactly on its spot, hero in his pose.
    chase.update(dt, hero.group.position, true);
    return;
  }

  const f = input.forward;
  const s = input.strafe;
  const moving = input.moving;
  const running = input.running;

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
  hud.update(speed, moving, running);
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
