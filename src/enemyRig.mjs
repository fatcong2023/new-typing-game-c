const JOINT_NAMES = Object.freeze([
  "root", "pelvis", "chest", "neck", "head",
  "nearShoulder", "nearElbow", "nearWrist",
  "farShoulder", "farElbow", "farWrist",
  "nearHip", "nearKnee", "nearAnkle",
  "farHip", "farKnee", "farAnkle",
  "nearFoot", "farFoot",
]);

const BONES = Object.freeze([
  Object.freeze({ id: "rootPelvis", from: "root", to: "pelvis" }),
  Object.freeze({ id: "spine", from: "pelvis", to: "chest" }),
  Object.freeze({ id: "neck", from: "chest", to: "neck" }),
  Object.freeze({ id: "head", from: "neck", to: "head" }),
  Object.freeze({ id: "nearUpperArm", from: "nearShoulder", to: "nearElbow" }),
  Object.freeze({ id: "nearForearm", from: "nearElbow", to: "nearWrist" }),
  Object.freeze({ id: "farUpperArm", from: "farShoulder", to: "farElbow" }),
  Object.freeze({ id: "farForearm", from: "farElbow", to: "farWrist" }),
  Object.freeze({ id: "nearThigh", from: "nearHip", to: "nearKnee" }),
  Object.freeze({ id: "nearShin", from: "nearKnee", to: "nearAnkle" }),
  Object.freeze({ id: "nearFoot", from: "nearAnkle", to: "nearFoot" }),
  Object.freeze({ id: "farThigh", from: "farHip", to: "farKnee" }),
  Object.freeze({ id: "farShin", from: "farKnee", to: "farAnkle" }),
  Object.freeze({ id: "farFoot", from: "farAnkle", to: "farFoot" }),
]);

const DEFINITIONS = Object.freeze({
  grunt: Object.freeze({
    id: "grunt",
    jointNames: JOINT_NAMES,
    bones: BONES,
    gait: Object.freeze({
      pelvisHeight: 38.4,
      stride: 7,
      lift: 6,
      bob: 0.8,
      torsoRotation: -0.045,
      armSwing: 0.34,
      thighLength: 19,
      shinLength: 12.5,
      bootHeight: 9.1,
      footPath: Object.freeze([
        Object.freeze({ phase: 0, x: -7, y: 0, pitch: 0.12 }),
        Object.freeze({ phase: 0.12, x: -5.4, y: 0, pitch: 0 }),
        Object.freeze({ phase: 0.32, x: 1.2, y: 0, pitch: 0 }),
        Object.freeze({ phase: 0.5, x: 7, y: 0, pitch: -0.047 }),
        Object.freeze({ phase: 0.62, x: 6.1, y: -3.1, pitch: -0.023 }),
        Object.freeze({ phase: 0.75, x: 0, y: -6, pitch: 0.03 }),
        Object.freeze({ phase: 0.9, x: -5.5, y: -3.2, pitch: 0.08 }),
        Object.freeze({ phase: 1, x: -7, y: 0, pitch: 0.12 }),
      ]),
    }),
  }),
  runner: Object.freeze({
    id: "runner",
    jointNames: JOINT_NAMES,
    bones: BONES,
    gait: Object.freeze({
      pelvisHeight: 35.1,
      stride: 11.5,
      lift: 8.5,
      bob: 1.2,
      torsoRotation: -0.25,
      armSwing: 0.62,
      thighLength: 20,
      shinLength: 13,
      bootHeight: 5.5,
      footPath: Object.freeze([
        Object.freeze({ phase: 0, x: -12, y: 0, pitch: 0.14 }),
        Object.freeze({ phase: 0.1, x: -9, y: 0, pitch: 0.03 }),
        Object.freeze({ phase: 0.28, x: 4, y: 0, pitch: 0 }),
        Object.freeze({ phase: 0.38, x: 11.5, y: 0, pitch: -0.15 }),
        Object.freeze({ phase: 0.48, x: 10, y: -4.2, pitch: -0.09 }),
        Object.freeze({ phase: 0.68, x: 1, y: -9, pitch: 0.03 }),
        Object.freeze({ phase: 0.86, x: -9, y: -5, pitch: 0.1 }),
        Object.freeze({ phase: 1, x: -12, y: 0, pitch: 0.14 }),
      ]),
    }),
  }),
});

