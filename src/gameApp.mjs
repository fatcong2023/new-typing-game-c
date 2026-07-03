import {
  ARROW_TYPES,
  ENEMY_TYPES,
  ENRICHMENT_PHRASES,
  LEVEL_TIER_CONFIGS,
  TOWER_LEVELS,
  WORDS,
  getLevelConfig,
  getLevelTier,
  getWordLengthRange,
} from "./gameData.mjs";
import {
  applyArrowHit,
  canAffordUpgrade,
  createCombatEnemy,
  createGameModel,
  getUnlockedArrowIds,
  getUpgradePreview,
  getWeaponDamage,
  purchaseUpgrade,
  tickStatusEffects,
} from "./gameLogic.mjs";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 1100;
const H = 660;
const GROUND = 560;
const TOWER_X = 72;
const TOWER_W = 118;
const STOP_X = TOWER_X + TOWER_W + 20;
const SPAWN_X = W + 60;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.scale(DPR, DPR);

const arrowByKey = new Map(ARROW_TYPES.filter((arrow) => /^[1-6]$/.test(arrow.key)).map((arrow) => [arrow.key, arrow.id]));
const enemyNameById = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy.name]));

const app = {
  screen: "start",
  model: createGameModel({ level: 1, gold: 40, trainingPoints: 0, arrowCharge: 3 }),
  enemies: [],
  arrows: [],
  particles: [],
  spawnTimer: 1.4,
  spawned: 0,
  defeatedThisLevel: 0,
  levelQuota: 10,
  combatWord: "",
  wordInput: "",
  message: "",
  messageTimer: 0,
  shakeTimer: 0,
  phraseIndex: 0,
  levelRewardPaid: false,
  selectedEnemyIndex: 0,
  rngSeed: Date.now() >>> 0,
  rng: mulberry32(Date.now() >>> 0),
  lastFrame: 0,
};

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand() {
  return app.rng();
}

function pick(array) {
  return array[Math.floor(rand() * array.length)] ?? array[0];
}

function wordPoolForLevel(level) {
  const { min, max } = getWordLengthRange(level);
  const pool = WORDS.filter((word) => word.length >= min && word.length <= max);
  return pool.length ? pool : WORDS;
}

function nextCombatWord() {
  const pool = wordPoolForLevel(app.model.level);
  let next = pick(pool);
  for (let i = 0; i < 6 && next === app.combatWord; i += 1) next = pick(pool);
  app.combatWord = next;
  app.model.setCombatWord(next);
  app.wordInput = "";
}

function nextEnrichmentPhrase() {
  const tier = getLevelTier(app.model.level);
  const maxReward = Math.min(4, Math.max(1, Math.ceil(tier / 3)));
  const candidates = ENRICHMENT_PHRASES.filter((entry) => entry.reward <= maxReward + 1);
  const phrase = candidates[app.phraseIndex % candidates.length] ?? ENRICHMENT_PHRASES[0];
  app.phraseIndex += 1;
  app.model.setEnrichmentPhrase(phrase.phrase);
}

function announce(message, seconds = 2) {
  app.message = message;
  app.messageTimer = seconds;
}

function startCampaign() {
  app.rngSeed = Date.now() >>> 0;
  app.rng = mulberry32(app.rngSeed);
  app.model = createGameModel({ level: 1, gold: 40, trainingPoints: 0, arrowCharge: 3 });
  app.screen = "playing";
  setupLevel();
  announce("Level 1: hold the wall", 2.2);
}

function setupLevel() {
  const config = getLevelConfig(app.model.level);
  app.enemies = [];
  app.arrows = [];
  app.particles = [];
  app.spawnTimer = 1.25;
  app.spawned = 0;
  app.defeatedThisLevel = 0;
  app.levelQuota = config.enemyCount + Math.floor((app.model.level - 1) % 10);
  app.levelRewardPaid = false;
  app.model.mode = "combat";
  nextCombatWord();
  nextEnrichmentPhrase();
}

