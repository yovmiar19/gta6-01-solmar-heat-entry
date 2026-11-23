// Step 11 — the story of Solmar Heat: cutscene dialogue, in-engine.
// Raka comes home to Solmar Bay after three years away, and finds his
// friend Mira's boatyard in the sights of Darto "Si Hiu", the developer
// who is buying the whole bay street by street. The story plays in
// cutscenes: a portrait dialogue box with typewriter text, Space or a
// click to go on, Esc to skip. While a cutscene plays the game waits —
// the world holds still behind the letterbox bars — and when it ends the
// job it was about starts (or the job just finished gets its last word).
//
// A scene is { title, lines: [{ who, text }] }. The player queues scenes
// (an intro, a mission's intro, a completion line) and they play in
// order. Every scene that starts is written into the story log, which
// the player can open with L to see the beats they have already lived.
// Step 12: a saved game's log can be put back with restoreLog().

const TYPE_SPEED = 45; // characters per second the typewriter reveals

const CHARACTERS = {
  raka: {
    name: 'RAKA',
    color: '#4ad8e8',
    skin: '#d9a06b',
    hair: '#1c1c1c',
    jacket: '#1f7a7a',
    shirt: '#f5f0e6',
  },
  mira: {
    name: 'MIRA',
    color: '#ff9a5c',
    skin: '#e8b98a',
    hair: '#241610',
    jacket: '#d96a4a',
    shirt: '#f5f0e6',
  },
  darto: {
    name: 'DARTO "SI HIU"',
    color: '#c9c9c9',
    skin: '#c9a37e',
    hair: '#333338',
    jacket: '#4a4a52',
    shirt: '#2a2a30',
  },
};

const SCENES = {
  intro: {
    title: 'ACT I — HOMECOMING',
    lines: [
      { who: 'mira', text: "Raka? Raka! Three years gone and you just walk back in like the tide." },
      { who: 'raka', text: "The tide always comes back, Mira. What's left of the boatyard?" },
      { who: 'mira', text: "Still mine. Barely. Darto 'Si Hiu' has been circling it for months — 'redevelopment', he calls it." },
      { who: 'raka', text: "Darto the Shark. He used to sell stolen radios out of a van. Now he buys whole streets?" },
      { who: 'mira', text: "Now he owns the pier, the market, and half the KPD's patience. The bay is his unless someone pushes back." },
      { who: 'raka', text: "Then I'll push. But first I need wheels, and wheels cost money." },
      { who: 'mira', text: "There's work on the avenue — jobs that pay, if you don't mind getting your hands dirty. Welcome home, Raka." },
    ],
  },
  'intro-wheels': {
    title: 'FIRST WHEELS',
    lines: [
      { who: 'mira', text: "No car, no jobs, Raka. Borrow one — permanently. Any civilian ride will do." },
      { who: 'raka', text: "Borrow. Right. The owner will understand." },
      { who: 'mira', text: "They never do. That's why you drive fast." },
    ],
  },
  'intro-pier': {
    title: 'PIER RUN',
    lines: [
      { who: 'mira', text: "Darto's men watch the pier. Drive the drop-off there anyway — fast, quiet, no stops." },
      { who: 'raka', text: "If they stop me, I'll tell them I'm the delivery boy." },
      { who: 'mira', text: "You ARE the delivery boy. That's the whole problem." },
    ],
  },
  'intro-practice': {
    title: 'TARGET PRACTICE',
    lines: [
      { who: 'mira', text: "Before you wave that pistol around town — prove you can hit something that isn't moving." },
      { who: 'raka', text: "Three rounds on the dummy. Watch and learn." },
    ],
  },
  'intro-heat': {
    title: 'LOSE THE HEAT',
    lines: [
      { who: 'raka', text: "The KPD's on me. Time to show them Solmar Bay is bigger than their radio." },
      { who: 'mira', text: "Lose them, Raka. Don't make me post your bail again." },
    ],
  },
  'done-wheels': {
    title: 'FIRST WHEELS — DONE',
    lines: [
      { who: 'mira', text: "Wheels, sorted. Now earn your keep." },
    ],
  },
  'done-pier': {
    title: 'PIER RUN — DONE',
    lines: [
      { who: 'mira', text: "Delivered. Darto's men didn't even blink. Keep it that way." },
    ],
  },
  'done-practice': {
    title: 'TARGET PRACTICE — DONE',
    lines: [
      { who: 'raka', text: "Three for three. The dummy never stood a chance." },
    ],
  },
  'done-heat': {
    title: 'LOSE THE HEAT — DONE',
    lines: [
      { who: 'mira', text: "Clean. The KPD lost you — and Darto heard about it." },
    ],
  },
  'done-all': {
    title: 'ALL JOBS DONE',
    lines: [
      { who: 'mira', text: "The bay's talking, Raka. Every job, every escape — Darto knows your name now." },
      { who: 'raka', text: "Good. Let him come. Solmar Bay is mine." },
    ],
  },
};

