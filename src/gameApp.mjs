import {
  ARROW_TYPES,
  ENEMY_TYPES,
  ENRICHMENT_PHRASES,
  TOWER_LEVELS,
  WORDS,
  getArrowType,
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
const ARROW_GRAVITY = 680; // px/s² — one sky, one gravity for every shaft
const DPR = Math.min(window.devicePixelRatio || 1, 2);

canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.scale(DPR, DPR);

/* ============================================================
   Illuminated-manuscript palette — heraldic pigments & gold leaf.
   Titles set in blackletter (UnifrakturMaguntia); body in EB Garamond.
   ============================================================ */
const INK = "#2a1c0e";
const GILT = "#c69a3a", GILT_HI = "#efcf7a", GILT_DK = "#8f6a1f";
const VERMILION = "#a3301d";
const PARCH_HI = "#f5ecd2", PARCH_DK = "#d6c398";
const DISPLAY = "'UnifrakturMaguntia', 'EB Garamond', Georgia";
const BODY = "'EB Garamond', Georgia";
function giltFill(x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GILT_HI); g.addColorStop(0.5, GILT);
  g.addColorStop(1, GILT_DK); return g;
}

// heraldic surcoat pigments for each foe of the spreadsheet bestiary
const ENEMY_PIGMENTS = {
  grunt: { body: "#b3a88c", trim: "#6b5a38" },
  runner: { body: "#b98a3a", trim: "#6e4d17" },
  chainmailGuard: { body: "#8b96a4", trim: "#3f4b3c" },
  shieldBearer: { body: "#2b4a9b", trim: "#1d3468" },
  swarm: { body: "#7a8f4a", trim: "#44522a" },
  brute: { body: "#7c3f1d", trim: "#45210d" },
  bannerCaptain: { body: "#6d3a7a", trim: "#3e1f47" },
  siegeEnemy: { body: "#8a5a20", trim: "#4c3010" },
  fireResistantKnight: { body: "#a3301d", trim: "#5c170c" },
  boss: { body: "#3a332a", trim: "#171310" },
};

const arrowByKey = new Map(ARROW_TYPES.filter((arrow) => /^[1-6]$/.test(arrow.key)).map((arrow) => [arrow.key, arrow.id]));
const ARROW_TINTS = {
  normal: "#5b4325",
  fire: VERMILION,
  piercing: "#274a90",
  ice: "#4a7f9b",
  armorBreaker: "#57534e",
  explosive: "#8a4a17",
};

/* ============================================================
   Sound — tiny WebAudio synth, safe to fail silently
   ============================================================ */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  return AC;
}
function tone(freq, dur, type, vol, slideTo) {
  const c = audio(); if (!c) return;
  try {
    if (c.state === "suspended") c.resume();
    const t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const sfx = {
  shoot()    { tone(380, 0.16, "sawtooth", 0.09, 110); },
  hitArmor() { tone(230, 0.08, "square", 0.10, 150); },
  kill()     { tone(330, 0.09, "triangle", 0.12); setTimeout(() => tone(494, 0.13, "triangle", 0.11), 70); },
  knock()    { tone(72, 0.16, "sine", 0.28, 45); },
  error()    { tone(110, 0.18, "sawtooth", 0.07, 78); },
  type()     { tone(720, 0.025, "square", 0.02); },
  badType()  { tone(170, 0.05, "square", 0.045); },
  levelUp()  { tone(392, 0.1, "triangle", 0.11); setTimeout(() => tone(523, 0.11, "triangle", 0.11), 90); setTimeout(() => tone(659, 0.16, "triangle", 0.11), 180); },
  horn()     { tone(262, 0.18, "triangle", 0.14); setTimeout(() => tone(330, 0.18, "triangle", 0.14), 140); setTimeout(() => tone(392, 0.3, "triangle", 0.13), 300); },
  coin()     { tone(880, 0.06, "square", 0.05); setTimeout(() => tone(1245, 0.09, "square", 0.045), 60); },
};

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
  app.phraseIndex = 0;
  app.message = "";
  app.messageTimer = 0;
  app.shakeTimer = 0;
  app.screen = "playing";
  setupLevel();
  announce("Level 1: hold the line", 2.2);
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
  return sortedTargets()[0] ?? null;
}

function pendingArrowsFor(enemy) {
  return app.arrows.filter((arrow) => arrow.hits.includes(enemy));
}

// replay the shafts already in the air against a ghost copy — if they will
// finish this foe on their own, fresh shots should pick another mark
function isDoomed(enemy) {
  const pending = pendingArrowsFor(enemy);
  if (!pending.length) return false;
  const ghost = {
    ...enemy,
    statuses: {
      burning: { ...enemy.statuses.burning },
      poison: { ...enemy.statuses.poison },
      slow: { ...enemy.statuses.slow },
    },
  };
  for (const arrow of pending) applyArrowHit(ghost, arrow.arrowId, { weaponDamage: arrow.weaponDamage });
  return !ghost.alive;
}

function sortedTargets() {
  // nearest first; foes already doomed by in-flight arrows fall to the back
  const rank = new Map(livingEnemies().map((enemy) => [enemy, isDoomed(enemy) ? 1 : 0]));
  return [...rank.keys()].sort((a, b) => rank.get(a) - rank.get(b) || a.x - b.x);
}

function selectArrow(arrowId) {
  const tier = getLevelTier(app.model.level);
  if (!getUnlockedArrowIds(tier).includes(arrowId)) {
    announce("That arrow is not unlocked yet", 1.3);
    app.shakeTimer = 0.25;
    sfx.error();
    return;
  }
  app.model.activeArrowId = arrowId;
}

function fireArrow() {
  if (app.wordInput !== app.combatWord) {
    app.shakeTimer = 0.25;
    announce("Finish the combat word first", 1.1);
    sfx.error();
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
    sfx.error();
    return;
  }
  if (arrowId !== "normal") app.model.arrowCharge -= 1;

  const weaponDamage = getWeaponDamage(app.model.longbowmanTier);
  let hitTargets;
  if (arrowId === "piercing") {
    hitTargets = targets.slice(0, Math.min(3, targets.length));
  } else if (arrowId === "explosive") {
    // area damage around the impact, per the spreadsheet's splashRadius
    const radius = getArrowType("explosive").splashRadius;
    hitTargets = targets.filter((enemy) => Math.abs(enemy.x - primary.x) <= radius);
  } else {
    hitTargets = [primary];
  }
  // loose the shaft now — the blow lands only when it does (resolveArrowImpact)
  launchArrow(primary, hitTargets, arrowId, weaponDamage);

  if (app.model.completedPhrases > 0 && app.model.completedPhrases % 2 === 0) {
    const bonus = sortedTargets().find((enemy) => !hitTargets.includes(enemy));
    if (bonus) launchArrow(bonus, [bonus], "normal", weaponDamage);
  }

  sfx.shoot();
  nextCombatWord();
}

// build a ballistic shaft: fixed gravity, launch velocity solved so it lands on
// the mark after flightTime. it carries its victims and its damage; nothing is
// dealt until the arrow actually arrives.
function launchArrow(aimEnemy, hits, arrowId, weaponDamage) {
  const launchX = 128, launchY = 500;
  const slow = aimEnemy.statuses.slow.active ? aimEnemy.statuses.slow.multiplier : 1;
  const targetY = GROUND - 58 + aimEnemy.laneOffset;
  const flightTime = Math.min(1.9, 0.95 + Math.abs(aimEnemy.x - launchX) / 700);
  // lead the mark so the shaft falls where the foe will be, not where it was
  const leadX = aimEnemy.x > STOP_X ? aimEnemy.x - aimEnemy.speed * slow * flightTime : aimEnemy.x;
  const targetX = Math.max(STOP_X - 6, leadX);
  app.arrows.push({
    x0: launchX, y0: launchY, x: launchX, y: launchY,
    vx: (targetX - launchX) / flightTime,
    vy: (targetY - launchY - 0.5 * ARROW_GRAVITY * flightTime * flightTime) / flightTime,
    t: 0, T: flightTime,
    hits, arrowId, weaponDamage,
  });
}

function resolveArrowImpact(arrow) {
  for (const enemy of arrow.hits) {
    if (!enemy.alive || enemy.dyingTimer > 0) continue;
    const result = applyArrowHit(enemy, arrow.arrowId, { weaponDamage: arrow.weaponDamage });
    if (result.armorHit) { addBurst(enemy.x, GROUND - 62, "#cfd6df", 8); sfx.hitArmor(); }
    else if (result.hpDamage > 0) addBurst(enemy.x, GROUND - 56, ARROW_TINTS[arrow.arrowId] ?? "#b03a2e", 6);
    if (!enemy.alive) defeatEnemy(enemy);
  }
  if (arrow.arrowId === "explosive") addBurst(arrow.x, GROUND - 52, "#c98a3a", 18);
}

function defeatEnemy(enemy) {
  if (enemy.dyingTimer > 0) return;
  enemy.alive = false;
  enemy.dyingTimer = 0.45;
  app.model.gold += enemy.rewardGold;
  app.defeatedThisLevel += 1;
  addBurst(enemy.x, GROUND - 50, "#b03a2e", enemy.id === "boss" ? 26 : 14);
  sfx.kill();
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
    sfx.levelUp();
    return;
  }
  app.screen = "shop";
  announce(`Level ${app.model.level} cleared: +${clearBonus + bossBonus} gold`, 3);
  sfx.horn();
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
    const previewName = upgradeId === "repair" ? "Barricade repaired" : "Upgrade purchased";
    announce(previewName, 1.4);
    sfx.coin();
  } else {
    if (upgradeId === "repair" && app.model.towerHp >= app.model.towerMaxHp) announce("The barricade is already whole", 1.2);
    else announce("Not enough resources", 1.2);
    app.shakeTimer = 0.25;
    sfx.error();
  }
}

