// test-weapons.js — Step 14 weapons test: switching, firing, ammo,
// reload, spread/damage sanity per gun, HUD ammo display, pickups, and
// the tracer cap. Headless runs ~1 fps, so every check polls state with
// waitForFunction and a generous timeout — never a fixed wait for a
// result (the one waitForTimeout is a negative check: the locked rifle
// cache must still be shut after a time window).
// Usage (from anywhere — the playwright import is absolute, since ESM
// resolves from this file's folder, not the shell's cwd):
//   node <path>/test-weapons.js
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

async function ws() {
  return page.evaluate(() => window.__solmar.debug.weaponState());
}
async function waitState(pred, timeout = 240000) {
  await page.waitForFunction(pred, null, { timeout });
}
// Fire one aimed pull and wait until the shot counter moves. Retries:
// a call made while the previous gun's cooldown is still running
// returns false (the shotgun's is a full second), so one attempt is
// not enough — keep pulling until a round leaves the muzzle. The
// counter is read directly after each pull, never through a
// requestAnimationFrame poll: at ~0.2 fps a frame can outlast a short
// poll window, and a blind retry would fire a second shot.
async function fireOnce() {
  const before = (await ws()).shotsFired;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await page.evaluate(() => window.__solmar.combat.shoot(true));
    // The counter moves synchronously inside shoot(): read it at once.
    // If the cooldown was still running, shoot() was a no-op and the
    // counter stays — wait out a frame and pull again.
    const now = await page.evaluate(() => window.__solmar.shotsFired);
    if (now > before) return;
    await page.waitForTimeout(2000);
  }
  throw new Error(`fireOnce timed out (shotsFired stuck at ${before})`);
}

await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__solmarReady === true, null, { timeout: 60000 });

// --- T1: new guns start locked ---------------------------------------------
let s = await ws();
check('locked: slot 3 select fails', (await page.evaluate(() => window.__solmar.debug.selectSlot(3))) === false);
check('locked: slot 4 select fails', (await page.evaluate(() => window.__solmar.debug.selectSlot(4))) === false);
check('locked: slot 5 select fails', (await page.evaluate(() => window.__solmar.debug.selectSlot(5))) === false);
s = await ws();
check('locked: still on pistol', s.slot === 2 && s.weaponId === 'pistol', `slot=${s.slot}`);
check('locked: owned is fists+pistol', JSON.stringify(s.owned) === JSON.stringify(['fists', 'pistol']), s.owned.join(','));

// --- T2: SMG — give, switch, HUD -------------------------------------------
check('smg: give works', (await page.evaluate(() => window.__solmar.debug.giveWeapon('smg'))) === true);
s = await ws();
check('smg: selected, 30/120', s.slot === 3 && s.mag === 30 && s.reserve === 120, `mag=${s.mag} reserve=${s.reserve}`);
check('smg: HUD name+ammo', s.hudWeapon === 'SMG' && s.hudAmmo === '30 / 120', `${s.hudWeapon} ${s.hudAmmo}`);
check('smg: defs sane', s.defs.smg.damage === 18 && s.defs.smg.cooldown === 0.083 && s.defs.smg.auto === true, `dmg=${s.defs.smg.damage} cd=${s.defs.smg.cooldown}`);

// --- T3: SMG fires at the dummy, ammo drops, damage lands ------------------
const dmgBefore = s.damageDealt;
const dummyBefore = s.dummyHits;
await fireOnce();
s = await ws();
check('smg: mag 30 -> 29', s.mag === 29, `mag=${s.mag}`);
check('smg: shot counted', s.shotsFired > 0);
check('smg: aimed pull hits dummy', s.dummyHits > dummyBefore, `dummyHits=${s.dummyHits}`);
check('smg: damage 18 at close range', s.damageDealt - dmgBefore === 18, `dealt=${s.damageDealt - dmgBefore}`);

// --- T4: SMG reload ---------------------------------------------------------
await page.evaluate(() => window.__solmar.combat.reload());
await waitState(`window.__solmar.debug.weaponState().mag === 30`);
s = await ws();
check('smg: reload refills 29 -> 30', s.mag === 30, `mag=${s.mag}`);
check('smg: reload spends reserve 120 -> 119', s.reserve === 119, `reserve=${s.reserve}`);
check('smg: HUD ammo after reload', s.hudAmmo === '30 / 119', s.hudAmmo);

