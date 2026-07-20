import test from "node:test";
import assert from "node:assert/strict";

const enemyRig = await import("../src/enemyRig.mjs").catch(() => ({}));

test("grunt and runner expose multi-joint cutout skeleton definitions", () => {
  assert.equal(typeof enemyRig.getEnemyRigDefinition, "function");

  const requiredJoints = [
    "root", "pelvis", "chest", "neck", "head",
    "nearShoulder", "nearElbow", "nearWrist",
    "farShoulder", "farElbow", "farWrist",
    "nearHip", "nearKnee", "nearAnkle",
    "farHip", "farKnee", "farAnkle",
    "nearFoot", "farFoot",
  ];

  for (const enemyId of ["grunt", "runner"]) {
    const definition = enemyRig.getEnemyRigDefinition(enemyId);
    assert.equal(definition.id, enemyId);
    assert.ok(definition.jointNames.length >= requiredJoints.length);
    for (const jointName of requiredJoints) {
      assert.ok(definition.jointNames.includes(jointName), `${enemyId} is missing ${jointName}`);
    }
    assert.ok(definition.bones.length >= 14, `${enemyId} needs a genuinely articulated skeleton`);
  }
});

test("grunt render contract keeps the shield arm near, hides the sword arm, and reuses a side-view far boot", () => {
  assert.equal(typeof enemyRig.getEnemyRigRenderPlan, "function");
  const plan = enemyRig.getEnemyRigRenderPlan("grunt");
  assert.equal(plan.shieldSide, "near", "the visible left arm must carry the shield");
  assert.equal(plan.weaponSide, "far", "the hidden right arm must carry the sword");
  assert.equal(plan.showWeaponArmWhileWalking, false, "the far-side sword arm must stay behind the torso");
  assert.equal(plan.weaponLayer, "between_body_and_shield", "the shield may hide the arm, but not the whole sword");
  assert.ok(plan.armVisuals, "grunt render plan needs explicit arm artwork roles");
  assert.equal(plan.armVisuals.shieldUpper, "far_upper_arm");
  assert.equal(plan.armVisuals.shieldForearm, "far_forearm_hand", "the shield hand must not contain the sword hilt artwork");
  assert.equal(plan.bootVisuals.near, "near_boot");
  assert.equal(plan.bootVisuals.far, "near_boot", "the front-facing far boot must not be twisted into a side view");

  const pose = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.2 });
  assert.deepEqual(pose.weaponGrip, pose.joints.farWrist);
  assert.deepEqual(pose.shieldGrip, pose.joints.nearWrist);
});

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

test("walk and run cycles keep one root and preserve every articulated limb length", () => {
  assert.equal(typeof enemyRig.getEnemyRigPose, "function");

  for (const enemyId of ["grunt", "runner"]) {
    const definition = enemyRig.getEnemyRigDefinition(enemyId);
    const samples = Array.from({ length: 81 }, (_, index) =>
      enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: index / 80 }));
    const baseline = samples[0];

    for (const pose of samples) {
      assert.deepEqual(pose.root, { x: 0, y: 0 }, `${enemyId} root drifted`);
      for (const jointName of definition.jointNames) {
        assert.ok(pose.joints[jointName], `${enemyId} pose is missing ${jointName}`);
      }
      for (const bone of definition.bones.filter((item) => !["rootPelvis", "spine", "neck", "head"].includes(item.id))) {
        const expected = distance(baseline.joints[bone.from], baseline.joints[bone.to]);
        const actual = distance(pose.joints[bone.from], pose.joints[bone.to]);
        assert.ok(Math.abs(actual - expected) < 1e-6, `${enemyId} ${bone.id} stretched: ${actual} vs ${expected}`);
      }
    }

    const end = samples.at(-1);
    for (const jointName of definition.jointNames) {
      assert.ok(
        distance(baseline.joints[jointName], end.joints[jointName]) < 1e-6,
        `${enemyId} cycle does not loop at ${jointName}`,
      );
    }

    for (let index = 1; index < samples.length; index += 1) {
      for (const jointName of definition.jointNames) {
        assert.ok(
          distance(samples[index - 1].joints[jointName], samples[index].joints[jointName]) < 2,
          `${enemyId} ${jointName} jumped at sample ${index}`,
        );
      }
    }
  }
});

test("runner gait has a longer stride, higher foot lift, and stronger forward lean than grunt walk", () => {
  const posesFor = (enemyId) => Array.from({ length: 101 }, (_, index) =>
    enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: index / 100 }));
  const grunt = posesFor("grunt");
  const runner = posesFor("runner");
  const range = (poses, jointName, axis) => {
    const values = poses.map((pose) => pose.joints[jointName][axis]);
    return Math.max(...values) - Math.min(...values);
  };

  assert.ok(range(runner, "nearAnkle", "x") > range(grunt, "nearAnkle", "x") * 1.45);
  assert.ok(range(runner, "nearAnkle", "y") > range(grunt, "nearAnkle", "y") * 1.3);
  assert.ok(Math.abs(runner[0].torsoRotation) > Math.abs(grunt[0].torsoRotation) + 0.12);
});

