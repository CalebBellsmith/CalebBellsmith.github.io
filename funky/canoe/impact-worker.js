/* Runs the impact solver off the main thread and packs the frames into flat
 * typed arrays for a cheap transfer back to the page. */
importScripts('impact-core.js' + self.location.search);   // same version as the page asked for
let mesh = null;
onmessage = e => {
  const msg = e.data;
  if (msg.type === 'mesh') { mesh = msg.mesh; return; }
  if (msg.type !== 'run') return;
  try {
    let last = 0;
    const r = self.CanoeImpact.simulate(mesh, msg.params, p => {
      if (p - last > 0.02) { last = p; postMessage({ type: 'progress', p }); }
    });
    const nf = r.frames.length, N3 = r.frames[0].X.length, NE = r.frames[0].S.length;
    const X = new Float32Array(nf * N3), S = new Float32Array(nf * NE), C = new Float32Array(nf * NE);
    const T = new Float32Array(nf), F = new Float32Array(nf), OB = new Float32Array(nf * 3);
    r.frames.forEach((f, k) => {
      X.set(f.X, k * N3); S.set(f.S, k * NE); C.set(f.C, k * NE);
      T[k] = f.t; F[k] = f.F; OB.set(f.ob, 3 * k);
    });
    const ob = Object.assign({}, r.obstacle);
    postMessage({
      type: 'done', nf, X, S, C, T, F, OB, peakS: r.peakS, peakC: r.peakC, peakMode: r.peakMode, peakPly: r.peakPly,
      summary: r.summary, obstacle: ob, dir: r.dir,
    }, [X.buffer, S.buffer, C.buffer, T.buffer, F.buffer, OB.buffer]);
  } catch (err) {
    postMessage({ type: 'error', message: err.message || String(err) });
  }
};