// --- T5: Shotgun — 8 pellets, 9 dmg each, point blank -----------------------
await page.evaluate(() => window.__solmar.debug.giveWeapon('shotgun'));
s = await ws();
check('shotgun: selected, 6/24', s.slot === 4 && s.mag === 6 && s.reserve === 24, `mag=${s.mag} reserve=${s.reserve}`);
check('shotgun: HUD', s.hudWeapon === 'Shotgun' && s.hudAmmo === '6 / 24', `${s.hudWeapon} ${s.hudAmmo}`);
check('shotgun: defs sane', s.defs.shotgun.pellets === 8 && s.defs.shotgun.damage === 9 && s.defs.shotgun.cooldown === 1.0, `pellets=${s.defs.shotgun.pellets}`);
await fireOnce();
s = await ws();
check('shotgun: mag 6 -> 5', s.mag === 5, `mag=${s.mag}`);
check('shotgun: pellets landed', s.lastPelletsHit >= 1, `pelletsHit=${s.lastPelletsHit}`);
check('shotgun: damage is 9 x pellets hit', s.lastDamage === 9 * s.lastPelletsHit, `dmg=${s.lastDamage} pellets=${s.lastPelletsHit}`);
check('shotgun: falloff full at 8m', (await page.evaluate(() => window.__solmar.combat.falloffFor('shotgun', 8))) === 1);
check('shotgun: falloff fades by 18m', (await page.evaluate(() => window.__solmar.combat.falloffFor('shotgun', 18))) === 0.25);

// --- T6: Assault rifle — 26 dmg, tight, long range --------------------------
await page.evaluate(() => window.__solmar.debug.giveWeapon('ar'));
s = await ws();
check('ar: selected, 30/90', s.slot === 5 && s.mag === 30 && s.reserve === 90, `mag=${s.mag} reserve=${s.reserve}`);
check('ar: HUD', s.hudWeapon === 'Assault Rifle' && s.hudAmmo === '30 / 90', `${s.hudWeapon} ${s.hudAmmo}`);
check('ar: defs sane', s.defs.ar.damage === 26 && s.defs.ar.range === 45 && s.defs.ar.auto === true, `dmg=${s.defs.ar.damage} range=${s.defs.ar.range}`);
const arDmgBefore = s.damageDealt;
await fireOnce();
s = await ws();
check('ar: mag 30 -> 29', s.mag === 29, `mag=${s.mag}`);
check('ar: aimed pull deals 26', s.damageDealt - arDmgBefore === 26, `dealt=${s.damageDealt - arDmgBefore}`);
check('ar: falloff full at 30m', (await page.evaluate(() => window.__solmar.combat.falloffFor('ar', 30))) === 1);
check('ar: falloff 0.7 at 45m', (await page.evaluate(() => window.__solmar.combat.falloffFor('ar', 45))) === 0.7);