function typeCharacter(char) {
  if (app.model.mode === "combat") {
    if (app.wordInput.length >= app.combatWord.length + 3) return;
    app.wordInput += char;
    app.model.combatInput = app.wordInput;
    if (!app.combatWord.startsWith(app.wordInput)) { app.shakeTimer = 0.12; sfx.badType(); }
    else sfx.type();
    return;
  }
  const before = app.model.trainingPoints;
  const expected = app.model.enrichmentPhrase[app.model.enrichmentInput.length];
  const lenBefore = app.model.enrichmentInput.length;
  app.model.typeChar(char);
  if (app.model.trainingPoints > before) {
    announce(`Training complete: +${app.model.trainingPoints - before} TP`, 1.6);
    app.model.arrowCharge += 1;
    nextEnrichmentPhrase();
    sfx.coin();
    return;
  }
  if (app.model.enrichmentInput.length === lenBefore || char !== expected) sfx.badType();
  else sfx.type();
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

  for (const arrow of app.arrows) {
    arrow.t += dt;
    arrow.x = arrow.x0 + arrow.vx * arrow.t;
    arrow.y = arrow.y0 + arrow.vy * arrow.t + 0.5 * ARROW_GRAVITY * arrow.t * arrow.t;
    if (arrow.t >= arrow.T) { resolveArrowImpact(arrow); arrow.landed = true; }
  }
  app.arrows = app.arrows.filter((arrow) => !arrow.landed);

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
        addBurst(STOP_X - 8, GROUND - 52, "#8d8677", 8);
        app.shakeTimer = Math.max(app.shakeTimer, 0.18);
        sfx.knock();
        if (app.model.towerHp <= 0) app.screen = "gameover";
      }
    }
  }
  app.enemies = app.enemies.filter((enemy) => enemy.alive || enemy.dyingTimer > 0);
  completeLevelIfReady();
}

/* ============================================================
   Drawing — an illuminated page from a campaign chronicle
   ============================================================ */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// deterministic foxing/age spots so the vellum doesn't shimmer
const FOX = [];
(function () {
  let s = 1337;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 40; i++) FOX.push({ x: rnd() * W, y: rnd() * H, r: 6 + rnd() * 26, a: 0.03 + rnd() * 0.05 });
})();

function drawBackground() {
  // vellum ground tone across the whole leaf
  const page = ctx.createLinearGradient(0, 0, 0, H);
  page.addColorStop(0, "#f2e8cc");
  page.addColorStop(0.55, "#ece0bf");
  page.addColorStop(1, "#e3d4ac");
  ctx.fillStyle = page;
  ctx.fillRect(0, 0, W, H);

  // foxing — faint age spots in warm umber
  for (const f of FOX) {
    ctx.fillStyle = "rgba(120,86,40," + f.a + ")";
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
  }

  // gold-leaf sun, ink-ringed, with radiating rays (heraldic "sun in splendour")
  const sx = 886, sy = 90;
  ctx.save();
  ctx.strokeStyle = "rgba(150,110,30,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * 34, sy + Math.sin(a) * 34);
    ctx.lineTo(sx + Math.cos(a) * (i % 2 ? 48 : 42), sy + Math.sin(a) * (i % 2 ? 48 : 42));
    ctx.stroke();
  }
  const gl = ctx.createRadialGradient(sx - 8, sy - 8, 4, sx, sy, 28);
  gl.addColorStop(0, GILT_HI); gl.addColorStop(0.7, GILT); gl.addColorStop(1, GILT_DK);
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.arc(sx, sy, 28, 0, 7); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(sx, sy, 28, 0, 7); ctx.stroke();
  ctx.restore();

  // scrollwork clouds — thin ink outline, cream fill, drifting
  const t = performance.now() / 1000;
  for (let i = 0; i < 3; i++) {
    const cx = ((t * (7 + i * 3) + i * 380) % (W + 240)) - 120;
    const cy = 200 + i * 34;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 44, 13, 0, 0, 7);
    ctx.ellipse(cx + 30, cy - 8, 28, 11, 0, 0, 7);
    ctx.ellipse(cx - 28, cy - 5, 24, 9, 0, 0, 7);
    ctx.fillStyle = "rgba(250,244,226,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,92,50,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ink-outlined rolling hills in verdigris pigment
  function hill(cy, ry, fill, dark) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(W * 0.28, cy, 430, ry, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.8, cy + 12, 470, ry + 18, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(W * 0.28, cy, 430, ry, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(W * 0.8, cy + 12, 470, ry + 18, 0, Math.PI, 0); ctx.stroke();
  }
  hill(GROUND + 26, 88, "#8ba36f", "rgba(60,74,44,0.55)");
  hill(GROUND + 40, 108, "#6f8a56", "rgba(52,64,38,0.6)");

  // ground band — warm sward with an ink horizon rule and hatch tufts
  ctx.fillStyle = "#7d9457";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
  ctx.strokeStyle = "rgba(48,60,34,0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 38; i++) {
    const gx = (i * 137 + 40) % W, gy = GROUND + 16 + (i * 53) % 40;
    ctx.beginPath();
    ctx.moveTo(gx, gy); ctx.lineTo(gx - 3, gy - 8);
    ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 10);
    ctx.moveTo(gx, gy); ctx.lineTo(gx + 3, gy - 8);
    ctx.stroke();
  }

  drawCamps();
}

