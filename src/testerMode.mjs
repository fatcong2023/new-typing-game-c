import { ENEMY_TYPES, LEVEL_TIER_CONFIGS, getEnemyType, getLevelTier } from "./gameData.mjs";

// Keeps the tester tools out of a child's way; it is not real security, since
// anyone reading the page source can see it.
export const TESTER_PASSWORD = "32167";
const LEVELS_PER_TIER = 10;
const MAX_LEVEL = LEVEL_TIER_CONFIGS.length * LEVELS_PER_TIER;
const RESOURCE_GRANT = Object.freeze({ gold: 1000, trainingPoints: 10, arrowCharge: 10 });
const GRANT_LABEL = `+${RESOURCE_GRANT.gold} 金币 · +${RESOURCE_GRANT.trainingPoints} 训练点 · +${RESOURCE_GRANT.arrowCharge} 特殊箭`;
const UNLOCK_KEY = "longbowTesterUnlocked";
const SPEED_OPTIONS = [
  { value: 0, label: "暂停" },
  { value: 0.5, label: "0.5×" },
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
];

export function checkTesterPassword(input) {
  return String(input ?? "").trim() === TESTER_PASSWORD;
}

export function clampLevel(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const level = Math.floor(Number(value));
  if (!Number.isFinite(level)) return null;
  return Math.max(1, Math.min(MAX_LEVEL, level));
}

export function tierStartLevel(tier) {
  return (tier - 1) * LEVELS_PER_TIER + 1;
}

export function createTesterSettings() {
  return { oneKillClears: false, invincible: false, enemySpeed: 1 };
}

export function grantTesterResources(model) {
  model.gold += RESOURCE_GRANT.gold;
  model.trainingPoints += RESOURCE_GRANT.trainingPoints;
  model.arrowCharge += RESOURCE_GRANT.arrowCharge;
}

export function describeTierEnemies(tier) {
  const first = tierStartLevel(tier);
  const last = first + LEVELS_PER_TIER - 1;
  const names = LEVEL_TIER_CONFIGS[tier - 1].enemyIds.map((id) => getEnemyType(id).name);
  return `第 ${first}–${last} 关：${names.join("、")}（第 ${last} 关有 Boss）`;
}

/* ============================================================
   Tester UI — a faint lock opens the password dialog; once unlocked,
   the tester button toggles a parchment panel of level, speed and
   summoning tools. Everything is plain DOM laid over the canvas.
   ============================================================ */
const TESTER_CSS = `
#tester-root {
  font-family: 'EB Garamond', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Georgia, serif;
  color: #2a1c0e;
}
#tester-root [hidden] { display: none !important; }
#tester-root button { font: inherit; color: inherit; cursor: pointer; }
#tester-root button:focus-visible, #tester-root input:focus-visible {
  outline: 2px solid #a3301d; outline-offset: 1px;
}
.tester-lock {
  position: fixed; right: 12px; bottom: 12px; z-index: 20;
  width: 30px; height: 30px; padding: 6px; border-radius: 50%;
  border: 1px solid rgba(200, 162, 58, 0.4); background: rgba(36, 24, 18, 0.4);
  color: #c8a23a; opacity: 0.35; transition: opacity 0.2s;
}
.tester-lock:hover, .tester-lock:focus-visible { opacity: 1; }
.tester-lock svg {
  display: block; width: 100%; height: 100%;
  fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
}
.tester-card {
  background: linear-gradient(#f5ecd2, #e2d0a4);
  border: 2px solid #2a1c0e; border-radius: 6px;
  box-shadow: inset 0 0 0 3px #f5ecd2, inset 0 0 0 5px #c69a3a, 0 12px 32px rgba(0, 0, 0, 0.5);
}
.tester-backdrop {
  position: fixed; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 12, 6, 0.55);
}
.tester-dialog { width: min(300px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px 22px 18px; }
.tester-dialog h2 { margin: 0 0 14px; font-size: 21px; font-weight: 600; text-align: center; color: #7a1420; }
.tester-dialog label { display: block; margin-bottom: 6px; font-size: 14px; }
.tester-dialog input {
  width: 100%; box-sizing: border-box; padding: 8px 10px;
  font: 20px/1.2 inherit; letter-spacing: 0.3em;
  border: 1px solid #2a1c0e; border-radius: 4px; background: #fbf6e6; color: #2a1c0e;
}
.tester-error { margin: 8px 0 0; font-size: 14px; color: #a3301d; }
.tester-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.tester-shake { animation: tester-shake 0.35s; }
@keyframes tester-shake {
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
.tester-toggle {
  position: fixed; top: 12px; left: 12px; z-index: 20; padding: 5px 12px;
  border: 1px solid #2a1c0e; border-radius: 4px; font-weight: 600;
  background: linear-gradient(#efcf7a, #c69a3a); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
/* 60vh keeps the panel above the bowman's head on landscape screens; the
   rest scrolls inside the panel. */
.tester-panel {
  position: fixed; top: 50px; left: 12px; z-index: 20;
  width: 280px; max-height: 60vh; overflow-y: auto;
  box-sizing: border-box; padding: 10px 12px 12px; font-size: 13px;
}
.tester-panel h3 {
  margin: 9px 0 5px; padding-bottom: 1px; font-size: 12.5px; font-weight: 600; letter-spacing: 0.08em;
  color: #7a1420; border-bottom: 1px solid rgba(143, 106, 31, 0.45);
}
.tester-panel h3:first-child { margin-top: 0; }
.tester-row { display: flex; align-items: center; gap: 6px; }
.tester-row input {
  width: 56px; box-sizing: border-box; padding: 2px 6px; font: inherit;
  border: 1px solid rgba(42, 28, 14, 0.55); border-radius: 4px; background: #fbf6e6; color: #2a1c0e;
}
.tester-row button { margin-left: auto; }
.tester-grid { display: grid; gap: 4px; }
.tester-row + .tester-grid { margin-top: 5px; }
.tester-tiers { grid-template-columns: repeat(5, 1fr); }
.tester-speeds { grid-template-columns: repeat(4, 1fr); }
.tester-summons { grid-template-columns: repeat(2, 1fr); }
#tester-root .tester-panel button, #tester-root .tester-dialog button {
  padding: 3px 6px; border: 1px solid rgba(42, 28, 14, 0.55); border-radius: 4px; background: #fbf6e6;
}
#tester-root .tester-summons button { padding: 3px 4px; font-size: 12.5px; line-height: 1.15; }
#tester-root .tester-panel button:hover, #tester-root .tester-dialog button:hover { filter: brightness(0.94); }
#tester-root button.tester-primary, #tester-root button[aria-pressed="true"] {
  border-color: #2a1c0e; background: linear-gradient(#efcf7a, #c69a3a); font-weight: 600;
}
#tester-root .tester-switch { display: flex; justify-content: space-between; }
.tester-switch-state::after { content: "关"; color: rgba(42, 28, 14, 0.55); }
.tester-switch[aria-pressed="true"] .tester-switch-state::after { content: "开"; color: #2a1c0e; }
#tester-root .tester-exit { width: 100%; margin-top: 10px; color: #a3301d; }
.tester-status { min-height: 1.3em; margin: 6px 0 0; font-style: italic; color: #5a4526; }
`;

