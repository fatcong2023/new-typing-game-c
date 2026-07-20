import fs from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = "../output/skeletal-animation-playtest";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push({ type: "console", text: msg.text() });
});
page.on("pageerror", (err) => errors.push({ type: "pageerror", text: String(err) }));

await page.goto("http://localhost:8000", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);

const initial = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (initial.archer.animationMode !== "skeletal") throw new Error(`Expected skeletal rig, got ${initial.archer.animationMode}`);
if (!initial.archer.assetsReady) throw new Error("Skeletal rig assets were not ready");
const fixedAnchors = JSON.stringify({
  root: initial.archer.root,
  head: initial.archer.head,
  bowShoulder: initial.archer.bowShoulder,
  drawShoulder: initial.archer.drawShoulder,
});

await page.evaluate(() => {
  window.__game.app.enemies = [];
  window.__game.app.spawnTimer = 999;
});

const capture = async (filename) => {
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const anchors = JSON.stringify({
    root: state.archer.root,
    head: state.archer.head,
    bowShoulder: state.archer.bowShoulder,
    drawShoulder: state.archer.drawShoulder,
  });
  if (anchors !== fixedAnchors) throw new Error(`Fixed rig anchors drifted: ${anchors}`);
  await page.screenshot({
    path: `${outputDir}/${filename}`,
    clip: { x: 20, y: 390, width: 240, height: 230 },
  });
};

for (let index = 0; index <= 10; index += 1) {
  await page.evaluate((progress) => {
    const game = window.__game;
    game.app.archerShot = { active: false, elapsed: 0, released: false, shots: [] };
    game.app.archerDrawProgress = progress;
    game.render();
  }, index / 10);
  await capture(`draw-${String(index).padStart(2, "0")}.png`);
}

for (let index = 0; index <= 10; index += 1) {
  await page.evaluate((progress) => {
    const game = window.__game;
    game.app.archerShot = {
      active: true,
      elapsed: progress * 0.62,
      released: progress >= 0.2,
      shots: [],
    };
    game.render();
  }, index / 10);
  await capture(`release-${String(index).padStart(2, "0")}.png`);
}

if (errors.length) {
  await fs.writeFile(`${outputDir}/errors.json`, JSON.stringify(errors, null, 2));
  throw new Error(`Console/page errors were captured: ${JSON.stringify(errors)}`);
}

await fs.writeFile(`${outputDir}/state.json`, JSON.stringify(initial, null, 2));
await browser.close();
