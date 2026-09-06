import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

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