const RENDER_PLANS = Object.freeze({
  grunt: Object.freeze({
    shieldSide: "near",
    weaponSide: "far",
    // The viewer watches the grunt's LEFT profile: the near/left hand shows its
    // back on the shield grip (mostly hidden by the shield). The far/right sword
    // arm lives BEHIND the torso, so the body occludes the upper arm, most of
    // the forearm and the hilt; only the palm-side fist and the blade clear the
    // silhouette — real side-view Z-layering, not an arm pasted on the jack.
    showWeaponArmWhileWalking: true,
    shieldCarriedHigh: true,
    weaponLayer: "behind_body",
    armVisuals: Object.freeze({
      shieldUpper: "far_upper_arm",
      shieldForearm: "far_forearm_hand",
    }),
    // Asset naming is swapped vs content: "near-forearm-hand.png" holds the
    // palm-side sword fist, so the weapon arm borrows the near-named art.
    weaponArmVisuals: Object.freeze({
      upper: "near_upper_arm",
      forearm: "near_forearm_hand",
    }),
    bootVisuals: Object.freeze({ near: "near_boot", far: "near_boot" }),
  }),
  runner: Object.freeze({
    shieldSide: "near",
    weaponSide: "far",
    showWeaponArmWhileWalking: true,
    weaponLayer: "behind_body",
    armVisuals: Object.freeze({
      shieldUpper: "near_upper_arm",
      shieldForearm: "near_forearm_hand",
    }),
    bootVisuals: Object.freeze({ near: "near_shin_boot", far: "far_shin_boot" }),
  }),
});

const BONE_LENGTHS = Object.freeze({
  spine: 15.5,
  neck: 4.5,
  head: 5,
  // Slightly longer arms (closer to human proportion) let the sword hand drop
  // below the high-carried shield's taper, so the blade stays partly visible
  // instead of vanishing behind the shield through half the walk cycle.
  upperArm: 10.2,
  forearm: 10.2,
  thigh: 10.5,
  shin: 10.5,
});

function pointDown(origin, angle, length) {
  return {
    x: origin.x + Math.sin(angle) * length,
    y: origin.y + Math.cos(angle) * length,
  };
}

function pointUp(origin, angle, length) {
  return {
    x: origin.x + Math.sin(angle) * length,
    y: origin.y - Math.cos(angle) * length,
  };
}

function rotateOffset(offset, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
  };
}

function addOffset(origin, offset) {
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function sampleFootPath(path, phase) {
  const normalized = ((phase % 1) + 1) % 1;
  let nextIndex = path.findIndex((keyframe) => keyframe.phase >= normalized);
  if (nextIndex <= 0) nextIndex = 1;
  const from = path[nextIndex - 1];
  const to = path[nextIndex];
  const segmentProgress = smoothstep(
    (normalized - from.phase) / (to.phase - from.phase),
  );
  return {
    x: lerp(from.x, to.x, segmentProgress),
    y: lerp(from.y, to.y, segmentProgress),
    pitch: lerp(from.pitch, to.pitch, segmentProgress),
  };
}

function ankleFromFoot(foot, bootHeight, pitch) {
  return addOffset(foot, rotateOffset({ x: 0, y: -bootHeight }, pitch));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function lerpPoint(from, to, progress) {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
  };
}

function distanceBetween(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function extendSegment(from, toward, length) {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    x: toward.x + dx / distance * length,
    y: toward.y + dy / distance * length,
  };
}

function solveForwardKnee(hip, ankle, thighLength, shinLength) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const rawDistance = Math.hypot(dx, dy);
  const distance = Math.min(thighLength + shinLength - 1e-6, Math.max(1e-6, rawDistance));
  const ux = dx / rawDistance;
  const uy = dy / rawDistance;
  const along = (
    thighLength * thighLength
    - shinLength * shinLength
    + distance * distance
  ) / (2 * distance);
  const perpendicular = Math.sqrt(Math.max(0, thighLength * thighLength - along * along));
  const base = {
    x: hip.x + ux * along,
    y: hip.y + uy * along,
  };
  const first = { x: base.x - uy * perpendicular, y: base.y + ux * perpendicular };
  const second = { x: base.x + uy * perpendicular, y: base.y - ux * perpendicular };
  return first.x <= second.x ? first : second;
}