function jointAngleDegrees(first, joint, last) {
  const ax = first.x - joint.x;
  const ay = first.y - joint.y;
  const bx = last.x - joint.x;
  const by = last.y - joint.y;
  const cosine = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

test("both knees visibly flex and extend instead of shuffling on short rigid legs", () => {
  for (const enemyId of ["grunt", "runner"]) {
    const poses = Array.from({ length: 161 }, (_, index) =>
      enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: index / 160 }));

    for (const side of ["near", "far"]) {
      const angles = poses.map((pose) => jointAngleDegrees(
        pose.joints[`${side}Hip`],
        pose.joints[`${side}Knee`],
        pose.joints[`${side}Ankle`],
      ));
      const flexionRange = Math.max(...angles) - Math.min(...angles);
      assert.ok(flexionRange >= 38, `${enemyId} ${side} knee only moves ${flexionRange.toFixed(1)} degrees`);
      assert.ok(Math.max(...angles) >= 150, `${enemyId} ${side} leg never reaches a natural extension`);
      assert.ok(Math.min(...angles) <= 120, `${enemyId} ${side} leg never bends for its recovery step`);
    }
  }
});

test("enemy thighs keep the approved art's longer human proportion instead of dwarf-like equal segments", () => {
  for (const enemyId of ["grunt", "runner"]) {
    const pose = enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: 0.18 });
    for (const side of ["near", "far"]) {
      const thigh = distance(pose.joints[`${side}Hip`], pose.joints[`${side}Knee`]);
      const shin = distance(pose.joints[`${side}Knee`], pose.joints[`${side}Ankle`]);
      assert.ok(thigh >= shin * 1.4, `${enemyId} ${side} thigh is still visually too short`);
      assert.ok(thigh <= shin * 1.65, `${enemyId} ${side} thigh/shin ratio is distorted`);
    }
  }
});

test("the articulated lower body is long enough to read as adult human legs", () => {
  for (const enemyId of ["grunt", "runner"]) {
    const pose = enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: 0.18 });
    const torso = distance(pose.joints.pelvis, pose.joints.neck);
    const leg = distance(pose.joints.nearHip, pose.joints.nearKnee)
      + distance(pose.joints.nearKnee, pose.joints.nearAnkle);
    assert.ok(leg >= torso * 1.52, `${enemyId} lower body still reads as dwarf-like`);
  }
});

test("grunt sword tip swings naturally from level to forty-five degrees upward", () => {
  const elevations = Array.from({ length: 161 }, (_, index) => {
    const pose = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: index / 160 });
    const dx = pose.weaponTip.x - pose.weaponGrip.x;
    const dy = pose.weaponTip.y - pose.weaponGrip.y;
    const direction = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    return direction - Math.PI;
  });

  assert.ok(elevations.every((angle) => angle >= 0 && angle <= Math.PI / 4));
  assert.ok(Math.max(...elevations) - Math.min(...elevations) >= Math.PI / 12);
});

test("grunt walk follows heel strike, planted support, toe off, then a knee-led forward swing", () => {
  const heelStrike = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0 });
  const midStance = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.25 });
  const toeOff = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.5 });
  const midSwing = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.75 });

  assert.ok(heelStrike.joints.nearFoot.x < -5, "heel strike must land in front for a left-moving enemy");
  assert.ok(Math.abs(heelStrike.joints.nearFoot.y) < 1e-9, "heel strike must touch the ground");
  assert.ok(midStance.joints.nearFoot.x > heelStrike.joints.nearFoot.x);
  assert.ok(Math.abs(midStance.joints.nearFoot.y) < 1e-9, "support foot must remain planted");
  assert.ok(toeOff.joints.nearFoot.x > 5, "toe off must finish behind the pelvis");
  assert.ok(Math.abs(toeOff.joints.nearFoot.y) < 1e-9, "toe must still touch at push-off");
  assert.ok(midSwing.joints.nearFoot.y < -4, "recovery foot must clear the ground");
  assert.ok(midSwing.joints.nearFoot.x < toeOff.joints.nearFoot.x - 4, "swing foot must travel forward");

  const stanceKnee = jointAngleDegrees(
    midStance.joints.nearHip,
    midStance.joints.nearKnee,
    midStance.joints.nearAnkle,
  );
  const swingKnee = jointAngleDegrees(
    midSwing.joints.nearHip,
    midSwing.joints.nearKnee,
    midSwing.joints.nearAnkle,
  );
  assert.ok(stanceKnee > swingKnee + 25, "the knee must bend to lead the recovery step");
});

