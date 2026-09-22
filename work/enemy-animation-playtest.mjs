import fs from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const url = process.env.PLAYTEST_URL ?? "http://localhost:8000";

const outputDir = process.env.ENEMY_PLAYTEST_OUTPUT_DIR
  ?? process.env.PLAYTEST_OUTPUT_DIR
  ?? "output/enemy-animation-playtest";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: process.env.PLAYTEST_SOFTWARE_GL ? ["--use-gl=angle", "--use-angle=swiftshader"] : [],
});
try {
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
// Hold gameplay time while preserving the asset loader's animation-frame polls.
await page.addInitScript(() => {
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => callback.name === "frame" ? -1 : requestFrame(callback);
});
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "pageerror", text: String(error) }));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__game, null, { polling: 50 });
await page.keyboard.press("Enter");

await page.evaluate(() => {
  const makeEnemy = (id, x) => ({
    id,
    name: id === "grunt" ? "Grunt" : "Runner",
    x,
    laneOffset: 0,
    hp: 1,
    maxHp: 1,
    armor: 0,
    maxArmor: 0,
    speed: id === "grunt" ? 42 : 68,
    towerDamage: 4,
    rewardGold: 2,
    alive: true,
    dyingTimer: 0,
    deathDuration: 1.25,
    phase: 0,
    attackTimer: 0,
    spineMode: "walk",
    statuses: {
      burning: { active: false },
      poison: { active: false },
      slow: { active: false, multiplier: 1 },
    },
  });
  window.__game.app.enemies = [makeEnemy("grunt", 420), makeEnemy("runner", 680)];
  window.__game.app.spawnTimer = 999;
  window.__game.render();
});
await page.waitForFunction(() => {
  const animations = JSON.parse(window.render_game_to_text()).enemyAnimations;
  return animations.length === 2 && animations.every(enemy => enemy.assetsReady);
}, null, { polling: 50, timeout: 30000 });

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const initial = await state();
if (!Array.isArray(initial.enemyAnimations) || initial.enemyAnimations.length !== 2) {
  throw new Error("Expected render_game_to_text to expose both enemy skeletons");
}
for (const enemy of initial.enemyAnimations) {
  const expectedMode = enemy.id === "grunt" ? "spine" : "skeletal";
  if (enemy.animationMode !== expectedMode) throw new Error(`${enemy.id} is not ${expectedMode}`);
  if (!enemy.assetsReady) throw new Error(`${enemy.id} rig assets are not ready`);
  if (Object.keys(enemy.joints ?? {}).length < 17) throw new Error(`${enemy.id} rig has too few joints`);
}

const capture = async (filename) => {
  await page.locator("#game").screenshot({
    path: `${outputDir}/${filename}`,
  });
};

for (let index = 0; index < 8; index += 1) {
  const phase = index / 8;
  await page.evaluate((value) => {
    for (const enemy of window.__game.app.enemies) {
      enemy.alive = true;
      enemy.dyingTimer = 0;
      enemy.phase = value * Math.PI * 2;
    }
    window.__game.render();
  }, phase);
  await capture(`locomotion-${String(index).padStart(2, "0")}.png`);
}

for (let index = 0; index <= 8; index += 1) {
  const progress = index / 8;
  await page.evaluate((value) => {
    for (const enemy of window.__game.app.enemies) {
      enemy.alive = false;
      enemy.deathDuration = 1.25;
      enemy.dyingTimer = Math.max(0.001, enemy.deathDuration * (1 - value));
      if (enemy.id === "grunt") {
        enemy.spineDeathPose = { mode: "walk", time: enemy.phase / (Math.PI * 2) * 1.2 };
      }
    }
    window.__game.render();
  }, progress);
  const snapshot = await state();
  const animations = snapshot.enemyAnimations;
  if (animations.some((enemy) => enemy.mode !== "death")) {
    throw new Error(`Death mode missing at progress ${progress}`);
  }
  await capture(`death-${String(index).padStart(2, "0")}.png`);
}

const clutchSnapshot = await page.evaluate(() => {
  for (const enemy of window.__game.app.enemies) {
    enemy.dyingTimer = enemy.deathDuration * (1 - 0.28);
  }
  window.__game.render();
  return JSON.parse(window.render_game_to_text());
});
for (const enemy of clutchSnapshot.enemyAnimations) {
  if (enemy.id !== "runner") continue;
  const chest = enemy.joints.chest;
  const hand = enemy.joints.farWrist;
  if (Math.hypot(hand.x - chest.x, hand.y - chest.y) >= 4) {
    throw new Error(`${enemy.id} hand did not reach chest in the hit reaction`);
  }
}

if (errors.length) {
  await fs.writeFile(`${outputDir}/errors.json`, JSON.stringify(errors, null, 2));
  throw new Error(`Console/page errors were captured: ${JSON.stringify(errors)}`);
}

await fs.writeFile(`${outputDir}/state.json`, JSON.stringify(clutchSnapshot, null, 2));
} finally {
await browser.close();
}