// a tall heraldic standard: pole + big waving flag (St George or France)
function drawStandard(px, kind) {
  const g = GROUND, poleTop = g - 250;
  ctx.strokeStyle = "#4a4038"; ctx.lineWidth = 4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(px, g); ctx.lineTo(px, poleTop); ctx.stroke();
  ctx.fillStyle = "#d8c98f";
  ctx.beginPath(); ctx.arc(px, poleTop - 2, 3.6, 0, 7); ctx.fill();
  const fw = 62, fh = 42, w = Math.sin(performance.now() / 340 + (kind === "france" ? 2 : 0)) * 2.8;
  const quad = () => {
    ctx.beginPath();
    ctx.moveTo(px, poleTop); ctx.lineTo(px + fw, poleTop + w);
    ctx.lineTo(px + fw, poleTop + fh + w); ctx.lineTo(px, poleTop + fh);
    ctx.closePath();
  };
  ctx.save(); quad();
  ctx.fillStyle = kind === "france" ? "#2b4a9b" : "#f4f1e8"; ctx.fill(); ctx.clip();
  if (kind === "france") {
    fleurDeLis(px + 18, poleTop + 14 + w / 2, 7, "#e8c33a");
    fleurDeLis(px + 44, poleTop + 14 + w / 2, 7, "#e8c33a");
    fleurDeLis(px + 31, poleTop + 32 + w / 2, 7, "#e8c33a");
  } else {
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(px, poleTop + fh / 2 - 4 + w / 2, fw, 8);
    ctx.fillRect(px + fw / 2 - 4, poleTop - 2, 8, fh + 4);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(70,60,45,0.55)"; ctx.lineWidth = 1;
  quad(); ctx.stroke();
}

// two facing encampments — English colours on the left, French on the right
function drawCamps() {
  const g = GROUND;
  function tent(cx, hw, ht, body, trim) {
    ctx.fillStyle = body; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - hw, g); ctx.lineTo(cx, g - ht); ctx.lineTo(cx + hw, g); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(40,30,18,0.5)";
    ctx.beginPath(); ctx.moveTo(cx - 4, g); ctx.lineTo(cx, g - ht * 0.5); ctx.lineTo(cx + 4, g); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#5a5245"; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx, g - ht); ctx.lineTo(cx, g - ht - 11); ctx.stroke();
    const w = Math.sin(performance.now() / 330 + cx) * 2;
    ctx.fillStyle = trim;
    ctx.beginPath(); ctx.moveTo(cx, g - ht - 11); ctx.lineTo(cx + 11, g - ht - 8 + w); ctx.lineTo(cx, g - ht - 5); ctx.closePath(); ctx.fill();
  }
  tent(24, 19, 40, "#efe7d0", "#c8102e");
  tent(70, 14, 30, "#e7dcc0", "#c8102e");
  tent(W - 26, 19, 40, "#c3cdea", "#e8c33a");
  tent(W - 72, 14, 30, "#b4c0e0", "#e8c33a");
  drawStandard(16, "stgeorge");
}

function fleurDeLis(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.15, x, y + s * 0.5);
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.15, x, y - s);
  ctx.fill();
  ctx.beginPath(); ctx.arc(x - s * 0.55, y - s * 0.1, s * 0.3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.55, y - s * 0.1, s * 0.3, 0, 7); ctx.fill();
  ctx.fillRect(x - s * 0.6, y + s * 0.18, s * 1.2, s * 0.26);
  ctx.fillRect(x - s * 0.14, y + s * 0.5, s * 0.28, s * 0.42);
}

// the French host's great banner, flying over their camp on the right
function drawEnemyBanner() {
  drawStandard(W - 92, "france");
}