/**
 * Paint a stylized portrait of a character on a small canvas: face,
 * hair, jacket and shirt, each in their own colours, so the three
 * speakers read as three different people at a glance. `who` is one of
 * the keys of CHARACTERS; `ctx` draws at twice the display size (the
 * canvas is 192 wide and shown at 96) so the lines stay sharp.
 */
function drawPortrait(canvas, who) {
  const c = CHARACTERS[who] ?? CHARACTERS.raka;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  ctx.clearRect(0, 0, W, H);
  // The backdrop: a dark wash of the speaker's colour.
  ctx.fillStyle = c.color;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // The shoulders: jacket across the bottom, shirt in a V at the throat.
  ctx.fillStyle = c.jacket;
  ctx.beginPath();
  ctx.moveTo(cx - 62, H);
  ctx.quadraticCurveTo(cx - 58, H * 0.62, cx - 26, H * 0.66);
  ctx.lineTo(cx + 26, H * 0.66);
  ctx.quadraticCurveTo(cx + 58, H * 0.62, cx + 62, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c.shirt;
  ctx.beginPath();
  ctx.moveTo(cx - 14, H * 0.66);
  ctx.lineTo(cx, H * 0.86);
  ctx.lineTo(cx + 14, H * 0.66);
  ctx.closePath();
  ctx.fill();
  // Darto wears a tie over his shirt.
  if (who === 'darto') {
    ctx.fillStyle = '#1a1a1e';
    ctx.beginPath();
    ctx.moveTo(cx - 6, H * 0.7);
    ctx.lineTo(cx + 6, H * 0.7);
    ctx.lineTo(cx + 9, H * 0.95);
    ctx.lineTo(cx, H);
    ctx.lineTo(cx - 9, H * 0.95);
    ctx.closePath();
    ctx.fill();
  }
  // The neck and the face.
  ctx.fillStyle = c.skin;
  ctx.fillRect(cx - 11, H * 0.56, 22, 18);
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.38, 34, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // The hair: Raka short and spiky, Mira long down both sides, Darto
  // slicked back over the crown.
  ctx.fillStyle = c.hair;
  if (who === 'mira') {
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.36, 38, 42, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 36, H * 0.55, 12, 34, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 36, H * 0.55, 12, 34, -0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (who === 'darto') {
    ctx.beginPath();
    ctx.ellipse(cx, H * 0.3, 35, 24, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 34, H * 0.3);
    ctx.lineTo(cx - 30, H * 0.2);
    ctx.lineTo(cx + 30, H * 0.2);
    ctx.lineTo(cx + 34, H * 0.3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 35, H * 0.34);
    ctx.lineTo(cx - 28, H * 0.14);
    ctx.lineTo(cx - 14, H * 0.22);
    ctx.lineTo(cx - 4, H * 0.1);
    ctx.lineTo(cx + 8, H * 0.22);
    ctx.lineTo(cx + 20, H * 0.12);
    ctx.lineTo(cx + 30, H * 0.24);
    ctx.lineTo(cx + 35, H * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  // The eyes and brows.
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(cx - 13, H * 0.38, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 13, H * 0.38, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = c.hair;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 19, H * 0.3);
  ctx.lineTo(cx - 7, H * 0.29);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 7, H * 0.29);
  ctx.lineTo(cx + 19, H * 0.3);
  ctx.stroke();
  // Darto's thin moustache.
  if (who === 'darto') {
    ctx.fillStyle = c.hair;
    ctx.fillRect(cx - 12, H * 0.5, 24, 4);
  }
  // The mouth: a smile for Raka and Mira, a flat line for Darto.
  ctx.strokeStyle = '#7a4a30';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (who === 'darto') {
    ctx.moveTo(cx - 10, H * 0.56);
    ctx.lineTo(cx + 10, H * 0.56);
  } else {
    ctx.arc(cx, H * 0.5, 12, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();
  // Mira's earrings.
  if (who === 'mira') {
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.arc(cx - 33, H * 0.46, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 33, H * 0.46, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Build the story player. `hud` is the HUD (for the story-beat line in
 * the mission panel); `input` is the keyboard/mouse rig (Space or a
 * click goes on, Esc skips). The dialogue box and the letterbox bars
 * live in index.html and are shown only while a scene plays.
 */
export function createStory(hud, input) {
  const boxEl = document.getElementById('dialogue');
  const portraitEl = document.getElementById('dlg-portrait');
  const nameEl = document.getElementById('dlg-name');
  const textEl = document.getElementById('dlg-text');
  const continueEl = document.getElementById('dlg-continue');
  const topBarEl = document.getElementById('letterbox-top');
  const bottomBarEl = document.getElementById('letterbox-bottom');
  const logEl = document.getElementById('story-log');
  const logListEl = document.getElementById('story-log-list');

  const queue = []; // scene ids waiting their turn
  const log = []; // beats seen: { title, line } in the order they played
  let current = null; // the scene playing now, or null
  let lineIndex = 0; // which line of the scene is up
  let shown = 0; // characters of the line the typewriter has revealed
  let logOpen = false;

  /** Paint the current line's speaker and text onto the box. */
  function renderLine() {
    const line = current.lines[lineIndex];
    const c = CHARACTERS[line.who] ?? CHARACTERS.raka;
    drawPortrait(portraitEl, line.who);
    nameEl.textContent = c.name;
    nameEl.style.color = c.color;
    textEl.textContent = line.text.slice(0, Math.floor(shown));
    // The continue mark only shows once the whole line is out.
    continueEl.style.visibility = shown >= line.text.length ? 'visible' : 'hidden';
  }

  /** Hide the box and the bars, and hand the game back. */
  function hideBox() {
    boxEl.style.display = 'none';
    topBarEl.style.display = 'none';
    bottomBarEl.style.display = 'none';
  }

  /** Start the next queued scene, or hide the box when the queue is empty. */
  function nextScene() {
    const id = queue.shift();
    if (!id || !SCENES[id]) {
      current = null;
      hideBox();
      return;
    }
    current = SCENES[id];
    current.id = id;
    lineIndex = 0;
    shown = 0;
    // The beat goes in the log the moment it starts playing.
    log.push({ title: current.title, line: current.lines[0].text });
    if (hud.setStoryBeat) hud.setStoryBeat(current.title);
    renderLog();
    boxEl.style.display = 'flex';
    topBarEl.style.display = 'block';
    bottomBarEl.style.display = 'block';
    renderLine();
  }

  /** Rebuild the log panel from the beats seen so far. */
  function renderLog() {
    if (!logListEl) return;
    logListEl.innerHTML = log.map((beat) => (
      `<div class="log-beat"><div class="log-title">${beat.title}</div>`
      + `<div class="log-line">&ldquo;${beat.line}&rdquo;</div></div>`
    )).join('');
  }

  return {
    /** True while a scene is playing (the game waits). */
    get playing() { return current !== null; },
    /** The scene playing now, or null. */
    get sceneId() { return current ? current.id : null; },
    /** Which line of the scene is up (0-based). */
    get lineIndex() { return lineIndex; },
    /** Characters of the line revealed so far. */
    get typed() { return Math.floor(shown); },
    /** True while the current line is fully typed out. */
    get lineDone() {
      return !!current && shown >= current.lines[lineIndex].text.length;
    },
    /** The beats seen so far, in order. */
    get log() { return log.map((b) => ({ title: b.title, line: b.line })); },
    /** True while the story log panel is open. */
    get logOpen() { return logOpen; },

    /**
     * Queue a scene by id ('intro', 'intro-wheels', 'done-pier', ...).
     * Unknown ids are ignored. Scenes play in the order they were queued.
     */
    play(id) {
      if (!SCENES[id]) return false;
      queue.push(id);
      if (!current) nextScene();
      return true;
    },

    /** Skip the scene playing now and everything queued behind it. */
    skipAll() {
      queue.length = 0;
      current = null;
      hideBox();
    },

    /** Open or close the story log panel. */
    toggleLog() {
      logOpen = !logOpen;
      if (logEl) logEl.style.display = logOpen ? 'block' : 'none';
      if (logOpen) renderLog();
      return logOpen;
    },

    /**
     * Step 12: put a saved game's beats back into the log (a load).
     * Only beats with a title and a line are kept, in the saved order.
     * The mission panel shows the last beat again, so the story picks up
     * where it left off instead of going blank.
     */
    restoreLog(beats) {
      log.length = 0;
      for (const b of beats ?? []) {
        if (b && typeof b.title === 'string' && typeof b.line === 'string') {
          log.push({ title: b.title, line: b.line });
        }
      }
      if (log.length > 0 && hud.setStoryBeat) hud.setStoryBeat(log[log.length - 1].title);
      renderLog();
      return log.length;
    },

    /**
     * One frame, while a scene plays. The typewriter reveals the line;
     * Space or a click finishes a line that is still typing, then moves
     * on to the next one; Esc skips the scene and the queue behind it.
     * The input queues are consumed here, so a press that advances the
     * dialogue never also jumps or shoots.
     */
    update(dt) {
      if (!current) return;
      const line = current.lines[lineIndex];
      if (shown < line.text.length) {
        shown = Math.min(line.text.length, shown + TYPE_SPEED * dt);
        renderLine();
      }
      const advance = input.takeJump() || input.takeShot();
      if (input.takeSkip()) {
        this.skipAll();
        return;
      }
      if (!advance) return;
      if (shown < line.text.length) {
        // Still typing: the press finishes the line at once.
        shown = line.text.length;
        renderLine();
        return;
      }
      lineIndex += 1;
      if (lineIndex >= current.lines.length) {
        nextScene();
        return;
      }
      shown = 0;
      renderLine();
    },
  };
}
