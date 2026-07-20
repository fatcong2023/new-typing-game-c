const FIXED = Object.freeze({
  root: Object.freeze({ x: 0, y: 0 }),
  torso: Object.freeze({ x: 0, y: 0, rotation: 0 }),
  head: Object.freeze({ x: 0, y: -132, rotation: 0 }),
  bowShoulder: Object.freeze({ x: 15, y: -114 }),
  drawShoulder: Object.freeze({ x: -13, y: -114 }),
});
const DRAW_UPPER_ARM_LENGTH = 26;
const DRAW_FOREARM_LENGTH = 36;
export const ARCHER_WORLD_SCALE = 0.6;

export function scaleArcherRigPoint(point) {
  return {
    x: point.x * ARCHER_WORLD_SCALE,
    y: point.y * ARCHER_WORLD_SCALE,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerpPoint(from, to, progress) {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function samplePointPath(keys, progress) {
  const t = clamp01(progress);
  for (let index = 1; index < keys.length; index += 1) {
    if (t <= keys[index].at) {
      const previous = keys[index - 1];
      const span = keys[index].at - previous.at;
      const local = span > 0 ? smoothstep((t - previous.at) / span) : 1;
      return lerpPoint(previous.point, keys[index].point, local);
    }
  }
  return { ...keys.at(-1).point };
}

function solveElbow(shoulder, hand, upperLength, forearmLength) {
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const distance = Math.hypot(dx, dy);
  const along = (
    upperLength * upperLength
    - forearmLength * forearmLength
    + distance * distance
  ) / (2 * distance);
  const perpendicular = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const ux = dx / distance;
  const uy = dy / distance;
  const base = {
    x: shoulder.x + ux * along,
    y: shoulder.y + uy * along,
  };
  const first = {
    x: base.x - uy * perpendicular,
    y: base.y + ux * perpendicular,
  };
  const second = {
    x: base.x + uy * perpendicular,
    y: base.y - ux * perpendicular,
  };
  return first.x <= second.x ? first : second;
}

export function getLongbowGeometry(pose) {
  const dx = pose.bowHand.x - pose.drawHand.x;
  const dy = pose.bowHand.y - pose.drawHand.y;
  const distance = Math.hypot(dx, dy);
  const aim = distance > 6 ? Math.atan2(dy, dx) : -0.28;
  const ux = Math.cos(aim);
  const uy = Math.sin(aim);
  const px = -uy;
  const py = ux;
  const grip = pose.bowHand;
  const halfLength = 72;
  const curveDepth = 16;
  const tipsMidpoint = {
    x: grip.x - ux * curveDepth,
    y: grip.y - uy * curveDepth,
  };
  const top = {
    x: tipsMidpoint.x - px * halfLength,
    y: tipsMidpoint.y - py * halfLength,
  };
  const bottom = {
    x: tipsMidpoint.x + px * halfLength,
    y: tipsMidpoint.y + py * halfLength,
  };
  const control = {
    x: grip.x + ux * curveDepth,
    y: grip.y + uy * curveDepth,
  };
  const nock = {
    x: grip.x + (pose.drawHand.x - grip.x) * pose.stringDraw,
    y: grip.y + (pose.drawHand.y - grip.y) * pose.stringDraw,
  };
  return { aim, ux, uy, grip, top, bottom, control, nock };
}

export function getArcherRigPose({ drawProgress = 0, releaseProgress = null } = {}) {
  const draw = smoothstep(drawProgress);
  let bowHand = lerpPoint({ x: 29, y: -80 }, { x: 44, y: -124 }, draw);
  let drawHand = lerpPoint({ x: 25, y: -80 }, { x: -3, y: -112 }, draw);
  let drawElbow = solveElbow(
    FIXED.drawShoulder,
    drawHand,
    DRAW_UPPER_ARM_LENGTH,
    DRAW_FOREARM_LENGTH,
  );
  let stringDraw = draw;

  if (releaseProgress !== null) {
    const release = clamp01(releaseProgress);
    bowHand = samplePointPath([
      { at: 0, point: { x: 44, y: -124 } },
      { at: 0.55, point: { x: 44, y: -124 } },
      { at: 1, point: { x: 29, y: -80 } },
    ], release);
    drawHand = samplePointPath([
      { at: 0, point: { x: -3, y: -112 } },
      { at: 0.2, point: { x: -6, y: -116 } },
      { at: 0.42, point: { x: -7, y: -118 } },
      { at: 0.65, point: { x: 0, y: -106 } },
      { at: 1, point: { x: 25, y: -80 } },
    ], release);
    drawElbow = samplePointPath([
      { at: 0, point: drawElbow },
      { at: 0.2, point: { x: -42, y: -114 } },
      { at: 0.42, point: { x: -42, y: -112 } },
      { at: 0.65, point: { x: -36, y: -104 } },
      {
        at: 1,
        point: solveElbow(
          FIXED.drawShoulder,
          { x: 25, y: -80 },
          DRAW_UPPER_ARM_LENGTH,
          DRAW_FOREARM_LENGTH,
        ),
      },
    ], release);
    stringDraw = 1 - smoothstep(release / 0.18);
  }

  return {
    root: { ...FIXED.root },
    torso: { ...FIXED.torso },
    head: { ...FIXED.head },
    bowShoulder: { ...FIXED.bowShoulder },
    drawShoulder: { ...FIXED.drawShoulder },
    bowHand,
    drawHand,
    drawElbow,
    stringDraw,
  };
}