// Reskinned: the defended structure is now a cheval de frise — an anti-cavalry
// barricade of crossed sharpened stakes planted on the ground. HP, level,
// shield, damage-reduction, and repair mechanics are unchanged; this only
// redraws what the tower used to be. (Internal names stay "tower*".)
function drawTower() {
  const hpFrac = Math.max(0, app.model.towerHp / app.model.towerMaxHp);
  const groundY = GROUND;
  const bx0 = 116, bx1 = 204;           // barricade footprint along the line
  const unitCount = 4;
  const unitW = (bx1 - bx0) / unitCount;
  const s = 12;                         // half-spread of each X at its base
  const h = 60;                         // stake height (tips reach groundY - h)
  const railY = groundY - 30;           // where the stakes cross and the rail binds
  const brokenCount = hpFrac < 0.33 ? 2 : hpFrac < 0.66 ? 1 : 0;
  const standingUnits = unitCount - brokenCount;
  const standingRight = bx0 + standingUnits * unitW;

  // binding rail behind the stakes, spanning only the still-standing units
  ctx.fillStyle = "#6b4a2a";
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 1.4;
  rr(bx0 - 6, railY - 4, (standingRight - bx0) + 12, 8, 3); ctx.fill(); ctx.stroke();

  // the crossed sharpened stakes; broken ones are knocked toward the foe
  for (let i = 0; i < unitCount; i++) {
    const cx = bx0 + unitW * (i + 0.5);
    const broken = i >= standingUnits;
    ctx.save();
    ctx.translate(cx, groundY);
    if (broken) ctx.rotate(0.85);
    ctx.fillStyle = "#7a4a22";
    ctx.strokeStyle = "#4a3018";
    ctx.lineWidth = 0.8;
    // stake leaning right: base at (-s,0) up to a sharp tip at (s,-h)
    ctx.beginPath();
    ctx.moveTo(-s - 2.5, 0); ctx.lineTo(-s + 2.5, 0); ctx.lineTo(s, -h); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // stake leaning left: base at (s,0) up to a sharp tip at (-s,-h)
    ctx.beginPath();
    ctx.moveTo(s - 2.5, 0); ctx.lineTo(s + 2.5, 0); ctx.lineTo(-s, -h); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // lashings where each standing X crosses the rail
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 2;
  for (let i = 0; i < standingUnits; i++) {
    const cx = bx0 + unitW * (i + 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - 5, railY - 3); ctx.lineTo(cx + 5, railY + 3);
    ctx.moveTo(cx + 5, railY - 3); ctx.lineTo(cx - 5, railY + 3);
    ctx.stroke();
  }

  // splinters scattered on the ground where stakes have been shattered
  if (brokenCount > 0) {
    ctx.strokeStyle = "rgba(74,48,24,0.8)";
    ctx.lineWidth = 2;
    for (let k = 0; k < brokenCount * 3; k++) {
      const sxp = standingRight + 6 + k * 7;
      ctx.beginPath(); ctx.moveTo(sxp, groundY - 2); ctx.lineTo(sxp + 8, groundY - 5 - (k % 2) * 4); ctx.stroke();
    }
  }

  // barricade HP bar + rubricated name, above the stakes
  const bw = (bx1 - bx0) + 24, bx = bx0 - 12, by = groundY - h - 44;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rr(bx, by, bw, 12, 6); ctx.fill();
  ctx.fillStyle = hpFrac > 0.5 ? "#5cab5c" : hpFrac > 0.25 ? "#d9a441" : "#c0503f";
  if (hpFrac > 0) { rr(bx + 1.5, by + 1.5, Math.max(4, (bw - 3) * hpFrac), 9, 4.5); ctx.fill(); }
  ctx.fillStyle = "#2e2a22";
  ctx.font = "bold 11px " + BODY;
  ctx.textAlign = "left";
  ctx.fillText("BARRICADE  " + app.model.towerHp + " / " + app.model.towerMaxHp, bx + 2, by - 4);
  ctx.textAlign = "center";
  ctx.font = "italic 13px " + BODY;
  ctx.fillStyle = "rgba(94,58,20,0.85)";
  ctx.fillText(TOWER_LEVELS[app.model.towerLevel - 1].name, bx0 + (bx1 - bx0) / 2, by + 26);
}

function drawArcher() {
  const x = 98;
  const y = 486;
  const g = GROUND;
  const target = closestEnemy();
  const ready = app.screen === "playing" && app.model.mode === "combat" && app.wordInput === app.combatWord && app.combatWord.length > 0;
  const ang = target ? Math.max(-0.5, Math.min(0.45, Math.atan2(y + 40 - (g - 40), target.x - x) * -1)) : 0.32;

  ctx.lineCap = "round";

  // a sheaf of arrows planted point-down in the turf beside him
  for (let i = 0; i < 3; i += 1) {
    const axp = x - 22 + i * 6;
    ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(axp, g - 1); ctx.lineTo(axp - 3, g - 30); ctx.stroke();
    ctx.strokeStyle = "#d8d2c4"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(axp - 3, g - 30); ctx.lineTo(axp - 6, g - 36); ctx.stroke();
  }

  // legs — padded hose with some volume, planted stance
  ctx.strokeStyle = "#5f4d30"; ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 42); ctx.lineTo(x - 7, y + 72);
  ctx.moveTo(x + 3, y + 42); ctx.lineTo(x + 9, y + 72);
  ctx.stroke();
  ctx.fillStyle = "#3a2c1a";
  ctx.beginPath(); ctx.ellipse(x - 8, y + 73, 5, 3, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 10, y + 73, 5, 3, 0, 0, 7); ctx.fill();

  // padded jack / jupon in white St George livery
  ctx.fillStyle = "#f2eddd"; ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 11, y + 6); ctx.lineTo(x + 11, y + 6);
  ctx.lineTo(x + 9, y + 43); ctx.lineTo(x - 9, y + 43);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "rgba(120,105,80,0.45)"; ctx.lineWidth = 0.8;
  for (let qx = -6; qx <= 6; qx += 4) { ctx.beginPath(); ctx.moveTo(x + qx, y + 8); ctx.lineTo(x + qx, y + 42); ctx.stroke(); }
  ctx.fillStyle = "#c8102e";
  ctx.fillRect(x - 2, y + 6, 4, 37);
  ctx.fillRect(x - 11, y + 20, 22, 4);
  ctx.strokeStyle = "#4a3320"; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(x - 10, y + 41); ctx.lineTo(x + 10, y + 41); ctx.stroke();

  // face under a broad-brimmed kettle helmet
  ctx.fillStyle = "#e0b48e";
  ctx.beginPath(); ctx.arc(x + 1, y - 4, 6.5, 0, 7); ctx.fill();
  ctx.fillStyle = "#aab0b8"; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x + 1, y - 6, 8, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c2c7cf";
  ctx.beginPath(); ctx.ellipse(x + 1, y - 6, 13, 3.4, 0, 0, 7); ctx.fill(); ctx.stroke();

  // front (bow) arm reaching to the grip
  const bx = x + 15, by = y + 16;
  const pull = ready ? -12 : 0;
  ctx.strokeStyle = "#e6e0cf"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x + 6, y + 10); ctx.lineTo(bx, by); ctx.stroke();

  // the great warbow — a tall D-stave, taller than the man, tinted by the arrow
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(-ang);
  const R = 36;
  ctx.strokeStyle = app.model.activeArrowId === "normal" ? "#7a4a22" : ARROW_TINTS[app.model.activeArrowId] ?? "#7a4a22";
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2.05, Math.PI / 2.05); ctx.stroke();
  const tipX = R * Math.cos(Math.PI / 2.05), tipY = R * Math.sin(Math.PI / 2.05);
  ctx.strokeStyle = "#efe9dc"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tipX, -tipY); ctx.lineTo(pull, 0); ctx.lineTo(tipX, tipY); ctx.stroke();
  if (ready) {
    ctx.strokeStyle = "#5b4325"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(32, 0); ctx.stroke();
    ctx.fillStyle = "#c9cdd4";
    ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(26, -3); ctx.lineTo(26, 3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // rear (draw) arm — hauled back to the cheek at full draw
  ctx.strokeStyle = "#e6e0cf"; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 10);
  if (ready) ctx.lineTo(x - 2, y + 2);
  else ctx.lineTo(x - 9, y + 24);
  ctx.stroke();
}