test("grunt boot has its own ankle-driven pitch instead of rotating as part of the shin", () => {
  const heelStrike = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0 });
  const midStance = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.25 });
  const toeOff = enemyRig.getEnemyRigPose("grunt", { locomotionPhase: 0.5 });

  assert.equal(typeof heelStrike.footPitch?.near, "number");
  assert.ok(heelStrike.footPitch.near > 0.06, "front boot should lift its toe before landing");
  assert.ok(Math.abs(midStance.footPitch.near) < 0.04, "planted boot should lie flat");
  assert.ok(toeOff.footPitch.near < -0.04, "rear boot should roll through the toe at push-off");

  for (const pose of [heelStrike, midStance, toeOff]) {
    const shinLength = distance(pose.joints.nearKnee, pose.joints.nearAnkle);
    const bootLength = distance(pose.joints.nearAnkle, pose.joints.nearFoot);
    assert.ok(Math.abs(shinLength - 12.5) < 1e-6, "shin must remain an independent rigid segment");
    assert.ok(Math.abs(bootLength - 9.1) < 1e-6, "boot must remain an independent rigid segment");
  }
});

test("ankles remain above separately grounded feet so boots can stay flat", () => {
  for (const enemyId of ["grunt", "runner"]) {
    const expectedBootLength = enemyRig.getEnemyRigDefinition(enemyId).gait.bootHeight;
    for (const phase of [0.25, 0.5, 0.75]) {
      const pose = enemyRig.getEnemyRigPose(enemyId, { locomotionPhase: phase });
      for (const side of ["near", "far"]) {
        const ankle = pose.joints[`${side}Ankle`];
        const foot = pose.joints[`${side}Foot`];
        assert.ok(ankle.y < foot.y - 3.5, `${enemyId} ${side} has no articulated ankle`);
        assert.ok(Math.abs(distance(ankle, foot) - expectedBootLength) < 1e-6);
      }
    }
  }
});

test("fatal arrow hit moves the far-side weapon hand to the chest before the body falls", () => {
  assert.equal(typeof enemyRig.getEnemyDeathDuration, "function");

  for (const enemyId of ["grunt", "runner"]) {
    assert.ok(enemyRig.getEnemyDeathDuration(enemyId) >= 1.1);
    const impact = enemyRig.getEnemyRigPose(enemyId, {
      locomotionPhase: 0.2,
      deathProgress: 0,
    });
    const clutch = enemyRig.getEnemyRigPose(enemyId, {
      locomotionPhase: 0.2,
      deathProgress: 0.28,
    });
    const fallen = enemyRig.getEnemyRigPose(enemyId, {
      locomotionPhase: 0.2,
      deathProgress: 1,
    });

    assert.equal(clutch.mode, "death");
    assert.ok(
      distance(clutch.joints.farWrist, clutch.joints.chest) < 2.5,
      `${enemyId} never clutched the arrow wound`,
    );
    assert.ok(
      distance(clutch.joints.farWrist, clutch.joints.chest)
        < distance(impact.joints.farWrist, impact.joints.chest) * 0.3,
    );
    assert.equal(clutch.weaponReleased, true, `${enemyId} should release the sword to clutch the chest`);
    assert.ok(fallen.bodyRotation > 1.15 && fallen.bodyRotation < 1.55);
    assert.ok(fallen.headRotation < fallen.bodyRotation, "head should lag behind the fall");
    assert.deepEqual(fallen.root, { x: 0, y: 0 });
  }
});

test("death animation is continuous, stays on one root, and never flips a limb", () => {
  for (const enemyId of ["grunt", "runner"]) {
    const definition = enemyRig.getEnemyRigDefinition(enemyId);
    const poses = Array.from({ length: 161 }, (_, index) =>
      enemyRig.getEnemyRigPose(enemyId, {
        locomotionPhase: 0.37,
        deathProgress: index / 160,
      }));
    let previousRotation = -Infinity;

    for (const pose of poses) {
      assert.deepEqual(pose.root, { x: 0, y: 0 });
      assert.ok(pose.bodyRotation >= previousRotation - 1e-9, `${enemyId} reversed its fall`);
      previousRotation = pose.bodyRotation;
      for (const bone of definition.bones.filter((item) => !["rootPelvis", "spine", "neck", "head"].includes(item.id))) {
        const baseline = poses[0];
        const expected = distance(baseline.joints[bone.from], baseline.joints[bone.to]);
        const actual = distance(pose.joints[bone.from], pose.joints[bone.to]);
        assert.ok(Math.abs(actual - expected) < 1e-6, `${enemyId} ${bone.id} stretched during death`);
      }
    }

    for (let index = 1; index < poses.length; index += 1) {
      assert.ok(poses[index].bodyRotation - poses[index - 1].bodyRotation < 0.08);
      for (const jointName of definition.jointNames) {
        assert.ok(
          distance(poses[index - 1].joints[jointName], poses[index].joints[jointName]) < 1.5,
          `${enemyId} ${jointName} flipped at death sample ${index}`,
        );
      }
    }
  }
});
