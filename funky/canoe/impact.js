// Impact mode: set up a hit, run the explicit FE solver in a worker, then play
// it back in slow motion with failure-index colours, exaggerated deformation,
// a force trace and an unrolled damage map. Scene units mm, y up.

// bump when impact-core.js changes so browsers don't mix old and new solver code
const CORE_VERSION = '4';
const MODES = ['fibre tension', 'fibre compression', 'cross-grain tension', 'cross-grain compression', 'shear'];

export function create(ctx) {
  const { THREE, scene, $, pressed, status } = ctx;
  const root = new THREE.Group();
  let mesh = null, geo = null, hullMesh = null, edges = null, obMesh = null, worker = null;
  let N = 0, NE = 0, X0 = null, vAdj = null, result = null, frame = 0, playing = false, tSim = 0;
  const P = { obstacle: 'rock', target: 'bow', speed: 2, approach: 0, obAngle: 0, size: 0.4, paddlers: 2, paddlerKg: 80, gear: 20, float: true };
  const V = { slow: 100, colour: 'S', def: 5, peak: false };
  const toW = (x, y, z) => [x * 1000, z * 1000, -y * 1000];       // model m -> scene mm

  // ---------------- colours ----------------
  const WOOD = new THREE.Color('#d8b98c');
  const STOPS = [[0, WOOD], [0.2, new THREE.Color('#1fd16b')], [0.6, new THREE.Color('#ffa31a')],
    [1.0, new THREE.Color('#ff2a2a')], [1.6, new THREE.Color('#b0004a')]];
  const tmp = new THREE.Color();
  function fiColour(v, out) {
    if (v <= 0) return out.copy(WOOD);
    for (let i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
        return out.copy(ca).lerp(cb, (v - a) / (b - a));
      }
    }
    return out.copy(STOPS[STOPS.length - 1][1]);
  }
  function legend() {
    const lb = $('legendBar');
    lb.innerHTML = `<strong>${V.colour === 'S' ? 'Failure index, structure' : 'Failure index, cedar core across the grain'}</strong>
      <div class="ramp" style="background:linear-gradient(90deg,#d8b98c 0%,#1fd16b 12.5%,#ffa31a 37.5%,#ff2a2a 62.5%,#b0004a 100%)"></div>
      <div class="ticks"><span>0</span><span>0.6</span><span>1 fails</span><span>1.6+</span></div>`;
    lb.hidden = false;
  }

  // ---------------- hull mesh ----------------
  function loadCore() {
    if (self.CanoeImpact) return Promise.resolve();
    return new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = `impact-core.js?v=${CORE_VERSION}`; sc.onload = res; sc.onerror = rej;
      document.head.append(sc);
    });
  }
  function preview() {
    if (!mesh || !self.CanoeImpact || !self.CanoeImpact.previewObstacle) return;
    result = null; playing = false;
    $('iPlayback').hidden = true; $('iResults').hidden = true;
    resetHull();
    try { buildObstacle(self.CanoeImpact.previewObstacle(mesh, params())); } catch (e) { console.warn(e); }
  }
  function resetHull() {
    const pos = geo.attributes.position;
    mesh.nodes.forEach((v, i) => pos.setXYZ(i, ...toW(...v)));
    pos.needsUpdate = true; geo.computeVertexNormals();
    edges.geometry.dispose(); edges.geometry = new THREE.WireframeGeometry(geo);
    paint(null);
  }

  async function loadMesh() {
    await loadCore();
    mesh = await ctx.loadJSON('fe_mesh');
    N = mesh.nodes.length; NE = mesh.tris.length;
    X0 = new Float64Array(N * 3);
    mesh.nodes.forEach((v, i) => X0.set(v, 3 * i));
    // non-indexed geometry for crisp per-face colours in the damage map look,
    // but smooth per-vertex colours read better on the hull: indexed it is
    geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    mesh.nodes.forEach((v, i) => pos.set(toW(...v), 3 * i));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setIndex(mesh.tris.flat());
    geo.computeVertexNormals();
    hullMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide }));
    edges = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
    root.add(hullMesh, edges);
    // node -> elements
    vAdj = Array.from({ length: N }, () => []);
    mesh.tris.forEach((t, e) => t.forEach(i => vAdj[i].push(e)));
    paint(null);
    // a calm water plane at the design waterline
    const w = new THREE.Mesh(new THREE.PlaneGeometry(14000, 9000), new THREE.MeshBasicMaterial({ color: 0x0a1a3a, transparent: true, opacity: 0.45, depthWrite: false }));
    w.rotation.x = -Math.PI / 2; w.position.y = mesh.hull.draft * 1000;
    root.add(w);
    worker = new Worker(`impact-worker.js?v=${CORE_VERSION}`);
    worker.postMessage({ type: 'mesh', mesh });
    worker.onmessage = onWorker;
    preview();
  }
  function paint(fi) {
    const col = geo.attributes.color;
    for (let i = 0; i < N; i++) {
      let v = 0;
      if (fi) for (const e of vAdj[i]) if (fi[e] > v) v = fi[e];
      fiColour(v, tmp);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }

  // ---------------- obstacle ----------------
  function buildObstacle(ob, at) {
    if (obMesh) { root.remove(obMesh); obMesh.traverse(o => o.geometry && o.geometry.dispose()); }
    const c = at || ob.c;
    if (ob.kind === 'rock') {
      const g = new THREE.IcosahedronGeometry(ob.R * 1000, 4);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const n = 1 + 0.035 * Math.sin(v.x * 0.013 + 1.3) * Math.cos(v.y * 0.011) + 0.025 * Math.sin(v.z * 0.021);
        v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      obMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95, flatShading: true }));
    } else if (ob.kind === 'log') {
      const g = new THREE.CylinderGeometry(ob.R * 1000, ob.R * 1000, ob.len * 1000, 24, 1);
      obMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }));
      const ax = new THREE.Vector3(...toW(ob.axis[0], ob.axis[1], 0)).normalize();
      obMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
    } else {
      const g = new THREE.BoxGeometry(300, 1400, 5000);
      obMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8b8f98, roughness: 0.9 }));
      // plane n.x = off in model coords; box face sits on the plane
      const n = new THREE.Vector3(...toW(ob.n[0], ob.n[1], 0)).normalize();
      obMesh.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), n);
      const onPlane = [ob.n[0] * ob.off, ob.n[1] * ob.off];
      const ctr = new THREE.Vector3(...toW(onPlane[0], onPlane[1], 0.3)).addScaledVector(n, -150);
      obMesh.position.copy(ctr);
      root.add(obMesh);
      return;
    }
    obMesh.position.set(...toW(c[0], c[1], c[2]));
    root.add(obMesh);
  }
  function params() {
    const stern = P.target === 'stern' || P.target === 'sternQuarter';
    return {
      obstacle: P.obstacle, target: P.target, speed: P.speed, size: P.size,
      approachDeg: (stern ? 180 : 0) + P.approach, obstacleDeg: P.obAngle,
      paddlers: P.paddlers, paddlerKg: P.paddlerKg, gearKg: P.gear, logFloats: P.float,
      draft: mesh ? mesh.hull.draft : 0.115,
    };
  }

  // ---------------- run ----------------
  function run() {
    if (!worker) return;
    $('iRun').disabled = true;
    $('busy').hidden = false; $('busyText').textContent = 'Running the impact…'; $('busyBar').style.width = '0%';
    playing = false;
    worker.postMessage({ type: 'run', params: params() });
  }
  function onWorker(e) {
    const m = e.data;
    if (m.type === 'progress') { $('busyBar').style.width = `${Math.round(m.p * 100)}%`; return; }
    $('busy').hidden = true; $('iRun').disabled = false;
    if (m.type === 'error') { status.textContent = 'Impact failed: ' + m.message; return; }
    result = m;
    result.rigid = rigidFits(m);
    buildObstacle(m.obstacle, Array.from(m.OB.slice(0, 3)));
    $('iPlayback').hidden = false; $('iResults').hidden = false;
    $('iTime').max = m.nf - 1; $('iTime').value = 0;
    frame = 0; tSim = 0; playing = true; $('iPlay').textContent = 'Pause';
    showResults();
    showFrame(0);
  }

  // rigid-body fit per frame (Horn's quaternion method), so deformation can be
  // exaggerated without exaggerating the motion of the whole boat
  function rigidFits(m) {
    const fits = [];
    const N3 = N * 3;
    let cx0 = 0, cy0 = 0, cz0 = 0;
    for (let i = 0; i < N; i++) { cx0 += X0[3 * i]; cy0 += X0[3 * i + 1]; cz0 += X0[3 * i + 2]; }
    cx0 /= N; cy0 /= N; cz0 /= N;
    for (let k = 0; k < m.nf; k++) {
      const X = m.X.subarray(k * N3, (k + 1) * N3);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < N; i++) { cx += X[3 * i]; cy += X[3 * i + 1]; cz += X[3 * i + 2]; }
      cx /= N; cy /= N; cz /= N;
      let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
      for (let i = 0; i < N; i++) {
        const ax = X0[3 * i] - cx0, ay = X0[3 * i + 1] - cy0, az = X0[3 * i + 2] - cz0;
        const bx = X[3 * i] - cx, by = X[3 * i + 1] - cy, bz = X[3 * i + 2] - cz;
        Sxx += ax * bx; Sxy += ax * by; Sxz += ax * bz; Syx += ay * bx; Syy += ay * by; Syz += ay * bz; Szx += az * bx; Szy += az * by; Szz += az * bz;
      }
      const Nm = [
        [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
        [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
        [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
        [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
      ];
      const shift = Math.abs(Sxx) + Math.abs(Syy) + Math.abs(Szz) + Math.abs(Sxy) + Math.abs(Syz) + Math.abs(Szx) + 1e-9;
      let q = [1, 0, 0, 0];
      for (let it = 0; it < 60; it++) {
        const r = [0, 0, 0, 0];
        for (let a = 0; a < 4; a++) { r[a] = shift * q[a]; for (let b = 0; b < 4; b++) r[a] += Nm[a][b] * q[b]; }
        const l = Math.hypot(...r); q = r.map(v => v / l);
      }
      const [w, x, y, z] = q;
      const R = [
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
      ];
      fits.push({ R, c0: [cx0, cy0, cz0], c: [cx, cy, cz] });
    }
    return fits;
  }

  function showFrame(k) {
    if (!result) return;
    frame = k;
    const N3 = N * 3, X = result.X.subarray(k * N3, (k + 1) * N3);
    const { R, c0, c } = result.rigid[k];
    const pos = geo.attributes.position;
    for (let i = 0; i < N; i++) {
      const ax = X0[3 * i] - c0[0], ay = X0[3 * i + 1] - c0[1], az = X0[3 * i + 2] - c0[2];
      const rx = R[0] * ax + R[1] * ay + R[2] * az + c[0];
      const ry = R[3] * ax + R[4] * ay + R[5] * az + c[1];
      const rz = R[6] * ax + R[7] * ay + R[8] * az + c[2];
      const x = rx + V.def * (X[3 * i] - rx), y = ry + V.def * (X[3 * i + 1] - ry), z = rz + V.def * (X[3 * i + 2] - rz);
      const w = toW(x, y, z);
      pos.setXYZ(i, w[0], w[1], w[2]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    edges.geometry.dispose(); edges.geometry = new THREE.WireframeGeometry(geo);
    const fi = V.peak ? (V.colour === 'S' ? result.peakS : result.peakC)
      : (V.colour === 'S' ? result.S : result.C).subarray(k * NE, (k + 1) * NE);
    paint(fi);
    if (obMesh && result.obstacle.kind === 'log') obMesh.position.set(...toW(result.OB[3 * k], result.OB[3 * k + 1], result.OB[3 * k + 2]));
    const t = result.T[k] * 1000, F = result.F[k] / 1000;
    $('iTimeOut').textContent = `t = ${t.toFixed(1)} ms · contact force ${F.toFixed(2)} kN`;
    $('iTime').value = k;
    drawForce();
  }

  // ---------------- results ----------------
  function where(e) {
    const t = mesh.tris[e];
    let x = 0, u = 0;
    t.forEach(i => { x += mesh.nodes[i][0] / 3; u += Math.abs(mesh.unroll[i][1]) / 3; });
    const L = mesh.hull.L / 2;
    const along = x > 0.62 * L ? 'near the bow' : x > 0.2 * L ? 'in the forward quarter' : x < -0.62 * L ? 'near the stern' : x < -0.2 * L ? 'in the aft quarter' : 'amidships';
    const cls = mesh.elemClass[e];
    const part = cls === 'gunwale' ? 'at the gunwale' : cls === 'stem' ? 'at the stem' : u < 0.35 ? 'on the bottom' : u > 0.8 ? 'just below the gunwale' : 'on the side';
    return `${part} ${along}`;
  }
  function plyName(e, ply) {
    const cls = mesh.elemClass[e];
    if (ply === 9) return cls === 'stem' ? 'cherry stem' : 'ash gunwale';
    const lay = mesh.layups[cls];
    const name = lay[ply] && lay[ply][0];
    if (name === 'cedar') return 'cedar strip core';
    return ply === 0 ? 'outer glass' : ply === lay.length - 1 ? 'inner glass' : 'outer glass (second ply)';
  }
  function failedText(s) {
    const pct = 100 * s.failedElems / s.nElem;
    // mean element area is ~3,100 mm^2 on this mesh
    if (pct < 1) return `A patch of about ${Math.max(1, Math.round(s.failedElems * 0.0031 * 1e4))} cm² is past its limit.`;
    return `About ${Math.round(pct)}% of the hull is past its limit.`;
  }
  function showResults() {
    const s = result.summary;
    const v = $('iVerdict');
    const fi = s.worstFI, coreFrac = s.crackedElems / s.nElem;
    let cls, txt;
    if (fi < 0.6 && s.worstCore < 1) { cls = 'ok'; txt = `No damage expected. The worst spot reaches ${Math.round(fi * 100)}% of its strength (${plyName(s.worstElem, s.worstPly)}, ${where(s.worstElem)}).`; }
    else if (fi < 1) { cls = 'warn'; txt = `Close call. The ${plyName(s.worstElem, s.worstPly)} ${where(s.worstElem)} reaches ${Math.round(fi * 100)}% of its strength${s.worstCore >= 1 ? ', and the cedar core cracks across the grain inside the glass' : ''}.`; }
    else { cls = 'bad'; txt = `Damage. The ${plyName(s.worstElem, s.worstPly)} fails in ${MODES[s.worstMode]} ${where(s.worstElem)} (index ${fi.toFixed(2)}). ${failedText(s)}`; }
    v.className = 'verdict ' + cls; v.textContent = txt;
    const f = (x, d = 1) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
    const stillTouching = s.contactTime > s.simTime - 0.002;
    const rows = [
      ['Hit', `${s.target}, ${f(s.speed, 2)} m/s`],
      ['Moving mass (canoe + load)', `${f(s.massCanoe + s.payload, 0)} kg`],
      ['Water carried along (added mass)', `${f(s.addedMass, 0)} kg`],
      ['Kinetic energy', `${f(s.KE0, 0)} J`],
      ['Peak contact force', `${f(s.peakForce / 1000, 2)} kN`],
      ['Contact time', `${f(s.contactTime * 1000, 0)} ms${stillTouching ? ' (still touching)' : ''}`],
      ['Impulse', `${f(s.impulse, 0)} N·s`],
      ['Energy taken out of the motion', `${f(s.energyAbsorbed, 0)} J`],
      ['Speed afterwards', `${f(Math.hypot(...s.vOut), 2)} m/s`],
      ['Cedar core cracked across the grain', `${f(100 * coreFrac, 0)}% of hull`],
      ['Elements · time step', `${s.nElem} · ${f(s.dt * 1e6, 1)} µs × ${s.steps.toLocaleString()}`],
    ];
    const dl = $('iStats'); dl.replaceChildren();
    for (const [k, val] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = val; dl.append(dt, dd);
    }
    drawMap();
  }
  function drawForce() {
    const cv = $('iForce'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const css = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, W, H);
    const pad = { l: 46, r: 10, t: 12, b: 26 };
    const T = result.T, F = result.F, tMax = T[T.length - 1] || 1;
    let fMax = 0; for (const v of F) fMax = Math.max(fMax, v);
    const step = niceStep(fMax / 1000 / 4) * 1000, top = Math.max(step, Math.ceil(fMax / step) * step);
    const X = t => pad.l + (W - pad.l - pad.r) * t / tMax, Y = f => H - pad.b - (H - pad.t - pad.b) * f / top;
    g.strokeStyle = css.getPropertyValue('--line'); g.fillStyle = css.getPropertyValue('--muted');
    g.font = '18px JetBrains Mono, monospace'; g.lineWidth = 1;
    for (let f = 0; f <= top + 1; f += step) {
      g.beginPath(); g.moveTo(pad.l, Y(f)); g.lineTo(W - pad.r, Y(f)); g.stroke();
      g.fillText(`${(f / 1000).toFixed(step < 1000 ? 1 : 0)}`, 4, Y(f) + 6);
    }
    g.fillText('kN', 4, pad.t + 4);
    const tStep = niceStep(tMax * 1000 / 5);
    for (let t = 0; t <= tMax * 1000 + 1e-6; t += tStep) g.fillText(`${Math.round(t)}`, X(t / 1000) - 8, H - 4);
    g.fillText('ms', W - 30, H - 4);
    g.strokeStyle = '#00f0ff'; g.lineWidth = 2.5; g.beginPath();
    for (let k = 0; k < T.length; k++) { k ? g.lineTo(X(T[k]), Y(F[k])) : g.moveTo(X(T[k]), Y(F[k])); }
    g.stroke();
    g.strokeStyle = '#ff2bd6'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(T[frame]), pad.t); g.lineTo(X(T[frame]), H - pad.b); g.stroke();
  }
  function niceStep(x) {
    const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9))), m = x / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function drawMap() {
    const cv = $('iMap'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue('--stage'); g.fillRect(0, 0, W, H);
    const pad = 28, L = mesh.hull.L / 2;
    const px = x => pad + (W - 2 * pad) * (x + L) / (2 * L), py = u => pad + (H - 2 * pad) * (1 - u) / 2;
    const fi = V.colour === 'S' ? result.peakS : result.peakC;
    mesh.tris.forEach((t, e) => {
      fiColour(fi[e], tmp);
      g.fillStyle = `rgb(${tmp.r * 255 | 0},${tmp.g * 255 | 0},${tmp.b * 255 | 0})`;
      g.strokeStyle = g.fillStyle;
      g.beginPath();
      t.forEach((i, k) => { const [x, u] = mesh.unroll[i]; k ? g.lineTo(px(x), py(u)) : g.moveTo(px(x), py(u)); });
      g.closePath(); g.fill(); g.stroke();
    });
    g.fillStyle = css.getPropertyValue('--muted'); g.font = '17px JetBrains Mono, monospace';
    g.fillText('STERN', 4, H / 2 + 6); g.fillText('BOW', W - 42, H / 2 + 6);
    g.fillText('STARBOARD SHEER', W / 2 - 80, 18); g.fillText('PORT SHEER', W / 2 - 55, H - 6);
    g.strokeStyle = css.getPropertyValue('--line'); g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(pad, py(0)); g.lineTo(W - pad, py(0)); g.stroke(); g.setLineDash([]);
    // where it hit
    const ti = result.obstacle.target;
    const [hx, hu] = mesh.unroll[ti];
    g.strokeStyle = '#00f0ff'; g.lineWidth = 2; g.beginPath(); g.arc(px(hx), py(hu), 9, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
  }

  // ---------------- controls ----------------
  const outs = {
    iSpeed: v => `${(+v).toFixed(2)} m/s · ${(v * 3.6).toFixed(1)} km/h`,
    iApproach: v => +v === 0 ? '0° (straight)' : `${Math.abs(v)}° to ${v > 0 ? 'starboard' : 'port'}`,
    iObAngle: v => `${v}°`, iSize: v => P.obstacle === 'log' ? `${Math.round(v * 2000)} mm diameter` : `${Math.round(v * 1000)} mm`,
    iPaddlers: v => `${v}`, iPaddlerKg: v => `${v} kg`, iGear: v => `${v} kg`,
  };
  const keyOf = { iSpeed: 'speed', iApproach: 'approach', iObAngle: 'obAngle', iSize: 'size', iPaddlers: 'paddlers', iPaddlerKg: 'paddlerKg', iGear: 'gear' };
  for (const id of Object.keys(outs)) {
    const el = $(id);
    el.addEventListener('input', () => { P[keyOf[id]] = +el.value; $(id + 'Out').textContent = outs[id](el.value); preview(); });
    $(id + 'Out').textContent = outs[id](el.value);
  }
  function syncObstacleUI() {
    $('iObAngleWrap').hidden = P.obstacle === 'rock';
    $('iFloatWrap').hidden = P.obstacle !== 'log';
    $('iSize').parentElement.hidden = P.obstacle === 'wall';
    $('iSizeLabel').textContent = P.obstacle === 'log' ? 'Log size' : 'Rock radius';
    const s = $('iSize');
    if (P.obstacle === 'log') { s.min = 0.05; s.max = 0.4; s.step = 0.025; if (P.size > 0.4) P.size = 0.15; }
    else { s.min = 0.1; s.max = 1; s.step = 0.05; }
    s.value = P.size; $('iSizeOut').textContent = outs.iSize(P.size);
  }
  $('iOb').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; pressed($('iOb'), b);
    P.obstacle = b.dataset.o;
    if (P.obstacle === 'log') P.size = 0.15; else if (P.obstacle === 'rock') P.size = 0.4;
    syncObstacleUI(); preview();
  });
  $('iTarget').addEventListener('change', e => {
    P.target = e.target.value;
    // sensible default direction for each spot
    const d = { midships: 90, bowQuarter: 30, sternQuarter: -30 }[P.target] ?? 0;
    P.approach = d; $('iApproach').value = d; $('iApproachOut').textContent = outs.iApproach(d);
    preview();
  });
  $('iFloat').addEventListener('change', e => { P.float = e.target.checked; preview(); });
  $('iRun').addEventListener('click', run);
  $('iPlay').addEventListener('click', () => {
    if (!result) return;
    if (!playing && frame >= result.nf - 1) { frame = 0; tSim = 0; }
    playing = !playing; $('iPlay').textContent = playing ? 'Pause' : 'Play';
  });
  $('iTime').addEventListener('input', e => { playing = false; $('iPlay').textContent = 'Play'; tSim = result.T[+e.target.value]; showFrame(+e.target.value); });
  $('iSlow').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pressed($('iSlow'), b); V.slow = +b.dataset.s; });
  $('iColour').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; pressed($('iColour'), b); V.colour = b.dataset.c;
    legend(); if (result) { showFrame(frame); drawMap(); }
  });
  $('iDef').addEventListener('input', e => { V.def = +e.target.value; $('iDefOut').textContent = `${V.def}×`; if (result) showFrame(frame); });
  $('iDefOut').textContent = `${V.def}×`;
  $('iPeak').addEventListener('change', e => { V.peak = e.target.checked; if (result) showFrame(frame); });
  syncObstacleUI();

  function frameView() {
    const box = new THREE.Box3(new THREE.Vector3(-3000, -200, -900), new THREE.Vector3(3400, 700, 900));
    ctx.frameBox(box, 1.15);
  }

  let started = null;
  return {
    enter() {
      scene.add(root); ctx.grid.visible = false; legend();
      if (!started) started = loadMesh().then(() => {
        status.textContent = 'Set up a hit and press Run impact';
        frameView();
      }).catch(ctx.fail);
      else frameView();
    },
    exit() { scene.remove(root); ctx.grid.visible = true; playing = false; },
    reframe: frameView,
    update(dt) {
      if (!result || !playing) return;
      tSim += dt / V.slow;
      const T = result.T;
      let k = frame;
      while (k < result.nf - 1 && T[k + 1] <= tSim) k++;
      if (k !== frame) showFrame(k);
      if (k >= result.nf - 1) { playing = false; $('iPlay').textContent = 'Replay'; }
    },
  };
}
