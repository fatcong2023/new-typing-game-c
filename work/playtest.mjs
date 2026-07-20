import fs from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = process.env.PLAYTEST_OUTPUT_DIR ?? "/Users/frankcj/tmp/new-typing-game-playtest";
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
await page.waitForTimeout(350);
await page.screenshot({ path: `${outputDir}/start.png` });

await page.keyboard.press("Enter");
await page.waitForTimeout(100);
await page.evaluate(() => window.advanceTime(1900));
let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.screen !== "playing") throw new Error(`Expected playing screen, got ${state.screen}`);
if (!state.combatWord) throw new Error("No combat word after start");
if (state.audio.musicMuted) throw new Error("Background music unexpectedly started muted");
if (!state.audio.arrangement.includes("folk harp") || !state.audio.arrangement.includes("bowed psaltery")) {
  throw new Error(`Expected the three-instrument medieval arrangement, got ${state.audio.arrangement}`);
}
await page.keyboard.press("F2");
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (!state.audio.musicMuted) throw new Error("F2 did not mute the background music");
await page.keyboard.press("F2");
await page.waitForTimeout(100);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.audio.musicMuted) throw new Error("F2 did not restore the background music");
if (state.enemies.length === 0) throw new Error("Expected at least one spawned enemy");
if (state.archer.animationMode !== "skeletal") throw new Error(`Expected skeletal animation, got ${state.archer.animationMode}`);
if (!state.archer.assetsReady) throw new Error("Skeletal archer assets did not load");
const fixedRigAnchors = JSON.stringify({
  root: state.archer.root,
  head: state.archer.head,
  bowShoulder: state.archer.bowShoulder,
  drawShoulder: state.archer.drawShoulder,
});
const assertStableRig = (current) => {
  const anchors = JSON.stringify({
    root: current.archer.root,
    head: current.archer.head,
    bowShoulder: current.archer.bowShoulder,
    drawShoulder: current.archer.drawShoulder,
  });
  if (anchors !== fixedRigAnchors) throw new Error(`Skeletal base drifted: ${anchors}`);
};
for (let i = 0; i < 45; i += 1) {
  if (state.enemies.some((enemy) => enemy.x < 1060)) break;
  await page.evaluate(() => window.advanceTime(100));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}
if (!state.enemies.some((enemy) => enemy.x < 1060)) throw new Error("Spawned enemy never entered the visible playfield");
await page.screenshot({ path: `${outputDir}/enemy-visible.png` });

const firstWord = state.combatWord;
const splitAt = Math.max(1, Math.floor(firstWord.length / 2));
await page.keyboard.type(firstWord.slice(0, splitAt));
await page.evaluate(() => window.advanceTime(80));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.archer.drawProgress <= 0 || state.archer.drawProgress >= 0.75) throw new Error(`Expected early draw progress, got ${state.archer.drawProgress}`);
assertStableRig(state);
await page.screenshot({ path: `${outputDir}/archer-half-draw-transition.png` });
await page.evaluate(() => window.advanceTime(100));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.archer.drawProgress <= 0.15 || state.archer.drawProgress >= 0.9) throw new Error(`Expected partial draw progress, got ${state.archer.drawProgress}`);
assertStableRig(state);
await page.screenshot({ path: `${outputDir}/archer-half-draw.png` });

await page.keyboard.type(firstWord.slice(splitAt));
await page.evaluate(() => window.advanceTime(90));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.archer.drawProgress <= 0.55 || state.archer.drawProgress > 1) throw new Error(`Expected late draw progress, got ${state.archer.drawProgress}`);
assertStableRig(state);
await page.screenshot({ path: `${outputDir}/archer-full-draw-transition.png` });
await page.evaluate(() => window.advanceTime(150));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.archer.pose !== "full-draw") throw new Error(`Expected full-draw pose, got ${state.archer.pose}`);
assertStableRig(state);
await page.screenshot({ path: `${outputDir}/archer-full-draw.png` });

await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(170));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (!["string-snap", "follow-through"].includes(state.archer.pose)) throw new Error(`Expected a release transition, got ${state.archer.pose}`);
assertStableRig(state);
await page.screenshot({ path: `${outputDir}/archer-release-transition.png` });
await page.evaluate(() => window.advanceTime(130));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.combatInput !== "") throw new Error("Combat input did not reset after firing");
if (state.arrows.length === 0) throw new Error("No live arrow was launched from the release animation");
await page.screenshot({ path: `${outputDir}/archer-release.png` });
await page.evaluate(() => window.advanceTime(400));

await page.keyboard.press("Tab");
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const phrase = state.enrichmentPhrase;
const partial = phrase.slice(0, 5);
await page.keyboard.type(partial);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.enrichmentInput !== partial) throw new Error("Enrichment partial input was not captured");

await page.keyboard.press("Tab");
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.keyboard.type(state.combatWord);
await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(250));

await page.keyboard.press("Tab");
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await page.keyboard.type(phrase.slice(partial.length));
await page.evaluate(() => window.advanceTime(100));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.resources.trainingPoints < 1) throw new Error("Completing enrichment phrase did not grant Training Points");
await page.screenshot({ path: `${outputDir}/gameplay.png` });

await page.evaluate(() => {
  const game = window.__game.app;
  game.model.gold = 500;
  game.screen = "shop";
});
await page.waitForTimeout(100);
await page.screenshot({ path: `${outputDir}/shop-before.png` });
await page.keyboard.press("1");
await page.waitForTimeout(100);
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.tower.level !== 2) throw new Error(`Tower purchase failed, level is ${state.tower.level}`);
await page.screenshot({ path: `${outputDir}/shop-after.png` });

if (errors.length) {
  await fs.writeFile(`${outputDir}/errors.json`, JSON.stringify(errors, null, 2));
  throw new Error(`Console/page errors were captured: ${JSON.stringify(errors)}`);
}

await fs.writeFile(`${outputDir}/final-state.json`, JSON.stringify(state, null, 2));
await browser.close();