// --- T7: keyboard switching 1-5 --------------------------------------------
for (const [key, slot] of [['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5]]) {
  await page.keyboard.press(key);
  await waitState(`window.__solmar.weaponSlot === ${slot}`);
  s = await ws();
  check(`keys: ${key} selects slot ${slot}`, s.slot === slot, `slot=${s.slot} ${s.weaponId}`);
}
s = await ws();
// Re-check fists HUD properly: press 1, read HUD.
await page.keyboard.press('1');
await waitState(`window.__solmar.weaponSlot === 1`);
s = await ws();
check('keys: fists HUD ammo is infinite', s.hudWeapon === 'Fists' && s.hudAmmo === '∞', `${s.hudWeapon} ${s.hudAmmo}`);

// --- T8: mouse wheel cycles owned weapons -----------------------------------
await page.keyboard.press('2'); // back to pistol
await waitState(`window.__solmar.weaponSlot === 2`);
await page.mouse.move(640, 360);
await page.mouse.wheel(0, 120); // down = next owned -> SMG
await waitState(`window.__solmar.weaponSlot === 3`);
s = await ws();
check('wheel: down cycles pistol -> smg', s.slot === 3, `slot=${s.slot}`);
await page.mouse.wheel(0, -120); // up = previous -> pistol
await waitState(`window.__solmar.weaponSlot === 2`);
s = await ws();
check('wheel: up cycles smg -> pistol', s.slot === 2, `slot=${s.slot}`);

// --- T9: tracer cap — ten staged pulls never light more than 6 tracers -----
await page.evaluate(() => { for (let i = 0; i < 10; i += 1) window.__solmar.combat.stageShoot(); });
s = await ws();
check('tracers: capped at 6', s.activeTracers <= 6, `active=${s.activeTracers}`);

// --- T10: pistol regression (the old gun still works) -----------------------
await page.keyboard.press('2');
await waitState(`window.__solmar.weaponSlot === 2`);
const pBefore = await ws();
await fireOnce();
s = await ws();
check('pistol: aimed pull hits dummy', s.dummyHits > pBefore.dummyHits, `dummyHits=${s.dummyHits}`);
check('pistol: damage 20 at close range', s.damageDealt - pBefore.damageDealt === 20, `dealt=${s.damageDealt - pBefore.damageDealt}`);
check('pistol: mag drops by 1', s.mag === pBefore.mag - 1, `mag=${s.mag} was ${pBefore.mag}`);

// --- T11: punch regression ---------------------------------------------------
await page.keyboard.press('1');
await waitState(`window.__solmar.weaponSlot === 1`);
const punchesBefore = await page.evaluate(() => window.__solmar.punchesThrown);
await page.evaluate(() => window.__solmar.debug.punch());
await waitState(`window.__solmar.punchesThrown > ${punchesBefore}`);
check('punch: still throws', true, `punches=${punchesBefore + 1}`);

// --- T12: pickups on a fresh load -------------------------------------------
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__solmarReady === true, null, { timeout: 60000 });
s = await ws();
check('pickup: fresh load has 3 pickups', s.pickups.length === 3, `n=${s.pickups.length}`);
check('pickup: AR cache locked (0 jobs done)', s.pickups.find((p) => p.weapon === 'ar').locked === true);
await page.evaluate(() => window.__solmar.debug.toPickup('smg'));
await waitState(`window.__solmar.ownedWeapons.includes('smg')`);
s = await ws();
check('pickup: SMG collected by walking up', s.owned.includes('smg') && s.pickups.find((p) => p.weapon === 'smg').taken === true);
check('pickup: SMG auto-selected on take', s.slot === 3, `slot=${s.slot}`);
await page.evaluate(() => window.__solmar.debug.toPickup('ar'));
await page.waitForTimeout(2000); // negative check window: the locked cache must stay shut
s = await ws();
check('pickup: locked AR cache stays shut', s.pickups.find((p) => p.weapon === 'ar').taken === false && !s.owned.includes('ar'));

// --- T13: Mission 2 (Pier Run) pays a shotgun ------------------------------
// A stray shotgun pellet may have clipped a pedestrian and raised the
// heat; clear it so the mission drive is not chased from the start.
await page.evaluate(() => window.__solmar.debug.setWanted(0));
s = await ws();
check('blackmarket: locked at 0 jobs', (await page.evaluate(() => window.__solmar.debug.blackMarketState())).unlocked === false);
check('blackmarket: order refused at 0 jobs', (await page.evaluate(() => window.__solmar.debug.orderAR())) === false);
await page.evaluate(() => window.__solmar.debug.toMissionStart());
await waitState(`window.__solmar.mission.active === 'First Wheels'`, 60000);
await page.evaluate(() => window.__solmar.debug.toVehicle('Sedan'));
await page.evaluate(() => window.__solmar.debug.enter());
await waitState(`window.__solmar.mission.active === 'Pier Run'`, 60000);
check('mission: First Wheels done, Pier Run active', true, `cash=${await page.evaluate(() => window.__solmar.cash)}`);
await page.evaluate(() => window.__solmar.debug.toTarget());
await waitState(`window.__solmar.mission.completed === 2`, 60000);
s = await ws();
check('mission: Pier Run pays a shotgun', s.owned.includes('shotgun'), s.owned.join(','));
check('mission: shotgun auto-selected on reward', s.slot === 4, `slot=${s.slot}`);
check('mission: cash is $1,100 after two jobs', (await page.evaluate(() => window.__solmar.cash)) === 1100);

// --- T14: phone black market — 3 district jobs, then ORDER ------------------
// T13 ended with Raka driving the stolen sedan: get out first — the
// job teleports refuse while driving. Only the 'drive' jobs can be
// finished on foot (taxi 2 stages, parcel 1, lifeguard 1); 'chop'
// needs a stolen ride, 'getaway' needs heat, 'boat' needs a boat.
await page.keyboard.press('KeyE');
await waitState(`window.__solmar.driving === false`, 240000);
// The sedan theft left 1 star: clear it so a patrol car cannot pin
// Raka mid-job and bust the run.
await page.evaluate(() => window.__solmar.debug.setWanted(0));
async function jobsDone() {
  return page.evaluate(() => window.__solmar.debug.jobState().completed);
}
for (const id of ['taxi', 'parcel', 'lifeguard']) {
  if ((await jobsDone()) >= 3) break;
  const accepted = await page.evaluate((jobId) => window.__solmar.debug.acceptJob(jobId), id);
  if (!accepted) continue;
  for (let hop = 0; hop < 5; hop += 1) {
    const before = await jobsDone();
    await page.evaluate(() => window.__solmar.debug.toJobTarget());
    try {
      await page.waitForFunction((b) => window.__solmar.debug.jobState().completed > b
        || window.__solmar.debug.jobState().stage !== 0, before, { timeout: 60000 });
    } catch { /* this hop did not finish or advance the job */ }
    if ((await jobsDone()) > before) break;
    const stage = await page.evaluate(() => window.__solmar.debug.jobState().stage);
    if (stage === 0 && (await jobsDone()) === before) break; // stuck: try another job
  }
  if ((await jobsDone()) < 3) {
    await page.evaluate(() => window.__solmar.debug.abandonJob());
  }
}
check('blackmarket: 3 district jobs done', (await jobsDone()) >= 3, `done=${await jobsDone()}`);
let bm = await page.evaluate(() => window.__solmar.debug.blackMarketState());
check('blackmarket: unlocked after 3 jobs', bm.unlocked === true && bm.jobsNeeded === 3, `jobsDone=${bm.jobsDone} unlocked=${bm.unlocked}`);
check('blackmarket: cash covers $1,500', bm.cash >= 1500, `cash=${bm.cash}`);
await page.evaluate(() => window.__solmar.debug.openPhone());
await page.evaluate(() => window.__solmar.debug.phoneTab('bank'));
const orderLabel = await page.evaluate(() => {
  const btn = document.getElementById('blackmarket-order');
  return btn ? { text: btn.textContent, disabled: btn.disabled } : null;
});
check('blackmarket: ORDER button live in BANK tab', orderLabel && orderLabel.text === 'ORDER — $1,500' && orderLabel.disabled === false, JSON.stringify(orderLabel));
const cashBefore = bm.cash;
// A DOM click, not page.click: the ORDER handler re-renders the bank
// list at once (the button is destroyed and rebuilt as OWNED), and
// Playwright's real click hangs waiting on a navigation that never
// comes. The handler runs identically either way.
await page.evaluate(() => document.getElementById('blackmarket-order').click());
await waitState(`window.__solmar.ownedWeapons.includes('ar')`, 60000);
s = await ws();
check('blackmarket: AR owned after ORDER', s.owned.includes('ar'));
bm = await page.evaluate(() => window.__solmar.debug.blackMarketState());
check('blackmarket: cash down $1,500', bm.cash === cashBefore - 1500, `cash=${bm.cash} was ${cashBefore}`);
check('blackmarket: ledger records the buy', (await page.evaluate(() => window.__solmar.ledger)).some((e) => e.label === 'Black market: Assault Rifle' && e.amount === -1500));
check('blackmarket: second order refused', (await page.evaluate(() => window.__solmar.debug.orderAR())) === false);
await page.evaluate(() => window.__solmar.debug.closePhone());

// --- T15: police trunk shotgun at wanted 2+ ----------------------------------
await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => window.__solmarReady === true, null, { timeout: 60000 });
await page.evaluate(() => window.__solmar.debug.setWanted(1));
await page.waitForTimeout(2000); // negative check window: no cache at 1 star
check('trunk: no cache at wanted 1', (await page.evaluate(() => window.__solmar.trunk)) === null);
await page.evaluate(() => window.__solmar.debug.setWanted(2));
await waitState(`window.__solmar.trunk !== null`, 60000);
check('trunk: cache arms at wanted 2', true, JSON.stringify(await page.evaluate(() => window.__solmar.trunk)));
await page.evaluate(() => window.__solmar.debug.toTrunk());
await waitState(`window.__solmar.ownedWeapons.includes('shotgun')`, 60000);
s = await ws();
check('trunk: shotgun lifted from the trunk', s.owned.includes('shotgun'));
check('trunk: cache gone after the lift', (await page.evaluate(() => window.__solmar.trunk)) === null);

// --- T16: the gun in Raka's hand follows the selected weapon -----------------
await page.evaluate(() => window.__solmar.debug.giveWeapon('ar'));
await waitState(`window.__solmar.hero.weaponId === 'ar'`, 60000);
check('character: AR in hand after select', (await page.evaluate(() => window.__solmar.hero.weaponId)) === 'ar');
await page.evaluate(() => window.__solmar.debug.selectSlot(1));
await waitState(`window.__solmar.hero.weaponId === 'fists'`, 60000);
check('character: no gun in hand on fists', (await page.evaluate(() => window.__solmar.hero.weaponId)) === 'fists');

check('console: zero errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: failed.length, errors }, null, 2));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
