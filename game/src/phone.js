// Step 13 — the SOLMAR TEL: Raka's phone, Karimbu-style. T opens it
// and the world freezes behind it (the game loop owns the freeze, the
// same way it owns the pause menu's). Four tabs: JOBS (the side-work
// board — take one, abandon it, see which are done), MAP (the city
// with its seven districts and their standing), BANK (the cash balance
// and the ledger of everything paid in and fined out), TEXTS (messages
// from Mira, Lio and Kiki, tied to the story).
//
// The phone never owns game state itself: it reads the world through
// the callbacks in `deps` (the map state, the job board, the cash, the
// rank) and hands choices back the same way (take a job, drop one).
// The ledger IS the phone's own state: the game loop records every
// payout and fine into it, and a save carries it along.

const TABS = ['jobs', 'map', 'bank', 'texts'];
const MAP_SIZE = 440; // the phone map's backing store, drawn at 420px
const MAP_RANGE = 60; // the map covers x and z from -RANGE to +RANGE
const MAP_SCALE = MAP_SIZE / (MAP_RANGE * 2); // pixels per metre
const MAP_SEA = 29; // the sea band along the bottom edge, in pixels
const LEDGER_MAX = 30; // the bank keeps the newest thirty entries

/** Turn a world position into phone-map pixels (north-up, like the radar). */
function toMap(x, z) {
  const py = z <= MAP_RANGE
    ? (z + MAP_RANGE) * MAP_SCALE
    : MAP_SIZE - MAP_SEA + ((z - MAP_RANGE) / 60) * MAP_SEA;
  return { px: (x + MAP_RANGE) * MAP_SCALE, py };
}

/** Messages on the phone: who sent them, when, and what they said. */
const TEXTS = [
  {
    who: 'MIRA', color: '#ff9a5c', time: '08:12',
    text: "Darto's men were at the pier again today. Two of them, asking about the boatyard's papers. Keep your head down — and your pistol closer.",
  },
  {
    who: 'LIO', color: '#7ed957', time: '09:41',
    text: "Yo Raka! I can soup up that GT of yours one day. For now — don't scratch her, yeah?",
  },
  {
    who: 'KIKI', color: '#f2a0c0', time: '10:05',
    text: "Eyes on the avenue, boss. KPD's got two cars out tonight. Stay off the main drag.",
  },
  {
    who: 'MIRA', color: '#ff9a5c', time: 'Yesterday',
    text: "The boatyard's still mine. Barely. Every job you take is one more brick in his wall we knock out.",
  },
  {
    who: 'LIO', color: '#7ed957', time: 'Yesterday',
    text: "Heard you stole a bus. A BUS. You're braver than me, boss. The shop'll pay good for parts, just saying.",
  },
  {
    who: 'KIKI', color: '#f2a0c0', time: 'Yesterday',
    text: "Darto's boys hang around the pier after dark. If you see the grey van, go the other way.",
  },
  {
    who: 'MIRA', color: '#ff9a5c', time: 'Yesterday',
    text: "Lio says the Sunset GT needs a look. Bring it by the yard when you can — on the house, for old times.",
  },
  {
    who: 'KIKI', color: '#f2a0c0', time: 'Yesterday',
    text: "The beach is quiet tonight. Good night for a swim — or a boat that nobody watches.",
  },
];