function spawnEnemy() {
  const config = getLevelConfig(app.model.level);
  let enemyId = pick(config.enemyIds);
  const isBossLevel = app.model.level % 10 === 0;
  if (isBossLevel && app.spawned === app.levelQuota - 1) enemyId = "boss";
  const enemy = createCombatEnemy(enemyId, {
    x: SPAWN_X + rand() * 40,
    laneOffset: rand() * 16 - 8,
    attackTimer: 0,
    alive: true,
    dyingTimer: 0,
    phase: rand() * Math.PI * 2,
  });
  const tier = getLevelTier(app.model.level);
  if (enemy.id === "boss") {
    enemy.name = `Tier ${tier} Warlord`;
    enemy.hp += tier * 4;
    enemy.maxHp = enemy.hp;
    enemy.armor += Math.ceil(tier / 2);
    enemy.maxArmor = enemy.armor;
    enemy.rewardGold += tier * 18;
    enemy.towerDamage += tier;
  }
  app.enemies.push(enemy);
  app.spawned += 1;
}

function livingEnemies() {
  return app.enemies.filter((enemy) => enemy.alive && enemy.dyingTimer <= 0);
}

function closestEnemy() {
  return livingEnemies().sort((a, b) => a.x - b.x)[0] ?? null;
}

function sortedTargets() {
  return livingEnemies().sort((a, b) => a.x - b.x);
}

function selectArrow(arrowId) {
  const tier = getLevelTier(app.model.level);
  if (!getUnlockedArrowIds(tier).includes(arrowId)) {
    announce("That arrow is not unlocked yet", 1.3);
    app.shakeTimer = 0.25;
    return;
  }
  app.model.activeArrowId = arrowId;
}

function fireArrow() {
  if (app.wordInput !== app.combatWord) {
    app.shakeTimer = 0.25;
    announce("Finish the combat word first", 1.1);
    return;
  }
  const targets = sortedTargets();
  const primary = targets[0];
  if (!primary) {
    nextCombatWord();
    return;
  }

  const arrowId = app.model.activeArrowId;
  if (arrowId !== "normal" && app.model.arrowCharge <= 0) {
    announce("No Arrow Charge left", 1.2);
    app.shakeTimer = 0.25;
    return;
  }
  if (arrowId !== "normal") app.model.arrowCharge -= 1;

  const weaponDamage = getWeaponDamage(app.model.longbowmanTier);
  const hitTargets = arrowId === "piercing" ? targets.slice(0, Math.min(3, targets.length)) : [primary];
  for (const enemy of hitTargets) {
    const result = applyArrowHit(enemy, arrowId, { weaponDamage });
    app.arrows.push({
      x: 145,
      y: 260,
      tx: enemy.x,
      ty: GROUND - 58 + enemy.laneOffset,
      life: 0.28,
      arrowId,
    });
    if (result.armorHit) addBurst(enemy.x, GROUND - 62, "#CBD5E1", 8);
    if (!enemy.alive) defeatEnemy(enemy);
  }

  if (app.model.completedPhrases > 0 && app.model.completedPhrases % 2 === 0) {
    const bonus = targets.find((enemy) => enemy.alive);
    if (bonus) {
      applyArrowHit(bonus, "normal", { weaponDamage });
      if (!bonus.alive) defeatEnemy(bonus);
    }
  }

  nextCombatWord();
}

function defeatEnemy(enemy) {
  if (enemy.dyingTimer > 0) return;
  enemy.alive = false;
  enemy.dyingTimer = 0.45;
  app.model.gold += enemy.rewardGold;
  app.defeatedThisLevel += 1;
  addBurst(enemy.x, GROUND - 50, "#DC2626", 14);
}

function addBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    app.particles.push({
      x,
      y,
      vx: (rand() - 0.5) * 220,
      vy: -30 - rand() * 160,
      life: 0.35 + rand() * 0.35,
      color,
    });
  }
}

function completeLevelIfReady() {
  if (app.spawned < app.levelQuota) return;
  if (app.enemies.some((enemy) => enemy.alive || enemy.dyingTimer > 0)) return;
  if (app.levelRewardPaid) return;
  app.levelRewardPaid = true;
  const tier = getLevelTier(app.model.level);
  const hpBonus = Math.round((app.model.towerHp / app.model.towerMaxHp) * 12 * tier);
  const clearBonus = 15 + tier * 8 + hpBonus;
  const bossBonus = app.model.level % 10 === 0 ? tier * 20 : 0;
  app.model.gold += clearBonus + bossBonus;
  if (app.model.level % 10 === 0) app.model.trainingPoints += 1;
  if (app.model.level >= 100) {
    app.screen = "victory";
    announce("Campaign complete", 4);
    return;
  }
  app.screen = "shop";
  announce(`Level ${app.model.level} cleared: +${clearBonus + bossBonus} gold`, 3);
}

