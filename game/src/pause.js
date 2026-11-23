// Step 12 — the pause menu, Karimbu-style: Esc (or P) freezes the world
// and opens a panel with six tabs — MAP, STORY, STATS, SETTINGS,
// CONTROLS, SAVE. The menu lives outside #hud so its buttons take
// clicks. While it is open the game loop does nothing but wait: the
// clock, the weather, the traffic and the missions all hold still.
//
// The menu never owns game state itself: it reads the world through the
// callbacks in `deps` (map state, stats, the story log, the save slots)
// and hands choices back the same way (setting changes, save, load,
// reset). The game loop owns the open/closed state and calls toggle().

const TABS = ['map', 'story', 'stats', 'settings', 'controls', 'save'];
const MAP_SIZE = 440; // the pause map's backing store, drawn at 420px
const MAP_RANGE = 60; // the map covers x and z from -RANGE to +RANGE
const MAP_SCALE = MAP_SIZE / (MAP_RANGE * 2); // pixels per metre
const MAP_SEA = 29; // the sea band along the bottom edge, in pixels

/** Turn a world position into pause-map pixels (north-up, like the radar). */
function toMap(x, z) {
  const py = z <= MAP_RANGE
    ? (z + MAP_RANGE) * MAP_SCALE
    : MAP_SIZE - MAP_SEA + ((z - MAP_RANGE) / 60) * MAP_SEA;
  return { px: (x + MAP_RANGE) * MAP_SCALE, py };
}

