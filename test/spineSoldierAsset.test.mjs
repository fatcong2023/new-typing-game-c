import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  AnimationState, AnimationStateData, AtlasAttachmentLoader, FakeTexture,
  MeshAttachment, Physics, Skeleton, SkeletonJson, TextureAtlas,
} from "../src/vendor/spine-webgl.min.mjs";
import {
  SOLDIER_SCALE, SOLDIER_VIEW, SOLDIER_ATTACK_DURATION, SOLDIER_IMPACT_TIME,
  advanceSoldierAttack,
} from "../src/soldierAnimation.mjs";

const assetRoot = new URL("../src/assets/spine/", import.meta.url);
const animations = ["walk_shield_overhead", "attack_shield_overhead"];

async function loadRig() {
  const atlas = new TextureAtlas(await fs.readFile(new URL("french-soldier-combat.atlas", assetRoot), "utf8"));
  for (const page of atlas.pages) page.setTexture(new FakeTexture({ width: page.width, height: page.height }));
  const json = JSON.parse(await fs.readFile(new URL("french-soldier-combat.json", assetRoot), "utf8"));
  const reader = new SkeletonJson(new AtlasAttachmentLoader(atlas));
  reader.scale = SOLDIER_SCALE;
  const data = reader.readSkeletonData(json);
  return { data, skeleton: new Skeleton(data), state: new AnimationState(new AnimationStateData(data)) };
}

function pose(rig, name, time) {
  rig.state.clearTracks();
  rig.skeleton.setupPose();
  rig.state.setAnimation(0, name, false).trackTime = time;
  rig.state.apply(rig.skeleton);
  rig.skeleton.updateWorldTransform(Physics.none);
}

function meshVertices(skeleton) {
  const result = new Map();
  for (const slot of skeleton.drawOrder.appliedPose) {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment)) continue;
    const vertices = new Array(attachment.worldVerticesLength);
    attachment.computeWorldVertices(skeleton, slot, 0, vertices.length, vertices, 0, 2);
    result.set(slot.data.name, vertices);
  }
  return result;
}

function point(skeleton, name, endpoint = false) {
  const bone = skeleton.findBone(name);
  assert.ok(bone, `missing ${name} bone`);
  const p = bone.appliedPose;
  return [p.worldX + (endpoint ? p.a * bone.data.length : 0), p.worldY + (endpoint ? p.c * bone.data.length : 0)];
}

function yBounds(vertices) {
  const y = vertices.filter((_, index) => index % 2 === 1);
  return { min: Math.min(...y), max: Math.max(...y) };
}

test("the game ships the approved Spine 4.3 soldier with walking and attacking", async () => {
  const [jsonText, atlasText, png] = await Promise.all([
    fs.readFile(new URL("french-soldier-combat.json", assetRoot), "utf8"),
    fs.readFile(new URL("french-soldier-combat.atlas", assetRoot), "utf8"),
    fs.readFile(new URL("french-soldier-combat.png", assetRoot)),
  ]);
  const json = JSON.parse(jsonText);
  assert.match(json.skeleton.spine, /^4\.3\./);
  for (const name of animations) assert.ok(json.animations[name], `missing ${name} animation`);
  assert.match(atlasText, /french-soldier-combat\.png/);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(png.byteLength > 500_000, "texture atlas image is unexpectedly small");
  const rig = await loadRig();
  assert.ok(Math.abs(rig.data.findAnimation("attack_shield_overhead").duration - SOLDIER_ATTACK_DURATION) < 1e-6);
});

test("both soldier loops return to their starting mesh pose", async () => {
  const rig = await loadRig();
  for (const name of animations) {
    pose(rig, name, 0);
    const first = meshVertices(rig.skeleton);
    pose(rig, name, rig.data.findAnimation(name).duration);
    const last = meshVertices(rig.skeleton);
    assert.deepEqual([...last.keys()], [...first.keys()], `${name} changes its active attachments at the loop seam`);
    for (const [slot, start] of first) {
      const end = last.get(slot);
      assert.equal(end.length, start.length);
      const maxShift = Math.max(...end.map((value, index) => Math.abs(value - start[index])));
      assert.ok(maxShift < 0.003, `${name} ${slot} jumps ${maxShift} units at its loop seam`);
    }
  }
});

