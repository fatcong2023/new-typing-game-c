import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const url = process.env.PLAYTEST_URL ?? "http://localhost:8000";
const output = process.env.PLAYTEST_OUTPUT_DIR ?? "output/french-soldier-playtest";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.env.PLAYTEST_SOFTWARE_GL ? ["--use-gl=angle", "--use-angle=swiftshader"] : [],
});
const report = { url, errors: [], failedAssets: [], poses: {}, damage: [], sizes: [] };
const jointNames = ["swordShoulder", "swordElbow", "swordHand", "swordGrip", "swordTip", "head", "nearFoot", "farFoot", "shieldGrip"];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function openPage(deviceScaleFactor = 1) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor });
  // Keep application updates deterministic. Spine's asset loader also polls RAF,
  // so allow its callbacks while holding the application's named frame callback.
  await page.addInitScript(() => {
    let nextId = -1;
    const callbacks = new Map();
    const nativeRequestFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (callback.name !== "frame") return nativeRequestFrame(callback);
      const id = nextId--;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => id < 0 ? callbacks.delete(id) : nativeCancelFrame(id);
    window.__pausedAnimationFrames = callbacks;
  });
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  page.on("response", response => {
    if (response.status() >= 400 && /\/src\//.test(response.url())) {
      report.failedAssets.push({ url: response.url(), status: response.status() });
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__game && window.render_game_to_text, null, { polling: 50 });
  await page.evaluate(async () => {
    const { createCombatEnemy } = await import(new URL("src/gameLogic.mjs", location.href));
    window.__makeTestEnemy = (id, overrides = {}) => createCombatEnemy(id, {
      x: 470, laneOffset: 0, attackTimer: 0, alive: true,
      dyingTimer: 0, deathDuration: 1.25, phase: 0,
      spineMode: "walk", spineWalkTime: 0,
      ...overrides,
    });
    window.__game.startCampaign();
    window.__game.app.spawnTimer = 999;
    window.__game.app.enemies = [window.__makeTestEnemy("grunt"), window.__makeTestEnemy("runner", { x: 780 })];
    window.__game.render();
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text());
    return state.archer.assetsReady && state.enemyAnimations.length === 2 &&
      state.enemyAnimations.every(enemy => enemy.assetsReady);
  }, null, { polling: 50, timeout: 30000 });
  await page.evaluate(() => window.__game.render());
  return page;
}

const readState = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function capture(page, name) {
  await page.evaluate(() => {
    window.__game.app.shakeTimer = 0;
    window.__game.render();
  });
  await page.locator("#game").screenshot({ path: path.join(output, `${name}.png`) });
  const state = await readState(page);
  report.poses[name] = state.enemyAnimations;
  return state.enemyAnimations;
}

function checkSoldier(enemy, mode) {
  assert.equal(enemy.id, "grunt");
  assert.equal(enemy.animationMode, "spine", `${mode} must keep the new Spine soldier`);
  assert.equal(enemy.assetsReady, true);
  assert.equal(enemy.assetError, null);
  assert.equal(enemy.mode, mode);
  for (const name of jointNames) {
    assert.ok(Number.isFinite(enemy.joints?.[name]?.x) && Number.isFinite(enemy.joints?.[name]?.y), `${mode}: missing ${name}`);
  }
  if (mode !== "death") {
    assert.ok(enemy.joints.shieldGrip.y < enemy.joints.head.y - 2, `${mode}: shield must remain above the head`);
  }
  const handToGrip = distance(enemy.joints.swordHand, enemy.joints.swordGrip);
  assert.ok(handToGrip > 1 && handToGrip < 12, `${mode}: sword grip is detached from the hand`);
  assert.ok(distance(enemy.joints.swordGrip, enemy.joints.swordTip) > 15, `${mode}: sword must retain its length`);
}

async function setAttack(page, time) {
  await page.evaluate(value => {
    const game = window.__game;
    game.app.enemies = [window.__makeTestEnemy("grunt", {
      x: 210, spineMode: "attack", attackTimer: value,
    })];
    game.render();
  }, time);
}

async function advance(page, seconds) {
  return page.evaluate(total => {
    const game = window.__game;
    let remaining = total;
    while (remaining > 1e-10) {
      const dt = Math.min(0.01, remaining);
      game.update(dt);
      remaining -= dt;
    }
    game.app.shakeTimer = 0;
    game.render();
    return { hp: game.app.model.towerHp, attackTimer: game.app.enemies[0].attackTimer };
  }, seconds);
}

