import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? "playwright";
const { chromium } = await import(
  playwrightModule.startsWith("file:")
    ? playwrightModule
    : pathToFileURL(path.resolve(playwrightModule)).href
).catch(async () => import("playwright"));

const outputDir = path.resolve(process.env.DEMO_OUTPUT_DIR ?? "demo-video");
const targetUrl = process.env.DEMO_URL ?? "http://192.168.2.131:8000";
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
const timeline = [];
let startedAt = 0;

const mark = (name, details = {}) => timeline.push({
  name,
  time: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
  ...details,
});

page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "pageerror", text: String(error) }));

await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).archer.assetsReady);

const recording = await page.evaluate(() => {
  const canvas = document.querySelector("#game");
  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType = mimeTypes.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start(500);
  window.__kidsDemoRecorder = { recorder, chunks, mimeType };
  return { mimeType, width: canvas.width, height: canvas.height };
});

startedAt = performance.now();
mark("title");
await page.waitForTimeout(2600);

mark("press_enter");
await page.keyboard.press("Enter");
await page.waitForTimeout(2200);

let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
mark("type_first_word", { text: state.combatWord });
await page.keyboard.type(state.combatWord, { delay: 340 });
await page.waitForTimeout(1100);

mark("first_full_draw");
await page.waitForTimeout(900);

mark("first_shot");
await page.keyboard.press("Space");
await page.waitForTimeout(2700);

state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
mark("type_second_word", { text: state.combatWord });
await page.keyboard.type(state.combatWord, { delay: 260 });
await page.waitForTimeout(900);

mark("second_shot");
await page.keyboard.press("Space");
await page.waitForTimeout(2400);

mark("open_training");
await page.keyboard.press("Tab");
await page.waitForTimeout(1200);

state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
mark("type_training_phrase", { text: state.enrichmentPhrase });
await page.keyboard.type(state.enrichmentPhrase, { delay: 90 });
await page.waitForTimeout(1400);

mark("return_to_combat");
await page.keyboard.press("Tab");
await page.waitForTimeout(3000);
mark("end");

const base64 = await page.evaluate(async () => {
  const { recorder, chunks, mimeType } = window.__kidsDemoRecorder;
  await new Promise((resolve, reject) => {
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.addEventListener("error", (event) => reject(event.error), { once: true });
    recorder.stop();
  });
  const blob = new Blob(chunks, { type: mimeType });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
});

await fs.writeFile(path.join(outputDir, "raw-gameplay-canvas.webm"), Buffer.from(base64, "base64"));
await fs.writeFile(
  path.join(outputDir, "timeline-canvas.json"),
  JSON.stringify({ recording, timeline }, null, 2),
);
if (errors.length) {
  await fs.writeFile(path.join(outputDir, "browser-errors.json"), JSON.stringify(errors, null, 2));
  throw new Error(`Browser errors were captured: ${JSON.stringify(errors)}`);
}

await context.close();
await browser.close();
console.log(JSON.stringify({ outputDir, recording, timeline }, null, 2));