function nextLevel() {
  app.model.level += 1;
  app.screen = "playing";
  const tower = TOWER_LEVELS[app.model.towerLevel - 1];
  const repairPercent = app.model.towerLevel >= 3 ? 0.08 + app.model.towerLevel * 0.02 : 0;
  app.model.towerHp = Math.min(tower.maxHp, Math.round(app.model.towerHp + tower.maxHp * repairPercent));
  setupLevel();
  announce(`Level ${app.model.level}: Tier ${getLevelTier(app.model.level)}`, 2);
}

function buy(upgradeId) {
  const ok = purchaseUpgrade(app.model, upgradeId);
  if (ok) {
    const previewName = upgradeId === "repair" ? "Tower repaired" : "Upgrade purchased";
    announce(previewName, 1.4);
  } else {
    announce("Not enough resources", 1.2);
    app.shakeTimer = 0.25;
  }
}

function typeCharacter(char) {
  if (app.model.mode === "combat") {
    if (app.wordInput.length >= app.combatWord.length + 3) return;
    app.wordInput += char;
    app.model.combatInput = app.wordInput;
    if (!app.combatWord.startsWith(app.wordInput)) app.shakeTimer = 0.12;
    return;
  }
  const before = app.model.trainingPoints;
  app.model.typeChar(char);
  if (app.model.trainingPoints > before) {
    announce(`Training complete: +${app.model.trainingPoints - before} TP`, 1.6);
    app.model.arrowCharge += 1;
    nextEnrichmentPhrase();
  }
}

function update(dt) {
  if (app.messageTimer > 0) app.messageTimer -= dt;
  if (app.shakeTimer > 0) app.shakeTimer -= dt;

  for (const particle of app.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 400 * dt;
    particle.life -= dt;
  }
  app.particles = app.particles.filter((particle) => particle.life > 0);

  for (const arrow of app.arrows) arrow.life -= dt;
  app.arrows = app.arrows.filter((arrow) => arrow.life > 0);

  if (app.screen !== "playing") return;

  const config = getLevelConfig(app.model.level);
  app.spawnTimer -= dt;
  if (app.spawned < app.levelQuota && app.spawnTimer <= 0 && livingEnemies().length < config.maxAlive) {
    spawnEnemy();
    app.spawnTimer = Math.max(0.38, config.spawnInterval - app.model.level * 0.006) * (0.75 + rand() * 0.5);
  }

  for (const enemy of app.enemies) {
    if (enemy.dyingTimer > 0) {
      enemy.dyingTimer -= dt;
      continue;
    }
    if (!enemy.alive) continue;
    tickStatusEffects(enemy, dt);
    if (!enemy.alive) {
      defeatEnemy(enemy);
      continue;
    }
    const slow = enemy.statuses.slow.active ? enemy.statuses.slow.multiplier : 1;
    if (enemy.x > STOP_X) {
      enemy.x -= enemy.speed * slow * dt;
      enemy.phase += dt * 6;
    } else {
      enemy.attackTimer += dt;
      if (enemy.attackTimer >= 1.2) {
        enemy.attackTimer -= 1.2;
        const reduction = TOWER_LEVELS[app.model.towerLevel - 1].damageReduction;
        app.model.towerHp = Math.max(0, app.model.towerHp - Math.ceil(enemy.towerDamage * (1 - reduction)));
        addBurst(STOP_X - 8, GROUND - 52, "#7C2D12", 8);
        if (app.model.towerHp <= 0) app.screen = "gameover";
      }
    }
  }
  app.enemies = app.enemies.filter((enemy) => enemy.alive || enemy.dyingTimer > 0);
  completeLevelIfReady();
}

function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(x, y, w, h, fill = "rgba(255,255,255,.86)") {
  ctx.fillStyle = fill;
  drawRoundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(30,41,59,.24)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, "#93C5FD");
  sky.addColorStop(0.65, "#DBEAFE");
  sky.addColorStop(1, "#ECFCCB");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND);

  ctx.fillStyle = "#86A86E";
  ctx.beginPath();
  ctx.ellipse(430, GROUND + 35, 520, 120, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6B8F56";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = "#557A44";
  ctx.fillRect(0, GROUND, W, 6);
}

