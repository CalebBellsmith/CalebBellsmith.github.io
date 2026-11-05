/* Explicit dynamic shell FE for the canoe impact sim.
 *
 * Membrane: co-rotational constant-strain triangles with an orthotropic
 * laminate (classical lamination theory, strip direction = projected x).
 * Bending: discrete-shell hinges on interior edges (Grinspun et al. 2003),
 * dihedral gradients after Bridson et al. 2003 (signs checked against finite
 * differences), stiffness from the laminate D across each edge. Hinge stiffness
 * and the curvature estimate are calibrated on a plate bent to a known radius.
 * Gunwales and stems are smeared into their band of elements as extra
 * along-strip EA, EI and mass.
 * Contact: penalty against a rigid sphere (rock), plane (wall) or a floating
 * cylinder (log, free to translate). Water is lumped as added mass on wetted
 * nodes. Central-difference time integration with selective mass scaling of
 * the few smallest elements (reported).
 * Failure: per-ply max-stress index from membrane strain + z * curvature in
 * each ply's material axes. "Structural" covers the glass skins, cedar along
 * the grain and in shear, and the gunwale / stem members; cedar cracking
 * across the grain (sealed inside the glass) is tracked separately as "core".
 *
 * SI units (m, kg, s, N, Pa). Plain script: Web Worker (importScripts) or
 * Node (require) for testing.
 */
