// Canoe viewer: shared three.js scene, the Model mode, and switching to the
// Flow and Impact modes (flow.js, impact.js). Scene units are mm, y up:
// boat length on x, the boat's "up" on y, starboard toward -z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), status = $('status');
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05040a');
const camera = new THREE.PerspectiveCamera(30, 1, 10, 120000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.8;
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2f5a, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3000, 6000, 4000); scene.add(sun);
const rim = new THREE.DirectionalLight(0x9fe9ff, 0.5); rim.position.set(-4000, 1500, -3000); scene.add(rim);

const grid = new THREE.GridHelper(9000, 30, 0x00f0ff, 0x1b1736);
grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);

function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(r.height, 1); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const VIEWS = {
  iso: new THREE.Vector3(0.9, 0.55, 1.0), side: new THREE.Vector3(0, 0.02, 1),
  plan: new THREE.Vector3(0, 1, 0.001), end: new THREE.Vector3(1, 0.05, 0.001),
  under: new THREE.Vector3(0.6, -0.7, 0.8),
};
let view = 'iso';
function frameBox(box, dist = 1.75) {
  const c = box.getCenter(new THREE.Vector3());
  const d = VIEWS[view].clone().normalize().multiplyScalar(box.getSize(new THREE.Vector3()).length() * dist);
  camera.position.copy(c).add(d);
  controls.target.copy(c); controls.update();
}

const loader = new GLTFLoader();
const gltfCache = {};
function loadModel(name) {
  if (!gltfCache[name]) gltfCache[name] = new Promise((res, rej) =>
    loader.load(`models/${name}.glb`, g => res(g.scene), undefined, rej));
  return gltfCache[name];
}
const json = {};
function loadJSON(name) {
  if (!json[name]) json[name] = fetch(`models/${name}.json`).then(r => {
    if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
    return r.json();
  });
  return json[name];
}

// ---------------- Model mode ----------------
const modelMode = (() => {
  const pivot = new THREE.Group();
  let current = null, box = null, flipped = false, xray = false, spec = null, name = 'canoe_hull_shell';
  function fit() {
    if (!current) return;
    pivot.rotation.x = flipped ? Math.PI : 0;
    pivot.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(pivot);
    grid.position.y = box.min.y - 2;
    const s = box.getSize(new THREE.Vector3());
    status.textContent = `${Math.round(s.x)} × ${Math.round(s.z)} × ${Math.round(s.y)} mm`;
  }
  function applyXray() {
    if (!current) return;
    current.traverse(o => {
      if (!o.isMesh || !/^(strip_|outer_stem|inner_stem)/.test(o.name)) return;
      if (!o.userData.solid) {
        o.userData.solid = o.material;
        o.userData.ghost = o.material.clone();
        Object.assign(o.userData.ghost, { transparent: true, opacity: 0.16, depthWrite: false });
      }
      o.material = xray ? o.userData.ghost : o.userData.solid;
    });
  }
  function listParts() {
    if (!spec) return;
    const dl = $('parts'); dl.replaceChildren();
    for (const [k, v] of Object.entries(spec.views[name])) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
  }
  async function show(n) {
    name = n;
    status.textContent = 'Loading model…';
    const m = await loadModel(n);
    if (current) pivot.remove(current);
    current = m; pivot.add(current);
    flipped = false; $('flip').classList.remove('on');
    applyXray(); fit(); frameBox(box); listParts();
  }
  const seg = document.querySelector('[aria-label="Model"]');
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pressed(seg, b); show(b.dataset.m).catch(fail);
  });
  $('flip').addEventListener('click', () => { flipped = !flipped; $('flip').classList.toggle('on', flipped); fit(); frameBox(box); });
  $('xray').addEventListener('click', () => { xray = !xray; $('xray').classList.toggle('on', xray); applyXray(); });

  loadJSON('spec').then(s => {
    spec = s;
    const h = $('hydro');
    for (const [label, ref, val] of s.hydro) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const a = document.createElement('dd'); a.className = 'ref'; a.textContent = ref;
      const b = document.createElement('dd'); b.textContent = val;
      h.append(dt, a, b);
    }
    for (const c of s.pattern) { const i = document.createElement('i'); i.style.background = s.colors[c]; $('pattern').append(i); }
    $('pnote').textContent = `${s.pattern.length} strips per side, sheer (left) to keel (right), ${s.strip}. Light along the sheer, fading to dark over the bottom.`;
    for (const [label, col] of s.legend) {
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = col;
      const t = document.createElement('span'); t.textContent = label;
      $('legend').append(sw, t);
    }
    listParts();
  }).catch(() => {});

  let started = false;
  return {
    enter() {
      scene.add(pivot); grid.visible = true;
      if (!started) { started = true; show(name).catch(fail); } else { fit(); frameBox(box); }
    },
    exit() { scene.remove(pivot); },
    reframe() { if (box) frameBox(box); },
    update() {},
  };
})();

function pressed(group, btn) { group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn)); }
function fail(e) { status.textContent = 'Failed: ' + (e && e.message || e); console.error(e); }

// ---------------- shared context for the other modes ----------------
const ctx = { THREE, scene, camera, controls, renderer, stage, status, grid, $, pressed, fail,
  loadModel, loadJSON, frameBox, get view() { return view; } };

const modes = { model: modelMode };
let active = null, activeName = '';
async function setMode(name) {
  if (name === activeName) return;
  if (!modes[name]) {
    status.textContent = 'Loading…';
    const mod = name === 'flow' ? await import('./flow.js') : await import('./impact.js');
    modes[name] = mod.create(ctx);
  }
  if (active) active.exit();
  activeName = name; active = modes[name];
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  document.querySelectorAll('[data-for]').forEach(el => { el.hidden = el.dataset.for !== name; });
  pressed(document.querySelector('.seg.mode'), document.querySelector(`[data-mode="${name}"]`));
  $('modeSub').textContent = {
    model: "Cedar strip canoe · reconstructed from Ted Moores' published lines · mm",
    flow: 'Live flow around the hull · resistance from the real hull shape',
    impact: 'Explicit FE impact · failure index per ply',
  }[name];
  $('legendBar').hidden = true;
  controls.autoRotate = false; $('spin').classList.remove('on');
  active.enter();
  try { history.replaceState(null, '', '#' + name); } catch (e) { /* sandboxed */ }
}
document.querySelector('.seg.mode').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) setMode(b.dataset.mode).catch(fail);
});
const viewSeg = document.querySelector('[aria-label="View"]');
viewSeg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  pressed(viewSeg, b); view = b.dataset.v; active && active.reframe();
});
$('spin').addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; $('spin').classList.toggle('on', controls.autoRotate); });
$('capture').addEventListener('click', () => {
  stage.classList.add('capturing');
  const off = () => { stage.classList.remove('capturing'); stage.removeEventListener('click', off); };
  setTimeout(() => stage.addEventListener('click', off), 50);
  status.textContent = 'Click the view to bring the controls back';
});

resize();
const start = (location.hash || '').slice(1);
setMode(['flow', 'impact'].includes(start) ? start : 'model').catch(fail);

const clock = new THREE.Clock();
(function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  if (active) active.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
})();