// shared figure so the field and the start-screen legend match
function drawEnemyFigure(enemy, knockLunge) {
  const pig = ENEMY_PIGMENTS[enemy.id] ?? { body: "#8b8272", trim: "#4c443a" };
  const swing = knockLunge > 0 ? 0 : Math.sin(enemy.phase) * 0.55;

  ctx.strokeStyle = "#2f2a24";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  // legs
  ctx.beginPath();
  ctx.moveTo(0, -16); ctx.lineTo(Math.sin(swing) * 7, 0);
  ctx.moveTo(0, -16); ctx.lineTo(-Math.sin(swing) * 7, 0);
  ctx.stroke();
  // body
  ctx.fillStyle = pig.body;
  ctx.strokeStyle = pig.trim;
  ctx.lineWidth = 1.6;
  rr(-8, -38, 16, 23, 4); ctx.fill(); ctx.stroke();
  // chain mail speckle for the armored
  if (enemy.id === "chainmailGuard" || enemy.id === "fireResistantKnight") {
    ctx.fillStyle = "rgba(70,78,88,0.5)";
    for (let yy = -35; yy < -18; yy += 4)
      for (let xx = -6; xx < 8; xx += 4) { ctx.beginPath(); ctx.arc(xx, yy, 1, 0, 7); ctx.fill(); }
  }
  // head + helmet
  ctx.fillStyle = "#e0b48e";
  ctx.beginPath(); ctx.arc(0, -44, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = pig.trim;
  ctx.beginPath(); ctx.arc(0, -45, 6, Math.PI, 0); ctx.fill();
  if (enemy.maxArmor > 0) ctx.fillRect(-6, -45, 12, 3); // face guard for the armored

  // sword arm (raised while knocking at the wall)
  ctx.strokeStyle = "#2f2a24";
  ctx.lineWidth = 2.6;
  const armAng = knockLunge > 0 ? -1.9 + knockLunge * 0.9 : -0.5 + Math.sin(enemy.phase) * 0.2;
  const ax = -8 + Math.cos(Math.PI + armAng) * -10, ay = -33 + Math.sin(Math.PI + armAng) * -10;
  ctx.beginPath(); ctx.moveTo(-6, -33); ctx.lineTo(ax, ay); ctx.stroke();
  ctx.strokeStyle = "#aeb4bd";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 9, ay - 7); ctx.stroke();

  // heater shield charged with a gold fleur-de-lis; the shield bearer's is greater
  const big = enemy.id === "shieldBearer";
  const sx = 1, sw = big ? 13 : 10, sh = big ? 20 : 15.5, sy = big ? -37 : -35;
  ctx.fillStyle = "#2b4a9b";
  ctx.strokeStyle = "#1d3468";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy); ctx.lineTo(sx + sw, sy + sh * 0.52);
  ctx.quadraticCurveTo(sx + sw, sy + sh * 0.86, sx + sw / 2, sy + sh);
  ctx.quadraticCurveTo(sx, sy + sh * 0.86, sx, sy + sh * 0.52);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  fleurDeLis(sx + sw / 2, sy + sh * 0.42, big ? 5.4 : 4.4, "#e8c33a");

  // the banner captain flies his own pennon
  if (enemy.id === "bannerCaptain") {
    ctx.strokeStyle = "#5a5245";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(-10, -62); ctx.stroke();
    ctx.fillStyle = pig.body;
    ctx.beginPath(); ctx.moveTo(-10, -62); ctx.lineTo(-30, -57); ctx.lineTo(-10, -52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = pig.trim; ctx.lineWidth = 1; ctx.stroke();
  }
  // the siege enemy shoulders a ram
  if (enemy.id === "siegeEnemy") {
    ctx.strokeStyle = "#6b4a2a";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(16, -26); ctx.stroke();
    ctx.strokeStyle = "#4a3018";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(16, -26); ctx.stroke();
  }
  // champion's gold plume
  if (enemy.id === "boss") {
    ctx.strokeStyle = "#c8a23a";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -51); ctx.quadraticCurveTo(7, -59, 13, -54); ctx.stroke();
  }
}