try {
  const page = await openPage();
  await page.evaluate(() => {
    window.__game.app.enemies = [
      window.__makeTestEnemy("grunt", { x: 430, phase: 0, spineWalkTime: 0 }),
      window.__makeTestEnemy("grunt", { x: 650, phase: Math.PI, spineWalkTime: 0.6 }),
      window.__makeTestEnemy("runner", { x: 850, phase: 0.3 }),
    ];
    window.__game.render();
  });
  const walk0 = await capture(page, "walk-phases-a");
  assert.equal(walk0.length, 3);
  for (const enemy of walk0.slice(0, 2)) {
    checkSoldier(enemy, "walk");
    assert.equal(enemy.animation, "walk_shield_overhead");
  }
  assert.equal(walk0[2].animationMode, "skeletal", "runner must retain its existing rig");
  assert.ok(Math.abs(walk0[0].animationTime - walk0[1].animationTime) > 0.1, "soldiers must have independent phases");
  const relativeFootA = walk0[0].joints.nearFoot.x - walk0[0].root.x;
  const relativeFootB = walk0[1].joints.nearFoot.x - walk0[1].root.x;
  assert.ok(Math.abs(relativeFootA - relativeFootB) > 0.1, "independent soldiers must render different leg poses");

  await advance(page, 0.3);
  const walk1 = await capture(page, "walk-phases-b");
  checkSoldier(walk1[0], "walk");
  assert.ok(Math.abs(walk1[0].animationTime - walk0[0].animationTime) > 0.1, "walking animation must advance");

  await setAttack(page, 0);
  const rest = (await capture(page, "attack-ready"))[0];
  checkSoldier(rest, "attack");
  await setAttack(page, 0.4333333333);
  const apex = (await capture(page, "attack-apex"))[0];
  checkSoldier(apex, "attack");
  assert.equal(apex.animation, "attack_shield_overhead");
  assert.ok(apex.joints.swordElbow.y < apex.joints.swordShoulder.y - 3, "windup must raise the upper arm above the shoulder");
  assert.ok(apex.joints.swordHand.y < apex.joints.head.y, "windup hand must reach above the head");
  assert.ok(apex.joints.swordHand.y < rest.joints.swordHand.y - 15, "windup must visibly lift the sword hand");
  await setAttack(page, 0.68);
  const impact = (await capture(page, "attack-impact"))[0];
  checkSoldier(impact, "attack");
  assert.ok(impact.joints.swordHand.y > apex.joints.swordHand.y + 20, "attack must follow through downwards");
  assert.ok(impact.joints.swordTip.y > apex.joints.swordTip.y + 20, "blade must cut downwards");
  assert.ok(Math.abs(distance(apex.joints.swordHand, apex.joints.swordGrip) - distance(impact.joints.swordHand, impact.joints.swordGrip)) < 0.1, "sword attachment must keep its grip distance");

  await page.evaluate(() => {
    const enemy = window.__game.app.enemies[0];
    enemy.alive = false;
    enemy.spineDeathPose = { mode: "attack", time: 0.4333333333 };
    enemy.deathDuration = 1.25;
    enemy.dyingTimer = enemy.deathDuration * 0.5;
    window.__game.render();
  });
  const death = (await capture(page, "death-halfway"))[0];
  checkSoldier(death, "death");
  assert.ok(Math.abs(death.deathProgress - 0.5) < 0.01);

  // Actual update loop: damage belongs to the downward impact, once per 1.2 s swing.
  await setAttack(page, 0);
  const damageSetup = await page.evaluate(async () => {
    const { TOWER_LEVELS } = await import(new URL("src/gameData.mjs", location.href));
    const game = window.__game;
    const enemy = game.app.enemies[0];
    const reduction = TOWER_LEVELS[game.app.model.towerLevel - 1].damageReduction;
    return { hp: game.app.model.towerHp, perHit: Math.ceil(enemy.towerDamage * (1 - reduction)) };
  });
  const damageCheck = async (time, seconds, hitCount) => {
    const result = await advance(page, seconds);
    report.damage.push({ time, ...result });
    assert.equal(result.hp, damageSetup.hp - damageSetup.perHit * hitCount, `incorrect damage count at ${time}s`);
  };
  await damageCheck(0.639, 0.639, 0);
  await damageCheck(0.641, 0.002, 1);
  await damageCheck(1.839, 1.198, 1);
  await damageCheck(1.841, 0.002, 2);

  const highDprPage = await openPage(2);
  await highDprPage.setViewportSize({ width: 2560, height: 1440 });
  await highDprPage.waitForFunction(() => {
    const canvas = document.querySelector("#game"), rect = canvas.getBoundingClientRect();
    return canvas.width === Math.round(rect.width * Math.min(devicePixelRatio, 3)) &&
      canvas.height === Math.round(rect.height * Math.min(devicePixelRatio, 3));
  }, null, { polling: 50 });
  await setAttack(highDprPage, 0.4333333333);
  const highDprApex = (await capture(highDprPage, "attack-apex-dpr2"))[0];
  checkSoldier(highDprApex, "attack");
  for (const name of jointNames) {
    assert.ok(distance(apex.joints[name], highDprApex.joints[name]) < 0.1, `DPR must not change world-space ${name}`);
  }
  for (const sizedPage of [page, highDprPage]) {
    report.sizes.push(await sizedPage.evaluate(() => {
      const canvas = document.querySelector("#game"), rect = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, dpr: devicePixelRatio };
    }));
  }
  assert.equal(report.sizes[1].dpr, 2);
  assert.ok(report.sizes[1].width > report.sizes[0].width);
  assert.deepEqual(report.failedAssets, []);
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify({ passed: true, output, screenshots: Object.keys(report.poses), damage: report.damage, sizes: report.sizes }, null, 2));
} catch (error) {
  report.passed = false;
  report.failure = String(error.stack ?? error);
  throw error;
} finally {
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
