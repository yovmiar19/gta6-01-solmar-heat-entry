// Keyboard and mouse (WASD / arrows to move, Shift to run, drag to look).
// Pointer events cover mouse and touch drags alike. The game reads the move
// amounts each frame and turns them into camera-relative movement itself.

export function createInput(canvas, onOrbit) {
  const keys = new Set();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function down(event) {
    // Arrow keys would scroll the page; the game owns them.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
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
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    onOrbit(dx, dy);
  }
  function pointerUp() {
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
