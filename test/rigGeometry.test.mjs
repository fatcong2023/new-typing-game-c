import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const geometry = await import("../src/rigGeometry.mjs").catch(() => ({}));
const { getEnemyRigPose } = await import("../src/enemyRig.mjs");

function anchorDistance(part) {
  const [fromX, fromY] = part.proximal_anchor.xy;
  const [toX, toY] = part.distal_anchor.xy;
  return Math.hypot(toX - fromX, toY - fromY);
}

test("Grunt thigh, shin, and boot keep one common art scale", async () => {
  const manifest = JSON.parse(await fs.readFile(
    new URL("../src/assets/enemies/grunt/rig/rig-manifest.json", import.meta.url),
    "utf8",
  ));
  const pose = getEnemyRigPose("grunt", { locomotionPhase: 0.25 });

  for (const side of ["near", "far"]) {
    const targets = {
      thigh: Math.hypot(
        pose.joints[`${side}Knee`].x - pose.joints[`${side}Hip`].x,
        pose.joints[`${side}Knee`].y - pose.joints[`${side}Hip`].y,
      ),
      shin: Math.hypot(
        pose.joints[`${side}Ankle`].x - pose.joints[`${side}Knee`].x,
        pose.joints[`${side}Ankle`].y - pose.joints[`${side}Knee`].y,
      ),
      boot: Math.hypot(
        pose.joints[`${side}Foot`].x - pose.joints[`${side}Ankle`].x,
        pose.joints[`${side}Foot`].y - pose.joints[`${side}Ankle`].y,
      ),
    };
    const scales = [
      targets.thigh / anchorDistance(manifest.parts[`${side}_thigh`]),
      targets.shin / anchorDistance(manifest.parts[`${side}_shin`]),
      targets.boot / anchorDistance(manifest.parts[`${side}_boot`]),
    ];
    const smallest = Math.min(...scales);
    const largest = Math.max(...scales);
    assert.ok(largest / smallest < 1.12, `${side} lower-body parts use mismatched scales: ${scales}`);
  }
});

test("Grunt boot soles map to the gait's planted and lifted foot contacts", async () => {
  assert.equal(typeof geometry.mapRigPartPoint, "function");
  const manifest = JSON.parse(await fs.readFile(
    new URL("../src/assets/enemies/grunt/rig/rig-manifest.json", import.meta.url),
    "utf8",
  ));

  for (const phase of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const pose = getEnemyRigPose("grunt", { locomotionPhase: phase });
    for (const side of ["near", "far"]) {
      const part = manifest.parts[`${side}_boot`];
      const footTarget = pose.joints[`${side}Foot`];
      const args = {
        part,
        targetFrom: pose.joints[`${side}Ankle`],
        targetTo: footTarget,
      };
      const sole = geometry.mapRigPartPoint({
        ...args,
        sourcePoint: part.distal_anchor.xy,
      });
      assert.ok(Math.hypot(sole.x - footTarget.x, sole.y - footTarget.y) < 1e-9);

      if (Math.abs(footTarget.y) < 1e-9) {
        const toe = geometry.mapRigPartPoint({
          ...args,
          sourcePoint: part.additional_anchors.boot_toe,
        });
        assert.ok(toe.y <= 0.2, `${side} toe penetrates the ground at phase ${phase}`);
        assert.ok(toe.y >= -4.5, `${side} planted boot points unnaturally upward at phase ${phase}`);
      }
    }
  }
});
