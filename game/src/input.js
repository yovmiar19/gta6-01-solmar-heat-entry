// Keyboard and mouse (WASD / arrows to move, Shift to run, drag to look,
// click to shoot, R to reload).
// Pointer events cover mouse and touch drags alike. The game reads the move
// amounts each frame and turns them into camera-relative movement itself.
// A press that barely moves the pointer and lifts quickly is a click, not a
// drag: it queues one shot instead of orbiting the camera.

export function createInput(canvas, onOrbit) {
  const keys = new Set();
  let actionQueued = false; // E pressed since the last takeAction() call
  let shotQueued = false; // a click (not a drag) since the last takeShot() call
  let reloadQueued = false; // R pressed since the last takeReload() call
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let moved = 0;

  function down(event) {
    // Arrow keys would scroll the page; the game owns them.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === 'KeyE' && !event.repeat) actionQueued = true;
    if (event.code === 'KeyR' && !event.repeat) reloadQueued = true;
    keys.add(event.code);
  }
  function up(event) {
    keys.delete(event.code);
  }
  function blur() {
    keys.clear();
    dragging = false;
  }

  function pointerDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    downX = event.clientX;
    downY = event.clientY;
    downTime = performance.now();
    moved = 0;
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    onOrbit(dx, dy);
  }
  function pointerUp(event) {
    // A quick press that barely moved the pointer is a click: queue a shot.
    // A real drag moved further or lasted longer and orbits only.
    if (dragging && moved < 6 && performance.now() - downTime < 350) shotQueued = true;
    dragging = false;
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);

  function held(...codes) {
    return codes.some((code) => keys.has(code));
  }

  return {
    /**
     * True once per E press, then clears: enter the car when near it on foot,
     * get out when driving and (nearly) stopped. Held E never repeats.
     */
    takeAction() {
      const pressed = actionQueued;
      actionQueued = false;
      return pressed;
    },
    /** True once per click (a press that did not drag), then clears: shoot. */
    takeShot() {
      const pressed = shotQueued;
      shotQueued = false;
      return pressed;
    },
    /** True once per R press, then clears: reload the magazine. */
    takeReload() {
      const pressed = reloadQueued;
      reloadQueued = false;
      return pressed;
    },
    /** Forward amount: +1 for W / Up, -1 for S / Down. */
    get forward() {
      return (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
    },
    /** Strafe amount: +1 for D / Right, -1 for A / Left. */
    get strafe() {
      return (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    },
    /** Shift held: run instead of walk. */
    get running() {
      return held('ShiftLeft', 'ShiftRight');
    },
    /** Any move key held. */
    get moving() {
      return this.forward !== 0 || this.strafe !== 0;
    },
  };
}
