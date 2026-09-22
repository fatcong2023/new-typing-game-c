import assert from "node:assert/strict";
import test from "node:test";

import { createGameModel } from "../src/gameLogic.mjs";
import {
  checkTesterPassword,
  clampLevel,
  createTesterSettings,
  describeTierEnemies,
  grantTesterResources,
  tierStartLevel,
} from "../src/testerMode.mjs";

test("tester password accepts only 32167", () => {
  assert.equal(checkTesterPassword("32167"), true);
  assert.equal(checkTesterPassword(" 32167 "), true);
  assert.equal(checkTesterPassword("3216"), false);
  assert.equal(checkTesterPassword("321670"), false);
  assert.equal(checkTesterPassword("12345"), false);
  assert.equal(checkTesterPassword(""), false);
  assert.equal(checkTesterPassword(undefined), false);
});

test("level input is clamped to the 100-level campaign", () => {
  assert.equal(clampLevel("37"), 37);
  assert.equal(clampLevel(41), 41);
  assert.equal(clampLevel("12.8"), 12);
  assert.equal(clampLevel(0), 1);
  assert.equal(clampLevel(-5), 1);
  assert.equal(clampLevel(250), 100);
});

test("blank or non-numeric level input is rejected", () => {
  assert.equal(clampLevel(""), null);
  assert.equal(clampLevel("   "), null);
  assert.equal(clampLevel("abc"), null);
  assert.equal(clampLevel(undefined), null);
});

test("tier shortcuts open on the first level of the tier", () => {
  assert.equal(tierStartLevel(1), 1);
  assert.equal(tierStartLevel(5), 41);
  assert.equal(tierStartLevel(10), 91);
});

test("tester settings start with every cheat off", () => {
  const settings = createTesterSettings();
  assert.deepEqual(settings, { oneKillClears: false, invincible: false, enemySpeed: 1 });
  settings.invincible = true;
  assert.equal(createTesterSettings().invincible, false, "each call returns a fresh object");
});

test("resource grant adds gold, training points and arrow charge", () => {
  const model = createGameModel({ gold: 40, trainingPoints: 0, arrowCharge: 3 });
  grantTesterResources(model);
  assert.equal(model.gold, 1040);
  assert.equal(model.trainingPoints, 10);
  assert.equal(model.arrowCharge, 13);
});

test("tier tooltips name the tier's levels, foes and boss level", () => {
  assert.equal(describeTierEnemies(1), "第 1–10 关：Grunt（第 10 关有 Boss）");
  assert.equal(
    describeTierEnemies(5),
    "第 41–50 关：Chainmail Guard、Shield Bearer、Swarm、Brute（第 50 关有 Boss）",
  );
});