export function createPhone(deps) {
  const phoneEl = document.getElementById('phone');
  const tabEls = [...document.querySelectorAll('.phone-tab')];
  const pageEls = {};
  for (const t of TABS) pageEls[t] = document.getElementById(`phone-page-${t}`);
  const jobsListEl = document.getElementById('phone-jobs-list');
  const mapCanvas = document.getElementById('phone-map');
  const bankListEl = document.getElementById('phone-bank-list');
  const textsListEl = document.getElementById('phone-texts-list');
  const closeBtn = document.getElementById('phone-close');
  const clockEl = document.getElementById('phone-clock');

  let open = false;
  let tab = 'jobs';
  let ledger = []; // { label, amount, at } — newest last

  /** A filled dot on the phone map. */
  function dot(ctx, x, z, radius, color) {
    const p = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A ring on the phone map (the helicopter, or a target's halo). */
  function ring(ctx, x, z, radius, color, width) {
    const p = toMap(x, z);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** A diamond on the phone map (a mission or job target). */
  function diamond(ctx, x, z, size, color) {
    const p = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.px, p.py - size);
    ctx.lineTo(p.px + size * 0.8, p.py);
    ctx.lineTo(p.px, p.py + size);
    ctx.lineTo(p.px - size * 0.8, p.py);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw the phone map: the same city the radar shows, bigger, with
   * the seven districts washed in by their standing (green where Raka
   * is liked, red where he is not), their names and scores, Raka's
   * arrow, the mission target in gold and the job target in cyan.
   */
  function drawMap(state) {
    const ctx = mapCanvas.getContext('2d');
    const S = MAP_SIZE;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 18, 12, 0.92)';
    ctx.fillRect(0, 0, S, S);
    // The districts first: a wash of green or red by their standing.
    for (const d of state.districts ?? []) {
      const warm = d.standing >= 60;
      const hostile = d.standing < 40;
      const p0 = toMap(d.x0, d.z0);
      const p1 = toMap(d.x1, d.z1);
      ctx.fillStyle = warm
        ? 'rgba(126, 217, 87, 0.10)'
        : hostile ? 'rgba(255, 77, 61, 0.12)' : 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(p0.px, p0.py, p1.px - p0.px, p1.py - p0.py);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p0.px, p0.py, p1.px - p0.px, p1.py - p0.py);
    }
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
    // The district names and their standing, at each district's centre.
    ctx.font = 'bold 13px system-ui, sans-serif';
    for (const d of state.districts ?? []) {
      const cx = (d.x0 + d.x1) / 2;
      const cz = (d.z0 + d.z1) / 2;
      const p = toMap(cx, cz);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(d.name.toUpperCase(), p.px, p.py - 4);
      ctx.fillStyle = d.standing >= 60 ? '#7ed957' : d.standing < 40 ? '#ff6b5e' : '#ffd97a';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`${d.label} ${d.standing}`, p.px, p.py + 12);
      ctx.font = 'bold 13px system-ui, sans-serif';
    }
    // The mission target in gold, the job target in cyan.
    if (state.target) diamond(ctx, state.target.x, state.target.z, 13, '#ffd94c');
    if (state.jobTarget) diamond(ctx, state.jobTarget.x, state.jobTarget.z, 13, '#35e0ff');
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

  /** One bank row: what it was, and how much it moved the balance. */
  function bankRow(entry) {
    const sign = entry.amount >= 0 ? '+' : '−';
    const amount = `$${Math.abs(entry.amount).toLocaleString('en-US')}`;
    const cls = entry.amount >= 0 ? 'in' : 'out';
    return `<div class="phone-row"><span class="k">${entry.label}</span>`
      + `<span class="v ${cls}">${sign}${amount}</span></div>`;
  }

  /** Rebuild the page showing now from live game state. */
  function renderCurrent() {
    const clock = document.getElementById('clock');
    if (clockEl && clock) clockEl.textContent = clock.textContent;
    if (tab === 'jobs') {
      const jobs = deps.getJobs();
      const anyActive = jobs.some((j) => j.isActive);
      jobsListEl.innerHTML = jobs.map((j) => {
        const status = j.isActive
          ? '<span class="job-tag active">ACTIVE</span>'
          : j.done ? '<span class="job-tag done">DONE ✓</span>' : '';
        const btn = j.isActive
          ? `<button class="pause-btn danger" data-abandon="${j.id}">ABANDON</button>`
          : `<button class="pause-btn" data-accept="${j.id}"${anyActive ? ' disabled' : ''}>ACCEPT — $${j.reward}</button>`;
        return `<div class="job-card"><div class="job-head"><span class="job-name">${j.name}</span>${status}</div>`
          + `<div class="job-desc">${j.desc}</div>`
          + `<div class="job-meta">${j.districtName} · +8 standing · +50 RP</div>`
          + `<div class="job-btns">${btn}</div></div>`;
      }).join('');
      jobsListEl.querySelectorAll('[data-accept]').forEach((btn) => {
        btn.addEventListener('click', () => {
          deps.sound.click();
          if (deps.onAcceptJob(btn.getAttribute('data-accept'))) renderCurrent();
        });
      });
      jobsListEl.querySelectorAll('[data-abandon]').forEach((btn) => {
        btn.addEventListener('click', () => {
          deps.sound.click();
          if (deps.onAbandonJob()) renderCurrent();
        });
      });
    } else if (tab === 'map') {
      drawMap(deps.getMapState());
    } else if (tab === 'bank') {
      const cash = deps.getCash();
      const rank = deps.getRank();
      bankListEl.innerHTML = ''
        + `<div class="phone-row"><span class="k">BALANCE</span><span class="v in">$${cash.toLocaleString('en-US')}</span></div>`
        + `<div class="phone-row"><span class="k">RANK</span><span class="v">RANK ${rank.rank} · ${rank.rp}${rank.next === null ? ' RP · MAX' : ` / ${rank.next} RP`}</span></div>`
        + (ledger.length === 0
          ? '<div class="phone-note">No transactions yet — finish a mission or a job.</div>'
          : ledger.slice().reverse().map(bankRow).join(''));
    } else if (tab === 'texts') {
      textsListEl.innerHTML = TEXTS.map((t) => (
        `<div class="text-msg"><div class="text-head"><span style="color:${t.color}">${t.who}</span>`
        + `<span class="text-time">${t.time}</span></div>`
        + `<div class="text-body">${t.text}</div></div>`
      )).join('');
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

  /** Show the phone and render the current tab. */
  function openPhone() {
    open = true;
    phoneEl.style.display = 'flex';
    renderCurrent();
  }

  /** Hide the phone. */
  function closePhone() {
    open = false;
    phoneEl.style.display = 'none';
  }

  // --- wiring ---------------------------------------------------------------
  for (const el of tabEls) {
    el.addEventListener('click', () => {
      deps.sound.click();
      openTab(el.getAttribute('data-tab'));
    });
  }
  closeBtn.addEventListener('click', () => {
    deps.sound.click();
    closePhone();
  });

  return {
    /** True while the phone is open (the world is frozen). */
    get open() { return open; },
    /** The tab showing now ('jobs' | 'map' | 'bank' | 'texts'). */
    get tab() { return tab; },
    /** Switch to a tab and render it. */
    openTab,
    /** Show the phone (and render the current tab). */
    openMenu: openPhone,
    /** Hide the phone. */
    closeMenu: closePhone,
    /** Open if closed, close if open. */
    toggle() {
      if (open) closePhone();
      else openPhone();
    },
    /** Rebuild the page showing now from live game state. */
    refresh: renderCurrent,

    /**
     * Write a line into the bank ledger: a payout (positive) or a fine
     * (negative). The ledger keeps the newest thirty entries.
     */
    recordLedger(label, amount) {
      ledger.push({ label, amount, at: Date.now() });
      if (ledger.length > LEDGER_MAX) ledger = ledger.slice(-LEDGER_MAX);
      return ledger.length;
    },

    /** The ledger's entries, oldest first (for a save). */
    get ledger() {
      return ledger.map((e) => ({ label: e.label, amount: e.amount, at: e.at }));
    },

    /**
     * Put saved ledger entries back (a load). Only well-formed entries
     * are kept, oldest first, capped at the ledger's length.
     */
    restoreLedger(saved) {
      ledger = [];
      for (const e of saved ?? []) {
        if (e && typeof e.label === 'string' && typeof e.amount === 'number' && Number.isFinite(e.amount)) {
          ledger.push({ label: e.label, amount: e.amount, at: typeof e.at === 'number' ? e.at : 0 });
        }
      }
      if (ledger.length > LEDGER_MAX) ledger = ledger.slice(-LEDGER_MAX);
      return ledger.length;
    },
  };
}