function drawEnemy(enemy) {
  // 1.4x base so the French host stands eye-to-eye with the English bowman
  const scale = (enemy.id === "boss" ? 1.55 : enemy.id === "brute" ? 1.2 : enemy.id === "swarm" ? 0.85 : 1) * 1.4;
  ctx.save();
  const knocking = enemy.dyingTimer <= 0 && enemy.alive && enemy.x <= STOP_X;
  const knockLunge = knocking ? Math.abs(Math.sin(enemy.attackTimer / 1.2 * Math.PI)) : 0;
  ctx.translate(enemy.x - knockLunge * 7, GROUND + enemy.laneOffset * 0.4);

  if (enemy.dyingTimer > 0) {
    const k = 1 - enemy.dyingTimer / 0.45;
    ctx.globalAlpha = Math.max(0, 1 - k * 1.15);
    ctx.rotate(k * 1.5); // topple backward
  }
  ctx.scale(scale, scale);
  drawEnemyFigure(enemy, knockLunge);

  if (enemy.dyingTimer <= 0 && enemy.id !== "boss") {
    // HP pips in dried vermilion; a thin bar for the great-of-heart
    if (enemy.maxHp <= 6) {
      for (let i = 0; i < enemy.maxHp; i++) {
        ctx.fillStyle = i < Math.ceil(enemy.hp) ? "#c0392b" : "rgba(0,0,0,0.25)";
        ctx.fillRect(-enemy.maxHp * 3.5 + i * 7, -60, 5, 5);
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(-16, -60, 32, 5);
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(-16, -60, 32 * Math.max(0, enemy.hp / enemy.maxHp), 5);
    }
    // armor pips as steel lozenges
    for (let i = 0; i < enemy.maxArmor; i += 1) {
      ctx.save();
      ctx.translate(-enemy.maxArmor * 4 + i * 8 + 3, -66);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = i < enemy.armor ? "#aab6c4" : "rgba(0,0,0,0.18)";
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
      ctx.strokeStyle = "rgba(47,42,36,0.6)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-2.6, -2.6, 5.2, 5.2);
      ctx.restore();
    }
  }
  // status marks — a lick of flame, a rime of frost
  if (enemy.statuses.burning.active) {
    ctx.fillStyle = VERMILION;
    ctx.beginPath();
    ctx.moveTo(0, -80); ctx.quadraticCurveTo(5, -72, 0, -66); ctx.quadraticCurveTo(-5, -72, 0, -80);
    ctx.fill();
    ctx.fillStyle = "#e8c33a";
    ctx.beginPath(); ctx.arc(0, -70, 2, 0, 7); ctx.fill();
  }
  if (enemy.statuses.slow.active) {
    ctx.strokeStyle = "#4a7f9b";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(-12 - Math.cos(a) * 4, -30 - Math.sin(a) * 4);
      ctx.lineTo(-12 + Math.cos(a) * 4, -30 + Math.sin(a) * 4);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawArrows() {
  for (const arrow of app.arrows) {
    // pitch the shaft along its real velocity: nose up while climbing, level
    // at the apex, then steeply down as gravity pulls it onto the target
    const vyNow = arrow.vy + ARROW_GRAVITY * arrow.t;
    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(Math.atan2(vyNow, arrow.vx));
    ctx.strokeStyle = ARROW_TINTS[arrow.arrowId] ?? "#5b4325";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(2, 0); ctx.stroke();
    ctx.fillStyle = "#c9cdd4";
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-1, -2.8); ctx.lineTo(-1, 2.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8e0d0";
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-11, -3); ctx.lineTo(-8, 0); ctx.lineTo(-11, 3); ctx.closePath(); ctx.fill();
    if (arrow.arrowId === "fire") {
      ctx.fillStyle = "rgba(163,48,29,0.8)";
      ctx.beginPath(); ctx.arc(3, 0, 3, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

// letters colored by typing state, with caret and overtype tail
function drawTypedText(target, typed, cx, y, opts) {
  const { active, font, caret } = opts;
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const chars = [...target];
  const widths = chars.map((char) => ctx.measureText(char).width + 3);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let x = cx - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    if (i < typed.length) ctx.fillStyle = typed[i] === chars[i] ? "#2e7d32" : "#c0392b";
    else ctx.fillStyle = active ? "#3d3629" : "rgba(61,54,41,0.45)";
    ctx.fillText(chars[i], x, y);
    if (caret && active && i === typed.length) {
      ctx.fillStyle = "rgba(61,54,41,0.75)";
      ctx.fillRect(x - 1, y + 14, widths[i] - 3, 2.6);
    }
    x += widths[i];
  }
  const extra = typed.slice(chars.length);
  if (extra) {
    ctx.fillStyle = "#c0392b";
    ctx.font = font.replace(/\d+px/, (m) => Math.round(parseInt(m) * 0.62) + "px");
    ctx.fillText(extra, x + 4, y + 2);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
}

// parchment cartouche with ink rule and gilt inner border
function cartouche(x, y, w, h, active, glow) {
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.62;
  ctx.fillStyle = "rgba(244,235,210,0.96)";
  if (glow) { ctx.shadowColor = "rgba(201,162,39,0.85)"; ctx.shadowBlur = 16; }
  rr(x, y, w, h, 8); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  rr(x, y, w, h, 8); ctx.stroke();
  ctx.strokeStyle = glow ? giltFill(x, y, x + w, y + h) : "rgba(140,110,50,0.7)";
  ctx.lineWidth = glow ? 3 : 1.6;
  rr(x + 5, y + 5, w - 10, h - 10, 5); ctx.stroke();
  ctx.restore();
}

function drawPanels() {
  const mode = app.model.mode;
  const jitter = app.shakeTimer > 0 ? Math.sin(app.shakeTimer * 60) * 5 : 0;
  const cx = W / 2 + jitter;
  const combatReady = app.wordInput === app.combatWord && app.combatWord.length > 0;

  // combat cartouche
  ctx.font = "bold 38px " + BODY;
  const wordW = Math.max(280, [...app.combatWord].reduce((s, ch) => s + ctx.measureText(ch).width + 3, 0) + 90);
  cartouche(cx - wordW / 2, 22, wordW, 62, mode === "combat", mode === "combat" && combatReady);
  drawTypedText(app.combatWord, app.wordInput, cx, 54, { active: mode === "combat", font: "bold 38px " + BODY, caret: !combatReady });

  // enrichment cartouche
  ctx.font = "600 21px " + BODY;
  const phraseW = Math.max(360, [...app.model.enrichmentPhrase].reduce((s, ch) => s + ctx.measureText(ch).width + 3, 0) + 80);
  cartouche(W / 2 - phraseW / 2, 96, phraseW, 46, mode === "enrichment", false);
  drawTypedText(app.model.enrichmentPhrase, app.model.enrichmentInput, W / 2, 119, { active: mode === "enrichment", font: "600 21px " + BODY, caret: true });
  const phraseEntry = ENRICHMENT_PHRASES.find((entry) => entry.phrase === app.model.enrichmentPhrase);
  if (phraseEntry) {
    ctx.font = "italic 12px " + BODY;
    ctx.fillStyle = "rgba(122,92,20,0.9)";
    ctx.textAlign = "left";
    ctx.fillText("+" + phraseEntry.reward + " TP", W / 2 + phraseW / 2 + 8, 121);
    ctx.textAlign = "center";
  }

  // guidance line, in the scribe's italic hand
  ctx.font = "italic 15px " + BODY;
  if (mode === "combat" && combatReady) {
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
    ctx.fillStyle = "rgba(140,100,20," + pulse.toFixed(2) + ")";
    ctx.fillText("press SPACE to loose the arrow", cx, 162);
  } else if (mode === "combat") {
    ctx.fillStyle = "rgba(70,60,45,0.75)";
    ctx.fillText("type the combat word · TAB to train for Training Points", cx, 162);
  } else {
    ctx.fillStyle = "rgba(70,60,45,0.75)";
    ctx.fillText("the foe still marches — TAB returns to the fight · progress is kept", W / 2, 162);
  }
}

function drawHUD() {
  const tier = getLevelTier(app.model.level);
  ctx.textAlign = "right";
  ctx.fillStyle = "#2e2a22";
  ctx.font = "bold 18px " + BODY;
  ctx.fillText("Level " + app.model.level + " / 100 · Tier " + tier, W - 32, 44);
  ctx.fillStyle = "#7a5c14";
  ctx.font = "bold 16px " + BODY;
  ctx.fillText("Gold " + app.model.gold, W - 32, 66);
  ctx.fillStyle = "#2e6b3a";
  ctx.fillText("Training " + app.model.trainingPoints, W - 32, 86);
  ctx.fillStyle = "#2e2a22";
  ctx.font = "14px " + BODY;
  ctx.fillText("Arrow Charge " + app.model.arrowCharge, W - 32, 106);
  ctx.fillText("Foes " + app.defeatedThisLevel + " / " + app.levelQuota, W - 32, 124);

  // the quiver — arrow chips on the sward, gilt for the arrow in hand
  const unlockedIds = getUnlockedArrowIds(tier);
  const slots = ARROW_TYPES.filter((arrow) => /^[1-6]$/.test(arrow.key))
    .filter((arrow) => Number(arrow.key) <= 3 || unlockedIds.includes(arrow.id));
  let x = 24;
  const y = GROUND + 26;
  for (const arrow of slots) {
    const unlocked = unlockedIds.includes(arrow.id);
    const active = app.model.activeArrowId === arrow.id;
    ctx.save();
    ctx.globalAlpha = unlocked ? 1 : 0.45;
    ctx.fillStyle = active ? giltFill(x, y, x + 92, y + 30) : "rgba(244,235,210,0.92)";
    rr(x, y, 92, 30, 5); ctx.fill();
    ctx.strokeStyle = active ? INK : "rgba(42,28,14,0.65)";
    ctx.lineWidth = active ? 2 : 1.2;
    rr(x, y, 92, 30, 5); ctx.stroke();
    ctx.fillStyle = active ? "#2a1c0e" : unlocked ? "#3d3629" : "rgba(61,54,41,0.8)";
    ctx.font = (active ? "bold " : "") + "13px " + BODY;
    ctx.textAlign = "center";
    ctx.fillText(arrow.key + " · " + (unlocked ? arrow.name.split(" ")[0] : "Tier " + arrow.unlockTier), x + 46, y + 19);
    ctx.restore();
    x += 100;
  }
  // the bowman's weapon, noted beneath
  ctx.textAlign = "left";
  ctx.font = "italic 14px " + BODY;
  ctx.fillStyle = "rgba(46,42,34,0.8)";
  ctx.fillText(app.model.activeWeaponName + " · draw ×" + getWeaponDamage(app.model.longbowmanTier).toFixed(2).replace(/\.?0+$/, ""), 26, y + 52);

  ctx.font = "11px " + BODY;
  ctx.fillStyle = "rgba(46,42,34,0.55)";
  ctx.textAlign = "right";
  ctx.fillText("seed " + app.rngSeed, W - 14, H - 22);
  ctx.textAlign = "center";
}

function drawBossBar() {
  const b = app.enemies.find((enemy) => enemy.id === "boss" && enemy.alive && enemy.dyingTimer <= 0);
  if (!b) return;
  const bw = 320, bx = W / 2 - bw / 2, by = 196;
  ctx.textAlign = "center";
  ctx.font = "bold 15px " + BODY;
  ctx.fillStyle = "#7a1420";
  ctx.fillText(b.name, W / 2, by - 6);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  rr(bx, by, bw, 12, 6); ctx.fill();
  const frac = Math.max(0, b.hp / b.maxHp);
  ctx.fillStyle = "#a02030";
  if (frac > 0) { rr(bx + 1.5, by + 1.5, Math.max(4, (bw - 3) * frac), 9, 4.5); ctx.fill(); }
}

function drawMessage() {
  if (app.messageTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, app.messageTimer);
  ctx.fillStyle = "rgba(40,34,24,0.82)";
  ctx.font = "bold 24px " + BODY;
  ctx.textAlign = "center";
  const width = Math.max(280, ctx.measureText(app.message).width + 52);
  rr(W / 2 - width / 2, 224, width, 46, 10);
  ctx.fill();
  ctx.fillStyle = "#f3e9c9";
  ctx.fillText(app.message, W / 2, 255);
  ctx.restore();
}

function drawPageBorder() {
  // foxed-edge vignette so the leaf darkens toward its margins
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
  v.addColorStop(0, "rgba(60,40,16,0)");
  v.addColorStop(1, "rgba(44,28,10,0.30)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  // illuminated margin — ink rule / gilt band / hairline
  const m = 13;
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.strokeStyle = giltFill(0, 0, W, H); ctx.lineWidth = 4;
  ctx.strokeRect(m + 5, m + 5, W - 2 * m - 10, H - 2 * m - 10);
  ctx.strokeStyle = "rgba(42,28,14,0.7)"; ctx.lineWidth = 1;
  ctx.strokeRect(m + 9, m + 9, W - 2 * m - 18, H - 2 * m - 18);

  // gilt corner lozenges
  const cs = [[m + 5, m + 5], [W - m - 5, m + 5], [m + 5, H - m - 5], [W - m - 5, H - m - 5]];
  for (const c of cs) {
    ctx.save();
    ctx.translate(c[0], c[1]); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = giltFill(-7, -7, 7, 7);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    ctx.strokeRect(-6, -6, 12, 12);
    ctx.restore();
  }
}

function drawOverlay(title, lines, footer) {
  // dim the field, then lay a fresh vellum leaf over it
  ctx.fillStyle = "rgba(30,20,10,0.55)";
  ctx.fillRect(0, 0, W, H);
  const px = 60, py = 34, pw = W - 120, ph = H - 68;
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, PARCH_HI); pg.addColorStop(1, PARCH_DK);
  ctx.fillStyle = pg;
  rr(px, py, pw, ph, 6); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  rr(px, py, pw, ph, 6); ctx.stroke();
  ctx.strokeStyle = giltFill(px, py, px + pw, py + ph); ctx.lineWidth = 3;
  rr(px + 6, py + 6, pw - 12, ph - 12, 4); ctx.stroke();

  ctx.textAlign = "center";
  // blackletter title in gold leaf with an ink shadow
  ctx.font = "68px " + DISPLAY;
  ctx.fillStyle = "rgba(40,26,12,0.35)";
  ctx.fillText(title, W / 2 + 2, 136);
  ctx.fillStyle = giltFill(W / 2 - 220, 80, W / 2 + 220, 146);
  ctx.fillText(title, W / 2, 134);
  ctx.strokeStyle = "rgba(60,40,14,0.7)"; ctx.lineWidth = 1;
  ctx.strokeText(title, W / 2, 134);
  // gilt rule beneath the title
  ctx.strokeStyle = giltFill(W / 2 - 170, 0, W / 2 + 170, 0); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W / 2 - 170, 156); ctx.lineTo(W / 2 + 170, 156); ctx.stroke();

  ctx.fillStyle = "#3a2a16";
  ctx.font = "19px " + BODY;
  let y = 198;
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += 30; }

  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 300);
  ctx.fillStyle = "rgba(163,48,29," + pulse.toFixed(2) + ")";
  ctx.font = "bold 22px " + BODY;
  ctx.fillText(footer, W / 2, H - 74);
}

function drawLegend(y) {
  const entries = [
    { id: "grunt", note: "from Level 1" },
    { id: "runner", note: "from Level 11" },
    { id: "chainmailGuard", note: "from Level 21" },
    { id: "shieldBearer", note: "from Level 31" },
  ];
  ctx.font = "14px " + BODY;
  ctx.textAlign = "center";
  const spacing = 190;
  let x = W / 2 - spacing * 1.5;
  for (const entry of entries) {
    const type = ENEMY_TYPES.find((item) => item.id === entry.id);
    const dummy = { id: entry.id, phase: 0.8, maxArmor: type.armor, statuses: null };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.9, 0.9);
    drawEnemyFigure(dummy, 0);
    ctx.restore();
    ctx.fillStyle = "#33240f";
    ctx.fillText(type.name, x, y + 22);
    ctx.fillStyle = "rgba(70,52,26,0.7)";
    ctx.fillText(type.armor > 0 ? type.armor + " armor · " + entry.note : entry.note, x, y + 40);
    x += spacing;
  }
}

function shopRow(y, key, label, preview, note, pips, affordable, blockedNote) {
  const px = W / 2 - 330;
  ctx.textAlign = "left";
  // the ware's number, set as a rubric
  ctx.font = "bold 22px " + BODY;
  ctx.fillStyle = affordable ? "#7a1420" : "rgba(122,20,32,0.45)";
  ctx.fillText(key, px + 26, y);
  ctx.fillStyle = affordable ? "#3d3629" : "rgba(61,54,41,0.5)";
  ctx.fillText(label, px + 52, y);
  if (pips) {
    for (let i = 0; i < pips.max; i++) {
      ctx.fillStyle = i < pips.rank ? "#7a5c14" : "rgba(0,0,0,0.18)";
      ctx.beginPath(); ctx.arc(px + 268 + i * 13, y - 7, 4.2, 0, 7); ctx.fill();
    }
  }
  ctx.textAlign = "right";
  ctx.font = "bold 17px " + BODY;
  if (blockedNote) { ctx.fillStyle = "rgba(61,54,41,0.5)"; ctx.fillText(blockedNote, W / 2 + 300, y); }
  else if (!preview) { ctx.fillStyle = "rgba(61,54,41,0.5)"; ctx.fillText("MAX", W / 2 + 300, y); }
  else {
    const cost = preview.goldCost + "g" + (preview.trainingPointCost ? " + " + preview.trainingPointCost + " TP" : "");
    ctx.fillStyle = affordable ? "#7a5c14" : "#b03a2e";
    ctx.fillText(cost, W / 2 + 300, y);
  }
  ctx.textAlign = "left";
  ctx.font = "italic 12.5px " + BODY;
  ctx.fillStyle = "rgba(61,54,41,0.75)";
  ctx.fillText(note, px + 52, y + 17);
}

function drawShop() {
  drawBackground();
  drawEnemyBanner();
  drawTower();
  drawArcher();
  ctx.fillStyle = "rgba(30,20,10,0.6)";
  ctx.fillRect(0, 0, W, H);
  const px = W / 2 - 340, pw = 680, py = 46, ph = H - 100;
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, PARCH_HI); pg.addColorStop(1, PARCH_DK);
  ctx.fillStyle = pg;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  rr(px, py, pw, ph, 8); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = giltFill(px, py, px + pw, py + ph); ctx.lineWidth = 3;
  rr(px + 6, py + 6, pw - 12, ph - 12, 5); ctx.stroke();

  ctx.textAlign = "center";
  let y = py + 46;
  ctx.fillStyle = giltFill(W / 2 - 120, py + 12, W / 2 + 120, py + 52);
  ctx.font = "40px " + DISPLAY;
  ctx.fillText("The Armory", W / 2, y); y += 16;
  ctx.strokeStyle = giltFill(W / 2 - 90, 0, W / 2 + 90, 0); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(W / 2 - 90, y - 6); ctx.lineTo(W / 2 + 90, y - 6); ctx.stroke();
  ctx.font = "italic 14px " + BODY;
  ctx.fillStyle = "rgba(61,54,41,0.8)";
  ctx.fillText("Level " + app.model.level + " is cleared — spend the war chest before the next assault", W / 2, y + 14);
  y += 40;
  ctx.font = "bold 16px " + BODY;
  ctx.fillStyle = "#3d3629";
  ctx.fillText(
    "Gold " + app.model.gold + "   ·   Training " + app.model.trainingPoints +
    "   ·   Arrow Charge " + app.model.arrowCharge +
    "   ·   Barricade " + app.model.towerHp + " / " + app.model.towerMaxHp,
    W / 2, y);
  y += 44;

  const towerPreview = getUpgradePreview(app.model, "tower");
  const bowPreview = getUpgradePreview(app.model, "longbowman");
  shopRow(y, "1", "Barricade", towerPreview,
    towerPreview ? "raise " + towerPreview.nextName + " — sturdier stakes, repair, and damage ward" : "the line stands at its finest",
    { rank: app.model.towerLevel, max: TOWER_LEVELS.length },
    canAffordUpgrade(app.model, "tower"), null);
  y += 56;
  shopRow(y, "2", "Longbowman", bowPreview,
    bowPreview ? "take up the " + bowPreview.nextName + " — a heavier draw for every arrow" : "the Fire Musket has no equal",
    { rank: app.model.longbowmanTier, max: 6 },
    canAffordUpgrade(app.model, "longbowman"), null);
  y += 56;
  shopRow(y, "3", "Special Arrows", getUpgradePreview(app.model, "arrowCharge"),
    "+3 Arrow Charge for Fire and Piercing shafts",
    null, canAffordUpgrade(app.model, "arrowCharge"), null);
  y += 56;
  const wallsWhole = app.model.towerHp >= app.model.towerMaxHp;
  shopRow(y, "4", "Repair", getUpgradePreview(app.model, "repair"),
    wallsWhole ? "the barricade already stands whole" : "carpenters mend the stakes, +60 HP",
    null, canAffordUpgrade(app.model, "repair"), wallsWhole ? "line whole" : null);
  y += 48;

  // the foes massing for the next assault, so the player can plan purchases
  const nextLevel = app.model.level + 1;
  const nextIds = getLevelConfig(nextLevel).enemyIds;
  ctx.textAlign = "center";
  ctx.font = "italic 15px " + BODY;
  ctx.fillStyle = "rgba(122,20,32,0.85)";
  ctx.fillText("Next assault — foes sighted for Level " + nextLevel, W / 2, y + 6);
  const rowY = y + 84;
  const gap = Math.min(180, 520 / Math.max(1, nextIds.length));
  let ex = W / 2 - gap * (nextIds.length - 1) / 2;
  for (const id of nextIds) {
    const type = ENEMY_TYPES.find((t) => t.id === id);
    const dummy = { id, phase: 0.8, maxArmor: type.armor, statuses: null };
    ctx.save();
    ctx.translate(ex, rowY);
    drawEnemyFigure(dummy, 0);
    ctx.restore();
    ctx.fillStyle = "#33240f";
    ctx.font = "12px " + BODY;
    ctx.fillText(type.name, ex, rowY + 24);
    if (type.armor > 0) {
      ctx.fillStyle = "rgba(70,52,26,0.7)";
      ctx.fillText(type.armor + " armor", ex, rowY + 40);
    }
    ex += gap;
  }

  ctx.textAlign = "center";
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 300);
  ctx.fillStyle = "rgba(163,48,29," + pulse.toFixed(2) + ")";
  ctx.font = "bold 21px " + BODY;
  ctx.fillText("press ENTER to march to Level " + (app.model.level + 1), W / 2, py + ph - 30);
  drawMessage();
}

