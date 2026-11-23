// Keyboard and mouse (WASD / arrows to move, Shift to run, drag to look,
// right mouse held to aim, left click to shoot, R to reload).
// Pointer events cover mouse and touch drags alike. The game reads the move
// amounts each frame and turns them into camera-relative movement itself.
// A press that barely moves the pointer is a click, not a drag: it queues
// one shot instead of orbiting the camera. The right mouse button never
// drags or shoots: holding it aims, and the browser's context menu is kept
// off the whole game so a right click is aim alone.

export function createInput(canvas, onOrbit) {
  const keys = new Set();
  let actionQueued = false; // E pressed since the last takeAction() call
  let shotQueued = false; // a click (not a drag) since the last takeShot() call
  let reloadQueued = false; // R pressed since the last takeReload() call
  let weatherQueued = false; // C pressed since the last takeWeather() call
  let timeQueued = false; // T pressed since the last takeTime() call
  let jumpQueued = false; // Space pressed since the last takeJump() call (step 10)
  let slot1Queued = false; // 1 pressed since the last takeSlot1() call (step 10)
  let slot2Queued = false; // 2 pressed since the last takeSlot2() call (step 10)
  let skipQueued = false; // Esc pressed since the last takeSkip() call (step 11)
  let logQueued = false; // L pressed since the last takeLog() call (step 11)
  let aiming = false; // right mouse held since the last pointer event
  let dragging = false;
  let clickCandidate = false; // left button down, not yet released: may be a click
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
    if (event.code === 'KeyC' && !event.repeat) weatherQueued = true;
    if (event.code === 'KeyT' && !event.repeat) timeQueued = true;
    if (event.code === 'Space' && !event.repeat) jumpQueued = true;
    if (event.code === 'Digit1' && !event.repeat) slot1Queued = true;
    if (event.code === 'Digit2' && !event.repeat) slot2Queued = true;
    if (event.code === 'Escape' && !event.repeat) skipQueued = true;
    if (event.code === 'KeyL' && !event.repeat) logQueued = true;
    keys.add(event.code);
  }
  function up(event) {
    keys.delete(event.code);
  }
  function blur() {
    keys.clear();
    dragging = false;
    aiming = false;
    clickCandidate = false;
  }

  function pointerDown(event) {
    // Right button: hold to aim. It never starts a drag and never shoots.
    if (event.button === 2) {
      aiming = true;
      return;
    }
    if (event.button !== 0) return;
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
    // Track how far the pointer travelled while the left button is held:
    // that distance is what separates a click from a drag. The orbit
    // itself only runs for a drag that began with a left pointerdown.
    if (!(event.buttons & 1)) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    if (dragging) onOrbit(dx, dy);
  }
  function pointerUp(event) {
    // Releasing the right button leaves aim mode; it never fired a shot.
    if (event.button === 2) {
      aiming = false;
      return;
    }
    if (event.button !== 0) return;
    dragging = false;
  }
  function pointerCancel() {
    // An interrupted press orbits and aims no more, and fires nothing.
    dragging = false;
    aiming = false;
    clickCandidate = false;
  }

  // Clicks are read off mousedown/mouseup, not pointerdown/pointerup:
  // while the right button is already held, the browser never fires a
  // pointerdown or pointerup for the left button at all — it only sends
  // pointermove with the buttons mask — so a pointer-based click detector
  // is blind to exactly the shot Yovmi asked for (left click while
  // aiming). mousedown/mouseup fire once per button, held or not, so they
  // see every shot. The drag state still lives on the pointer handlers
  // above; these two only arm and settle a click candidate.
  function mouseDown(event) {
    if (event.button !== 0) return;
    lastX = event.clientX;
    lastY = event.clientY;
    downX = event.clientX;
    downY = event.clientY;
    downTime = performance.now();
    moved = 0;
    clickCandidate = true;
  }
  function mouseUp(event) {
    if (event.button !== 0) return;
    // A press that barely moved the pointer is a click: queue a shot.
    // A real drag moved further and orbits only. The time window is
    // generous on purpose: on a slow frame the up handler can land well
    // after the down handler, and a click held a second is still a click
    // — movement, not speed, is what separates a click from a drag.
    if (clickCandidate && moved < 6 && performance.now() - downTime < 1000) shotQueued = true;
    clickCandidate = false;
  }

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('mousedown', mouseDown);
  canvas.addEventListener('mouseup', mouseUp);
  // A right click anywhere in the game is aim, never the browser's menu
  // (Inspect and the rest): the canvas, every HUD overlay above it, and
  // the document itself all swallow the context menu. The page is the
  // game, so no right click anywhere on it may open a menu and steal the
  // aim press — a mis-click into Inspect is exactly what this stops.
  function noMenu(event) {
    event.preventDefault();
  }
  canvas.addEventListener('contextmenu', noMenu);
  const hudRoot = document.getElementById('hud');
  if (hudRoot) hudRoot.addEventListener('contextmenu', noMenu);
  document.addEventListener('contextmenu', noMenu);

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
    /** True once per C press, then clears: turn the weather (step 8). */
    takeWeather() {
      const pressed = weatherQueued;
      weatherQueued = false;
      return pressed;
    },
    /** True once per T press, then clears: jump the clock two hours (step 8). */
    takeTime() {
      const pressed = timeQueued;
      timeQueued = false;
      return pressed;
    },
    /** True once per Space press, then clears: jump, vault, climb, or dive (step 10). */
    takeJump() {
      const pressed = jumpQueued;
      jumpQueued = false;
      return pressed;
    },
    /** True once per 1 press, then clears: select the Fists (step 10). */
    takeSlot1() {
      const pressed = slot1Queued;
      slot1Queued = false;
      return pressed;
    },
    /** True once per 2 press, then clears: select the Pistol (step 10). */
    takeSlot2() {
      const pressed = slot2Queued;
      slot2Queued = false;
      return pressed;
    },
    /** True once per Esc press, then clears: skip the cutscene (step 11). */
    takeSkip() {
      const pressed = skipQueued;
      skipQueued = false;
      return pressed;
    },
    /** True once per L press, then clears: open the story log (step 11). */
    takeLog() {
      const pressed = logQueued;
      logQueued = false;
      return pressed;
    },
    /** True while the right mouse button is held: aim mode. */
    get aiming() {
      return aiming;
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