(function (root) {
  'use strict';

  // ---------- laminate ----------
  function plyQ(m) {
    const E1 = m.E1 * 1e6, E2 = m.E2 * 1e6, G = m.G12 * 1e6, nu12 = m.nu12;
    const nu21 = nu12 * E2 / E1, d = 1 - nu12 * nu21;
    return [E1 / d, nu12 * E2 / d, E2 / d, G];          // Q11 Q12 Q22 Q66
  }
  // Q rotated so that ply axis 1 sits at angle a from the element's local x
  function rotQ(q, a) {
    const c = Math.cos(a), s = Math.sin(a), c2 = c * c, s2 = s * s;
    const [Q11, Q12, Q22, Q66] = q;
    return [
      Q11 * c2 * c2 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * s2 * s2,
      (Q11 + Q22 - 4 * Q66) * s2 * c2 + Q12 * (s2 * s2 + c2 * c2),
      Q11 * s2 * s2 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * c2 * c2,
      (Q11 - Q12 - 2 * Q66) * s * c2 * c + (Q12 - Q22 + 2 * Q66) * s2 * s * c,
      (Q11 - Q12 - 2 * Q66) * s2 * s * c + (Q12 - Q22 + 2 * Q66) * s * c2 * c,
      (Q11 + Q22 - 2 * Q12 - 2 * Q66) * s2 * c2 + Q66 * (s2 * s2 + c2 * c2),
    ];
  }
  function laminate(layup, mats) {
    const t = layup.reduce((s, l) => s + l[1] * 1e-3, 0);
    let z = t / 2;
    const A = [0, 0, 0, 0], D = [0, 0, 0, 0];
    let rhoA = 0;
    const plies = [];
    for (const [name, tmm] of layup) {
      const m = mats[name], h = tmm * 1e-3, q = plyQ(m);
      const zt = z, zb = z - h;
      for (let k = 0; k < 4; k++) { A[k] += q[k] * h; D[k] += q[k] * (zt ** 3 - zb ** 3) / 3; }
      rhoA += m.rho * h;
      plies.push({ name, zt, zb, q, m, core: name === 'cedar' });
      z = zb;
    }
    return { A, D, rhoA, t, plies };
  }

  // ---------- model setup ----------
  function setup(mesh, p) {
    p = p || {};
    const N = mesh.nodes.length, NE = mesh.tris.length;
    const X0 = new Float64Array(N * 3);
    mesh.nodes.forEach((v, i) => { X0[3 * i] = v[0]; X0[3 * i + 1] = v[1]; X0[3 * i + 2] = v[2]; });
    const tri = new Int32Array(NE * 3);
    mesh.tris.forEach((t, e) => tri.set(t, 3 * e));
    const lams = {};
    for (const k in mesh.layups) lams[k] = laminate(mesh.layups[k], mesh.materials);
    const lamOf = mesh.elemClass.map(c => lams[c]);

    const mass = new Float64Array(N);
    const area = new Float64Array(NE);
    const gx = new Float64Array(NE * 3), gy = new Float64Array(NE * 3);
    const Aloc = new Float64Array(NE * 6), Dmat = new Float64Array(NE * 4), alpha = new Float64Array(NE);
    const member = new Array(NE).fill(null);
    const dtTarget = p.dtTarget ?? 4e-6;
    let scaledMass = 0, structMass = 0, scaledElems = 0;
    for (let e = 0; e < NE; e++) {
      const i0 = 3 * tri[3 * e], i1 = 3 * tri[3 * e + 1], i2 = 3 * tri[3 * e + 2];
      const ax = X0[i1] - X0[i0], ay = X0[i1 + 1] - X0[i0 + 1], az = X0[i1 + 2] - X0[i0 + 2];
      const bx = X0[i2] - X0[i0], by = X0[i2 + 1] - X0[i0 + 1], bz = X0[i2 + 2] - X0[i0 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const A2 = Math.hypot(nx, ny, nz); area[e] = A2 / 2;
      nx /= A2; ny /= A2; nz /= A2;
      const la = Math.hypot(ax, ay, az);
      const e1x = ax / la, e1y = ay / la, e1z = az / la;
      const e2x = ny * e1z - nz * e1y, e2y = nz * e1x - nx * e1z, e2z = nx * e1y - ny * e1x;
      const p1x = la, p2x = bx * e1x + by * e1y + bz * e1z, p2y = bx * e2x + by * e2y + bz * e2z;
      const det = p1x * p2y;
      gx[3 * e] = -p2y / det; gy[3 * e] = (p2x - p1x) / det;
      gx[3 * e + 1] = p2y / det; gy[3 * e + 1] = -p2x / det;
      gx[3 * e + 2] = 0; gy[3 * e + 2] = p1x / det;
      alpha[e] = Math.atan2(e2x, e1x);          // global x projected into the element
      const cls = mesh.elemClass[e], lam = lamOf[e];
      const mem = mesh.members[cls];
      let addA11 = 0, addD11 = 0, addRho = 0;
      if (mem) {
        const mm = mesh.materials[mem.material];
        const ca = Math.cos(alpha[e]), sa = Math.sin(alpha[e]);
        const ext = Math.max(Math.abs(p1x * ca), Math.abs(p2x * ca + p2y * sa), Math.abs((p2x - p1x) * ca + p2y * sa), 1e-3);
        const w = Math.max(area[e] / ext * 2, 0.03);       // band width across the strips
        addA11 = mm.E1 * 1e6 * mem.area_mm2 * 1e-6 / w / 2;
        addD11 = mm.E1 * 1e6 * mem.I_mm4 * 1e-12 / w / 2;
        addRho = mm.rho * mem.area_mm2 * 1e-6 / w / 2;
        // extreme fibre of the member for its bending stress
        const depth = cls === 'stem' ? 0.0762 : 0.0222;
        member[e] = { m: mm, half: depth / 2 };
      }
      const R = rotQ([lam.A[0] + addA11, lam.A[1], lam.A[2], lam.A[3]], -alpha[e]);
      Aloc.set(R, 6 * e);
      Dmat[4 * e] = lam.D[0] + addD11; Dmat[4 * e + 1] = lam.D[1]; Dmat[4 * e + 2] = lam.D[2]; Dmat[4 * e + 3] = lam.D[3];
      const rhoA = lam.rhoA + addRho;
      let m = rhoA * area[e];
      structMass += m;
      // critical step of this element; scale its mass if it would limit dt
      const l3 = Math.hypot(bx - ax, by - ay, bz - az);
      const h = A2 / Math.max(la, Math.hypot(bx, by, bz), l3);
      const c = Math.sqrt(Math.max(R[0], R[2]) / rhoA);
      const dte = 0.7 * h / c;
      if (dte < dtTarget) {
        const f = (dtTarget / dte) ** 2;
        scaledMass += m * (f - 1); m *= f; scaledElems++;
      }
      mass[i0 / 3] += m / 3; mass[i1 / 3] += m / 3; mass[i2 / 3] += m / 3;
    }

    // payload: paddlers kneel just inboard of the seats, gear amidships. Each is
    // its own body on a spring-damper (~6 Hz, 30% damped) to a patch of bottom
    // nodes: people and packs are soft, so they load the hull over tens of ms
    // rather than as mass bolted to the planking.
    const un = mesh.unroll, bodies = [];
    function body(xc, halfLen, kg) {
      const ids = [];
      for (let i = 0; i < N; i++) if (Math.abs(X0[3 * i] - xc) < halfLen && Math.abs(un[i][1]) < 0.45) ids.push(i);
      if (!ids.length || kg <= 0) return;
      const w = 2 * Math.PI * (p.payloadHz ?? 6);
      bodies.push({ m: kg, ids: Int32Array.from(ids), k: kg * w * w, c: 2 * 0.3 * kg * w });
    }
    const paddlers = p.paddlers ?? 2, each = p.paddlerKg ?? 80;
    if (paddlers >= 1) body(mesh.seats.stern + 0.35, 0.3, each);
    if (paddlers >= 2) body(mesh.seats.bow - 0.35, 0.3, each);
    body(0, 0.6, p.gearKg ?? 20);
    const payload = bodies.reduce((s, b) => s + b.m, 0);
    // added mass of the water around the wetted hull, ~30% of displacement
    let nWet = 0; for (let i = 0; i < N; i++) if (mesh.wet[i]) nWet++;
    const addEach = 0.3 * (structMass + payload) / Math.max(nWet, 1);
    for (let i = 0; i < N; i++) mass[i] += mesh.wet[i] ? addEach : 0;

    // hinges on interior edges
    const edgeMap = new Map(), hl = [];
    for (let e = 0; e < NE; e++) for (let k = 0; k < 3; k++) {
      const u = tri[3 * e + k], v = tri[3 * e + (k + 1) % 3], w = tri[3 * e + (k + 2) % 3];
      const key = u < v ? u * N + v : v * N + u;
      const hit = edgeMap.get(key);
      if (hit) hl.push([hit.u, hit.v, hit.w, w, hit.e, e]); else edgeMap.set(key, { u, v, w, e });
    }
    const NH = hl.length, H = new Int32Array(NH * 6);
    hl.forEach((h, i) => H.set(h, 6 * i));
    const theta0 = new Float64Array(NH), kH = new Float64Array(NH), along = new Float64Array(NH);
    for (let h = 0; h < NH; h++) {
      theta0[h] = dihedral(X0, H, h);
      const x1 = 3 * H[6 * h], x2 = 3 * H[6 * h + 1];
      const ex = X0[x2] - X0[x1], ey = X0[x2 + 1] - X0[x1 + 1], ez = X0[x2 + 2] - X0[x1 + 2];
      const el = Math.hypot(ex, ey, ez);
      const ca = Math.abs(ex) / el;             // 1: edge along the strips -> bending across them (D22)
      along[h] = ca * ca;
      const Dd = (q) => Dmat[4 * q + 2] * ca * ca + Dmat[4 * q] * (1 - ca * ca);
      const Dh = 0.5 * (Dd(H[6 * h + 4]) + Dd(H[6 * h + 5]));
      // 0.95 calibrated on an irregular plate bent to a known radius (energy within 1%)
      kH[h] = 0.95 * Dh * el * el / (area[H[6 * h + 4]] + area[H[6 * h + 5]]);
    }
    const totalMass = mass.reduce((s, v) => s + v, 0);      // hull + water, payload bodies separate
    return { N, NE, NH, X0, tri, mass, area, gx, gy, Aloc, Dmat, alpha, H, theta0, kH, along,
      lamOf, member, cls: mesh.elemClass, structMass, payload, bodies, addedMass: addEach * nWet,
      scaledMass, scaledElems, totalMass, dt: dtTarget };
  }

  function dihedral(X, H, h) {
    const i1 = 3 * H[6 * h], i2 = 3 * H[6 * h + 1], i3 = 3 * H[6 * h + 2], i4 = 3 * H[6 * h + 3];
    const ax = X[i1] - X[i3], ay = X[i1 + 1] - X[i3 + 1], az = X[i1 + 2] - X[i3 + 2];
    const bx = X[i2] - X[i3], by = X[i2 + 1] - X[i3 + 1], bz = X[i2 + 2] - X[i3 + 2];
    const n1x = ay * bz - az * by, n1y = az * bx - ax * bz, n1z = ax * by - ay * bx;
    const cx = X[i2] - X[i4], cy = X[i2 + 1] - X[i4 + 1], cz = X[i2 + 2] - X[i4 + 2];
    const dx = X[i1] - X[i4], dy = X[i1 + 1] - X[i4 + 1], dz = X[i1 + 2] - X[i4 + 2];
    const n2x = cy * dz - cz * dy, n2y = cz * dx - cx * dz, n2z = cx * dy - cy * dx;
    const ex = X[i2] - X[i1], ey = X[i2 + 1] - X[i1 + 1], ez = X[i2 + 2] - X[i1 + 2];
    const n1 = Math.hypot(n1x, n1y, n1z), n2 = Math.hypot(n2x, n2y, n2z), el = Math.hypot(ex, ey, ez);
    const cosT = (n1x * n2x + n1y * n2y + n1z * n2z) / (n1 * n2);
    const mx = n1y * n2z - n1z * n2y, my = n1z * n2x - n1x * n2z, mz = n1x * n2y - n1y * n2x;
    const sinT = (mx * ex + my * ey + mz * ez) / (n1 * n2 * el);
    return Math.atan2(sinT, cosT);
  }

  // ---------- obstacle ----------
  const TARGETS = {
    bow: 'Bow stem', bowQuarter: 'Bow quarter', midships: 'Midships side',
    sternQuarter: 'Stern quarter', stern: 'Stern stem', keel: 'Bottom (grounding)',
  };
  function penetration(ob, x, y, z) {
    if (ob.kind === 'rock') {
      return ob.R - Math.hypot(x - ob.c[0], y - ob.c[1], z - ob.c[2]);
    } else if (ob.kind === 'log') {
      const rx = x - ob.c[0], ry = y - ob.c[1], rz = z - ob.c[2];
      const al = rx * ob.axis[0] + ry * ob.axis[1];
      if (Math.abs(al) > ob.len / 2) return -1;
      return ob.R - Math.hypot(rx - al * ob.axis[0], ry - al * ob.axis[1], rz);
    }
    return ob.off - (x * ob.n[0] + y * ob.n[1]);
  }
  function makeObstacle(S, p, L) {
    const deg = Math.PI / 180;
    const phi = (p.approachDeg ?? 0) * deg;
    const d = [Math.cos(phi), Math.sin(phi), 0];
    const zW = p.draft ?? 0.115, Lh = L / 2, X0 = S.X0;
    const want = {
      bow: [Lh, 0, zW + 0.03], bowQuarter: [Lh * 0.55, 0.32, zW], midships: [0, 0.45, zW + 0.04],
      sternQuarter: [-Lh * 0.55, 0.32, zW], stern: [-Lh, 0, zW + 0.03], keel: [Lh * 0.62, 0, 0.02],
    }[p.target] || [Lh, 0, zW + 0.03];
    if (want[1] && d[1] < 0) want[1] *= -1;
    let best = 0, bd = Infinity;
    for (let i = 0; i < S.N; i++) {
      const q = (X0[3 * i] - want[0]) ** 2 + 4 * (X0[3 * i + 1] - want[1]) ** 2 + (X0[3 * i + 2] - want[2]) ** 2;
      if (q < bd) { bd = q; best = i; }
    }
    const tp = [X0[3 * best], X0[3 * best + 1], X0[3 * best + 2]];
    const gap = 0.002, psi = (p.obstacleDeg ?? 0) * deg;
    const kind = p.obstacle || 'rock';
    const ob = { kind, v: [0, 0, 0], mass: Infinity, target: best };
    let push = d.slice();
    if (kind === 'rock') {
      ob.R = p.size ?? 0.4;
      if (p.target === 'keel') push = [d[0] * 0.8, d[1] * 0.8, -0.6];
      const pl = Math.hypot(...push); push = push.map(v => v / pl);
      ob.c = tp.map((v, k) => v + push[k] * (ob.R + gap));
    } else if (kind === 'log') {
      ob.R = p.size ?? 0.15; ob.len = 4.0;
      const c = Math.cos(psi), s = Math.sin(psi), ax = -d[1], ay = d[0];
      ob.axis = [ax * c - ay * s, ax * s + ay * c, 0];
      ob.c = [tp[0] + d[0] * (ob.R + gap), tp[1] + d[1] * (ob.R + gap), zW];
      ob.mass = p.logFloats === false ? Infinity : Math.PI * ob.R * ob.R * ob.len * 550;
    } else {
      const c = Math.cos(psi), s = Math.sin(psi);
      ob.n = [-(d[0] * c - d[1] * s), -(d[0] * s + d[1] * c), 0];
      let far = -Infinity;
      for (let i = 0; i < S.N; i++) { const v = -(X0[3 * i] * ob.n[0] + X0[3 * i + 1] * ob.n[1]); if (v > far) far = v; }
      ob.off = -(far + gap);
      ob.c = [tp[0], tp[1], zW];
    }
    // never start with the hull already inside the obstacle: back it off along the push direction
    for (let it = 0; it < 6; it++) {
      let worst = 0;
      for (let i = 0; i < S.N; i++) worst = Math.max(worst, penetration(ob, X0[3 * i], X0[3 * i + 1], X0[3 * i + 2]));
      if (worst <= 0) break;
      if (ob.kind === 'wall') ob.off -= worst + gap;
      else ob.c = ob.c.map((v, k) => v + push[k] * (worst + gap));
    }
    return { ob, d };
  }

  // ---------- simulation ----------
  function simulate(mesh, p, onProgress) {
    p = p || {};
    const S = setup(mesh, p);
    const { N, NE, NH, X0, tri, mass, area, gx, gy, Aloc, H, theta0, kH, along } = S;
    const { ob, d } = makeObstacle(S, p, mesh.hull.L);
    const v0 = p.speed ?? 2.0;
    const X = Float64Array.from(X0), V = new Float64Array(N * 3), F = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) { V[3 * i] = v0 * d[0]; V[3 * i + 1] = v0 * d[1]; V[3 * i + 2] = v0 * d[2]; }
    const dt = S.dt;
    // contact stiffness per node, capped for stability
    const kcBase = p.contactK ?? 4e7;
    const kc = new Float64Array(N), cDamp = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      kc[i] = Math.min(kcBase, 0.2 * mass[i] / (dt * dt));
      cDamp[i] = 0.6 * Math.sqrt(kc[i] * mass[i]);
    }
    const beta = 2e-6;                         // stiffness-proportional damping (s)
    const vibDamp = p.vibDamp ?? 25;           // 1/s, on velocity relative to the centre of mass
    const betaB = p.bendDamp ?? 2e-5;          // stiffness-proportional damping on the hinges (s)
    const eps = new Float64Array(NE * 3), curv = new Float64Array(NE * 2), dthPrev = new Float64Array(NH);
    const tMax = p.tMax ?? 0.15;
    const frameEvery = Math.max(1, Math.round((p.frameDt ?? 4e-4) / dt));
    const frames = [];
    const FIs = new Float32Array(NE), FIc = new Float32Array(NE);
    const peakS = new Float32Array(NE), peakC = new Float32Array(NE);
    const peakMode = new Int8Array(NE), peakPly = new Int8Array(NE);
    let tFirst = -1, tLast = -1, peakF = 0, impulse = 0, step = 0;
    let KE0 = 0; for (let i = 0; i < N; i++) KE0 += 0.5 * mass[i] * v0 * v0;
    const B = S.bodies.map(b => {
      const c = [0, 0, 0];
      for (const i of b.ids) { c[0] += X0[3 * i] / b.ids.length; c[1] += X0[3 * i + 1] / b.ids.length; c[2] += X0[3 * i + 2] / b.ids.length; }
      KE0 += 0.5 * b.m * v0 * v0;
      return Object.assign({}, b, { x: c.slice(), off: [0, 0, 0], v: [v0 * d[0], v0 * d[1], v0 * d[2]] });
    });
    // KE of structure + payload only (added water mass excluded from the energy story)
    const forceHist = [];

    for (let t = 0; t <= tMax; t += dt, step++) {
      F.fill(0); curv.fill(0);
      // membrane: co-rotational CST
      for (let e = 0; e < NE; e++) {
        const i0 = 3 * tri[3 * e], i1 = 3 * tri[3 * e + 1], i2 = 3 * tri[3 * e + 2];
        const ax = X[i1] - X[i0], ay = X[i1 + 1] - X[i0 + 1], az = X[i1 + 2] - X[i0 + 2];
        const bx = X[i2] - X[i0], by = X[i2 + 1] - X[i0 + 1], bz = X[i2 + 2] - X[i0 + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const A2 = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= A2; ny /= A2; nz /= A2;
        const la = Math.sqrt(ax * ax + ay * ay + az * az);
        const e1x = ax / la, e1y = ay / la, e1z = az / la;
        const e2x = ny * e1z - nz * e1y, e2y = nz * e1x - nx * e1z, e2z = nx * e1y - ny * e1x;
        const q2x = bx * e1x + by * e1y + bz * e1z, q2y = bx * e2x + by * e2y + bz * e2z;
        const g = 3 * e;
        const F11 = la * gx[g + 1] + q2x * gx[g + 2], F12 = la * gy[g + 1] + q2x * gy[g + 2];
        const F21 = q2y * gx[g + 2], F22 = q2y * gy[g + 2];
        const th = Math.atan2(F21 - F12, F11 + F22), c = Math.cos(th), s = Math.sin(th);
        const ex = c * F11 + s * F21 - 1, ey = -s * F12 + c * F22 - 1;
        const gxy = (c * F12 + s * F22) + (-s * F11 + c * F21);
        const exv = ex + beta * (ex - eps[g]) / dt, eyv = ey + beta * (ey - eps[g + 1]) / dt, gv = gxy + beta * (gxy - eps[g + 2]) / dt;
        eps[g] = ex; eps[g + 1] = ey; eps[g + 2] = gxy;
        const A = 6 * e;
        const Nx = Aloc[A] * exv + Aloc[A + 1] * eyv + Aloc[A + 3] * gv;
        const Ny = Aloc[A + 1] * exv + Aloc[A + 2] * eyv + Aloc[A + 4] * gv;
        const Nxy = Aloc[A + 3] * exv + Aloc[A + 4] * eyv + Aloc[A + 5] * gv;
        const ar = area[e];
        for (let j = 0; j < 3; j++) {
          const bxj = gx[g + j], byj = gy[g + j];
          const fx0 = -ar * (Nx * bxj + Nxy * byj), fy0 = -ar * (Nxy * bxj + Ny * byj);
          const fx = c * fx0 - s * fy0, fy = s * fx0 + c * fy0;
          const ii = 3 * tri[g + j];
          F[ii] += fx * e1x + fy * e2x; F[ii + 1] += fx * e1y + fy * e2y; F[ii + 2] += fx * e1z + fy * e2z;
        }
      }
      // bending hinges
      for (let h = 0; h < NH; h++) {
        const o = 6 * h;
        const i1 = 3 * H[o], i2 = 3 * H[o + 1], i3 = 3 * H[o + 2], i4 = 3 * H[o + 3];
        const ax = X[i1] - X[i3], ay = X[i1 + 1] - X[i3 + 1], az = X[i1 + 2] - X[i3 + 2];
        const bx = X[i2] - X[i3], by = X[i2 + 1] - X[i3 + 1], bz = X[i2 + 2] - X[i3 + 2];
        const n1x = ay * bz - az * by, n1y = az * bx - ax * bz, n1z = ax * by - ay * bx;
        const cx = X[i2] - X[i4], cy = X[i2 + 1] - X[i4 + 1], cz = X[i2 + 2] - X[i4 + 2];
        const dx = X[i1] - X[i4], dy = X[i1 + 1] - X[i4 + 1], dz = X[i1 + 2] - X[i4 + 2];
        const n2x = cy * dz - cz * dy, n2y = cz * dx - cx * dz, n2z = cx * dy - cy * dx;
        const ex = X[i2] - X[i1], ey = X[i2 + 1] - X[i1 + 1], ez = X[i2 + 2] - X[i1 + 2];
        const n1s = n1x * n1x + n1y * n1y + n1z * n1z, n2s = n2x * n2x + n2y * n2y + n2z * n2z;
        const el = Math.sqrt(ex * ex + ey * ey + ez * ez), n12 = Math.sqrt(n1s * n2s);
        const cosT = (n1x * n2x + n1y * n2y + n1z * n2z) / n12;
        const mx = n1y * n2z - n1z * n2y, my = n1z * n2x - n1x * n2z, mz = n1x * n2y - n1y * n2x;
        const sinT = (mx * ex + my * ey + mz * ez) / (n12 * el);
        let dth = Math.atan2(sinT, cosT) - theta0[h];
        if (dth > Math.PI) dth -= 2 * Math.PI; else if (dth < -Math.PI) dth += 2 * Math.PI;
        const M = -kH[h] * (dth + betaB * (dth - dthPrev[h]) / dt);
        dthPrev[h] = dth;
        const d13 = (ax * ex + ay * ey + az * ez) / el;                     // (x1 - x3) . e / |e|
        const d14 = (dx * ex + dy * ey + dz * ez) / el;                     // (x1 - x4) . e
        const d23 = (bx * ex + by * ey + bz * ez) / el;                     // (x2 - x3) . e
        const d24 = (cx * ex + cy * ey + cz * ez) / el;                     // (x2 - x4) . e
        const u1x = n1x / n1s, u1y = n1y / n1s, u1z = n1z / n1s, u2x = n2x / n2s, u2y = n2y / n2s, u2z = n2z / n2s;
        F[i1] += M * (d23 * u1x + d24 * u2x); F[i1 + 1] += M * (d23 * u1y + d24 * u2y); F[i1 + 2] += M * (d23 * u1z + d24 * u2z);
        F[i2] -= M * (d13 * u1x + d14 * u2x); F[i2 + 1] -= M * (d13 * u1y + d14 * u2y); F[i2 + 2] -= M * (d13 * u1z + d14 * u2z);
        F[i3] -= M * el * u1x; F[i3 + 1] -= M * el * u1y; F[i3 + 2] -= M * el * u1z;
        F[i4] -= M * el * u2x; F[i4 + 1] -= M * el * u2y; F[i4 + 2] -= M * el * u2z;
        // curvature into the two neighbouring elements: kappa = theta |e| / (A1 + A2)
        // (same plate calibration: recovers 1/R to within 1%)
        const ea = H[o + 4], eb = H[o + 5];
        const kap = dth * el / (area[ea] + area[eb]);
        const k1 = kap * (1 - along[h]), k2 = kap * along[h];   // along / across the strips
        if (Math.abs(k1) > Math.abs(curv[2 * ea])) curv[2 * ea] = k1;
        if (Math.abs(k2) > Math.abs(curv[2 * ea + 1])) curv[2 * ea + 1] = k2;
        if (Math.abs(k1) > Math.abs(curv[2 * eb])) curv[2 * eb] = k1;
        if (Math.abs(k2) > Math.abs(curv[2 * eb + 1])) curv[2 * eb + 1] = k2;
      }
      // contact
      let contactF = 0, obFx = 0, obFy = 0;
      for (let i = 0; i < N; i++) {
        const ii = 3 * i;
        const pen = penetration(ob, X[ii], X[ii + 1], X[ii + 2]);
        if (pen <= 0) continue;
        let nx, ny, nz;
        if (ob.kind === 'wall') { nx = ob.n[0]; ny = ob.n[1]; nz = 0; }
        else {
          let rx = X[ii] - ob.c[0], ry = X[ii + 1] - ob.c[1], rz = X[ii + 2] - ob.c[2];
          if (ob.kind === 'log') { const al = rx * ob.axis[0] + ry * ob.axis[1]; rx -= al * ob.axis[0]; ry -= al * ob.axis[1]; }
          const r = Math.hypot(rx, ry, rz); nx = rx / r; ny = ry / r; nz = rz / r;
        }
        const vn = (V[ii] - ob.v[0]) * nx + (V[ii + 1] - ob.v[1]) * ny + V[ii + 2] * nz;
        let f = kc[i] * pen - cDamp[i] * vn;
        if (f <= 0) continue;
        F[ii] += f * nx; F[ii + 1] += f * ny; F[ii + 2] += f * nz;
        contactF += f; obFx -= f * nx; obFy -= f * ny;
      }
      if (contactF > 0) {
        if (tFirst < 0) tFirst = t;
        tLast = t;
        if (contactF > peakF) peakF = contactF;
        impulse += contactF * dt;
      }
      if (ob.kind === 'log' && isFinite(ob.mass)) {
        ob.v[0] += obFx / ob.mass * dt; ob.v[1] += obFy / ob.mass * dt;
        ob.c[0] += ob.v[0] * dt; ob.c[1] += ob.v[1] * dt;
      }
      // payload bodies: spring-damper to the mean motion of their node patch
      for (const b of B) {
        let px = 0, py = 0, pz = 0, vx = 0, vy = 0, vz = 0;
        const n = b.ids.length;
        for (let k = 0; k < n; k++) {
          const ii = 3 * b.ids[k];
          px += X[ii]; py += X[ii + 1]; pz += X[ii + 2]; vx += V[ii]; vy += V[ii + 1]; vz += V[ii + 2];
        }
        px /= n; py /= n; pz /= n; vx /= n; vy /= n; vz /= n;
        const fx = b.k * (b.x[0] - px) + b.c * (b.v[0] - vx);
        const fy = b.k * (b.x[1] - py) + b.c * (b.v[1] - vy);
        const fz = b.k * (b.x[2] - pz) + b.c * (b.v[2] - vz);
        for (let k = 0; k < n; k++) { const ii = 3 * b.ids[k]; F[ii] += fx / n; F[ii + 1] += fy / n; F[ii + 2] += fz / n; }
        b.v[0] -= fx / b.m * dt; b.v[1] -= fy / b.m * dt; b.v[2] -= fz / b.m * dt;
        b.x[0] += b.v[0] * dt; b.x[1] += b.v[1] * dt; b.x[2] += b.v[2] * dt;
      }
      // damping of vibration relative to the canoe's overall motion (water + wood),
      // so rigid-body motion is untouched
      let cmx = 0, cmy = 0, cmz = 0;
      for (let i = 0; i < N; i++) { const m = mass[i], ii = 3 * i; cmx += m * V[ii]; cmy += m * V[ii + 1]; cmz += m * V[ii + 2]; }
      cmx /= S.totalMass; cmy /= S.totalMass; cmz /= S.totalMass;
      // central difference
      for (let i = 0; i < N; i++) {
        const k = dt / mass[i], ii = 3 * i, dm = vibDamp * mass[i];
        F[ii] -= dm * (V[ii] - cmx); F[ii + 1] -= dm * (V[ii + 1] - cmy); F[ii + 2] -= dm * (V[ii + 2] - cmz);
        V[ii] += F[ii] * k; V[ii + 1] += F[ii + 1] * k; V[ii + 2] += F[ii + 2] * k;
        X[ii] += V[ii] * dt; X[ii + 1] += V[ii + 1] * dt; X[ii + 2] += V[ii + 2] * dt;
      }
      if (step % frameEvery === 0) {
        evalFailure(S, eps, curv, FIs, FIc, peakS, peakC, peakMode, peakPly);
        frames.push({ t, X: Float32Array.from(X), S: Float32Array.from(FIs), C: Float32Array.from(FIc), F: contactF, ob: ob.c.slice() });
        forceHist.push([t, contactF]);
        if (onProgress && frames.length % 8 === 0) onProgress(Math.min(1, t / tMax));
        if (!(X[0] === X[0]) || Math.abs(X[0]) > 100) throw new Error('The solver went unstable');
      }
      if (tFirst >= 0 && contactF === 0 && t - tLast > 0.03) break;
    }
    // rigid-body outcome
    let mT = 0, px = 0, py = 0, pz = 0, KE1 = 0;
    for (let i = 0; i < N; i++) {
      const m = mass[i], ii = 3 * i;
      mT += m; px += m * V[ii]; py += m * V[ii + 1]; pz += m * V[ii + 2];
      KE1 += 0.5 * m * (V[ii] * V[ii] + V[ii + 1] * V[ii + 1] + V[ii + 2] * V[ii + 2]);
    }
    for (const b of B) {
      mT += b.m; px += b.m * b.v[0]; py += b.m * b.v[1]; pz += b.m * b.v[2];
      KE1 += 0.5 * b.m * (b.v[0] ** 2 + b.v[1] ** 2 + b.v[2] ** 2);
    }
    const vOut = [px / mT, py / mT, pz / mT];
    const KErigid = 0.5 * mT * (vOut[0] ** 2 + vOut[1] ** 2 + vOut[2] ** 2);
    let worst = 0, worstC = 0, failed = 0, cracked = 0;
    for (let e = 0; e < NE; e++) {
      if (peakS[e] > peakS[worst]) worst = e;
      if (peakC[e] > peakC[worstC]) worstC = e;
      if (peakS[e] >= 1) failed++;
      if (peakC[e] >= 1) cracked++;
    }
    return {
      frames, forceHist, obstacle: ob, dir: d,
      peakS, peakC, peakMode, peakPly,
      summary: {
        target: TARGETS[p.target] || TARGETS.bow,
        massCanoe: S.structMass, payload: S.payload, addedMass: S.addedMass, scaledMass: S.scaledMass,
        totalMass: mT, speed: v0, KE0, KE1, KErigid, energyAbsorbed: KE0 - KErigid,
        peakForce: peakF, impulse, contactTime: tFirst >= 0 ? tLast - tFirst : 0, vOut,
        worstElem: worst, worstFI: peakS[worst], worstPly: peakPly[worst], worstMode: peakMode[worst],
        worstCoreElem: worstC, worstCore: peakC[worstC], failedElems: failed, crackedElems: cracked,
        nElem: NE, dt, steps: step, simTime: frames.length ? frames[frames.length - 1].t : 0,
      },
    };
  }

  // modes: 0 fibre tension, 1 fibre compression, 2 cross-grain tension,
  // 3 cross-grain compression, 4 shear; ply 9 = smeared gunwale / stem member
  function evalFailure(S, eps, curv, FIs, FIc, peakS, peakC, peakMode, peakPly) {
    const { NE, alpha, lamOf, member } = S;
    for (let e = 0; e < NE; e++) {
      const a = alpha[e], c = Math.cos(a), s = Math.sin(a);
      const ex = eps[3 * e], ey = eps[3 * e + 1], g = eps[3 * e + 2];
      const e1 = ex * c * c + ey * s * s + g * s * c;
      const e2 = ex * s * s + ey * c * c - g * s * c;
      const g12 = 2 * (ey - ex) * s * c + g * (c * c - s * s);
      const k1 = curv[2 * e], k2 = curv[2 * e + 1];
      const plies = lamOf[e].plies;
      let bs = 0, ms = 0, ps = 0, bc = 0;
      for (let pi = 0; pi < plies.length; pi++) {
        const pl = plies[pi], m = pl.m, Q = pl.q;
        for (let side = 0; side < 2; side++) {
          const z = side ? pl.zb : pl.zt;
          const a1 = e1 + z * k1, a2 = e2 + z * k2;
          const s1 = (Q[0] * a1 + Q[1] * a2) * 1e-6, s2 = (Q[1] * a1 + Q[2] * a2) * 1e-6, t12 = Q[3] * g12 * 1e-6;
          const f0 = s1 > 0 ? s1 / m.Xt : -s1 / m.Xc;
          const f2 = s2 > 0 ? s2 / m.Yt : -s2 / m.Yc;
          const f4 = Math.abs(t12) / m.S;
          if (f0 > bs) { bs = f0; ms = s1 > 0 ? 0 : 1; ps = pi; }
          if (f4 > bs) { bs = f4; ms = 4; ps = pi; }
          if (pl.core) { if (f2 > bc) bc = f2; }
          else if (f2 > bs) { bs = f2; ms = s2 > 0 ? 2 : 3; ps = pi; }
        }
      }
      const mem = member[e];
      if (mem) {
        for (const sg of [1, -1]) {
          const sm = mem.m.E1 * (e1 + sg * mem.half * k1);
          const f = sm > 0 ? sm / mem.m.Xt : -sm / mem.m.Xc;
          if (f > bs) { bs = f; ms = sm > 0 ? 0 : 1; ps = 9; }
        }
      }
      FIs[e] = bs; FIc[e] = bc;
      if (bs > peakS[e]) { peakS[e] = bs; peakMode[e] = ms; peakPly[e] = ps; }
      if (bc > peakC[e]) peakC[e] = bc;
    }
  }

  // obstacle placement only (no mechanics), for previewing a set-up in the page
  function previewObstacle(mesh, p) {
    const N = mesh.nodes.length, X0 = new Float64Array(N * 3);
    mesh.nodes.forEach((v, i) => { X0[3 * i] = v[0]; X0[3 * i + 1] = v[1]; X0[3 * i + 2] = v[2]; });
    return makeObstacle({ N, X0 }, p || {}, mesh.hull.L).ob;
  }

  const api = { setup, simulate, laminate, dihedral, previewObstacle, TARGETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CanoeImpact = api;
})(typeof self !== 'undefined' ? self : this);
