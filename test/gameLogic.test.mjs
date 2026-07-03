import assert from "node:assert/strict";
import test from "node:test";

import {
  ARROW_TYPES,
  ENEMY_TYPES,
  LONGBOWMAN_TIERS,
  TOWER_LEVELS,
  getLevelTier,
  getWordLengthRange,
} from "../src/gameData.mjs";
import {
  applyArrowHit,
  canAffordUpgrade,
  createCombatEnemy,
  createGameModel,
  getUpgradePreview,
  purchaseUpgrade,
  tickStatusEffects,
} from "../src/gameLogic.mjs";

test("spreadsheet catalogues expose the planned game systems", () => {
  assert.equal(ARROW_TYPES.length, 8);
  assert.equal(ENEMY_TYPES.length, 10);
  assert.equal(TOWER_LEVELS.length, 8);
  assert.deepEqual(
    LONGBOWMAN_TIERS.map((tier) => tier.weapon),
    [
      "Longbow",
      "Reinforced Longbow",
      "Silver Bow",
      "Golden Bow",
      "Royal Golden Bow",
      "Fire Musket",
    ],
  );
  assert.equal(ARROW_TYPES.find((arrow) => arrow.id === "fire").armorInteraction, "bypass");
});

test("level tiers raise word length bands every ten levels", () => {
  assert.equal(getLevelTier(1), 1);
  assert.equal(getLevelTier(10), 1);
  assert.equal(getLevelTier(11), 2);
  assert.equal(getLevelTier(100), 10);
  assert.deepEqual(getWordLengthRange(1), { min: 3, max: 4 });
  assert.deepEqual(getWordLengthRange(51), { min: 8, max: 9 });
  assert.deepEqual(getWordLengthRange(91), { min: 12, max: 14 });
});

test("chainmail needs three normal hits to break armor and a fourth to kill", () => {
  const enemy = createCombatEnemy("chainmailGuard");
  assert.equal(enemy.armor, 3);
  assert.equal(enemy.hp, 1);

  applyArrowHit(enemy, "normal");
  applyArrowHit(enemy, "normal");
  applyArrowHit(enemy, "normal");

  assert.equal(enemy.armor, 0);
  assert.equal(enemy.hp, 1);
  assert.equal(enemy.alive, true);

  applyArrowHit(enemy, "normal");
  assert.equal(enemy.alive, false);
});

test("fire arrows bypass armor and burn armored enemies until they die", () => {
  const enemy = createCombatEnemy("chainmailGuard");
  applyArrowHit(enemy, "fire");

  assert.equal(enemy.armor, 3);
  assert.equal(enemy.statuses.burning.active, true);

  tickStatusEffects(enemy, 4);
  assert.equal(enemy.alive, false);
});

test("enrichment typing progress survives tabbing back to combat", () => {
  const game = createGameModel({ level: 1 });
  game.setCombatWord("fox");
  game.setEnrichmentPhrase("practice makes perfect");

  assert.equal(game.mode, "combat");
  game.toggleMode();
  game.typeText("prac");
  assert.equal(game.enrichmentProgress, 4);
  assert.equal(game.mode, "enrichment");

  game.toggleMode();
  assert.equal(game.mode, "combat");
  game.typeText("fox");
  assert.equal(game.combatInput, "fox");

  game.toggleMode();
  assert.equal(game.mode, "enrichment");
  assert.equal(game.enrichmentInput, "prac");
  game.typeText("tice makes perfect");

  assert.equal(game.trainingPoints, 1);
  assert.equal(game.enrichmentInput, "");
});

test("shop upgrades tower and longbowman from separate resources", () => {
  const game = createGameModel({ gold: 500, trainingPoints: 3 });

  assert.equal(canAffordUpgrade(game, "tower"), true);
  const towerPreview = getUpgradePreview(game, "tower");
  assert.equal(towerPreview.nextName, "Reinforced Watchtower");

  purchaseUpgrade(game, "tower");
  assert.equal(game.towerLevel, 2);
  assert.equal(game.towerMaxHp, 130);
  assert.equal(game.gold, 380);

  assert.equal(canAffordUpgrade(game, "longbowman"), true);
  purchaseUpgrade(game, "longbowman");
  assert.equal(game.longbowmanTier, 2);
  assert.equal(game.activeWeaponName, "Reinforced Longbow");
  assert.equal(game.gold, 200);
});