function drawTower() {
  const hpFrac = app.model.towerHp / app.model.towerMaxHp;
  ctx.fillStyle = "#A8A29E";
  ctx.fillRect(TOWER_X, 260, TOWER_W, GROUND - 260);
  ctx.strokeStyle = "#57534E";
  ctx.lineWidth = 3;
  ctx.strokeRect(TOWER_X, 260, TOWER_W, GROUND - 260);

  ctx.fillStyle = "#78716C";
  for (let y = 282; y < GROUND; y += 28) {
    ctx.fillRect(TOWER_X, y, TOWER_W, 2);
    for (let x = TOWER_X + 16 + ((y / 28) % 2) * 18; x < TOWER_X + TOWER_W; x += 36) ctx.fillRect(x, y - 24, 2, 24);
  }
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = "#A8A29E";
    ctx.fillRect(TOWER_X - 4 + i * 37, 238, 26, 24);
    ctx.strokeRect(TOWER_X - 4 + i * 37, 238, 26, 24);
  }

  ctx.fillStyle = "#1E293B";
  ctx.fillRect(TOWER_X + 32, 356, 16, 48);
  ctx.fillStyle = "#654321";
  drawRoundRect(TOWER_X + 39, GROUND - 64, 42, 64, 14);
  ctx.fill();

  panel(TOWER_X - 10, 204, TOWER_W + 20, 36, "rgba(255,255,255,.78)");
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 13px Georgia";
  ctx.textAlign = "center";
  ctx.fillText(TOWER_LEVELS[app.model.towerLevel - 1].name, TOWER_X + TOWER_W / 2, 225);
  ctx.fillStyle = "#111827";
  ctx.fillRect(TOWER_X - 8, 244, TOWER_W + 16, 13);
  ctx.fillStyle = hpFrac > 0.5 ? "#16A34A" : hpFrac > 0.25 ? "#F59E0B" : "#DC2626";
  ctx.fillRect(TOWER_X - 6, 246, Math.max(0, (TOWER_W + 12) * hpFrac), 9);
}

function drawArcher() {
  const x = 142;
  const y = 255;
  ctx.strokeStyle = "#3F2F21";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + 44);
  ctx.lineTo(x - 10, y + 76);
  ctx.moveTo(x, y + 44);
  ctx.lineTo(x + 16, y + 75);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y + 46);
  ctx.stroke();

  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(x - 13, y + 10, 26, 34);
  ctx.fillStyle = "#DC2626";
  ctx.fillRect(x - 2, y + 10, 4, 34);
  ctx.fillRect(x - 13, y + 23, 26, 4);
  ctx.fillStyle = "#F3C7A4";
  ctx.beginPath();
  ctx.arc(x, y - 3, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = app.model.activeArrowId === "fire" ? "#DC2626" : app.model.activeArrowId === "piercing" ? "#2563EB" : "#7C2D12";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + 34, y + 20, 38, -1.25, 1.25);
  ctx.stroke();
  ctx.strokeStyle = "#F8FAFC";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 46, y - 15);
  ctx.lineTo(x + 20, y + 20);
  ctx.lineTo(x + 46, y + 55);
  ctx.stroke();
}

