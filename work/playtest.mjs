import fs from "node:fs/promises";
import { chromium } from "playwright";

const outputDir = "../output/playtest";
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
if (state.enemies.length === 0) throw new Error("Expected at least one spawned enemy");
for (let i = 0; i < 45; i += 1) {
  if (state.enemies.some((enemy) => enemy.x < 1060)) break;
  await page.evaluate(() => window.advanceTime(100));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}
if (!state.enemies.some((enemy) => enemy.x < 1060)) throw new Error("Spawned enemy never entered the visible playfield");
await page.screenshot({ path: `${outputDir}/enemy-visible.png` });

await page.keyboard.type(state.combatWord);
await page.keyboard.press("Space");
await page.evaluate(() => window.advanceTime(350));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
if (state.combatInput !== "") throw new Error("Combat input did not reset after firing");

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
