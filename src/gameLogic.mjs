import {
  ARROW_TYPES,
  ENRICHMENT_PHRASES,
  LONGBOWMAN_TIERS,
  TOWER_LEVELS,
  getArrowType,
  getEnemyType,
} from "./gameData.mjs";

export function createCombatEnemy(enemyTypeId, overrides = {}) {
  const type = getEnemyType(enemyTypeId);
  if (!type) throw new Error(`Unknown enemy type: ${enemyTypeId}`);
  return {
    id: enemyTypeId,
    name: type.name,
    hp: type.hp,
    maxHp: type.hp,
    armor: type.armor,
    maxArmor: type.armor,
    speed: type.speed,
    towerDamage: type.towerDamage,
    rewardGold: type.rewardGold,
    burnResistance: type.burnResistance ?? 0,
    statuses: {
      burning: { active: false, remaining: 0, damagePerSecond: 0 },
      poison: { active: false, remaining: 0, damagePerSecond: 0 },
      slow: { active: false, remaining: 0, multiplier: 1 },
    },
    alive: true,
    ...overrides,
  };
}

export function applyArrowHit(enemy, arrowId, options = {}) {
  if (!enemy.alive) return { killed: false, armorHit: false, hpDamage: 0 };
  const arrow = getArrowType(arrowId);
  if (!arrow) throw new Error(`Unknown arrow type: ${arrowId}`);
  const weaponDamage = options.weaponDamage ?? 1;
  let hpDamage = 0;
  let armorHit = false;

  if (arrow.id === "fire") {
    const resistance = enemy.burnResistance ?? 0;
    enemy.statuses.burning = {
      active: true,
      remaining: arrow.burnDuration,
      damagePerSecond: arrow.burnDamagePerSecond * (1 - resistance) * weaponDamage,
    };
  } else if (arrow.id === "poison") {
    enemy.statuses.poison = {
      active: true,
      remaining: arrow.poisonDuration,
      damagePerSecond: arrow.poisonDamagePerSecond * weaponDamage,
    };
  } else if (arrow.id === "ice") {
    if (enemy.armor > 0) {
      enemy.armor = Math.max(0, enemy.armor - arrow.armorDamage);
      armorHit = true;
    } else {
      hpDamage = arrow.damage * weaponDamage;
    }
    enemy.statuses.slow = {
      active: true,
      remaining: arrow.slowDuration,
      multiplier: arrow.slowMultiplier,
    };
  } else if (enemy.armor > 0) {
    enemy.armor = Math.max(0, enemy.armor - arrow.armorDamage);
    armorHit = true;
  } else {
    hpDamage = arrow.damage * weaponDamage;
  }

  if (hpDamage > 0) enemy.hp -= hpDamage;
  if (enemy.hp <= 0) enemy.alive = false;
  return { killed: !enemy.alive, armorHit, hpDamage };
}

export function tickStatusEffects(enemy, seconds) {
  if (!enemy.alive) return;
  for (const key of ["burning", "poison"]) {
    const status = enemy.statuses[key];
    if (!status.active) continue;
    const elapsed = Math.min(seconds, status.remaining);
    enemy.hp -= status.damagePerSecond * elapsed;
    status.remaining -= seconds;
    if (status.remaining <= 0) status.active = false;
  }
  const slow = enemy.statuses.slow;
  if (slow.active) {
    slow.remaining -= seconds;
    if (slow.remaining <= 0) slow.active = false;
  }
  if (enemy.hp <= 0) enemy.alive = false;
}