function makeLocomotionPose(definition, locomotionPhase) {
  const phase = ((locomotionPhase % 1) + 1) % 1;
  const cycle = phase * Math.PI * 2;
  const gait = definition.gait;
  const pelvis = {
    x: 0,
    y: -gait.pelvisHeight - gait.bob * 0.5 * (1 - Math.cos(cycle * 2)),
  };
  const torsoRotation = gait.torsoRotation;
  const chest = pointUp(pelvis, torsoRotation, BONE_LENGTHS.spine);
  const neck = pointUp(chest, torsoRotation, BONE_LENGTHS.neck);
  const head = pointUp(neck, torsoRotation, BONE_LENGTHS.head);
  const nearShoulder = addOffset(chest, rotateOffset({ x: -3.8, y: -0.8 }, torsoRotation));
  const farShoulder = addOffset(chest, rotateOffset({ x: 3.8, y: -0.4 }, torsoRotation));
  const nearHip = addOffset(pelvis, rotateOffset({ x: -2.7, y: 0 }, torsoRotation * 0.2));
  const farHip = addOffset(pelvis, rotateOffset({ x: 2.7, y: 0 }, torsoRotation * 0.2));

  // A real step is not a sine wave. Each leg moves through heel strike,
  // planted support, toe-off and a knee-led recovery swing. Keeping the foot
  // trajectory authored also lets the thigh, shin and boot stay independent.
  const nearStep = sampleFootPath(gait.footPath, phase);
  const farStep = sampleFootPath(gait.footPath, phase + 0.5);
  const nearFoot = { x: nearStep.x, y: nearStep.y };
  const farFoot = { x: farStep.x, y: farStep.y };
  const nearAnkle = ankleFromFoot(nearFoot, gait.bootHeight, nearStep.pitch);
  const farAnkle = ankleFromFoot(farFoot, gait.bootHeight, farStep.pitch);
  const nearKnee = solveForwardKnee(
    nearHip,
    nearAnkle,
    gait.thighLength,
    gait.shinLength,
  );
  const farKnee = solveForwardKnee(
    farHip,
    farAnkle,
    gait.thighLength,
    gait.shinLength,
  );

  const nearSwing = Math.sin(cycle);
  const farSwing = Math.sin(cycle + Math.PI);
  const nearUpperAngle = -0.28 - gait.armSwing * nearSwing;
  // The sword arm swings well AHEAD of the hip (negative = toward the walking
  // direction). The arm is drawn BEHIND the torso, so only what clears the
  // body's front silhouette shows: the torso naturally occludes the upper arm,
  // most of the forearm and the hilt, leaving the fist and blade peeking out.
  const farUpperAngle = -0.92 - gait.armSwing * farSwing * 0.55;
  const nearElbow = pointDown(nearShoulder, nearUpperAngle, BONE_LENGTHS.upperArm);
  const farElbow = pointDown(farShoulder, farUpperAngle, BONE_LENGTHS.upperArm);
  // A strapped shield is CARRIED, not dangled: the forearm bends up across the
  // chest so the shield rides shoulder-to-waist (concept pose) and leaves the
  // palm-side sword hand visible below it. Other rigs keep the straight arm.
  const renderPlanForPose = RENDER_PLANS[definition.id];
  const nearWrist = renderPlanForPose?.shieldCarriedHigh
    ? pointDown(nearElbow, -2.02 + 0.07 * nearSwing, BONE_LENGTHS.forearm)
    : pointDown(nearElbow, nearUpperAngle - 0.18, BONE_LENGTHS.forearm);
  const farWrist = pointDown(farElbow, farUpperAngle + 0.24, BONE_LENGTHS.forearm);

  const root = { x: 0, y: 0 };
  const renderPlan = RENDER_PLANS[definition.id];
  const weaponWrist = renderPlan.weaponSide === "far" ? farWrist : nearWrist;
  const shieldWrist = renderPlan.shieldSide === "far" ? farWrist : nearWrist;
  const weaponGrip = { ...weaponWrist };
  const shieldGrip = { ...shieldWrist };
  let weaponTip;
  if (definition.id === "grunt") {
    // Keep the blade between level and 45 degrees upward while the wrist
    // supplies a small, continuous walking sway. The sword no longer inherits
    // the forearm's downward angle.
    const elevation = (22 + 17 * Math.sin(cycle - 0.35)) * Math.PI / 180;
    const bladeAngle = Math.PI + elevation;
    const bladeLength = 22.5;
    weaponTip = {
      x: weaponGrip.x + Math.cos(bladeAngle) * bladeLength,
      y: weaponGrip.y + Math.sin(bladeAngle) * bladeLength,
    };
  } else {
    // The blade continues the SAME forearm that grips it. Building the tip
    // from the other arm made the sword stretch between two counter-swinging
    // hands — it shrank to a dagger and flailed around the chest.
    weaponTip = extendSegment(farElbow, farWrist, 13);
  }
  return {
    id: definition.id,
    mode: definition.id === "runner" ? "run" : "walk",
    root,
    torsoRotation,
    bodyRotation: 0,
    headRotation: 0,
    weaponRotation: 0,
    weaponReleased: false,
    shieldGrip,
    footPitch: { near: nearStep.pitch, far: farStep.pitch },
    weaponGrip,
    weaponTip,
    joints: {
      root,
      pelvis,
      chest,
      neck,
      head,
      nearShoulder,
      nearElbow,
      nearWrist,
      farShoulder,
      farElbow,
      farWrist,
      nearHip,
      nearKnee,
      nearAnkle,
      nearFoot,
      farHip,
      farKnee,
      farAnkle,
      farFoot,
    },
  };
}

