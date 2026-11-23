// Step 6 — the minimap radar: a small north-up map of Solmar Bay in the
// top-right corner. It draws the streets, Raka (a white arrow that turns
// with him), the patrol cars and the helicopter in red, the civilian rides
// and the Sunset GT as dots, the pedestrians as small dots, and the active
// mission target as a pulsing yellow diamond. It redraws every frame, so
// the dots move with the city.
//
// The map is north-up: the top of the radar is the north end of the city
// (z = -60) and the right edge is the east side (x = +60). The world is
// 110 metres across, so the radar shows the whole city at a glance.

const SIZE = 300; // the canvas backing store, drawn at 150px on the page
const RANGE = 60; // the map covers x and z from -RANGE to +RANGE
const SCALE = SIZE / (RANGE * 2); // pixels per metre

/** Turn a world position into radar pixels (north-up). */
function toRadar(x, z) {
  return { px: (x + RANGE) * SCALE, py: (z + RANGE) * SCALE };
}

export function createRadar() {
  const canvas = document.getElementById('radar');
  const ctx = canvas.getContext('2d');
  let lastX = 0;
  let lastZ = 0;
  let lastYaw = Math.PI;
  let lastTarget = null;
  let time = 0;

  /** A filled dot on the map. */
  function dot(x, z, radius, color) {
    const p = toRadar(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A ring on the map (the helicopter, or the mission target's halo). */
  function ring(x, z, radius, color, width) {
    const p = toRadar(x, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  return {
    /** Raka's last drawn position (the test harness reads this). */
    get player() { return { x: lastX, z: lastZ, yaw: lastYaw }; },
    /** The last drawn mission target, or null. */
    get target() { return lastTarget; },

    /**
     * Redraw the map. `state` is { x, z, yaw, police, heli, vehicles,
     * npcs, sunset, target, time }: Raka's spot and heading, the patrol
     * cars' spots, the helicopter's spot (or null), the civilian rides',
     * the pedestrians', the Sunset GT's, and the mission target's (or
     * null). `time` is the running clock, for the target's pulse.
     */
    update(state) {
      time = state.time ?? time;
      lastX = state.x;
      lastZ = state.z;
      lastYaw = state.yaw;
      lastTarget = state.target ?? null;

      // --- the map itself: a dark panel, the streets, a north tick -------
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = 'rgba(12, 18, 12, 0.92)';
      ctx.fillRect(0, 0, SIZE, SIZE);
      // The main avenue (north–south) and the three cross streets.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect((0 - 5 + RANGE) * SCALE, 0, 10 * SCALE, SIZE);
      for (const z of [-30, 0, 30]) {
        ctx.fillRect(0, (z - 4 + RANGE) * SCALE, SIZE, 8 * SCALE);
      }
      // A gold border and an N for north.
      ctx.strokeStyle = 'rgba(242, 201, 76, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
      ctx.fillStyle = '#f2c94c';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', SIZE / 2, 24);

      // --- the mission target: a pulsing yellow diamond and halo ----------
      if (state.target) {
        const p = toRadar(state.target.x, state.target.z);
        const pulse = 1 + 0.25 * Math.sin(time * 5);
        ctx.fillStyle = '#ffd94c';
        ctx.beginPath();
        ctx.moveTo(p.px, p.py - 11 * pulse);
        ctx.lineTo(p.px + 8 * pulse, p.py);
        ctx.lineTo(p.px, p.py + 11 * pulse);
        ctx.lineTo(p.px - 8 * pulse, p.py);
        ctx.closePath();
        ctx.fill();
        ring(state.target.x, state.target.z, 16 * pulse, 'rgba(255, 217, 76, 0.8)', 2);
      }

      // --- the street: pedestrians, then the rides -------------------------
      // Pedestrians first, so the rides draw over them where they overlap.
      for (const npc of state.npcs) {
        dot(npc.group.position.x, npc.group.position.z, 3, '#f2a0c0');
      }
      // The Sunset GT is Raka's own ride: orange, like the car itself.
      if (state.sunset) dot(state.sunset.x, state.sunset.z, 4, '#e8641e');
      for (const v of state.vehicles) {
        dot(v.group.position.x, v.group.position.z, 4, '#9ac8e8');
      }

      // --- the heat: patrol cars red, the helicopter a red ring ------------
      for (const p of state.police) {
        dot(p.x, p.z, 5, '#ff3b2d');
      }
      if (state.heli) {
        dot(state.heli.x, state.heli.z, 4, '#ff3b2d');
        ring(state.heli.x, state.heli.z, 9, '#ff3b2d', 2);
      }

      // --- Raka: a white arrow that turns with him -------------------------
      // His heading yaw points along (sin yaw, cos yaw) on the ground; on
      // the map +x is right and +z is down, so the canvas angle for it is
      // PI/2 - yaw (facing north, yaw PI, reads straight up).
      const p = toRadar(state.x, state.z);
      ctx.save();
      ctx.translate(p.px, p.py);
      ctx.rotate(Math.PI / 2 - state.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  };
}