function draw() {
  if (app.screen === "shop") {
    drawShop();
    drawPageBorder();
    return;
  }
  if (app.screen === "start") {
    drawBackground();
    drawEnemyBanner();
    drawTower();
    drawArcher();
    drawOverlay("Longbow Training", [
      "Type the combat word — SPACE looses an arrow at the nearest foe.",
      "TAB turns to the training phrase: finish it for Training Points and Arrow Charge,",
      "but the enemy keeps marching while you study.",
      "1 Normal Arrow · 2 Fire Arrow burns through mail · 3 Piercing Arrow strikes three.",
      "Spend Gold and Training Points in the armory after every level.",
      "",
    ], "press ENTER to begin the campaign");
    drawLegend(430);
    drawPageBorder();
    return;
  }
  if (app.screen === "gameover") {
    drawBackground();
    drawTower();
    drawOverlay("The Line Has Fallen", [
      "The barricade was overrun at Level " + app.model.level + ".",
      "",
      "Gold " + app.model.gold + "   ·   Training Points " + app.model.trainingPoints,
      "The enemy kept moving while the training phrase waited.",
    ], "press ENTER to muster a new campaign");
    drawPageBorder();
    return;
  }
  if (app.screen === "victory") {
    drawBackground();
    drawTower();
    drawOverlay("The Line Holds", [
      "All one hundred levels are cleared.",
      "",
      "Final Gold " + app.model.gold + "   ·   Training Points " + app.model.trainingPoints,
      "Weapon: " + app.model.activeWeaponName + "   ·   Barricade: " + TOWER_LEVELS[app.model.towerLevel - 1].name,
    ], "press ENTER to start a new campaign");
    drawPageBorder();
    return;
  }

  ctx.save();
  if (app.shakeTimer > 0) ctx.translate(Math.sin(app.shakeTimer * 70) * 3, 0);
  drawBackground();
  drawEnemyBanner();
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
  drawBossBar();
  drawMessage();
  ctx.restore();
  drawPageBorder();
}

function handleShopKey(key) {
  if (key === "Enter") {
    nextLevel();
    return true;
  }
  if (key === "1") { buy("tower"); return true; }
  if (key === "2") { buy("longbowman"); return true; }
  if (key === "3") { buy("arrowCharge"); return true; }
  if (key === "4") { buy("repair"); return true; }
  return false;
}

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return; // leave browser shortcuts alone
  if (AC && AC.state === "suspended") AC.resume();

  if (app.screen === "start" || app.screen === "gameover" || app.screen === "victory") {
    if (event.key === "Enter") startCampaign();
    return;
  }
  if (app.screen === "shop") {
    if (handleShopKey(event.key)) event.preventDefault();
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
    name: enemy.name,
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
