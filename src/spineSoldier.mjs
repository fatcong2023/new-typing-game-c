import {
  AnimationState, AnimationStateData, AssetManager, AtlasAttachmentLoader,
  ManagedWebGLRenderingContext, Physics, Skeleton, SkeletonJson, SceneRenderer,
} from './vendor/spine-webgl.min.mjs';
import {
  SOLDIER_SCALE, SOLDIER_VIEW as VIEW, selectSoldierAnimation, soldierDeathTransform,
} from './soldierAnimation.mjs';

const ATLAS_URL = new URL('./assets/spine/french-soldier-combat.atlas', import.meta.url).href;
const JSON_URL = new URL('./assets/spine/french-soldier-combat.json', import.meta.url).href;
// Explicit time sampling lets all infantry share one renderer and texture atlas
// while retaining independent walk phases, attack clocks and death poses.
const runtime = {
  ready: false, error: null, skeleton: null, state: null,
  surface: null, renderer: null, poseKey: '', renderedKey: '',
};

async function load() {
  try {
    const surface = runtime.surface = document.createElement('canvas');
    const context = new ManagedWebGLRenderingContext(surface, {
      alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true,
    });
    if (!context.gl) throw new Error('WebGL is unavailable for the French infantry');
    const renderer = runtime.renderer = new SceneRenderer(surface, context, false);
    renderer.camera.position.set(VIEW.x + VIEW.width / 2, VIEW.y + VIEW.height / 2, 0);
    renderer.camera.setViewport(VIEW.width, VIEW.height);
    surface.addEventListener('webglcontextrestored', () => { runtime.renderedKey = ''; });
    const assets = new AssetManager(context);
    assets.loadTextureAtlas(ATLAS_URL);
    assets.loadJson(JSON_URL);
    await assets.loadAll();
    if (assets.hasErrors()) throw new Error(JSON.stringify(assets.getErrors()));
    const reader = new SkeletonJson(new AtlasAttachmentLoader(assets.require(ATLAS_URL)));
    reader.scale = SOLDIER_SCALE;
    const data = reader.readSkeletonData(assets.require(JSON_URL));
    for (const name of ['walk_shield_overhead', 'attack_shield_overhead']) {
      if (!data.findAnimation(name)) throw new Error(`Missing French infantry animation: ${name}`);
    }
    runtime.skeleton = new Skeleton(data);
    runtime.state = new AnimationState(new AnimationStateData(data));
    runtime.ready = true;
  } catch (error) {
    runtime.error = error instanceof Error ? error.message : String(error);
    console.error('Could not load the Spine French infantry', error);
  }
}

export const spineSoldierReadyPromise = load();
export const isSpineSoldierReady = () => runtime.ready && !runtime.renderer.context.gl.isContextLost();
export const getSpineSoldierError = () => runtime.error;

function applyPose(animation) {
  const key = `${animation.animation}:${animation.time.toFixed(5)}`;
  if (key === runtime.poseKey) return;
  runtime.state.clearTracks();
  runtime.skeleton.setupPose();
  runtime.state.setAnimation(0, animation.animation, false).trackTime = animation.time;
  runtime.state.apply(runtime.skeleton);
  runtime.skeleton.updateWorldTransform(Physics.none);
  runtime.poseKey = key;
}

function renderSurface(ctx) {
  const t = ctx.getTransform();
  const resolution = Math.min(4, Math.max(1, 2 * Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d))));
  const width = Math.ceil(VIEW.width * resolution), height = Math.ceil(VIEW.height * resolution);
  const surface = runtime.surface;
  if (surface.width !== width || surface.height !== height) {
    surface.width = width; surface.height = height;
    runtime.renderedKey = '';
  }
  if (runtime.renderedKey !== runtime.poseKey) {
    const renderer = runtime.renderer, gl = renderer.context.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderer.begin();
    renderer.drawSkeleton(runtime.skeleton);
    renderer.end();
    runtime.renderedKey = runtime.poseKey;
  }
  return surface;
}

export function drawSpineSoldier(ctx, enemy) {
  if (!isSpineSoldierReady()) return false;
  const animation = selectSoldierAnimation(enemy);
  applyPose(animation);
  const surface = renderSurface(ctx);
  const death = soldierDeathTransform(animation.deathProgress);
  ctx.save();
  ctx.translate(death.x, death.y);
  ctx.rotate(death.rotation);
  ctx.globalAlpha *= death.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(surface, VIEW.x, -(VIEW.y + VIEW.height), VIEW.width, VIEW.height);
  ctx.restore();
  return true;
}

function bonePoint(name, death, endpoint = false) {
  const bone = runtime.skeleton.findBone(name), p = bone.appliedPose;
  const x = p.worldX + (endpoint ? p.a * bone.data.length : 0);
  const y = -(p.worldY + (endpoint ? p.c * bone.data.length : 0));
  const c = Math.cos(death.rotation), s = Math.sin(death.rotation);
  return { x: death.x + x * c - y * s, y: death.y + x * s + y * c };
}

export function getSpineSoldierTextState(enemy) {
  const animation = selectSoldierAnimation(enemy), death = soldierDeathTransform(animation.deathProgress);
  const ready = isSpineSoldierReady();
  const result = {
    animationMode: 'spine', assetsReady: ready, assetError: runtime.error,
    mode: animation.mode, animation: animation.animation,
    animationTime: Number(animation.time.toFixed(4)), deathProgress: animation.deathProgress,
    bodyRotation: death.rotation, weaponReleased: false, root: { x: death.x, y: death.y }, joints: {},
  };
  if (!ready) return result;
  applyPose(animation);
  const names = {
    pelvis: 'hips', chest: 'torso', head: 'head',
    swordShoulder: 'sword_upper_arm', swordElbow: 'sword_forearm',
    swordHand: 'sword_hand', swordGrip: 'sword',
    shieldShoulder: 'overhead_upper_arm', shieldElbow: 'overhead_forearm',
    shieldHand: 'overhead_hand', shieldGrip: 'overhead_shield',
    nearHip: 'near_thigh', nearKnee: 'near_shin', nearAnkle: 'near_foot', nearFoot: 'near_toe',
    farHip: 'far_thigh', farKnee: 'far_shin', farAnkle: 'far_foot', farFoot: 'far_toe',
  };
  for (const [key, name] of Object.entries(names)) result.joints[key] = bonePoint(name, death);
  result.joints.swordTip = bonePoint('sword', death, true);
  return result;
}
