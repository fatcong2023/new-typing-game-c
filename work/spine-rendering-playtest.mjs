import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const url = process.env.PLAYTEST_URL ?? "http://localhost:8000";
const output = process.env.PLAYTEST_OUTPUT_DIR ?? "output/spine-playtest";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.env.PLAYTEST_SOFTWARE_GL ? ["--use-gl=angle", "--use-angle=swiftshader"] : [],
});
const report = { url, sizes: [], frameTimes: {}, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  if (process.env.PLAYTEST_BASELINE_MODULE) {
    await page.route("**/src/spineArcher.mjs", route => route.fulfill({
      path: process.env.PLAYTEST_BASELINE_MODULE, contentType: "text/javascript",
    }));
  }
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.render_game_to_text &&
    JSON.parse(window.render_game_to_text()).archer.assetsReady);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.__frameSamples = [];
    let previous;
    const record = now => {
      const app = window.__game.app;
      const phase = app.archerShot.active ? "release" :
        app.wordInput === app.combatWord ? "fullDraw" : "drawing";
      if (previous) window.__frameSamples.push({ phase, ms: now - previous });
      previous = now;
      window.__frameRecorder = requestAnimationFrame(record);
    };
    window.__frameRecorder = requestAnimationFrame(record);
  });
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.keyboard.type(state.combatWord.slice(0, -1), { delay: 180 });
  await page.waitForTimeout(350);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(state.archer.drawProgress > 0 && state.archer.drawProgress < 0.99);
  await page.keyboard.type(state.combatWord.slice(-1));
  await page.waitForTimeout(1800);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.archer.drawProgress, 1);
  assert.equal(state.archer.assetError, null);

  await page.keyboard.press("Space");
  await page.waitForTimeout(220);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(state.archer.shotActive && state.archer.released);
  assert.ok(state.arrows.length > 0, "the release must still launch the arrow");
  await page.waitForTimeout(600);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(state.archer.shotActive, false);
  assert.equal(state.combatInput, "");
  await page.keyboard.press("Tab");
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.keyboard.type(state.enrichmentPhrase);
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.ok(state.resources.trainingPoints >= 1);

  const samples = await page.evaluate(() => {
    cancelAnimationFrame(window.__frameRecorder);
    return window.__frameSamples;
  });
  for (const phase of ["drawing", "fullDraw", "release"]) {
    const ms = samples.filter(sample => sample.phase === phase).map(sample => sample.ms).sort((a,b) => a-b);
    report.frameTimes[phase] = { count: ms.length,
      median: ms[Math.floor(ms.length * 0.5)], p95: ms[Math.floor(ms.length * 0.95)], max: ms.at(-1) };
  }
  // Readback forces GPU synchronization; keep capture outside frame timing.
  const snapshot = await page.evaluate(() => {
    const game = window.__game;
    game.app.model.mode = "combat";
    game.app.wordInput = game.app.combatWord;
    game.app.archerDrawProgress = 1;
    game.render();
    return document.querySelector("#game").toDataURL();
  });
  await fs.writeFile(path.join(output, "full-draw-webgl.png"), Buffer.from(snapshot.split(",")[1], "base64"));

  for (const deviceScaleFactor of [1, 2]) {
    const sizedPage = deviceScaleFactor === 1 ? page :
      await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor });
    if (sizedPage !== page) {
      await sizedPage.goto(url, { waitUntil: "domcontentloaded" });
      await sizedPage.waitForFunction(() => window.render_game_to_text &&
        JSON.parse(window.render_game_to_text()).archer.assetsReady);
    }
    for (const viewport of [{width:1920,height:1080},{width:1200,height:760},{width:2560,height:1440}]) {
      await sizedPage.setViewportSize(viewport);
      await sizedPage.waitForFunction(() => {
        const c = document.querySelector("#game"), rect = c.getBoundingClientRect();
        return c.width === Math.round(rect.width * Math.min(devicePixelRatio,3)) &&
          c.height === Math.round(rect.height * Math.min(devicePixelRatio,3));
      });
      report.sizes.push(await sizedPage.evaluate(() => {
        const c = document.querySelector("#game"), rect = c.getBoundingClientRect();
        return { width:c.width, height:c.height, cssWidth:rect.width, cssHeight:rect.height, dpr:devicePixelRatio };
      }));
    }
    if (sizedPage !== page) await sizedPage.close();
  }
  assert.deepEqual(report.errors, []);
  await fs.writeFile(path.join(output, "rendering-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