test("the game viewport contains all soldier vertices throughout walking and attacking", async () => {
  const rig = await loadRig();
  const { x, y, width, height } = SOLDIER_VIEW;
  for (const name of animations) {
    const duration = rig.data.findAnimation(name).duration;
    const sampleCount = Math.ceil(duration * 120);
    for (let frame = 0; frame <= sampleCount; frame++) {
      pose(rig, name, duration * frame / sampleCount);
      for (const [slot, vertices] of meshVertices(rig.skeleton)) {
        for (let i = 0; i < vertices.length; i += 2) {
          const vx = vertices[i], vy = vertices[i + 1];
          assert.ok(Number.isFinite(vx) && Number.isFinite(vy), `${name} ${slot} has a non-finite vertex`);
          assert.ok(vx >= x && vx <= x + width && vy >= y && vy <= y + height,
            `${name} ${slot}, frame ${frame}, vertex ${i / 2} clips: (${vx}, ${vy})`);
        }
      }
    }
  }
});

test("soldier joints stay connected and the shield stays over the head", async () => {
  const rig = await loadRig();
  const chains = [
    ["near_thigh", "near_shin", "near_foot"],
    ["far_thigh", "far_shin", "far_foot"],
    ["sword_upper_arm", "sword_forearm", "sword_hand", "sword"],
    ["overhead_upper_arm", "overhead_forearm", "overhead_hand", "overhead_shield"],
  ];
  for (const name of animations) {
    const duration = rig.data.findAnimation(name).duration;
    for (let frame = 0; frame <= 72; frame++) {
      pose(rig, name, duration * frame / 72);
      for (const chain of chains) {
        for (let i = 0; i < chain.length - 1; i++) {
          const end = point(rig.skeleton, chain[i], true);
          const next = point(rig.skeleton, chain[i + 1]);
          const gap = Math.hypot(end[0] - next[0], end[1] - next[1]);
          assert.ok(gap < 0.003, `${name} ${chain[i + 1]} separates by ${gap} units at frame ${frame}`);
        }
      }
      const meshes = meshVertices(rig.skeleton);
      assert.ok(meshes.has("shield") && meshes.has("head"), "shield and head must remain visible");
      const shield = yBounds(meshes.get("shield")), head = yBounds(meshes.get("head"));
      assert.ok((shield.min + shield.max) / 2 > head.max,
        `${name} shield drops below the head at frame ${frame}`);
    }
  }
});

test("the approved attack raises the upper arm before the downward strike", async () => {
  const rig = await loadRig();
  pose(rig, "attack_shield_overhead", 13 / 30);
  const shoulder = point(rig.skeleton, "sword_upper_arm");
  const elbow = point(rig.skeleton, "sword_forearm");
  const wrist = point(rig.skeleton, "sword_hand");
  const grip = point(rig.skeleton, "sword");
  const tip = point(rig.skeleton, "sword", true);
  assert.ok(elbow[1] - shoulder[1] > 9, "the upper arm must lift the elbow above the shoulder");
  assert.ok(wrist[1] - elbow[1] > 11, "the forearm must point upward in the approved wind-up");
  assert.ok(tip[0] > grip[0] && tip[1] > grip[1], "the raised blade must point up and right");
  pose(rig, "attack_shield_overhead", SOLDIER_IMPACT_TIME);
  assert.ok(wrist[1] - point(rig.skeleton, "sword_hand")[1] > 20, "the sword hand must descend into the impact");
  assert.ok(tip[1] - point(rig.skeleton, "sword", true)[1] > 40, "the sword blade must swing down into the impact");
});

test("attack damage occurs once at the strike, including skipped frames and multiple cycles", () => {
  const before = advanceSoldierAttack(0, SOLDIER_IMPACT_TIME - 0.001);
  assert.equal(before.hits, 0, "wind-up must not inflict damage");
  const impact = advanceSoldierAttack(before.time, 0.001);
  assert.equal(impact.hits, 1);
  assert.equal(advanceSoldierAttack(impact.time, 0).hits, 0, "the impact must not fire twice at the same time");
  const recovery = advanceSoldierAttack(impact.time, SOLDIER_ATTACK_DURATION - SOLDIER_IMPACT_TIME);
  assert.equal(recovery.hits, 0, "the loop boundary must not inflict damage");
  assert.ok(Math.abs(recovery.time) < 1e-8, "the clock must wrap at the end of the attack");
  assert.equal(advanceSoldierAttack(recovery.time, SOLDIER_IMPACT_TIME - 0.001).hits, 0);
  assert.equal(advanceSoldierAttack(0, SOLDIER_ATTACK_DURATION * 3 + SOLDIER_IMPACT_TIME + 0.001).hits, 4,
    "large frame steps must count each crossed strike");
  let time = 0, hits = 0;
  for (let frame = 0; frame < 360; frame++) {
    const next = advanceSoldierAttack(time, 1 / 60);
    time = next.time;
    hits += next.hits;
  }
  assert.equal(hits, 5, "six seconds at 60 fps must deliver five attacks");
  assert.ok(time < 1e-8);
});
