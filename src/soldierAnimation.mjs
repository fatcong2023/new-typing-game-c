export const SOLDIER_SCALE = 0.1;
export const SOLDIER_ATTACK_DURATION = 1.2;
export const SOLDIER_WALK_DURATION = 1.2;
export const SOLDIER_IMPACT_TIME = 0.64;
// Includes the sword's entire sweep and the raised shield, in game-local units.
export const SOLDIER_VIEW = Object.freeze({ x: -71, y: -3, width: 102, height: 119.5 });

const wrap = (time, duration) => {
  const value = ((time % duration) + duration) % duration;
  return value < 1e-9 || duration - value < 1e-9 ? 0 : value;
};

export function advanceSoldierAttack(timer, dt) {
  if (!Number.isFinite(timer) || !Number.isFinite(dt) || dt < 0) {
    throw new RangeError('Attack time must be finite and dt must be nonnegative');
  }
  const start = wrap(timer, SOLDIER_ATTACK_DURATION);
  const end = start + dt;
  const passed = time => Math.floor((time - SOLDIER_IMPACT_TIME + 1e-9) / SOLDIER_ATTACK_DURATION);
  return { time: wrap(end, SOLDIER_ATTACK_DURATION), hits: passed(end) - passed(start) };
}

export function selectSoldierAnimation(enemy) {
  const dying = enemy.dyingTimer > 0;
  const frozen = dying ? enemy.spineDeathPose : null;
  const mode = frozen?.mode ?? (enemy.spineMode === 'attack' ? 'attack' : 'walk');
  const duration = mode === 'attack' ? SOLDIER_ATTACK_DURATION : SOLDIER_WALK_DURATION;
  const time = frozen?.time ?? (mode === 'attack'
    ? (enemy.attackTimer ?? 0)
    : (enemy.phase ?? 0) / (Math.PI * 2) * duration);
  return {
    mode: dying ? 'death' : mode,
    animation: mode === 'attack' ? 'attack_shield_overhead' : 'walk_shield_overhead',
    time: wrap(time, duration),
    deathProgress: dying ? Math.max(0, Math.min(1, 1 - enemy.dyingTimer / (enemy.deathDuration || 1.25))) : null,
  };
}

export function soldierDeathTransform(progress) {
  if (progress === null) return { x: 0, y: 0, rotation: 0, alpha: 1 };
  const fall = Math.max(0, Math.min(1, (progress - 0.12) / 0.62));
  const eased = fall * fall * (3 - 2 * fall);
  return {
    x: 5 * Math.sin(Math.min(1, progress / 0.3) * Math.PI / 2),
    y: 0,
    rotation: eased * 1.48,
    alpha: 1 - Math.max(0, Math.min(1, (progress - 0.76) / 0.24)),
  };
}