function drawEnemy(enemy) {
  const type = ENEMY_TYPES.find((item) => item.id === enemy.id);
  const scale = enemy.id === "boss" ? 1.45 : 1;
  const alpha = enemy.dyingTimer > 0 ? Math.max(0.2, enemy.dyingTimer / 0.45) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(enemy.x, GROUND + enemy.laneOffset);
  ctx.scale(scale, scale);
  ctx.fillStyle = type?.color ?? "#64748B";
  ctx.strokeStyle = "#1F2937";
  ctx.lineWidth = 2;
  drawRoundRect(-14, -58, 28, 42, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#F8CFAE";
  ctx.beginPath();
  ctx.arc(0, -70, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#334155";
  ctx.fillRect(-12, -78, 24, 8);

  ctx.strokeStyle = "#1F2937";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-6, -17);
  ctx.lineTo(-16 + Math.sin(enemy.phase) * 4, 0);
  ctx.moveTo(6, -17);
  ctx.lineTo(18 - Math.sin(enemy.phase) * 4, 0);
  ctx.stroke();

  ctx.fillStyle = "#1D4ED8";
  ctx.beginPath();
  ctx.moveTo(8, -54);
  ctx.lineTo(26, -50);
  ctx.lineTo(22, -28);
  ctx.lineTo(10, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FACC15";
  ctx.font = "bold 14px Georgia";
  ctx.textAlign = "center";
  ctx.fillText("⚜", 17, -34);

  const hpWidth = 40;
  ctx.fillStyle = "rgba(15,23,42,.35)";
  ctx.fillRect(-hpWidth / 2, -100, hpWidth, 6);
  ctx.fillStyle = "#EF4444";
  ctx.fillRect(-hpWidth / 2, -100, hpWidth * Math.max(0, enemy.hp / enemy.maxHp), 6);
  for (let i = 0; i < enemy.maxArmor; i += 1) {
    ctx.fillStyle = i < enemy.armor ? "#93C5FD" : "rgba(15,23,42,.25)";
    ctx.fillRect(-enemy.maxArmor * 4 + i * 8, -91, 6, 6);
  }
  if (enemy.statuses.burning.active) {
    ctx.fillStyle = "#F97316";
    ctx.beginPath();
    ctx.arc(0, -112, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawArrows() {
  for (const arrow of app.arrows) {
    const t = 1 - arrow.life / 0.28;
    const x = arrow.x + (arrow.tx - arrow.x) * t;
    const y = arrow.y + (arrow.ty - arrow.y) * t - Math.sin(t * Math.PI) * 38;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(arrow.ty - arrow.y, arrow.tx - arrow.x));
    ctx.strokeStyle = arrow.arrowId === "fire" ? "#EA580C" : arrow.arrowId === "piercing" ? "#2563EB" : "#6B3F1D";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = "#CBD5E1";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(6, -5);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawPanels() {
  const mode = app.model.mode;
  const wordJitter = app.shakeTimer > 0 ? Math.sin(app.shakeTimer * 60) * 4 : 0;
  panel(292 + wordJitter, 28, 516, 96, mode === "combat" ? "rgba(255,251,235,.94)" : "rgba(248,250,252,.82)");
  ctx.textAlign = "center";
  ctx.font = "bold 36px Georgia";
  drawTypedText(app.combatWord, app.wordInput, 550 + wordJitter, 75, mode === "combat");
  ctx.font = "14px Georgia";
  ctx.fillStyle = "#475569";
  ctx.fillText("Combat word · SPACE fires", 550 + wordJitter, 108);

  panel(262, 132, 576, 70, mode === "enrichment" ? "rgba(236,253,245,.95)" : "rgba(248,250,252,.80)");
  ctx.font = "bold 22px Georgia";
  drawTypedText(app.model.enrichmentPhrase, app.model.enrichmentInput, 550, 162, mode === "enrichment");
  ctx.font = "13px Georgia";
  ctx.fillStyle = "#475569";
  ctx.fillText("TAB switches lanes · phrase progress is saved", 550, 188);
}

function drawTypedText(target, typed, x, y, active) {
  ctx.textAlign = "left";
  const chars = [...target];
  const widths = chars.map((char) => ctx.measureText(char).width + 2);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let cursor = x - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    if (i < typed.length) ctx.fillStyle = typed[i] === chars[i] ? "#15803D" : "#B91C1C";
    else ctx.fillStyle = active ? "#1E293B" : "#64748B";
    ctx.fillText(chars[i], cursor, y);
    cursor += widths[i];
  }
  ctx.textAlign = "center";
}

function drawHUD() {
  panel(16, 16, 238, 128, "rgba(248,250,252,.88)");
  ctx.textAlign = "left";
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 18px Georgia";
  ctx.fillText(`Level ${app.model.level}/100 · Tier ${getLevelTier(app.model.level)}`, 32, 44);
  ctx.font = "15px Georgia";
  ctx.fillText(`Gold ${app.model.gold} · TP ${app.model.trainingPoints}`, 32, 70);
  ctx.fillText(`Tower ${app.model.towerHp}/${app.model.towerMaxHp}`, 32, 94);
  ctx.fillText(`Enemies ${app.defeatedThisLevel}/${app.levelQuota}`, 32, 118);

  panel(W - 294, 16, 278, 128, "rgba(248,250,252,.88)");
  ctx.textAlign = "left";
  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 16px Georgia";
  ctx.fillText(app.model.activeWeaponName, W - 278, 44);
  ctx.font = "14px Georgia";
  ctx.fillStyle = "#0F172A";
  ctx.fillText(`Arrow Charge ${app.model.arrowCharge}`, W - 278, 70);
  const tier = getLevelTier(app.model.level);
  let x = W - 278;
  for (const arrow of ARROW_TYPES.filter((item) => ["1", "2", "3"].includes(item.key))) {
    const unlocked = arrow.unlockTier <= tier;
    const active = app.model.activeArrowId === arrow.id;
    ctx.fillStyle = active ? "#1D4ED8" : unlocked ? "#E2E8F0" : "#CBD5E1";
    drawRoundRect(x, 92, 78, 30, 6);
    ctx.fill();
    ctx.fillStyle = active ? "#FFFFFF" : unlocked ? "#0F172A" : "#64748B";
    ctx.font = "bold 12px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(`${arrow.key} ${arrow.name.split(" ")[0]}`, x + 39, 112);
    x += 86;
  }
}

function drawMessage() {
  if (app.messageTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, app.messageTimer);
  ctx.fillStyle = "rgba(15,23,42,.86)";
  ctx.font = "bold 22px Georgia";
  ctx.textAlign = "center";
  const width = Math.max(280, ctx.measureText(app.message).width + 52);
  drawRoundRect(W / 2 - width / 2, 216, width, 48, 8);
  ctx.fill();
  ctx.fillStyle = "#F8FAFC";
  ctx.fillText(app.message, W / 2, 247);
  ctx.restore();
}

function drawShop() {
  drawBackground();
  ctx.fillStyle = "rgba(15,23,42,.72)";
  ctx.fillRect(0, 0, W, H);
  panel(170, 76, 760, 486, "rgba(255,251,235,.96)");
  ctx.textAlign = "center";
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 42px Georgia";
  ctx.fillText(`Level ${app.model.level} Cleared`, W / 2, 128);
  ctx.font = "17px Georgia";
  ctx.fillText(`Gold ${app.model.gold} · Training Points ${app.model.trainingPoints} · Arrow Charge ${app.model.arrowCharge}`, W / 2, 158);

  const rows = [
    ["1", "Tower Defense", getUpgradePreview(app.model, "tower"), "More HP, shield, repair, and damage reduction"],
    ["2", "Longbowman", getUpgradePreview(app.model, "longbowman"), "Longbow → Silver Bow → Golden Bow → Fire Musket"],
    ["3", "Special Arrows", getUpgradePreview(app.model, "arrowCharge"), "Refill +3 Arrow Charge for Fire and Piercing arrows"],
    ["4", "Repair", getUpgradePreview(app.model, "repair"), "Recover tower HP between waves"],
  ];
  let y = 204;
  for (const [key, label, preview, note] of rows) {
    const affordable = preview && canAffordUpgrade(app.model, key === "1" ? "tower" : key === "2" ? "longbowman" : key === "3" ? "arrowCharge" : "repair");
    ctx.fillStyle = affordable ? "#F8FAFC" : "#E5E7EB";
    drawRoundRect(220, y - 26, 660, 58, 6);
    ctx.fill();
    ctx.fillStyle = affordable ? "#0F172A" : "#64748B";
    ctx.font = "bold 18px Georgia";
    ctx.textAlign = "left";
    ctx.fillText(`${key}. ${label}`, 244, y);
    ctx.font = "14px Georgia";
    const cost = preview ? `${preview.goldCost}g${preview.trainingPointCost ? ` + ${preview.trainingPointCost} TP` : ""}` : "Maxed";
    ctx.fillText(`${preview?.nextName ?? "Fully upgraded"} · ${cost}`, 244, y + 20);
    ctx.textAlign = "right";
    ctx.fillText(note, 858, y + 10);
    y += 76;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 20px Georgia";
  ctx.fillText("Press ENTER for the next level", W / 2, 522);
  drawMessage();
}

function drawOverlay(title, lines, footer) {
  drawBackground();
  drawTower();
  drawArcher();
  ctx.fillStyle = "rgba(15,23,42,.72)";
  ctx.fillRect(0, 0, W, H);
  panel(155, 86, 790, 454, "rgba(255,251,235,.96)");
  ctx.textAlign = "center";
  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 52px Georgia";
  ctx.fillText(title, W / 2, 150);
  ctx.font = "18px Georgia";
  let y = 198;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 31;
  }
  ctx.font = "bold 22px Georgia";
  ctx.fillText(footer, W / 2, 492);
}

function draw() {
  if (app.screen === "shop") {
    drawShop();
    return;
  }
  if (app.screen === "start") {
    drawOverlay("LONGBOW TRAINING", [
      "Type enemy words to fire. Press TAB to risk time on enrichment phrases.",
      "1 Normal Arrow · 2 Fire Arrow · 3 Piercing Arrow.",
      "Fire bypasses chainmail. Piercing punishes swarms.",
      "Spend Gold and Training Points in the after-level shop.",
    ], "Press ENTER to begin");
    return;
  }
  if (app.screen === "gameover") {
    drawOverlay("THE TOWER HAS FALLEN", [
      `You reached Level ${app.model.level}.`,
      `Gold ${app.model.gold} · Training Points ${app.model.trainingPoints}`,
      "The enemy kept moving while the training phrase waited.",
    ], "Press ENTER to restart");
    return;
  }
  if (app.screen === "victory") {
    drawOverlay("THE KEEP STANDS", [
      "You cleared all 100 levels.",
      `Final Gold ${app.model.gold} · Training Points ${app.model.trainingPoints}`,
      `Weapon: ${app.model.activeWeaponName} · Tower: ${TOWER_LEVELS[app.model.towerLevel - 1].name}`,
    ], "Press ENTER to start a new campaign");
    return;
  }

  ctx.save();
  if (app.shakeTimer > 0) ctx.translate(Math.sin(app.shakeTimer * 70) * 3, 0);
  drawBackground();
  drawTower();
  drawArcher();
  for (const enemy of app.enemies) drawEnemy(enemy);
  drawArrows();
  for (const particle of app.particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 3);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  drawPanels();
  drawHUD();
  drawMessage();
  ctx.restore();
}

function handleShopKey(key) {
  if (key === "Enter") {
    nextLevel();
    return;
  }
  if (key === "1") buy("tower");
  if (key === "2") buy("longbowman");
  if (key === "3") buy("arrowCharge");
  if (key === "4") buy("repair");
}

window.addEventListener("keydown", (event) => {
  if (app.screen === "start" || app.screen === "gameover" || app.screen === "victory") {
    if (event.key === "Enter") startCampaign();
    return;
  }
  if (app.screen === "shop") {
    event.preventDefault();
    handleShopKey(event.key);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    app.model.toggleMode();
    return;
  }
  if (arrowByKey.has(event.key)) {
    selectArrow(arrowByKey.get(event.key));
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    if (app.model.mode === "combat") {
      app.wordInput = app.wordInput.slice(0, -1);
      app.model.combatInput = app.wordInput;
    } else {
      app.model.enrichmentInput = app.model.enrichmentInput.slice(0, -1);
    }
    return;
  }
  if (event.key === " ") {
    event.preventDefault();
    if (app.model.mode === "combat") fireArrow();
    else typeCharacter(" ");
    return;
  }
  if (event.key.length === 1 && /^[a-z]$/i.test(event.key)) {
    event.preventDefault();
    typeCharacter(event.key.toLowerCase());
  }
});

function frame(timestamp) {
  const dt = Math.min(0.05, (timestamp - app.lastFrame) / 1000 || 0);
  app.lastFrame = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(1 / 60);
  draw();
};

window.render_game_to_text = () => JSON.stringify({
  screen: app.screen,
  mode: app.model.mode,
  level: app.model.level,
  tier: getLevelTier(app.model.level),
  combatWord: app.combatWord,
  combatInput: app.wordInput,
  enrichmentPhrase: app.model.enrichmentPhrase,
  enrichmentInput: app.model.enrichmentInput,
  resources: {
    gold: app.model.gold,
    trainingPoints: app.model.trainingPoints,
    arrowCharge: app.model.arrowCharge,
  },
  tower: {
    hp: app.model.towerHp,
    maxHp: app.model.towerMaxHp,
    level: app.model.towerLevel,
  },
  weapon: {
    name: app.model.activeWeaponName,
    tier: app.model.longbowmanTier,
    activeArrowId: app.model.activeArrowId,
  },
  enemies: livingEnemies().map((enemy) => ({
    id: enemy.id,
    name: enemyNameById.get(enemy.id),
    x: Math.round(enemy.x),
    hp: Number(enemy.hp.toFixed(2)),
    armor: enemy.armor,
    burning: enemy.statuses.burning.active,
  })),
});

window.__game = {
  app,
  startCampaign,
  nextLevel,
  selectArrow,
  fireArrow,
  typeCharacter,
  update,
  renderText: window.render_game_to_text,
};

requestAnimationFrame(frame);