function makeDeathPose(definition, locomotionPhase, deathProgress) {
  const base = makeLocomotionPose(definition, locomotionPhase);
  const progress = clamp01(deathProgress);
  const clutch = smoothstep(progress / 0.28);
  const fall = smoothstep((progress - 0.2) / 0.8);
  const crouch = 3 * smoothstep(progress / 0.42);
  const shifted = {};
  for (const [jointName, point] of Object.entries(base.joints)) {
    shifted[jointName] = { ...point };
  }
  for (const jointName of [
    "pelvis", "chest", "neck", "head",
    "nearShoulder", "farShoulder", "nearHip", "farHip",
  ]) {
    shifted[jointName].y += crouch;
  }

  shifted.nearFoot = lerpPoint(base.joints.nearFoot, { x: -2.5, y: 0 }, fall * 0.55);
  shifted.farFoot = lerpPoint(base.joints.farFoot, { x: 3, y: 0 }, fall * 0.45);
  const deathFootPitch = {
    near: base.footPitch.near * (1 - fall),
    far: base.footPitch.far * (1 - fall),
  };
  shifted.nearAnkle = ankleFromFoot(
    shifted.nearFoot,
    definition.gait.bootHeight,
    deathFootPitch.near,
  );
  shifted.farAnkle = ankleFromFoot(
    shifted.farFoot,
    definition.gait.bootHeight,
    deathFootPitch.far,
  );
  shifted.nearKnee = solveForwardKnee(
    shifted.nearHip,
    shifted.nearAnkle,
    definition.gait.thighLength,
    definition.gait.shinLength,
  );
  shifted.farKnee = solveForwardKnee(
    shifted.farHip,
    shifted.farAnkle,
    definition.gait.thighLength,
    definition.gait.shinLength,
  );

  const renderPlan = RENDER_PLANS[definition.id];
  const weaponWristName = `${renderPlan.weaponSide}Wrist`;
  const weaponElbowName = `${renderPlan.weaponSide}Elbow`;
  const weaponShoulderName = `${renderPlan.weaponSide}Shoulder`;
  const shieldWristName = `${renderPlan.shieldSide}Wrist`;
  const shieldElbowName = `${renderPlan.shieldSide}Elbow`;
  const shieldShoulderName = `${renderPlan.shieldSide}Shoulder`;
  const chestClutch = { x: shifted.chest.x - 0.8, y: shifted.chest.y + 1.2 };
  shifted[weaponWristName] = lerpPoint(
    addOffset(base.joints[weaponWristName], { x: 0, y: crouch }),
    chestClutch,
    clutch,
  );
  shifted[weaponElbowName] = solveForwardKnee(
    shifted[weaponShoulderName],
    shifted[weaponWristName],
    BONE_LENGTHS.upperArm,
    BONE_LENGTHS.forearm,
  );

  const shieldFlailTarget = {
    x: shifted[shieldShoulderName].x + (definition.id === "grunt" ? 8 : 11),
    y: shifted[shieldShoulderName].y + 8,
  };
  shifted[shieldWristName] = lerpPoint(
    addOffset(base.joints[shieldWristName], { x: 0, y: crouch }),
    shieldFlailTarget,
    fall * 0.72,
  );
  shifted[shieldElbowName] = solveForwardKnee(
    shifted[shieldShoulderName],
    shifted[shieldWristName],
    BONE_LENGTHS.upperArm,
    BONE_LENGTHS.forearm,
  );

  const bodyRotation = 1.38 * fall;
  const weaponDrop = smoothstep((progress - 0.08) / 0.52);
  const weaponGrip = lerpPoint(
    base.weaponGrip,
    { x: base.weaponGrip.x - 4, y: -0.7 },
    weaponDrop,
  );
  const baseWeaponAngle = Math.atan2(
    base.weaponTip.y - base.weaponGrip.y,
    base.weaponTip.x - base.weaponGrip.x,
  );
  const weaponAngle = baseWeaponAngle + 1.9 * weaponDrop;
  const weaponLength = distanceBetween(base.weaponGrip, base.weaponTip);
  const weaponTip = {
    x: weaponGrip.x + Math.cos(weaponAngle) * weaponLength,
    y: weaponGrip.y + Math.sin(weaponAngle) * weaponLength,
  };
  return {
    ...base,
    mode: "death",
    deathProgress: progress,
    root: { x: 0, y: 0 },
    torsoRotation: base.torsoRotation + 0.05 * clutch,
    bodyRotation,
    headRotation: bodyRotation * 0.7,
    weaponRotation: 1.9 * smoothstep((progress - 0.08) / 0.5),
    weaponReleased: progress >= 0.1,
    shieldGrip: { ...shifted[shieldWristName] },
    footPitch: deathFootPitch,
    weaponGrip,
    weaponTip,
    joints: {
      ...shifted,
      root: { x: 0, y: 0 },
    },
  };
}

export function getEnemyRigDefinition(enemyId) {
  return DEFINITIONS[enemyId] ?? null;
}

export function getEnemyRigRenderPlan(enemyId) {
  return RENDER_PLANS[enemyId] ?? null;
}

export function getEnemyDeathDuration(enemyId) {
  return enemyId === "grunt" || enemyId === "runner" ? 1.25 : 0.45;
}

export function getEnemyRigPose(enemyId, {
  locomotionPhase = 0,
  deathProgress = null,
} = {}) {
  const definition = getEnemyRigDefinition(enemyId);
  if (!definition) throw new Error(`Enemy ${enemyId} does not use an illustrated rig`);
  if (deathProgress !== null) {
    return makeDeathPose(definition, locomotionPhase, deathProgress);
  }
  return makeLocomotionPose(definition, locomotionPhase);
}
