import fs from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = process.env.ENEMY_PLAYTEST_OUTPUT_DIR
  ?? `${process.env.HOME}/tmp/enemy-skeletal-animation-playtest`;
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "pageerror", text: String(error) }));

await page.goto("http://localhost:8000", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.keyboard.press("Enter");
await page.waitForTimeout(350);

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

const state = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const initial = await state();
if (!Array.isArray(initial.enemyAnimations) || initial.enemyAnimations.length !== 2) {
  throw new Error("Expected render_game_to_text to expose both enemy skeletons");
}
for (const enemy of initial.enemyAnimations) {
  if (enemy.animationMode !== "skeletal") throw new Error(`${enemy.id} is not skeletal`);
  if (!enemy.assetsReady) throw new Error(`${enemy.id} rig assets are not ready`);
  if (Object.keys(enemy.joints ?? {}).length < 17) throw new Error(`${enemy.id} rig has too few joints`);
}

const capture = async (filename) => {
  await page.screenshot({
    path: `${outputDir}/${filename}`,
    clip: { x: 250, y: 455, width: 570, height: 190 },
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
  const chest = enemy.joints.chest;
  const hand = enemy.joints.nearWrist;
  if (Math.hypot(hand.x - chest.x, hand.y - chest.y) >= 4) {
    throw new Error(`${enemy.id} hand did not reach chest in the hit reaction`);
  }
}

if (errors.length) {
  await fs.writeFile(`${outputDir}/errors.json`, JSON.stringify(errors, null, 2));
  throw new Error(`Console/page errors were captured: ${JSON.stringify(errors)}`);
}

await fs.writeFile(`${outputDir}/state.json`, JSON.stringify(clutchSnapshot, null, 2));
await browser.close();
