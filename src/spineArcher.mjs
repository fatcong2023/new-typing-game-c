import {
  AnimationState,
  AnimationStateData,
  AssetManager,
  AtlasAttachmentLoader,
  Physics,
  Skeleton,
  SkeletonJson,
  SkeletonRenderer,
} from "./vendor/spine-canvas.min.mjs";

export const ARCHER_WORLD_SCALE = 0.53;
export const SPINE_DRAW_DURATION = 0.8;
export const SPINE_RELEASE_DURATION = 0.62;

const ATLAS_URL = new URL("./assets/spine/english-longbowman-fixed.atlas", import.meta.url).href;
const JSON_URL = new URL("./assets/spine/english-longbowman-fixed.json", import.meta.url).href;

const runtime = {
  ready: false,
  error: null,
  skeleton: null,
  state: null,
  renderers: new WeakMap(),
  currentPoseKey: "",
  fullDrawBowHand: { x: 73, y: 149 },
};

function applyAnimation(name, time, pitchDegrees = 0) {
  if (!runtime.ready) return false;
  const clampedPitch = Math.max(-18, Math.min(28, pitchDegrees));
  const poseKey = `${name}:${time.toFixed(4)}:${clampedPitch.toFixed(2)}`;
  if (runtime.currentPoseKey === poseKey) return true;

  runtime.state.clearTracks();
  runtime.skeleton.setupPose();
  const entry = runtime.state.setAnimation(0, name, false);
  entry.trackTime = time;
  runtime.state.apply(runtime.skeleton);
  runtime.skeleton.findBone("aim_upper").pose.rotation += clampedPitch;
  runtime.skeleton.updateWorldTransform(Physics.none);
  runtime.currentPoseKey = poseKey;
  return true;
}

function selectAnimation(drawProgress, releaseProgress, idleTime) {
  if (releaseProgress !== null) {
    return { name: "release", time: releaseProgress * SPINE_RELEASE_DURATION };
  }
  if (drawProgress >= 0.995) {
    return { name: "full_draw", time: idleTime % 1 };
  }
  if (drawProgress > 0.002) {
    return { name: "draw", time: drawProgress * SPINE_DRAW_DURATION };
  }
  return { name: "idle", time: idleTime % 1.5 };
}

function bonePoint(name) {
  const bone = runtime.skeleton?.findBone(name);
  const pose = bone?.appliedPose;
  return pose ? { x: pose.worldX, y: pose.worldY } : null;
}

async function load() {
  try {
    const assets = new AssetManager();
    assets.loadTextureAtlas(ATLAS_URL);
    assets.loadJson(JSON_URL);
    await assets.loadAll();

    const atlas = assets.require(ATLAS_URL);
    const json = assets.require(JSON_URL);
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(json);
    runtime.skeleton = new Skeleton(data);
    runtime.state = new AnimationState(new AnimationStateData(data));
    runtime.ready = true;

    applyAnimation("full_draw", 0, 0);
    const fullDrawBowHand = bonePoint("bow_hand");
    if (Number.isFinite(fullDrawBowHand?.x) && Number.isFinite(fullDrawBowHand?.y)) {
      runtime.fullDrawBowHand = fullDrawBowHand;
    }
    runtime.currentPoseKey = "";
  } catch (error) {
    runtime.error = error instanceof Error ? error.message : String(error);
    console.error("Could not load the Spine longbowman", error);
  }
}

export const spineArcherReadyPromise = load();

export function isSpineArcherReady() {
  return runtime.ready;
}

export function getSpineArcherError() {
  return runtime.error;
}

export function drawSpineArcher(ctx, {
  root,
  drawProgress,
  releaseProgress,
  ready = false,
  pitchDegrees = 0,
  idleTime = performance.now() / 1000,
}) {
  if (!runtime.ready) return false;
  const animation = selectAnimation(drawProgress, releaseProgress, idleTime);
  applyAnimation(animation.name, animation.time, pitchDegrees);

  let renderer = runtime.renderers.get(ctx);
  if (!renderer) {
    renderer = new SkeletonRenderer(ctx);
    renderer.triangleRendering = true;
    runtime.renderers.set(ctx, renderer);
  }

  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.scale(ARCHER_WORLD_SCALE, -ARCHER_WORLD_SCALE);
  if (ready) {
    ctx.shadowColor = "rgba(198,154,58,0.8)";
    ctx.shadowBlur = 18;
  }
  renderer.draw(runtime.skeleton);
  ctx.restore();
  return true;
}

function toCanvasPoint(point) {
  return point ? {
    x: point.x * ARCHER_WORLD_SCALE,
    y: -point.y * ARCHER_WORLD_SCALE,
  } : null;
}

export function getSpineArcherPosePoints({
  drawProgress,
  releaseProgress,
  pitchDegrees = 0,
  idleTime = 0,
}) {
  if (!runtime.ready) return null;
  const animation = selectAnimation(drawProgress, releaseProgress, idleTime);
  applyAnimation(animation.name, animation.time, pitchDegrees);
  return {
    head: toCanvasPoint({ x: 0, y: 225 }),
    bowShoulder: toCanvasPoint(bonePoint("bow_shoulder")),
    drawShoulder: toCanvasPoint(bonePoint("draw_shoulder")),
    bowHand: toCanvasPoint(bonePoint("bow_hand")),
    drawHand: toCanvasPoint(bonePoint("draw_hand")),
    drawElbow: toCanvasPoint(bonePoint("draw_forearm")),
  };
}

export function getSpineFullDrawBowHand(pitchDegrees = 0) {
  if (!runtime.ready) return toCanvasPoint(runtime.fullDrawBowHand);
  applyAnimation("full_draw", 0, pitchDegrees);
  return toCanvasPoint(bonePoint("bow_hand"));
}
