import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { buildTerrain, buildWater, buildTrees, buildRocks, heightAt } from './terrain.js';
import { loadHero } from './character.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { HeroController } from './controller.js';

// ------------------------------------------------------------------- HUD
const hud = {
  healthEl: document.getElementById('health'),
  msgEl: document.getElementById('message'),
  setHealth(v) { this.healthEl.style.width = `${v}%`; },
  showMessage(title, small = '') {
    this.msgEl.innerHTML = `${title}${small ? `<span class="small">${small}</span>` : ''}`;
    this.msgEl.style.opacity = 1;
  },
  hideMessage() { this.msgEl.style.opacity = 0; },
};

// -------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4ee, 70, 460);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1600);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ sky
const sky = new Sky();
sky.scale.setScalar(4000);
scene.add(sky);
const sun = new THREE.Vector3();
{
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.75;
  const elev = THREE.MathUtils.degToRad(38);
  const azim = THREE.MathUtils.degToRad(125);
  sun.setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
  u.sunPosition.value.copy(sun);
}

// --------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xbdd9ee, 0x51683f, 0.85);
scene.add(hemi);

const dirLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -45;
dirLight.shadow.camera.right = 45;
dirLight.shadow.camera.top = 45;
dirLight.shadow.camera.bottom = -45;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 400;
dirLight.shadow.bias = -0.0006;
scene.add(dirLight, dirLight.target);

// ---------------------------------------------------------------- world
scene.add(buildTerrain(), buildWater(), buildTrees(), buildRocks());

// Spell/power-up glow, driven by the controller's busy state each frame.
const aura = new THREE.PointLight(0xffc860, 0, 9, 2);
scene.add(aura);

// ---------------------------------------------------------------- load
const loadBar = document.querySelector('#loadbar > div');
const loadLabel = document.getElementById('load-label');
const overlay = document.getElementById('overlay');
const startHint = document.getElementById('start-hint');

const input = new Input(renderer.domElement);
const orbit = new ThirdPersonCamera(camera, heightAt);

let controller = null;
let hero = null;

loadHero((f) => { loadBar.style.width = `${Math.round(f * 100)}%`; })
  .then((h) => {
    hero = h;
    scene.add(hero.root);
    controller = new HeroController(hero, heightAt, input, orbit, hud);
    hud.setHealth(100);

    loadLabel.style.display = 'none';
    document.getElementById('loadbar').style.display = 'none';
    startHint.style.display = 'block';
    startHint.addEventListener('click', start);
    window.__ready = true;
  })
  .catch((err) => {
    loadLabel.textContent = `Failed to load: ${err.message}`;
    console.error(err);
  });

function start() {
  overlay.classList.add('hidden');
  renderer.domElement.requestPointerLock?.();
}
renderer.domElement.addEventListener('click', () => {
  if (window.__ready && !document.pointerLockElement) renderer.domElement.requestPointerLock?.();
});

// ----------------------------------------------------------------- loop
const clock = new THREE.Clock();
const AURA_COLORS = { power_up: 0xffc860, cast_quick: 0x66aaff, cast_long: 0x66aaff };

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (controller) {
    orbit.handleInput(input);
    controller.update(dt);
    orbit.update(dt, controller.pos);

    // Sun shadow frustum follows the hero.
    dirLight.position.copy(controller.pos).add(sun.clone().multiplyScalar(120));
    dirLight.target.position.copy(controller.pos);

    // Magic glow while channelling.
    const busy = controller.busy;
    if (busy && AURA_COLORS[busy]) {
      aura.color.setHex(AURA_COLORS[busy]);
      aura.intensity = 22 + 12 * Math.sin(performance.now() * 0.012);
      aura.position.copy(controller.pos).add(new THREE.Vector3(0, 1.3, 0));
    } else {
      aura.intensity = Math.max(0, aura.intensity - dt * 120);
    }
  }

  input.consume();
  renderer.render(scene, camera);
}
animate();

// Debug/test hooks (used by the headless screenshot harness).
window.__game = {
  get controller() { return controller; },
  get hero() { return hero; },
  input, orbit, scene, camera,
  hideOverlay: () => overlay.classList.add('hidden'),
};
