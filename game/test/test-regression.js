// test-regression.js — Step 14 regression: the pre-existing features
// (pistol, punch, aim, phone, pause, missions, traffic, staged shots)
// must all stay green after the weapons rework. Same polling rule as
// test-weapons.js: waitForFunction, never a fixed wait for a result.
// Usage: node game/test/test-regression.js
import { chromium } from '/home/hatch/workspace/webtools/playwright/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8124/game/index.html?story=0&seed=7';
const results = [];
const errors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__solmarReady === true, null, { timeout: 240000 });
check('load: ready with story off', true);

// Pistol: shoot the dummy, reload.
const before = await page.evaluate(() => ({ shots: window.__solmar.shotsFired, mag: window.__solmar.mag }));
await page.evaluate(() => window.__solmar.combat.shoot(true));
await page.waitForFunction((b) => window.__solmar.shotsFired > b, before.shots, { timeout: 240000 });
let s = await page.evaluate(() => ({ mag: window.__solmar.mag, hits: window.__solmar.hits }));
check('pistol: aimed shot fires and lands', s.mag === before.mag - 1 && s.hits > 0, `mag=${s.mag} hits=${s.hits}`);
await page.evaluate(() => window.__solmar.combat.reload());
await page.waitForFunction((m) => window.__solmar.mag === 12, null, { timeout: 240000 });
check('pistol: reload refills to 12', true);

// Punch.
const punches = await page.evaluate(() => window.__solmar.punchesThrown);
await page.evaluate(() => window.__solmar.debug.punch());
await page.waitForFunction((p) => window.__solmar.punchesThrown > p, punches, { timeout: 240000 });
check('punch: still throws', true);

// Aim mode: right mouse held -> FOV eases from 60 toward 40 (it never
// lands exactly on 40 — the zoom is an ease, not a snap — so the check
// is "clearly zoomed", not an exact value).
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await page.waitForFunction(() => window.__solmar.aiming === true && window.__solmar.fov < 45, null, { timeout: 240000 });
check('aim: right mouse zooms FOV 60 -> 40', true, `fov=${await page.evaluate(() => window.__solmar.fov)}`);
await page.mouse.up({ button: 'right' });
await page.waitForFunction(() => window.__solmar.aiming === false, null, { timeout: 240000 });
check('aim: release leaves aim mode', true);

// Phone: open, bank tab renders, close.
await page.evaluate(() => window.__solmar.debug.openPhone());
await page.waitForFunction(() => window.__solmar.phoneOpen === true, null, { timeout: 240000 });
await page.evaluate(() => window.__solmar.debug.phoneTab('bank'));
const bankHas = await page.evaluate(() => document.getElementById('phone-bank-list').textContent.includes('BALANCE'));
check('phone: opens, BANK tab renders', bankHas);
await page.evaluate(() => window.__solmar.debug.closePhone());
await page.waitForFunction(() => window.__solmar.phoneOpen === false, null, { timeout: 240000 });
check('phone: closes', true);

// Pause: open, close.
await page.evaluate(() => window.__solmar.debug.openPause());
await page.waitForFunction(() => window.__solmar.paused === true, null, { timeout: 240000 });
check('pause: opens', true);
await page.evaluate(() => window.__solmar.debug.closePause());
await page.waitForFunction(() => window.__solmar.paused === false, null, { timeout: 240000 });
check('pause: closes', true);

// Street + missions + districts alive.
const world = await page.evaluate(() => ({
  npcs: window.__solmar.npcCount,
  mission: window.__solmar.mission.active,
  district: window.__solmar.district.name,
  rank: window.__solmar.rank.rank,
}));
check('world: pedestrians out', world.npcs > 0, `npcs=${world.npcs}`);
check('world: district + rank read', Boolean(world.district) && world.rank === 1, `${world.district} rank ${world.rank}`);

// Staged shots still stage: pistol, SMG, shotgun, AR.
for (const shot of ['shoot', 'smg', 'shotgun', 'ar']) {
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p2.on('pageerror', (e) => errs.push(String(e)));
  p2.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p2.goto(`http://localhost:8124/game/index.html?shot=${shot}&seed=7`, { waitUntil: 'load', timeout: 120000 });
  await p2.waitForFunction(() => window.__solmarReady === true, null, { timeout: 240000 });
  const hud = await p2.evaluate(() => ({
    weapon: document.getElementById('weapon-name').textContent,
    ammo: document.getElementById('ammo-num').textContent,
  }));
  check(`shot: ?shot=${shot} stages (${hud.weapon} ${hud.ammo})`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await p2.close();
}

check('console: zero errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: failed.length, errors }, null, 2));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
