import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const requiredParts = [
  "head",
  "torso",
  "pelvis",
  "near_upper_arm",
  "near_forearm_hand",
  "far_upper_arm",
  "far_forearm_hand",
  "near_thigh",
  "near_shin_boot",
  "far_thigh",
  "far_shin_boot",
  "sword",
];

for (const enemyId of ["grunt", "runner"]) {
  test(`${enemyId} cutout rig manifest supplies every articulated image`, async () => {
    const base = new URL(`../src/assets/enemies/${enemyId}/rig/`, import.meta.url);
    const manifest = JSON.parse(await fs.readFile(new URL("rig-manifest.json", base), "utf8"));
    assert.equal(manifest.character, enemyId);
    assert.equal(manifest.format, "2d-cutout-skeleton");

    for (const partName of requiredParts) {
      const part = manifest.parts[partName];
      assert.ok(part, `${enemyId} manifest is missing ${partName}`);
      assert.ok(part.proximal_anchor?.xy, `${enemyId} ${partName} lacks a proximal anchor`);
      assert.ok(part.distal_anchor?.xy, `${enemyId} ${partName} lacks a distal anchor`);
      const stats = await fs.stat(new URL(part.file, base));
      assert.ok(stats.size > 100, `${enemyId} ${part.file} is empty`);
    }

    if (enemyId === "runner") {
      const shield = manifest.parts.shield;
      assert.ok(shield, "runner needs a real visible shield instead of a blue waist flap");
      assert.ok(shield.proximal_anchor?.xy, "runner shield lacks a wrist grip anchor");
      assert.ok(shield.distal_anchor?.xy, "runner shield lacks a lower-edge anchor");
      const stats = await fs.stat(new URL(shield.file, base));
      assert.ok(stats.size > 100, "runner shield image is empty");
    }

    if (enemyId === "grunt") {
      for (const partName of ["near_shin", "near_boot", "far_shin", "far_boot"]) {
        const part = manifest.parts[partName];
        assert.ok(part, `grunt rig is missing separated ${partName}`);
        assert.ok(part.proximal_anchor?.xy, `${partName} lacks its proximal anchor`);
        assert.ok(part.distal_anchor?.xy, `${partName} lacks its distal anchor`);
        const stats = await fs.stat(new URL(part.file, base));
        assert.ok(stats.size > 100, `${part.file} is empty`);
      }
    }
  });
}
