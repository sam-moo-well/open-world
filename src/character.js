// Hero loading: the Maria rig plus the animation clips the controller uses.
//
// Facts from docs/ANIMATION_AUDIT.md that this module encodes:
//  - All FBXs share one mixamorig skeleton, 30 fps, centimetres, Y-up.
//  - Root motion is baked into Hips translation (no root bone), so every
//    clip gets its Hips XZ pinned to frame 0 and movement is driven by the
//    controller instead. Y is kept (crouch depth, jumps, deaths need it).
//  - The sword mesh is rigid-bound 100% to RightHand, i.e. it is a socket:
//    here it is converted to a plain Mesh so draw/sheathe can re-mount it
//    between the hand and the back.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Mixamo's "(2)"/"(3)" suffixes are download artefacts; the measured mapping
// lives in assets/animations/manifest.json. Slugs here match that manifest.
const CLIP_FILES = {
  idle: 'great sword idle.fbx',
  idle_var_a: 'great sword idle (2).fbx',
  idle_var_b: 'great sword idle (3).fbx',
  idle_long: 'great sword idle (5).fbx',
  walk_fwd: 'great sword walk.fbx',
  run_fwd: 'great sword run (2).fbx',
  crouch_enter: 'great sword crouching.fbx',
  crouch_exit: 'great sword crouching (2).fbx',
  crouch_idle: 'great sword crouching (3).fbx',
  jump_standing: 'great sword jump (2).fbx',
  jump_running: 'great sword jump.fbx',
  slash_1: 'great sword slash.fbx',
  slash_2: 'great sword slash (3).fbx',
  slash_3: 'great sword slash (5).fbx',
  slash_lunge: 'great sword slash (4).fbx',
  attack_spin: 'great sword high spin attack.fbx',
  attack_jump: 'great sword jump attack.fbx',
  attack_slide: 'great sword slide attack.fbx',
  kick_1: 'great sword kick.fbx',
  kick_2: 'great sword kick (2).fbx',
  block_enter: 'great sword blocking.fbx',
  block_hold: 'great sword blocking (2).fbx',
  block_exit: 'great sword blocking (3).fbx',
  hit_1: 'great sword impact.fbx',
  hit_2: 'great sword impact (2).fbx',
  hit_3: 'great sword impact (3).fbx',
  hit_4: 'great sword impact (4).fbx',
  hit_5: 'great sword impact (5).fbx',
  death_1: 'two handed sword death.fbx',
  death_2: 'two handed sword death (2).fbx',
  sword_draw: 'draw a great sword 1.fbx',
  sword_sheathe: 'draw a great sword 2.fbx',
  power_up: 'great sword power up.fbx',
  cast_quick: 'spell cast.fbx',
  cast_long: 'great sword casting.fbx',
};

const RIG_URL = '/character/Maria WProp J J Ong.fbx';

// Pin Hips XZ to the first key; keep Y (crouch/jump/death depend on it).
function stripRootXZ(clip) {
  for (const track of clip.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
}

function findBone(root, suffix) {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isBone && o.name.endsWith(suffix)) found = o;
  });
  return found;
}

