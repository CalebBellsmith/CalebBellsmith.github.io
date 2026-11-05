// Flow mode: a lattice-Boltzmann solver (D2Q9, BGK + Smagorinsky) running on
// the GPU over the waterplane, with the hull's waterline at the chosen load as
// a bounce-back obstacle. Flow always runs +x in the lattice; the water group
// is turned so it meets the boat at the chosen angle. Engineering numbers come
// from tables computed on the real hull (sim_tables.py) and the OpenFOAM runs.

const NX = 384, NY = 168;           // lattice
const U_LAT = 0.05;                 // inlet speed, lattice units (low Mach)
const G = 9.81;

export function create(ctx) {
  const { THREE, scene, camera, controls, renderer, $, pressed, status } = ctx;
  const gl = renderer.getContext();
  const floatOK = renderer.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');

  const root = new THREE.Group();
  let sim = null, hull = null, ready = false, paused = false;
  const S = { speed: 1.5, angle: 0, load: 180, temp: 15, water: 'fresh', field: 'dye', wave: 3 };

  // ---------------- water properties ----------------
  function waterProps() {
    const T = S.temp;
    const nuFresh = 1.79e-6 / (1 + 0.0337 * T + 0.000221 * T * T);
    const rhoFresh = 1000 * (1 - (T + 288.9414) / (508929.2 * (T + 68.12963)) * (T - 3.9863) ** 2);
    return S.water === 'salt'
      ? { rho: rhoFresh + 25.5 - 0.1 * (T - 15), nu: nuFresh * 1.07 }
      : { rho: rhoFresh, nu: nuFresh };
  }

  // ---------------- hull tables ----------------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function atLoad(totalKg, rho) {
    const L = sim.loads, mEq = totalKg * 1000 / rho;          // tables are for fresh water at 1000
    let i = 0; while (i < L.length - 2 && L[i + 1].mass < mEq) i++;
    const a = L[i], b = L[i + 1], t = Math.max(0, Math.min(1, (mEq - a.mass) / (b.mass - a.mass)));
    const o = {};
    for (const k of ['draft', 'S_m2', 'Lwl', 'Bwl', 'Cp', 'intT2_m3', 'lateral_m2', 'volume_m3']) o[k] = lerp(a[k], b[k], t);
    o.Rw = a.Rw.map((r, j) => lerp(r, b.Rw[j], t));
    o.wl = t < 0.5 ? a.waterline : b.waterline;
    o.wlB = b.waterline; o.wlA = a.waterline; o.t = t;
    return o;
  }
  function interpRw(h, V) {
    const sp = sim.speeds;
    if (V <= sp[0]) return h.Rw[0] * (V / sp[0]) ** 4;
    let j = 0; while (j < sp.length - 2 && sp[j + 1] < V) j++;
    const t = Math.min(1, (V - sp[j]) / (sp[j + 1] - sp[j]));
    return lerp(h.Rw[j], h.Rw[j + 1], t);
  }
  function formFactor() { return (sim.cfd && sim.cfd.formFactor) || 1.08; }
  function resistance(V, betaDeg, totalKg, wp = waterProps()) {
    const { rho, nu } = wp;
    const h = atLoad(totalKg, rho);
    const Lwl = h.Lwl / 1000;
    const Re = V * Lwl / nu;
    const Cf = 0.075 / (Math.log10(Re) - 2) ** 2;
    const q = 0.5 * rho * V * V;
    const k1 = formFactor();
    const Rf = q * h.S_m2 * Cf;
    const Rform = Rf * (k1 - 1);
    const Rw = interpRw(h, V) * rho / 1000;
    const b = betaDeg * Math.PI / 180, sb = Math.sin(b), cb = Math.cos(b);
    const Teff2 = h.intT2_m3 / Lwl;
    const Ylift = q * Math.PI * Teff2 * sb * cb;
    const Ycross = q * 0.8 * h.lateral_m2 * sb * sb;
    const Y = Ylift + Ycross;
    const Rind = q * Math.PI * Teff2 * sb * sb / 2 + Ycross * sb;
    const m22 = rho * Math.PI / 2 * h.intT2_m3, m11 = 0.05 * rho * h.volume_m3;
    const Nyaw = V * V * sb * cb * (m22 - m11);
    const total = Rf + Rform + Rw + Rind;
    return { h, rho, nu, Re, Cf, Rf, Rform, Rw, Rind, total, Y, Nyaw, Fn: V / Math.sqrt(G * Lwl), Lwl, k1 };
  }

  // ---------------- GPU solver ----------------
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;                 // full-screen pass: never cull
  quadScene.add(quad);
  const rtOpts = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
  let rtA, rtB, partA, partB, maskTex, simMat, partMat;

  const VERT = `in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const SIM_FRAG = `precision highp float; precision highp int;
    uniform sampler2D tF0, tF1, tF2, tMask;
    uniform float uIn, tau0; uniform int init;
    layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1; layout(location = 2) out vec4 o2;
    const ivec2 C[9] = ivec2[9](ivec2(0,0),ivec2(1,0),ivec2(0,1),ivec2(-1,0),ivec2(0,-1),ivec2(1,1),ivec2(-1,1),ivec2(-1,-1),ivec2(1,-1));
    const float W[9] = float[9](4./9.,1./9.,1./9.,1./9.,1./9.,1./36.,1./36.,1./36.,1./36.);
    const int OPP[9] = int[9](0,3,4,1,2,7,8,5,6);
    float getF(ivec2 p, int i) {
      if (i == 0) return texelFetch(tF2, p, 0).x;
      if (i <= 4) return texelFetch(tF0, p, 0)[i - 1];
      return texelFetch(tF1, p, 0)[i - 5];
    }
    float feq(int i, float rho, vec2 u) { float cu = dot(vec2(C[i]), u); return W[i] * rho * (1. + 3.*cu + 4.5*cu*cu - 1.5*dot(u,u)); }
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy), R = ivec2(${NX}, ${NY});
      float f[9];
      vec2 uin = vec2(uIn, 0.);
      bool solid = texelFetch(tMask, p, 0).r > 0.5;
      if (init == 1 || solid) {
        for (int i = 0; i < 9; i++) f[i] = feq(i, 1., solid ? vec2(0.) : uin);
        o0 = vec4(f[1], f[2], f[3], f[4]); o1 = vec4(f[5], f[6], f[7], f[8]); o2 = vec4(f[0], 1., solid ? vec2(0.) : uin);
        return;
      }
      for (int i = 0; i < 9; i++) {
        ivec2 q = p - C[i];
        if (q.x < 0 || q.y < 0 || q.y >= R.y) { f[i] = feq(i, 1., uin); continue; }     // free stream in
        if (q.x >= R.x) q.x = R.x - 1;                                                    // outlet: copy
        if (texelFetch(tMask, q, 0).r > 0.5) f[i] = getF(p, OPP[i]);                      // bounce back
        else f[i] = getF(q, i);
      }
      float rho = 0.; vec2 u = vec2(0.);
      for (int i = 0; i < 9; i++) { rho += f[i]; u += f[i] * vec2(C[i]); }
      u /= rho;
      float lu = length(u); if (lu > 0.3) u *= 0.3 / lu;
      // Smagorinsky: local relaxation time from the non-equilibrium stress
      float pxx = 0., pyy = 0., pxy = 0.;
      float fe[9];
      for (int i = 0; i < 9; i++) {
        fe[i] = feq(i, rho, u);
        float d = f[i] - fe[i]; vec2 c = vec2(C[i]);
        pxx += c.x*c.x*d; pyy += c.y*c.y*d; pxy += c.x*c.y*d;
      }
      float Q = sqrt(2. * (pxx*pxx + pyy*pyy + 2.*pxy*pxy));
      float tau = 0.5 * (tau0 + sqrt(tau0*tau0 + 18. * 1.41421 * 0.17*0.17 * Q / rho));
      for (int i = 0; i < 9; i++) f[i] -= (f[i] - fe[i]) / tau;
      o0 = vec4(f[1], f[2], f[3], f[4]); o1 = vec4(f[5], f[6], f[7], f[8]); o2 = vec4(f[0], rho, u);
    }`;
  // tracer particles: positions (lattice units) live in a float texture and
  // are carried by the live velocity field; they respawn at the inlet
  const PW = 128, PH = 96, MAX_AGE = 9000;
  const PART_FRAG = `precision highp float;
    uniform sampler2D tPart, tState, tMask; uniform float seed; uniform int init;
    out vec4 o;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec2 vel(vec2 q) {          // bilinear velocity from the nearest-filtered state
      vec2 g = q - 0.5; ivec2 i = ivec2(floor(g)); vec2 f = fract(g);
      ivec2 mx = ivec2(${NX - 1}, ${NY - 1});
      vec2 a = texelFetch(tState, clamp(i, ivec2(0), mx), 0).zw;
      vec2 b = texelFetch(tState, clamp(i + ivec2(1, 0), ivec2(0), mx), 0).zw;
      vec2 c = texelFetch(tState, clamp(i + ivec2(0, 1), ivec2(0), mx), 0).zw;
      vec2 d = texelFetch(tState, clamp(i + ivec2(1, 1), ivec2(0), mx), 0).zw;
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    void main() {
      vec2 res = vec2(${NX}., ${NY}.);
      vec4 P = texelFetch(tPart, ivec2(gl_FragCoord.xy), 0);
      if (init == 1) {
        float h1 = hash(gl_FragCoord.xy * 0.731 + 3.1), h2 = hash(gl_FragCoord.yx * 1.37 + 7.7), h3 = hash(gl_FragCoord.xy + 11.3);
        o = vec4(h1 * res.x, h2 * res.y, h3 * ${MAX_AGE}.0, h3);
        return;
      }
      vec2 pos = P.xy + vel(P.xy);
      float age = P.z + 1.0;
      bool dead = pos.x < 0.0 || pos.x > res.x - 1.0 || pos.y < 0.0 || pos.y > res.y - 1.0
        || texelFetch(tMask, ivec2(pos), 0).r > 0.5 || age > ${MAX_AGE}.0 * (0.55 + 0.45 * P.w);
      if (dead) {
        float h1 = hash(gl_FragCoord.xy + seed), h2 = hash(gl_FragCoord.yx * 1.7 + seed * 1.3);
        pos = vec2(h1 * 2.0, h2 * (res.y - 1.0));
        age = 0.0;
      }
      o = vec4(pos, age, P.w);
    }`;

  function initGPU() {
    rtA = new THREE.WebGLMultipleRenderTargets(NX, NY, 3, rtOpts);
    rtB = new THREE.WebGLMultipleRenderTargets(NX, NY, 3, rtOpts);
    for (const rt of [rtA, rtB]) rt.texture.forEach(t => { t.type = THREE.FloatType; t.minFilter = t.magFilter = THREE.NearestFilter; });
    partA = new THREE.WebGLRenderTarget(PW, PH, rtOpts);
    partB = new THREE.WebGLRenderTarget(PW, PH, rtOpts);
    maskTex = new THREE.DataTexture(new Uint8Array(NX * NY * 4), NX, NY, THREE.RGBAFormat);
    maskTex.minFilter = maskTex.magFilter = THREE.NearestFilter;
    simMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: SIM_FRAG,
      uniforms: { tF0: { value: null }, tF1: { value: null }, tF2: { value: null }, tMask: { value: maskTex },
        uIn: { value: U_LAT }, tau0: { value: 0.52 }, init: { value: 1 } },
    });
    partMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: PART_FRAG,
      uniforms: { tPart: { value: null }, tState: { value: null }, tMask: { value: maskTex }, seed: { value: 0 }, init: { value: 1 } },
    });
  }
  let stepCount = 0;
  function step() {
    stepCount++;                                 // also seeds particle respawns
    simMat.uniforms.tF0.value = rtA.texture[0];
    simMat.uniforms.tF1.value = rtA.texture[1];
    simMat.uniforms.tF2.value = rtA.texture[2];
    quad.material = simMat;
    renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
    simMat.uniforms.init.value = 0;
    [rtA, rtB] = [rtB, rtA];
    partMat.uniforms.tPart.value = partA.texture;
    partMat.uniforms.tState.value = rtA.texture[2];
    partMat.uniforms.seed.value = (stepCount * 0.6180339) % 97;
    quad.material = partMat;
    renderer.setRenderTarget(partB); renderer.render(quadScene, quadCam);
    partMat.uniforms.init.value = 0;
    [partA, partB] = [partB, partA];
    renderer.setRenderTarget(null);
  }

  // ---------------- water surface ----------------
  const Lx = 16000, Lz = 7000;                 // mm, lattice footprint
  const dx = Lx / NX;
  const x0 = -0.3 * Lx, z0 = -Lz / 2;          // hull centre sits 30% in from the inlet
  const water = new THREE.Group();
  root.add(water);
  let waterMesh;
  const waterUniforms = {
    tState: { value: null }, tMask: { value: null },
    uIn: { value: U_LAT }, field: { value: 0 }, k0: { value: 4 }, amp: { value: 0 },
    bow: { value: new THREE.Vector2() }, stern: { value: new THREE.Vector2() },
    origin: { value: new THREE.Vector2(x0, z0) }, size: { value: new THREE.Vector2(Lx, Lz) },
  };
  const WATER_VERT = `
    uniform float k0, amp; uniform vec2 bow, stern;
    varying vec2 vUv; varying float vH;
    float kelvin(vec2 q, vec2 src) {
      vec2 r = (q - src) / 1000.0;              // m; flow runs +x
      if (r.x <= 0.02) return 0.0;
      float t = abs(r.y) / r.x;                 // tan(alpha)
      float lim = 0.3536;                       // tan(19.47 deg)
      float fade = smoothstep(lim, lim * 0.82, t);
      float disc = max(1.0 - 8.0 * t * t, 0.0);
      float tp1 = t < 1e-4 ? 0.0 : (1.0 - sqrt(disc)) / (4.0 * t);
      float tp2 = t < 1e-4 ? 1e3 : (1.0 + sqrt(disc)) / (4.0 * t);
      float c1 = inversesqrt(1.0 + tp1 * tp1), s1 = tp1 * c1;
      float c2 = inversesqrt(1.0 + tp2 * tp2), s2 = tp2 * c2;
      float ph1 = k0 * (r.x * c1 + abs(r.y) * s1) / (c1 * c1);
      float ph2 = k0 * (r.x * c2 + abs(r.y) * s2) / (c2 * c2);
      float env = fade * inversesqrt(length(r) + 0.6);
      return env * (cos(ph1) + 0.7 * cos(ph2 + 0.785));
    }
    void main() {
      vUv = uv;
      vec2 q = position.xz;
      float h = amp * (kelvin(q, bow) - 0.6 * kelvin(q, stern));
      vH = h;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, h, position.z, 1.0);
    }`;
  const WATER_FRAG = `precision highp float;
    uniform sampler2D tState, tMask; uniform float uIn, amp; uniform int field;
    varying vec2 vUv; varying float vH;
    vec3 ramp(float t) {        // navy -> cyan -> white -> pink
      t = clamp(t, 0.0, 1.4);
      vec3 a = vec3(0.02, 0.05, 0.16), b = vec3(0.0, 0.62, 0.85), c = vec3(0.85, 0.98, 1.0), d = vec3(1.0, 0.17, 0.84);
      if (t < 0.6) return mix(a, b, t / 0.6);
      if (t < 1.0) return mix(b, c, (t - 0.6) / 0.4);
      return mix(c, d, (t - 1.0) / 0.4);
    }
    vec3 diverge(float t) {     // pink <- navy -> cyan
      t = clamp(t, -1.0, 1.0);
      vec3 mid = vec3(0.03, 0.05, 0.14);
      return t > 0.0 ? mix(mid, vec3(0.0, 0.94, 1.0), t) : mix(mid, vec3(1.0, 0.17, 0.84), -t);
    }
    void main() {
      vec2 res = vec2(${NX}., ${NY}.);
      if (texture2D(tMask, vUv).r > 0.5) discard;
      vec4 st = texture2D(tState, vUv);
      vec2 u = st.zw;
      vec3 col;
      if (field == 0) {
        col = mix(vec3(0.015, 0.03, 0.09), vec3(0.03, 0.10, 0.22), clamp(length(u) / uIn, 0.0, 1.4) / 1.4);
      } else if (field == 1) {
        col = ramp(length(u) / uIn);
      } else if (field == 2) {
        col = diverge((st.y - 1.0) * 3.0 / (uIn * uIn));       // Cp = (p - p0) / (rho U^2 / 2)
      } else {
        vec2 e = 1.0 / res;
        float w = (texture2D(tState, vUv + vec2(e.x, 0.)).w - texture2D(tState, vUv - vec2(e.x, 0.)).w)
                - (texture2D(tState, vUv + vec2(0., e.y)).z - texture2D(tState, vUv - vec2(0., e.y)).z);
        col = diverge(w / uIn * 6.0);
      }
      col *= 1.0 + clamp(vH / max(amp, 1e-3), -1.0, 1.0) * 0.18;   // crests catch the light a little
      float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      gl_FragColor = vec4(col, 0.93 * smoothstep(0.0, 0.04, edge));
    }`;

  function buildWater() {
    const nx = 420, nz = 180;
    const geo = new THREE.PlaneGeometry(Lx, Lz, nx, nz);
    geo.rotateX(-Math.PI / 2);                 // into XZ
    geo.translate(x0 + Lx / 2, 0, z0 + Lz / 2);
    // uv: u along local x, v along local z (lattice y)
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / Lx, (pos.getZ(i) - z0) / Lz);
    waterMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: waterUniforms, transparent: true, side: THREE.DoubleSide,
    }));
    waterMesh.renderOrder = 1;
    water.add(waterMesh);
  }

  const partUniforms = { tPart: { value: null }, tState: { value: null }, uIn: { value: U_LAT },
    origin: { value: new THREE.Vector2(x0, z0) }, cell: { value: dx }, size: { value: 2.5 * Math.min(devicePixelRatio, 2) }, dim: { value: 1 } };
  function buildParticles() {
    const n = PW * PH, ref = new Float32Array(n * 3);
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
      const k = 3 * (j * PW + i); ref[k] = (i + 0.5) / PW; ref[k + 1] = (j + 0.5) / PH;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(ref, 3));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: partUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform sampler2D tPart, tState; uniform vec2 origin; uniform float cell, size, uIn;
        varying float vA, vS;
        void main() {
          vec4 P = texture2D(tPart, position.xy);
          vec2 u = texture2D(tState, P.xy / vec2(${NX}., ${NY}.)).zw;
          vS = length(u) / uIn;
          vA = smoothstep(0.0, 120.0, P.z) * (1.0 - smoothstep(${(MAX_AGE * 0.45).toFixed(1)}, ${(MAX_AGE * 0.55).toFixed(1)}, P.z * (1.0 - P.w * 0.45)));
          vec3 wp = vec3(origin.x + P.x * cell, 12.0, origin.y + P.y * cell);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
          gl_PointSize = size;
        }`,
      fragmentShader: `
        uniform float dim; varying float vA, vS;
        void main() {
          vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
          vec3 slow = vec3(1.0, 0.17, 0.84), fast = vec3(0.6, 1.0, 1.0);
          vec3 col = mix(slow, fast, smoothstep(0.3, 1.1, vS));
          gl_FragColor = vec4(col, 0.85 * vA * dim);
        }`,
    }));
    pts.frustumCulled = false;
    pts.renderOrder = 2;                       // always over the water surface
    water.add(pts);
  }

  // hull outline in the lattice, for the current load and angle
  function buildMask(h) {
    const psi = S.angle * Math.PI / 180 - Math.PI;     // water group rotation about y
    water.rotation.y = psi;
    const c = Math.cos(psi), s = Math.sin(psi);
    // waterline outline (interpolated between table loads), both sides
    const wl = h.wlA.map((p, i) => [p[0], lerp(p[1], h.wlB[i][1], h.t)]).filter(p => p[1] > 0.5);
    const poly = [...wl.map(([x, y]) => [x, y]), ...wl.slice().reverse().map(([x, y]) => [x, -y])];
    const cv = document.createElement('canvas'); cv.width = NX; cv.height = NY;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, NX, NY);
    g.fillStyle = '#fff'; g.beginPath();
    const toLocal = ([mx, my]) => {
      const wx = mx, wz = -my;                       // model -> world (y up, starboard -z)
      const lx = wx * c - wz * s, lz = wx * s + wz * c;
      return [lx, lz];
    };
    poly.forEach((pt, k) => {
      const [lx, lz] = toLocal(pt);
      const i = (lx - x0) / dx, j = (lz - z0) / dx;
      k ? g.lineTo(i, j) : g.moveTo(i, j);
    });
    g.closePath(); g.fill();
    const img = g.getImageData(0, 0, NX, NY).data;
    const data = maskTex.image.data;
    for (let k = 0; k < NX * NY; k++) { const v = img[4 * k] > 127 ? 255 : 0; data[4 * k] = v; data[4 * k + 3] = 255; }
    maskTex.needsUpdate = true;
    // Kelvin sources at the stems, in local water coords
    const bow = toLocal([hullHalf, 0]), stern = toLocal([-hullHalf, 0]);
    // the upstream stem makes the main wave system
    const up = bow[0] < stern[0] ? bow : stern, dn = bow[0] < stern[0] ? stern : bow;
    waterUniforms.bow.value.set(up[0], up[1]);
    waterUniforms.stern.value.set(dn[0], dn[1]);
  }
  let hullHalf = 2300;

  // ---------------- panel ----------------
  const fmt = (v, d = 1) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  function bar(label, val, max, col) {
    return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.min(100, 100 * val / max)}%;background:${col}"></div></div><b>${fmt(val, 1)} N</b></div>`;
  }
  function rows(dl, list) {
    dl.replaceChildren();
    for (const [k, v] of list) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
  }
  function updatePanel() {
    const total = sim.canoe_mass + S.load;
    const r = resistance(S.speed, S.angle, total);
    const max = Math.max(r.total, 5);
    $('fBars').innerHTML =
      bar('Friction', r.Rf, max, '#00f0ff') + bar('Form', r.Rform, max, '#7a6cff') +
      bar('Waves', r.Rw, max, '#ff2bd6') + (S.angle > 0 ? bar('Drift', r.Rind, max, '#ffb02e') : '') +
      bar('Total', r.total, max, '#e9e6ff');
    const Vh = 0.4 * Math.sqrt(G * r.Lwl);
    const P = r.total * S.speed;
    rows($('fStats'), [
      ['Boat + load', `${fmt(total, 0)} kg`],
      ['Draft', `${fmt(r.h.draft, 0)} mm`],
      ['Wetted surface', `${fmt(r.h.S_m2, 2)} m²`],
      ['Waterline length', `${fmt(r.h.Lwl, 0)} mm`],
      ['Reynolds number', r.Re.toExponential(2).replace('e+', ' × 10^')],
      ['Froude number', fmt(r.Fn, 3)],
      ['Hull speed (Fn 0.4)', `${fmt(Vh, 2)} m/s · ${fmt(Vh * 3.6, 1)} km/h`],
      ['Friction coeff. (ITTC-57)', r.Cf.toExponential(3)],
      ['Form factor 1 + k', fmt(r.k1, 3)],
      ['Power to hold speed', `${fmt(P, 0)} W`],
      ['Per paddler (2, ~60% efficient)', `${fmt(P / 2 / 0.6, 0)} W`],
      ['Water', `${fmt(r.rho, 1)} kg/m³ · ν ${fmt(r.nu * 1e6, 3)} mm²/s`],
    ]);
    rows($('fSide'), S.angle === 0
      ? [['Flow angle', '0° (straight ahead)'], ['Side force', '0 N'], ['Turning moment', '0 N·m']]
      : [['Flow angle', `${S.angle}°`],
         ['Side force', `${fmt(r.Y, 0)} N`],
         ['Extra drag from drift', `${fmt(r.Rind, 1)} N`],
         ['Turning moment (Munk)', `${fmt(r.Nyaw, 0)} N·m, swings the boat broadside`]]);
    // CFD comparison at the design load
    const dl = $('fCfd');
    while (dl.children.length > 3) dl.lastChild.remove();
    const cfd = (sim.cfd && sim.cfd.runs) || [];
    for (const c of cfd) {
      const rr = resistance(c.U, 0, c.mass, { rho: sim.cfd.rho, nu: sim.cfd.nu });
      const add = (t, a, b) => { const dt = document.createElement('dt'); dt.textContent = t;
        const x = document.createElement('dd'); x.className = 'ref'; x.textContent = a;
        const y = document.createElement('dd'); y.textContent = b; dl.append(dt, x, y); };
      add(`${fmt(c.U, 1)} m/s viscous drag`, `${fmt(c.R, 2)} N`, `${fmt(rr.Rf + rr.Rform, 2)} N`);
    }
    $('fCfdNote').textContent = cfd.length
      ? `Full-scale OpenFOAM (simpleFoam, k-ω SST, ${sim.cfd.cells} cells) on the double-body hull at the design draft. The textbook form factor (Holtrop, 1 + k = ${fmt(sim.cfd.holtrop, 3)}) would put this panel ${fmt(100 * (sim.cfd.holtrop / sim.cfd.formFactor - 1), 0)}% high, so the form factor here is fitted to the CFD.`
      : 'CFD runs not loaded.';
    // waves
    waterUniforms.k0.value = G / (S.speed * S.speed);
    waterUniforms.amp.value = S.wave * 1000 * 0.0022 * Math.sqrt(Math.max(r.Rw, 0) / 10);
    // lattice Reynolds number grows with speed (stable range), time scale is real time
    let ReLat = 400 + 1400 * Math.min(S.speed / 4, 1);
    let tau0 = 0.5 + 3 * U_LAT * (r.Lwl * 1000 / dx) / ReLat;
    if (tau0 < 0.53) { tau0 = 0.53; ReLat = 3 * U_LAT * (r.Lwl * 1000 / dx) / (tau0 - 0.5); }
    simMat.uniforms.tau0.value = tau0;
    status.textContent = `${fmt(S.speed, 2)} m/s · flow shown at Re ≈ ${fmt(ReLat, 0)} (full scale ${r.Re.toExponential(1)})`;
    return r;
  }

  function placeHull(r) {
    if (!hull) return;
    hull.position.y = -r.h.draft;
    buildMask(r.h);
  }
  let lastMaskKey = '';
  function refresh(resetFlow) {
    if (!ready) return;
    const r = updatePanel();
    const key = `${Math.round(r.h.draft)}|${S.angle}`;
    if (key !== lastMaskKey || resetFlow) {
      if (lastMaskKey && key.split('|')[1] !== lastMaskKey.split('|')[1]) resetFlow = true;   // new angle: start the flow over
      lastMaskKey = key; placeHull(r);
    }
    if (resetFlow) { simMat.uniforms.init.value = 1; partMat.uniforms.init.value = 1; }
  }

  // ---------------- controls ----------------
  const outs = {
    fSpeed: v => `${(+v).toFixed(2)} m/s · ${(v * 3.6).toFixed(1)} km/h · ${(v * 1.944).toFixed(1)} kn`,
    fAngle: v => `${v}°`, fLoad: v => `${v} kg`, fTemp: v => `${v} °C`, fWave: v => `${v}×`,
  };
  const keyOf = { fSpeed: 'speed', fAngle: 'angle', fLoad: 'load', fTemp: 'temp', fWave: 'wave' };
  for (const id of Object.keys(outs)) {
    const el = $(id);
    const show = () => { $(id + 'Out').textContent = outs[id](el.value); };
    el.addEventListener('input', () => { S[keyOf[id]] = +el.value; show(); refresh(false); });
    show();
  }
  $('fWater').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; pressed($('fWater'), b); S.water = b.dataset.w; refresh(false); });
  $('fField').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; pressed($('fField'), b); S.field = b.dataset.f;
    waterUniforms.field.value = ['dye', 'speed', 'pressure', 'vorticity'].indexOf(S.field);
    partUniforms.dim.value = S.field === 'dye' ? 1 : 0.45;
    legend();
  });
  $('fPause').addEventListener('click', () => { paused = !paused; $('fPause').textContent = paused ? 'Play' : 'Pause'; $('fPause').classList.toggle('on', paused); });
  $('fReset').addEventListener('click', () => refresh(true));

  function legend() {
    const lb = $('legendBar');
    const L = {
      dye: ['Tracer particles by speed', 'linear-gradient(90deg,#ff2bd6,#99ffff)', ['slow', 'free stream']],
      speed: ['Flow speed / free stream', 'linear-gradient(90deg,#050d29 0%,#009ed9 43%,#d9faff 71%,#ff2bd6 100%)', ['0', '0.6', '1.0', '1.4']],
      pressure: ['Pressure coefficient Cp', 'linear-gradient(90deg,#ff2bd6,#080d24 50%,#00f0ff)', ['−0.3 suction', '0', '+0.3']],
      vorticity: ['Vorticity (spin)', 'linear-gradient(90deg,#ff2bd6,#080d24 50%,#00f0ff)', ['clockwise', '0', 'anti-clockwise']],
    }[S.field];
    lb.innerHTML = `<strong>${L[0]}</strong><div class="ramp" style="background:${L[1]}"></div><div class="ticks">${L[2].map(t => `<span>${t}</span>`).join('')}</div>`;
    lb.hidden = false;
  }

  // ---------------- setup ----------------
  async function start() {
    if (!floatOK) {
      status.textContent = 'This browser cannot render to float textures, so the live flow is off. The numbers still work.';
    }
    sim = await ctx.loadJSON('sim');
    if (floatOK) initGPU();
    buildWater();
    if (floatOK) buildParticles();
    waterUniforms.tMask.value = maskTex || null;
    const m = await ctx.loadModel('canoe_full');
    hull = m.clone();
    root.add(hull);
    const box = new THREE.Box3().setFromObject(hull);
    hullHalf = (box.max.x - box.min.x) / 2 - 40;
    ready = true;
    if (!floatOK) waterMesh.visible = false;
    refresh(true);
    frame();
  }
  function frame() {
    const box = new THREE.Box3(new THREE.Vector3(-3800, -600, -2200), new THREE.Vector3(3800, 600, 2200));
    ctx.frameBox(box, 1.25);
  }

  let started = null;
  return {
    enter() {
      scene.add(root); ctx.grid.visible = false;
      if (!started) started = start().catch(ctx.fail);
      else { refresh(false); frame(); }
      legend();
    },
    exit() { scene.remove(root); ctx.grid.visible = true; },
    reframe: frame,
    update() {
      if (!ready || !floatOK) return;
      if (!paused) {
        // real time: lattice cells per second = physical speed / cell size
        const n = Math.max(1, Math.min(18, Math.round(S.speed * 1000 / (U_LAT * dx * 60))));
        for (let i = 0; i < n; i++) step();
      }
      waterUniforms.tState.value = rtA.texture[2];
      partUniforms.tPart.value = partA.texture; partUniforms.tState.value = rtA.texture[2];
    },
  };
}