const TESTER_MARKUP = `
<button id="tester-lock" class="tester-lock" type="button" aria-label="打开测试者模式" title="测试者模式">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="5" y="11" width="14" height="10" rx="2"/></svg>
</button>
<div id="tester-dialog" class="tester-backdrop" hidden>
  <div class="tester-dialog tester-card" role="dialog" aria-modal="true" aria-labelledby="tester-dialog-title">
    <h2 id="tester-dialog-title">测试者模式</h2>
    <label for="tester-password">密码</label>
    <input id="tester-password" type="password" inputmode="numeric" autocomplete="off" maxlength="12">
    <p id="tester-password-error" class="tester-error" role="alert" hidden>密码不对，再试一次</p>
    <div class="tester-dialog-actions">
      <button type="button" id="tester-password-cancel">取消</button>
      <button type="button" id="tester-password-confirm" class="tester-primary">确认</button>
    </div>
  </div>
</div>
<button id="tester-toggle" class="tester-toggle" type="button" aria-expanded="false" aria-controls="tester-panel" hidden>测试者模式</button>
<section id="tester-panel" class="tester-panel tester-card" aria-label="测试者模式" hidden>
  <h3>关卡</h3>
  <div class="tester-row">
    <label for="tester-level">第</label>
    <input id="tester-level" type="number" min="1" max="${MAX_LEVEL}" step="1" inputmode="numeric">
    <span>关</span>
    <button type="button" id="tester-level-go">跳转</button>
  </div>
  <div id="tester-tiers" class="tester-grid tester-tiers"></div>
  <h3>敌人速度</h3>
  <div id="tester-speeds" class="tester-grid tester-speeds" role="group" aria-label="敌人速度"></div>
  <h3>开关与快捷操作</h3>
  <div class="tester-grid">
    <button type="button" id="tester-one-kill" class="tester-switch" aria-pressed="false">杀一个敌人就过关<span class="tester-switch-state"></span></button>
    <button type="button" id="tester-invincible" class="tester-switch" aria-pressed="false">城墙无敌<span class="tester-switch-state"></span></button>
    <button type="button" id="tester-finish-level">立即过关</button>
    <button type="button" id="tester-grant">${GRANT_LABEL}</button>
  </div>
  <p id="tester-status" class="tester-status" role="status"></p>
  <h3>召唤敌人</h3>
  <div id="tester-summons" class="tester-grid tester-summons"></div>
  <button type="button" id="tester-lock-again" class="tester-exit">退出测试者模式</button>
</section>
`;

function readUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeUnlocked(unlocked) {
  try {
    if (unlocked) sessionStorage.setItem(UNLOCK_KEY, "1");
    else sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Without storage the unlock simply lasts until the page reloads.
  }
}

function makeButton(label, attributes = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  return button;
}

