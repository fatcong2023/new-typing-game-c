import test from "node:test";
import assert from "node:assert/strict";

import * as archerRig from "../src/archerRig.mjs";

const { getArcherRigPose } = archerRig;

test("display scale keeps the English archer close to French soldier height", () => {
  assert.equal(typeof archerRig.scaleArcherRigPoint, "function");
  const bodySourceHeight = 1192;
  const bodyImageScale = 0.126;
  const normalFrenchHeight = 51 * 1.4;
  const displayedTop = archerRig.scaleArcherRigPoint({
    x: 0,
    y: -bodySourceHeight * bodyImageScale,
  });
  const displayedHeight = Math.abs(displayedTop.y);

  assert.ok(
    displayedHeight <= normalFrenchHeight * 1.3,
    `English archer is still oversized: ${displayedHeight} vs ${normalFrenchHeight}`,
  );
  assert.ok(
    displayedHeight >= normalFrenchHeight * 1.15,
    `English archer became too small: ${displayedHeight} vs ${normalFrenchHeight}`,
  );
});


test("skeletal archer keeps root, torso, head, and shoulders fixed through the whole shot", () => {
  const samples = [
    ...[0, 0.25, 0.5, 0.75, 1].map((drawProgress) => ({ drawProgress, releaseProgress: null })),
    ...[0, 0.2, 0.4, 0.6, 0.8, 1].map((releaseProgress) => ({ drawProgress: 1, releaseProgress })),
  ];
  const baseline = getArcherRigPose(samples[0]);

  for (const sample of samples) {
    const pose = getArcherRigPose(sample);
    assert.deepEqual(pose.root, baseline.root);
    assert.deepEqual(pose.torso, baseline.torso);
    assert.deepEqual(pose.head, baseline.head);
    assert.deepEqual(pose.bowShoulder, baseline.bowShoulder);
    assert.deepEqual(pose.drawShoulder, baseline.drawShoulder);
  }
});

test("arm rig attaches to the body's shoulder sockets instead of the lower chest", () => {
  const nockingPose = getArcherRigPose({ drawProgress: 0, releaseProgress: null });
  const fullDrawPose = getArcherRigPose({ drawProgress: 1, releaseProgress: null });

  assert.deepEqual(nockingPose.bowShoulder, { x: 15, y: -114 });
  assert.deepEqual(nockingPose.drawShoulder, { x: -13, y: -114 });
  assert.deepEqual(nockingPose.bowHand, { x: 29, y: -80 });
  assert.deepEqual(nockingPose.drawHand, { x: 25, y: -80 });
  assert.deepEqual(fullDrawPose.bowHand, { x: 44, y: -124 });
  assert.deepEqual(fullDrawPose.drawHand, { x: -3, y: -112 });
});

test("draw hands follow continuous paths from nocking position to full draw", () => {
  const poses = Array.from({ length: 51 }, (_, index) =>
    getArcherRigPose({ drawProgress: index / 50, releaseProgress: null }));

  assert.deepEqual(poses[0].bowHand, { x: 29, y: -80 });
  assert.deepEqual(poses.at(-1).bowHand, { x: 44, y: -124 });
  assert.deepEqual(poses[0].drawHand, { x: 25, y: -80 });
  assert.deepEqual(poses.at(-1).drawHand, { x: -3, y: -112 });

  for (let index = 1; index < poses.length; index += 1) {
    for (const key of ["bowHand", "drawHand"]) {
      const dx = poses[index][key].x - poses[index - 1][key].x;
      const dy = poses[index][key].y - poses[index - 1][key].y;
      assert.ok(Math.hypot(dx, dy) < 2, `${key} jumped at sample ${index}`);
    }
  }
});

test("release follow-through is continuous and returns to the same nocking pose", () => {
  const poses = Array.from({ length: 101 }, (_, index) =>
    getArcherRigPose({ drawProgress: 1, releaseProgress: index / 100 }));

  assert.deepEqual(poses[0].bowHand, { x: 44, y: -124 });
  assert.deepEqual(poses[0].drawHand, { x: -3, y: -112 });
  assert.deepEqual(poses.at(-1).bowHand, { x: 29, y: -80 });
  assert.deepEqual(poses.at(-1).drawHand, { x: 25, y: -80 });
  assert.equal(poses[0].stringDraw, 1);
  assert.equal(poses.at(-1).stringDraw, 0);

  for (let index = 1; index < poses.length; index += 1) {
    for (const key of ["bowHand", "drawHand"]) {
      const dx = poses[index][key].x - poses[index - 1][key].x;
      const dy = poses[index][key].y - poses[index - 1][key].y;
      assert.ok(Math.hypot(dx, dy) < 2, `${key} jumped at release sample ${index}`);
    }
  }
});