export function createGameModel(initial = {}) {
  const towerLevel = initial.towerLevel ?? 1;
  const longbowmanTier = initial.longbowmanTier ?? 1;
  const tower = TOWER_LEVELS[towerLevel - 1];
  const weapon = LONGBOWMAN_TIERS[longbowmanTier - 1];
  return {
    level: initial.level ?? 1,
    mode: "combat",
    combatWord: "",
    combatInput: "",
    enrichmentPhrase: "",
    enrichmentInput: "",
    gold: initial.gold ?? 0,
    trainingPoints: initial.trainingPoints ?? 0,
    arrowCharge: initial.arrowCharge ?? 3,
    towerLevel,
    towerMaxHp: tower.maxHp,
    towerHp: initial.towerHp ?? tower.maxHp,
    longbowmanTier,
    activeWeaponName: weapon.weapon,
    activeArrowId: "normal",
    completedPhrases: 0,
    get enrichmentProgress() {
      return this.enrichmentInput.length;
    },
    setCombatWord(nextWord) {
      this.combatWord = nextWord;
      this.combatInput = "";
    },
    setEnrichmentPhrase(nextPhrase) {
      this.enrichmentPhrase = nextPhrase;
      this.enrichmentInput = "";
    },
    toggleMode() {
      this.mode = this.mode === "combat" ? "enrichment" : "combat";
    },
    typeText(text) {
      for (const char of text) this.typeChar(char);
    },
    typeChar(char) {
      if (this.mode === "combat") {
        this.combatInput += char;
        return;
      }
      if (this.enrichmentInput.length >= this.enrichmentPhrase.length + 3) return;
      this.enrichmentInput += char;
      if (this.enrichmentInput === this.enrichmentPhrase) {
        const phrase = ENRICHMENT_PHRASES.find((entry) => entry.phrase === this.enrichmentPhrase);
        this.trainingPoints += phrase?.reward ?? 1;
        this.completedPhrases += 1;
        this.enrichmentInput = "";
      }
    },
  };
}

export function getUpgradePreview(game, upgradeId) {
  if (upgradeId === "tower") {
    const next = TOWER_LEVELS[game.towerLevel];
    if (!next) return null;
    return { nextName: next.name, goldCost: next.goldCost, trainingPointCost: 0 };
  }
  if (upgradeId === "longbowman") {
    const next = LONGBOWMAN_TIERS[game.longbowmanTier];
    if (!next) return null;
    return { nextName: next.weapon, goldCost: next.goldCost, trainingPointCost: next.trainingPointCost };
  }
  if (upgradeId === "arrowCharge") {
    return { nextName: "Arrow Charge Refill", goldCost: 80, trainingPointCost: 0 };
  }
  if (upgradeId === "repair") {
    return { nextName: "Tower Repair", goldCost: 60, trainingPointCost: 0 };
  }
  return null;
}

export function canAffordUpgrade(game, upgradeId) {
  const preview = getUpgradePreview(game, upgradeId);
  if (!preview) return false;
  if (upgradeId === "repair" && game.towerHp >= game.towerMaxHp) return false;
  return game.gold >= preview.goldCost && game.trainingPoints >= preview.trainingPointCost;
}

export function purchaseUpgrade(game, upgradeId) {
  if (!canAffordUpgrade(game, upgradeId)) return false;
  const preview = getUpgradePreview(game, upgradeId);
  game.gold -= preview.goldCost;
  game.trainingPoints -= preview.trainingPointCost;

  if (upgradeId === "tower") {
    game.towerLevel += 1;
    const tower = TOWER_LEVELS[game.towerLevel - 1];
    game.towerMaxHp = tower.maxHp;
    game.towerHp = Math.min(tower.maxHp, game.towerHp + 40);
  } else if (upgradeId === "longbowman") {
    game.longbowmanTier += 1;
    const tier = LONGBOWMAN_TIERS[game.longbowmanTier - 1];
    game.activeWeaponName = tier.weapon;
  } else if (upgradeId === "arrowCharge") {
    game.arrowCharge += 3;
  } else if (upgradeId === "repair") {
    game.towerHp = Math.min(game.towerMaxHp, game.towerHp + 60);
  }
  return true;
}

export function getWeaponDamage(longbowmanTier) {
  return LONGBOWMAN_TIERS[longbowmanTier - 1]?.baseDamage ?? 1;
}

export function getUnlockedArrowIds(levelTier) {
  return ARROW_TYPES.filter((arrow) => typeof arrow.key === "string" && /^[1-6]$/.test(arrow.key) && arrow.unlockTier <= levelTier)
    .map((arrow) => arrow.id);
}