// api: { settings, getLevel, jumpToLevel, finishLevelNow, summonEnemy, grantResources }
// settings is the game's live tester settings object; the panel edits it in place.
export function mountTesterMode(api) {
  const style = document.createElement("style");
  style.textContent = TESTER_CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "tester-root";
  root.innerHTML = TESTER_MARKUP;
  document.body.append(root);

  const $ = (selector) => root.querySelector(selector);
  const lock = $("#tester-lock");
  const dialog = $("#tester-dialog");
  const dialogCard = $(".tester-dialog");
  const password = $("#tester-password");
  const passwordError = $("#tester-password-error");
  const toggle = $("#tester-toggle");
  const panel = $("#tester-panel");
  const levelInput = $("#tester-level");
  const oneKill = $("#tester-one-kill");
  const invincible = $("#tester-invincible");
  const status = $("#tester-status");
  const say = (message) => { status.textContent = message; };

  const speedButtons = SPEED_OPTIONS.map(({ value, label }) => {
    const button = makeButton(label, { "data-speed": String(value), "aria-pressed": "false" });
    button.addEventListener("click", () => {
      api.settings.enemySpeed = value;
      renderSettings();
      say(value === 0 ? "敌人已暂停" : `敌人速度 ${label}`);
    });
    return button;
  });
  $("#tester-speeds").append(...speedButtons);

  for (let tier = 1; tier <= LEVEL_TIER_CONFIGS.length; tier += 1) {
    const button = makeButton(`T${tier}`, { "data-tier": String(tier), title: describeTierEnemies(tier) });
    button.addEventListener("click", () => jump(tierStartLevel(tier)));
    $("#tester-tiers").append(button);
  }

  for (const type of ENEMY_TYPES) {
    const button = makeButton(type.name, { "data-summon": type.id, title: `${type.name} · ${type.firstAppears}` });
    button.addEventListener("click", () => {
      say(api.summonEnemy(type.id) ? `已召唤 ${type.name}` : "只能在战斗中召唤敌人");
    });
    $("#tester-summons").append(button);
  }

  function renderSettings() {
    for (const button of speedButtons) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === api.settings.enemySpeed));
    }
    oneKill.setAttribute("aria-pressed", String(api.settings.oneKillClears));
    invincible.setAttribute("aria-pressed", String(api.settings.invincible));
  }

  function setPanelOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) levelInput.value = String(api.getLevel());
  }

  function setUnlocked(unlocked) {
    lock.hidden = unlocked;
    toggle.hidden = !unlocked;
    if (!unlocked) setPanelOpen(false);
  }

  function jump(level) {
    if (!api.jumpToLevel(level)) {
      say(`请输入 1–${MAX_LEVEL} 之间的关卡`);
      return;
    }
    const current = api.getLevel();
    levelInput.value = String(current);
    levelInput.blur(); // the next keystroke belongs to the new level
    say(`已跳到第 ${current} 关（Tier ${getLevelTier(current)}）`);
  }

  function openDialog() {
    password.value = "";
    passwordError.hidden = true;
    dialog.hidden = false;
    password.focus();
  }

  function closeDialog() {
    dialog.hidden = true;
    password.blur();
  }

  function submitPassword() {
    if (checkTesterPassword(password.value)) {
      closeDialog();
      writeUnlocked(true);
      setUnlocked(true);
      return;
    }
    password.value = "";
    passwordError.hidden = false;
    dialogCard.classList.remove("tester-shake");
    void dialogCard.offsetWidth; // restart the shake animation
    dialogCard.classList.add("tester-shake");
    password.focus();
  }

  lock.addEventListener("click", openDialog);
  $("#tester-password-cancel").addEventListener("click", closeDialog);
  $("#tester-password-confirm").addEventListener("click", submitPassword);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDialog();
    else if (event.key === "Enter" && event.target === password) submitPassword();
  });

  toggle.addEventListener("click", () => setPanelOpen(panel.hidden));
  $("#tester-level-go").addEventListener("click", () => jump(levelInput.value));
  levelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") jump(levelInput.value);
  });
  oneKill.addEventListener("click", () => {
    api.settings.oneKillClears = !api.settings.oneKillClears;
    renderSettings();
    say(api.settings.oneKillClears ? "下一次击杀就会过关" : "已恢复正常过关");
  });
  invincible.addEventListener("click", () => {
    api.settings.invincible = !api.settings.invincible;
    renderSettings();
    say(api.settings.invincible ? "城墙无敌已打开" : "城墙无敌已关闭");
  });
  $("#tester-finish-level").addEventListener("click", () => {
    say(api.finishLevelNow() ? "本关马上结束" : "现在不在战斗中");
  });
  $("#tester-grant").addEventListener("click", () => {
    api.grantResources();
    say(GRANT_LABEL);
  });
  $("#tester-lock-again").addEventListener("click", () => {
    Object.assign(api.settings, createTesterSettings());
    renderSettings();
    writeUnlocked(false);
    setUnlocked(false);
    say("");
  });

  // Keys typed into the tester UI belong to it, not to the game; and a clicked
  // button gives focus straight back so the next keystroke reaches the game.
  root.addEventListener("keydown", (event) => event.stopPropagation());
  root.addEventListener("click", (event) => event.target.closest("button")?.blur());

  renderSettings();
  setUnlocked(readUnlocked());
}