// Replace the rigid-skinned sword with a plain Mesh socketed to a bone.
// Local matrix under the bind bone is boneInverse * bindMatrix (that is
// exactly what the skinning path evaluates for a 100%-one-bone bind).
function socketSword(rig, hand, spine) {
  let skinned = null;
  rig.traverse((o) => {
    if (o.isSkinnedMesh && /sword/i.test(o.name)) skinned = o;
  });
  if (!skinned) return null;

  const idx = skinned.skeleton.bones.findIndex((b) => b.name.endsWith('RightHand'));
  const handLocal = new THREE.Matrix4()
    .copy(skinned.skeleton.boneInverses[idx])
    .multiply(skinned.bindMatrix);

  const mesh = new THREE.Mesh(skinned.geometry, skinned.material);
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  skinned.removeFromParent();

  // Back mount, built in Spine2 bone space. The sword geometry lives in
  // bind-space coordinates (its origin is nowhere near the blade), so the
  // matrix is derived from the geometry's own bounding box: map the blade's
  // long axis onto a diagonal across the back, and its centre to a point
  // behind the chest. Directions are specified in character space and
  // converted through the bind pose, so no bone-axis guesswork is involved.
  rig.updateMatrixWorld(true);
  skinned.geometry.computeBoundingBox();
  const bb = skinned.geometry.boundingBox;
  const size = bb.getSize(new THREE.Vector3());
  const centre = bb.getCenter(new THREE.Vector3());
  const bladeAxis = new THREE.Vector3();
  if (size.x >= size.y && size.x >= size.z) bladeAxis.set(1, 0, 0);
  else if (size.y >= size.z) bladeAxis.set(0, 1, 0);
  else bladeAxis.set(0, 0, 1);

  const spineInv = spine.matrixWorld.clone().invert();
  const toSpine = new THREE.Matrix4().multiplyMatrices(spineInv, rig.matrixWorld);
  const charDir = (x, y, z) =>
    new THREE.Vector3(x, y, z).transformDirection(toSpine).normalize();

  const backLocal = new THREE.Matrix4();
  function composeBack({ tilt = -0.45, up = 10, back = 16, side = 4, flip = true } = {}) {
    // Blade diagonal: mostly character-up, tilted toward the right shoulder.
    const d = charDir(0, 1, 0).multiplyScalar(1)
      .addScaledVector(charDir(1, 0, 0), tilt).normalize();
    if (flip) d.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(bladeAxis, d);
    const p = new THREE.Vector3()
      .addScaledVector(charDir(0, 0, -1), back)     // behind the torso (cm)
      .addScaledVector(charDir(0, 1, 0), up)
      .addScaledVector(charDir(1, 0, 0), side);
    p.sub(centre.clone().applyQuaternion(q));       // put bbox centre at p
    backLocal.compose(p, q, new THREE.Vector3(1, 1, 1));
    if (mesh.parent === spine) mesh.matrix.copy(backLocal);
  }
  composeBack();

  const sword = {
    mesh,
    mountHand() { hand.add(mesh); mesh.matrix.copy(handLocal); },
    mountBack() { spine.add(mesh); mesh.matrix.copy(backLocal); },
    tuneBack: composeBack,                          // screenshot-tuning hook
  };
  sword.mountHand();
  return sword;
}

export async function loadHero(onProgress) {
  const loader = new FBXLoader();
  const names = Object.keys(CLIP_FILES);
  const total = names.length + 1;
  let done = 0;
  const tick = () => onProgress && onProgress(++done / total);

  const rigPromise = loader.loadAsync(RIG_URL).then((r) => { tick(); return r; });
  const clipPromises = names.map((name) =>
    loader.loadAsync('/animations/' + CLIP_FILES[name]).then((fbx) => {
      tick();
      const clip = fbx.animations[0];
      clip.name = name;
      stripRootXZ(clip);
      return [name, clip];
    }),
  );

  const [rig, ...entries] = await Promise.all([rigPromise, ...clipPromises]);

  // Normalise: Mixamo exports in centimetres; scale so the hero is 1.72 m.
  let bodyMesh = null;
  rig.traverse((o) => {
    if (o.isSkinnedMesh && !/sword/i.test(o.name)) bodyMesh = o;
    if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
  });
  bodyMesh.geometry.computeBoundingBox();
  const bb = bodyMesh.geometry.boundingBox;
  const rawHeight = bb.max.y - bb.min.y;
  const scale = 1.72 / rawHeight;

  const root = new THREE.Group();
  root.name = 'hero';
  rig.scale.setScalar(scale);
  root.add(rig);

  const hand = findBone(rig, 'RightHand');
  const spine = findBone(rig, 'Spine2');
  const sword = socketSword(rig, hand, spine);

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  for (const [name, clip] of entries) actions[name] = mixer.clipAction(clip);

  return { root, rig, mixer, actions, sword, scale, rawHeight };
}
