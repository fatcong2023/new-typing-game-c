import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  AnimationState, AnimationStateData, AtlasAttachmentLoader, FakeTexture,
  MeshAttachment, Physics, Skeleton, SkeletonJson, TextureAtlas,
} from "../src/vendor/spine-webgl.min.mjs";
import { ARCHER_VIEW } from "../src/spineArcherView.mjs";

const assetRoot = new URL("../src/assets/spine/", import.meta.url);

test("the game ships the Spine 4.3 longbowman and all gameplay animations", async () => {
  const [jsonText, atlasText, png] = await Promise.all([
    fs.readFile(new URL("english-longbowman-fixed.json", assetRoot), "utf8"),
    fs.readFile(new URL("english-longbowman-fixed.atlas", assetRoot), "utf8"),
    fs.readFile(new URL("english-longbowman-fixed.png", assetRoot)),
  ]);
  const data = JSON.parse(jsonText);

  assert.match(data.skeleton.spine, /^4\.3\./);
  for (const animation of ["idle", "draw", "full_draw", "release", "aim_down", "aim_up"]) {
    assert.ok(data.animations[animation], `missing ${animation} animation`);
  }
  assert.match(atlasText, /english-longbowman-fixed\.png/);
  assert.ok(png.byteLength > 1_000_000, "texture atlas image is unexpectedly small");
});

async function loadRig() {
  const atlas = new TextureAtlas(await fs.readFile(new URL("english-longbowman-fixed.atlas", assetRoot), "utf8"));
  for (const page of atlas.pages) page.setTexture(new FakeTexture({ width: page.width, height: page.height }));
  const json = JSON.parse(await fs.readFile(new URL("english-longbowman-fixed.json", assetRoot), "utf8"));
  const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
  return { skeleton: new Skeleton(data), state: new AnimationState(new AnimationStateData(data)) };
}

function pose(rig, name, time, pitch = 0) {
  rig.state.clearTracks();
  rig.skeleton.setupPose();
  rig.state.setAnimation(0, name, false).trackTime = time;
  rig.state.apply(rig.skeleton);
  rig.skeleton.findBone("aim_upper").pose.rotation += pitch;
  rig.skeleton.updateWorldTransform(Physics.none);
}

function meshVertices(skeleton) {
  return skeleton.drawOrder.appliedPose.flatMap(slot => {
    const attachment = slot.appliedPose.attachment;
    if (!(attachment instanceof MeshAttachment)) return [];
    const vertices = new Array(attachment.worldVerticesLength);
    attachment.computeWorldVertices(skeleton, slot, 0, vertices.length, vertices, 0, 2);
    return vertices;
  });
}

test("draw, full hold and release join without a mesh jump", async () => {
  const rig = await loadRig();
  for (const pitch of [-18, 0, 12, 28]) {
    pose(rig, "draw", 0.8, pitch);
    const end = meshVertices(rig.skeleton);
    for (const [name, time] of [["full_draw", 0], ["full_draw", 0.99], ["release", 0]]) {
      pose(rig, name, time, pitch);
      const next = meshVertices(rig.skeleton);
      assert.equal(next.length, end.length);
      const maxShift = Math.max(...next.map((value, index) => Math.abs(value - end[index])));
      assert.ok(maxShift < 0.1, `${name} at pitch ${pitch} jumped ${maxShift} units`);
    }
  }
});

test("the WebGL viewport contains every animated attachment at all gameplay pitches", async () => {
  const rig = await loadRig();
  const { x, y, width, height } = ARCHER_VIEW;
  for (const pitch of [-18, 0, 12, 28]) {
    for (const [name, duration] of [["idle", 1.5], ["draw", 0.8], ["full_draw", 1], ["release", 0.62]]) {
      for (let frame = 0; frame <= 40; frame++) {
        pose(rig, name, duration * frame / 40, pitch);
        const bounds = rig.skeleton.getBoundsRect();
        assert.ok(bounds.x >= x && bounds.y >= y &&
          bounds.x + bounds.width <= x + width &&
          bounds.y + bounds.height <= y + height,
        `${name} at pitch ${pitch}, frame ${frame} clips: ${JSON.stringify(bounds)}`);
      }
    }
  }
});