test("draw-arm elbow preserves both bone lengths while drawing", () => {
  const samples = Array.from({ length: 21 }, (_, index) => ({
    drawProgress: index / 20,
    releaseProgress: null,
  }));

  for (const sample of samples) {
    const pose = getArcherRigPose(sample);
    assert.ok(pose.drawElbow, "pose must expose a draw-arm elbow joint");
    const upperLength = Math.hypot(
      pose.drawElbow.x - pose.drawShoulder.x,
      pose.drawElbow.y - pose.drawShoulder.y,
    );
    const forearmLength = Math.hypot(
      pose.drawHand.x - pose.drawElbow.x,
      pose.drawHand.y - pose.drawElbow.y,
    );
    assert.ok(Math.abs(upperLength - 26) < 0.001, `upper arm changed length: ${upperLength}`);
    assert.ok(Math.abs(forearmLength - 36) < 0.001, `forearm changed length: ${forearmLength}`);
  }
});

test("release arm follows a human-sized arc without a full rotation", () => {
  const poses = Array.from({ length: 201 }, (_, index) =>
    getArcherRigPose({ drawProgress: 1, releaseProgress: index / 200 }));
  const segmentAngle = (pose, from, to) => Math.atan2(
    pose[to].y - pose[from].y,
    pose[to].x - pose[from].x,
  );
  const angularStep = (from, to) => Math.abs(Math.atan2(
    Math.sin(to - from),
    Math.cos(to - from),
  ));

  for (const [label, from, to] of [
    ["upper arm", "drawShoulder", "drawElbow"],
    ["forearm", "drawElbow", "drawHand"],
  ]) {
    let totalRotation = 0;
    let largestStep = 0;
    for (let index = 1; index < poses.length; index += 1) {
      const step = angularStep(
        segmentAngle(poses[index - 1], from, to),
        segmentAngle(poses[index], from, to),
      );
      totalRotation += step;
      largestStep = Math.max(largestStep, step);
    }
    assert.ok(totalRotation < Math.PI, `${label} rotated too far: ${totalRotation}`);
    assert.ok(largestStep < 0.2, `${label} flipped between frames: ${largestStep}`);
  }
});

test("full-draw elbow rises behind the shoulder instead of folding onto the waist", () => {
  const pose = getArcherRigPose({ drawProgress: 1, releaseProgress: null });

  assert.ok(
    pose.drawElbow.x <= pose.drawShoulder.x - 24,
    `elbow is not behind the shoulder: ${JSON.stringify(pose.drawElbow)}`,
  );
  assert.ok(
    Math.abs(pose.drawElbow.y - pose.drawShoulder.y) <= 3,
    `elbow is not at shoulder height: ${JSON.stringify(pose.drawElbow)}`,
  );
});

test("English longbow stave is approximately the archer's full height", () => {
  assert.equal(typeof archerRig.getLongbowGeometry, "function");
  const pose = getArcherRigPose({ drawProgress: 1, releaseProgress: null });
  const bow = archerRig.getLongbowGeometry(pose);
  const staveLength = Math.hypot(bow.top.x - bow.bottom.x, bow.top.y - bow.bottom.y);

  assert.ok(staveLength >= 140, `longbow is too short: ${staveLength}`);
});

test("longbow stave makes one smooth outward arch through the grip", () => {
  const pose = getArcherRigPose({ drawProgress: 1, releaseProgress: null });
  const bow = archerRig.getLongbowGeometry(pose);

  assert.ok(bow.control, "longbow needs one continuous-curve control point");
  const curveMidpoint = {
    x: 0.25 * bow.top.x + 0.5 * bow.control.x + 0.25 * bow.bottom.x,
    y: 0.25 * bow.top.y + 0.5 * bow.control.y + 0.25 * bow.bottom.y,
  };
  assert.ok(Math.hypot(
    curveMidpoint.x - bow.grip.x,
    curveMidpoint.y - bow.grip.y,
  ) < 0.001, "the smooth stave curve must pass through the bow hand");

  const tipsMidpoint = {
    x: (bow.top.x + bow.bottom.x) / 2,
    y: (bow.top.y + bow.bottom.y) / 2,
  };
  const tipSetback = (
    (bow.grip.x - tipsMidpoint.x) * bow.ux
    + (bow.grip.y - tipsMidpoint.y) * bow.uy
  );
  assert.ok(tipSetback >= 14, `bow tips do not sweep behind the outward grip: ${tipSetback}`);
});

test("full draw aims the nocked arrow upward from one stable bow-hand origin", () => {
  const pose = getArcherRigPose({ drawProgress: 1, releaseProgress: null });
  const angle = Math.atan2(
    pose.bowHand.y - pose.drawHand.y,
    pose.bowHand.x - pose.drawHand.x,
  );

  assert.deepEqual(pose.bowHand, { x: 44, y: -124 });
  assert.ok(angle < -0.2 && angle > -0.35, `unexpected arrow angle ${angle}`);
});
