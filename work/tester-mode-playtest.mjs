import assert from "node:assert/strict";
import fs from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const url = process.env.PLAYTEST_URL ?? "http://localhost:8000";
const output = process.env.PLAYTEST_OUTPUT_DIR ?? "output/tester-mode-playtest";
await fs.mkdir(output, { recursive: true });

// PLAYTEST_CHANNEL=chrome drives the installed Chrome when Playwright's own
// Chromium build is not downloaded.
const browser = await chromium.launch({ channel: process.env.PLAYTEST_CHANNEL, headless: true });
const errors = [];
const ENEMY_IDS = [
  "grunt", "runner", "chainmailGuard", "shieldBearer", "swarm",
  "brute", "bannerCaptain", "siegeEnemy", "fireResistantKnight", "boss",
];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    // Full Chrome asks for a favicon the site does not have; the headless shell does not.
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) {
      errors.push(message.text());
    }
  });
  const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const advance = (ms) => page.evaluate((time) => window.advanceTime(time), ms);
  const gameHasFocus = () => page.evaluate(() => document.activeElement === document.body);
  const visible = (selector) => page.locator(selector).isVisible();
  const load = async (reload = false) => {
    if (reload) await page.reload({ waitUntil: "domcontentloaded" });
    else await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  };
  const jumpWithKeyboard = async (level) => {
    await page.fill("#tester-level", "");
    await page.locator("#tester-level").pressSequentially(String(level));
    await page.press("#tester-level", "Enter");
  };

  // Locked: only the faint lock is offered.
  await load();
  await page.locator("#tester-lock").waitFor({ state: "visible" });
  assert.equal(await visible("#tester-toggle"), false, "tester button starts hidden");
  assert.equal(await visible("#tester-panel"), false, "tester panel starts hidden");

  // A wrong password is refused, and its Enter never reaches the game.
  await page.click("#tester-lock");
  await page.locator("#tester-password").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => document.activeElement?.id), "tester-password");
  await page.keyboard.type("12345");
  await page.keyboard.press("Enter");
  await page.locator("#tester-password-error").waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#tester-password"), "", "a wrong password is cleared");
  assert.equal(await visible("#tester-toggle"), false);
  assert.equal((await state()).screen, "start", "Enter in the password field must not start the game");
  await page.screenshot({ path: `${output}/wrong-password.png` });

  // Escape closes the dialog; the right password reveals the tester button.
  await page.keyboard.press("Escape");
  await page.locator("#tester-password").waitFor({ state: "hidden" });
  await page.click("#tester-lock");
  assert.equal(await page.inputValue("#tester-password"), "", "the dialog reopens empty");
  await page.keyboard.type("32167");
  await page.keyboard.press("Enter");
  await page.locator("#tester-toggle").waitFor({ state: "visible" });
  assert.equal(await visible("#tester-lock"), false, "the lock hides once unlocked");
  assert.equal(await visible("#tester-password"), false);
  assert.equal((await state()).screen, "start");

  // The unlock survives a reload in the same tab.
  await load(true);
  await page.locator("#tester-toggle").waitFor({ state: "visible" });
  assert.equal(await visible("#tester-lock"), false);

  // Jumping from the start screen begins a campaign at that level.
  await page.click("#tester-toggle");
  await page.locator("#tester-panel").waitFor({ state: "visible" });
  assert.equal(await page.inputValue("#tester-level"), "1", "the level field shows the current level");
  await page.screenshot({ path: `${output}/panel-open.png` });
  await jumpWithKeyboard(41);
  let s = await state();
  assert.equal(s.screen, "playing");
  assert.equal(s.level, 41);
  assert.equal(s.tier, 5);
  assert.ok(await gameHasFocus(), "after a jump the keyboard belongs to the game");
  await page.keyboard.type(s.combatWord[0]);
  assert.equal((await state()).combatInput, s.combatWord[0], "typing reaches the combat word");
  await page.keyboard.press("Backspace");

  // Safari and Firefox on macOS leave focus in the field when 跳转 is clicked;
  // a programmatic click reproduces that, and the jump must still hand the
  // keyboard back to the game.
  await page.fill("#tester-level", "42");
  await page.$eval("#tester-level-go", (button) => button.click());
  assert.equal((await state()).level, 42);
  assert.ok(await gameHasFocus(), "a jump from the button leaves the level field");

  // Tier shortcuts jump to the tier's first level and name its foes.
  assert.match(await page.getAttribute('[data-tier="5"]', "title"), /第 41–50 关/);
  await page.click('[data-tier="10"]');
  s = await state();
  assert.equal(s.level, 91);
  assert.equal(s.tier, 10);
  assert.ok(await gameHasFocus());

  // Pause freezes the enemy side: nothing moves and nothing new spawns.
  await page.click('[data-speed="0"]');
  assert.equal((await state()).tester.enemySpeed, 0);
  const beforePause = await state();
  await advance(3000);
  const afterPause = await state();
  assert.equal(afterPause.enemies.length, beforePause.enemies.length, "no spawns while paused");
  assert.deepEqual(afterPause.enemies.map((enemy) => enemy.x), beforePause.enemies.map((enemy) => enemy.x));

  // Every enemy type can be summoned into view, even while paused, spread out
  // enough to be told apart.
  const alreadyInField = new Set(beforePause.enemies.map((enemy) => enemy.x));
  for (const id of ENEMY_IDS) await page.click(`[data-summon="${id}"]`);
  s = await state();
  const summoned = s.enemies.filter((enemy) => !alreadyInField.has(enemy.x) && enemy.x <= 1000);
  for (const id of ENEMY_IDS) {
    assert.ok(
      summoned.some((enemy) => enemy.id === id && enemy.x >= 650),
      `${id} was summoned into view`,
    );
  }
  const summonedXs = summoned.map((enemy) => enemy.x);
  assert.ok(Math.max(...summonedXs) - Math.min(...summonedXs) > 120, `summons spread out: ${summonedXs}`);
  const summonedBoss = summoned.find((enemy) => enemy.id === "boss");
  assert.equal(summonedBoss.name, "Tier 10 Warlord", "a summoned boss is scaled to the tier");
  assert.equal(summonedBoss.hp, 58);
  assert.ok(await gameHasFocus());
  await page.screenshot({ path: `${output}/summoned-while-paused.png` });

  // Double speed moves the enemy twice as far as normal speed.
  await page.click('[data-speed="1"]');
  let before = await state();
  await advance(1000);
  let after = await state();
  const normalStep = before.enemies[0].x - after.enemies[0].x;
  await page.click('[data-speed="2"]');
  before = await state();
  await advance(1000);
  after = await state();
  const doubleStep = before.enemies[0].x - after.enemies[0].x;
  assert.ok(normalStep > 0, "enemies march at normal speed");
  const ratio = doubleStep / normalStep;
  assert.ok(ratio > 1.6 && ratio < 2.4, `2x speed should double the march, got ratio ${ratio}`);

  // Invincible walls take blows without losing HP; switching it off restores damage.
  await page.click("#tester-invincible");
  assert.equal((await state()).tester.invincible, true);
  const wallHp = (await state()).tower.hp;
  await advance(12000);
  s = await state();
  assert.ok(s.enemies.some((enemy) => enemy.x <= 211), "foes reached the barricade");
  assert.equal(s.tower.hp, wallHp, "invincible walls keep their HP");
  assert.equal(s.screen, "playing");
  await page.screenshot({ path: `${output}/invincible-wall.png` });
  await page.click("#tester-invincible");
  await advance(700);
  assert.ok((await state()).tower.hp < wallHp, "walls take damage once invincibility is off");

  // Finishing the level now clears the field and opens the armory.
  await jumpWithKeyboard(12);
  await page.click('[data-speed="1"]');
  await advance(4000);
  assert.ok((await state()).enemies.length > 0, "foes spawned before the finish");
  await page.click("#tester-finish-level");
  await advance(3000);
  s = await state();
  assert.equal(s.screen, "shop");
  assert.equal(s.level, 12);

  // The resource grant works in the armory, and shop keys still reach the game.
  const resources = s.resources;
  await page.click("#tester-grant");
  s = await state();
  assert.deepEqual(s.resources, {
    gold: resources.gold + 1000,
    trainingPoints: resources.trainingPoints + 10,
    arrowCharge: resources.arrowCharge + 10,
  });
  assert.ok(await gameHasFocus());
  const bowTier = s.weapon.tier;
  await page.keyboard.press("2");
  assert.equal((await state()).weapon.tier, bowTier + 1, "the armory takes keyboard purchases");
  await page.keyboard.press("Enter");
  s = await state();
  assert.equal(s.screen, "playing");
  assert.equal(s.level, 13);

  // With one-kill on, the first kill ends the level.
  await page.click('[data-speed="0"]');
  await page.click("#tester-one-kill");
  assert.equal((await state()).tester.oneKillClears, true);
  await page.click('[data-summon="grunt"]');
  s = await state();
  await page.keyboard.type(s.combatWord);
  await page.keyboard.press("Space");
  await advance(2500);
  await advance(3000);
  s = await state();
  assert.equal(s.screen, "shop", "one kill sends the bowman to the armory");
  assert.equal(s.level, 13);

  // Digits and Enter typed into the level field never reach the armory.
  const towerLevel = s.tower.level;
  await jumpWithKeyboard(100);
  s = await state();
  assert.equal(s.level, 100);
  assert.equal(s.tower.level, towerLevel, "typing 1 in the level field must not buy a barricade");
  await page.click("#tester-finish-level");
  await advance(3000);
  assert.equal((await state()).screen, "victory");
  await page.click("#tester-finish-level");
  assert.match(await page.textContent("#tester-status"), /不在战斗中/);

  // Leaving tester mode resets every cheat and stays locked after a reload.
  await page.click("#tester-lock-again");
  await page.locator("#tester-lock").waitFor({ state: "visible" });
  assert.equal(await visible("#tester-toggle"), false);
  assert.equal(await visible("#tester-panel"), false);
  assert.deepEqual((await state()).tester, { oneKillClears: false, invincible: false, enemySpeed: 1 });
  await load(true);
  await page.locator("#tester-lock").waitFor({ state: "visible" });
  assert.equal(await visible("#tester-toggle"), false);

  assert.deepEqual(errors, [], "no browser errors");
} finally {
  await browser.close();
}
console.log("tester mode playtest passed");