export function createPause(deps) {
  const menuEl = document.getElementById('pause-menu');
  const tabEls = [...document.querySelectorAll('.pause-tab')];
  const pageEls = {};
  for (const t of TABS) pageEls[t] = document.getElementById(`pause-page-${t}`);
  const mapCanvas = document.getElementById('pause-map');
  const storyListEl = document.getElementById('pause-story-list');
  const statsListEl = document.getElementById('pause-stats-list');
  const saveListEl = document.getElementById('pause-save-list');
  const soundBtn = document.getElementById('set-sound');
  const qualityBtn = document.getElementById('set-quality');
  const resetBtn = document.getElementById('set-reset');
  const resumeBtn = document.getElementById('pause-resume');

  let open = false;
  let tab = 'map';
  let resetArmed = false;
  let resetTimer = null;

  /** A filled dot on the pause map. */
  function dot(ctx, x, z, radius, color) {
    const p = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A ring on the pause map (the helicopter). */
  function ring(ctx, x, z, radius, color, width) {
    const p = toMap(x, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Draw the pause map: the same city the radar shows, bigger — the
   * streets, the sea, Raka's arrow, the mission target, the heat and
   * the street. `state` is the radar's state object.
   */
  function drawMap(state) {
    const ctx = mapCanvas.getContext('2d');
    const S = MAP_SIZE;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 18, 12, 0.92)';
    ctx.fillRect(0, 0, S, S);
    // The main avenue (north–south) and the three cross streets.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect((0 - 5 + MAP_RANGE) * MAP_SCALE, 0, 10 * MAP_SCALE, S);
    for (const z of [-30, 0, 30]) {
      ctx.fillRect(0, (z - 4 + MAP_RANGE) * MAP_SCALE, S, 8 * MAP_SCALE);
    }
    // The sea: a blue band along the bottom edge, foam where sand meets it.
    ctx.fillStyle = 'rgba(30, 111, 158, 0.85)';
    ctx.fillRect(0, S - MAP_SEA, S, MAP_SEA);
    ctx.fillStyle = 'rgba(244, 251, 255, 0.7)';
    ctx.fillRect(0, S - MAP_SEA, S, 2);
    // A gold border and an N for north.
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
    ctx.fillStyle = '#f2c94c';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 30);
    // The mission target: a pulsing yellow diamond and halo.
    if (state.target) {
      const p = toMap(state.target.x, state.target.z);
      const pulse = 1 + 0.25 * Math.sin((state.time ?? 0) * 5);
      ctx.fillStyle = '#ffd94c';
      ctx.beginPath();
      ctx.moveTo(p.px, p.py - 13 * pulse);
      ctx.lineTo(p.px + 10 * pulse, p.py);
      ctx.lineTo(p.px, p.py + 13 * pulse);
      ctx.lineTo(p.px - 10 * pulse, p.py);
      ctx.closePath();
      ctx.fill();
      ring(ctx, state.target.x, state.target.z, 20 * pulse, 'rgba(255, 217, 76, 0.8)', 2);
    }
    // The street: pedestrians, then the rides, then the boats.
    for (const npc of state.npcs) dot(ctx, npc.group.position.x, npc.group.position.z, 4, '#f2a0c0');
    if (state.sunset) dot(ctx, state.sunset.x, state.sunset.z, 5, '#e8641e');
    for (const v of state.vehicles) dot(ctx, v.group.position.x, v.group.position.z, 5, '#9ac8e8');
    for (const b of state.boats ?? []) dot(ctx, b.group.position.x, b.group.position.z, 5, '#35e0ff');
    // The heat: patrol cars red, the helicopter a red ring.
    for (const p of state.police) dot(ctx, p.x, p.z, 6, '#ff3b2d');
    if (state.heli) {
      dot(ctx, state.heli.x, state.heli.z, 5, '#ff3b2d');
      ring(ctx, state.heli.x, state.heli.z, 11, '#ff3b2d', 2);
    }
    // Raka: a white arrow that turns with him.
    const p = toMap(state.x, state.z);
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(Math.PI / 2 - state.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** One stats row: a label on the left, a value on the right. */
  function row(k, v) {
    return `<div class="pause-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  }

  /** Format seconds as mm:ss. */
  function clockOf(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Rebuild the page showing now from live game state. */
  function renderCurrent() {
    if (tab === 'map') {
      drawMap(deps.getMapState());
    } else if (tab === 'story') {
      const beats = deps.getStoryLog();
      storyListEl.innerHTML = beats.length === 0
        ? '<div class="pause-row"><span class="k">NO BEATS YET</span><span class="v">Play the intro — the story writes itself as you go.</span></div>'
        : beats.map((b) => (
          `<div class="log-beat"><div class="log-title">${b.title}</div>`
          + `<div class="log-line">&ldquo;${b.line}&rdquo;</div></div>`
        )).join('');
    } else if (tab === 'stats') {
      const s = deps.getStats();
      statsListEl.innerHTML = ''
        + row('CASH', `$${s.cash.toLocaleString('en-US')}`)
        + row('MISSIONS', `${s.completed} / ${s.total}${s.activeName ? ` — ${s.activeName}` : ''}`)
        + row('WANTED', s.wanted > 0 ? '★'.repeat(s.wanted) + '☆'.repeat(5 - s.wanted) : 'CLEAN')
        + row('HEALTH', `${Math.round(s.health)} / 100`)
        + row('STAMINA', `${Math.round(s.stamina)} / 100`)
        + row('STORY BEATS', String(s.beats))
        + row('PLAY TIME', clockOf(s.playSeconds))
        + row('GAME TIME', `${s.clockText} · ${s.phase} · ${s.weather}`);
    } else if (tab === 'settings') {
      soundBtn.textContent = deps.settings.sound ? 'ON' : 'OFF';
      qualityBtn.textContent = deps.settings.quality === 'low' ? 'LOW' : 'HIGH';
    } else if (tab === 'save') {
      const slots = deps.listSaves();
      saveListEl.innerHTML = slots.map(({ slot, data }) => {
        const name = slot === 'auto' ? 'AUTOSAVE' : `SLOT ${slot}`;
        const info = !data
          ? 'Empty slot.'
          : `Cash <b>$${data.cash.toLocaleString('en-US')}</b> · Missions ${data.completedCount} / 4`
            + ` · ${data.timeText ?? ''} ${data.weather ?? ''} · saved ${new Date(data.savedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        const saveBtn = slot === 'auto' ? '' : `<button class="pause-btn ghost" data-save="${slot}">SAVE</button>`;
        const loadBtn = `<button class="pause-btn" data-load="${slot}"${data ? '' : ' disabled'}>LOAD</button>`;
        return `<div class="save-slot"><div class="slot-name">${name}</div>`
          + `<div class="slot-info">${info}</div>`
          + `<div class="slot-btns">${saveBtn}${loadBtn}</div></div>`;
      }).join('');
      saveListEl.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', () => {
          deps.sound.click();
          deps.onSave(btn.getAttribute('data-save'));
          renderCurrent();
        });
      });
      saveListEl.querySelectorAll('[data-load]').forEach((btn) => {
        btn.addEventListener('click', () => {
          deps.sound.click();
          if (deps.onLoad(btn.getAttribute('data-load'))) closeMenu();
        });
      });
    }
  }

  /** Switch to a tab and render it. */
  function openTab(name) {
    if (!TABS.includes(name)) return false;
    tab = name;
    for (const t of TABS) {
      pageEls[t].classList.toggle('active', t === name);
    }
    for (const el of tabEls) {
      el.classList.toggle('active', el.getAttribute('data-tab') === name);
    }
    renderCurrent();
    return true;
  }

  /** Disarm the reset button's two-step confirm. */
  function disarmReset() {
    resetArmed = false;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = null;
    resetBtn.textContent = 'RESET';
  }

  /** Show the menu and render the current tab. */
  function openMenu() {
    open = true;
    menuEl.style.display = 'flex';
    renderCurrent();
  }

  /** Hide the menu. */
  function closeMenu() {
    open = false;
    menuEl.style.display = 'none';
    disarmReset();
  }

  // --- wiring ---------------------------------------------------------------
  for (const el of tabEls) {
    el.addEventListener('click', () => {
      deps.sound.click();
      openTab(el.getAttribute('data-tab'));
    });
  }
  resumeBtn.addEventListener('click', () => {
    deps.sound.click();
    closeMenu();
  });
  soundBtn.addEventListener('click', () => {
    deps.sound.click();
    deps.onSettingChange('sound', !deps.settings.sound);
    renderCurrent();
  });
  qualityBtn.addEventListener('click', () => {
    deps.sound.click();
    deps.onSettingChange('quality', deps.settings.quality === 'low' ? 'high' : 'low');
    renderCurrent();
  });
  resetBtn.addEventListener('click', () => {
    deps.sound.click();
    if (!resetArmed) {
      // First press arms it: a second press within three seconds resets.
      resetArmed = true;
      resetBtn.textContent = 'SURE?';
      resetTimer = setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    deps.onReset();
  });

  return {
    /** True while the menu is open (the world is frozen). */
    get open() { return open; },
    /** The tab showing now ('map' | 'story' | 'stats' | 'settings' | 'controls' | 'save'). */
    get tab() { return tab; },
    /** Switch to a tab and render it. */
    openTab,
    /** Show the menu (and render the current tab). */
    openMenu,
    /** Hide the menu. */
    closeMenu,
    /** Open if closed, close if open. */
    toggle() {
      if (open) closeMenu();
      else openMenu();
    },
    /** Rebuild the page showing now from live game state. */
    refresh: renderCurrent,
  };
}
