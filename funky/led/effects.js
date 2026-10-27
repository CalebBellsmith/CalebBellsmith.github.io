/*
  Offline preview: a JavaScript copy of the firmware in led_matrix_control.ino.

  It runs the same OCEAN / LAVA / CAUSTIC maths (including FastLED's integer Perlin noise,
  gradient palettes and 8-bit scaling) and understands the same text commands, so the
  preview looks like the board even when no board is connected. When the board IS
  connected the app shows the real frames it streams instead, and this keeps running in
  the background so it can take over seamlessly if the link drops.

  Frames are row-major (y = 0..7, x = 0..7), RGB, before global brightness — exactly
  what the board streams over Bluetooth.
*/
(function (global) {
  'use strict';

  const W = 8, H = 8, N = W * H;
  const FRAME_MS = 30;
  const f32 = Math.fround;

  // ---------- FastLED 8/16-bit maths ----------
  const u8 = (v) => v & 0xff;
  const u16 = (v) => v & 0xffff;
  const i16 = (v) => (v << 16) >> 16;
  const scale8 = (i, s) => (i * (1 + s)) >> 8;                 // FASTLED_SCALE8_FIXED
  const scale16 = (i, s) => Math.floor((i * (1 + s)) / 65536);
  const qadd8 = (a, b) => Math.min(255, a + b);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---------- FastLED inoise16 (3D) ----------
  const P = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
    151];

  function ease16(i) {                       // ease16InOutQuad
    let j = i;
    if (j & 0x8000) j = 65535 - j;
    let jj2 = u16(scale16(j, j) << 1);
    if (i & 0x8000) jj2 = 65535 - jj2;
    return jj2;
  }
  const avg15 = (i, j) => (i >> 1) + (j >> 1) + (i & 1);

  function grad16(hash, x, y, z) {
    x = i16(x); y = i16(y); z = i16(z);
    hash &= 15;
    let u = hash < 8 ? x : y;
    let v = hash < 4 ? y : (hash === 12 || hash === 14) ? x : z;
    if (hash & 1) u = i16(-u);
    if (hash & 2) v = i16(-v);
    return avg15(u, v);
  }

  function lerp15by16(a, b, frac) {
    if (b > a) return i16(a + scale16(u16(b - a), frac));
    return i16(a - scale16(u16(a - b), frac));
  }

  function inoise16raw(x, y, z) {
    const X = (x >>> 16) & 0xff, Y = (y >>> 16) & 0xff, Z = (z >>> 16) & 0xff;
    const A = u8(P[X] + Y), AA = u8(P[A] + Z), AB = u8(P[A + 1] + Z);
    const B = u8(P[X + 1] + Y), BA = u8(P[B] + Z), BB = u8(P[B + 1] + Z);
    let u = x & 0xffff, v = y & 0xffff, w = z & 0xffff;
    const xx = (u >> 1) & 0x7fff, yy = (v >> 1) & 0x7fff, zz = (w >> 1) & 0x7fff;
    const Nn = 0x8000;
    u = ease16(u); v = ease16(v); w = ease16(w);
    const X1 = lerp15by16(grad16(P[AA], xx, yy, zz), grad16(P[BA], xx - Nn, yy, zz), u);
    const X2 = lerp15by16(grad16(P[AB], xx, yy - Nn, zz), grad16(P[BB], xx - Nn, yy - Nn, zz), u);
    const X3 = lerp15by16(grad16(P[AA + 1], xx, yy, zz - Nn), grad16(P[BA + 1], xx - Nn, yy, zz - Nn), u);
    const X4 = lerp15by16(grad16(P[AB + 1], xx, yy - Nn, zz - Nn), grad16(P[BB + 1], xx - Nn, yy - Nn, zz - Nn), u);
    return lerp15by16(lerp15by16(X1, X2, v), lerp15by16(X3, X4, v), w);
  }

  function inoise16(x, y, z) {
    const pan = Math.imul((inoise16raw(x, y, z) + 19052) >>> 0, 440) >>> 0;
    return (pan >>> 8) & 0xffff;
  }

  // ---------- Noise helpers (same as the firmware) ----------
  const toU32 = (v) => Math.floor(f32(f32(v + 500) * 65536)) >>> 0;
  const noiseAt = (x, y, z) => inoise16(toU32(x), toU32(y), toU32(z));
  const stretch = (n) => clamp(Math.trunc(((n - 16000) * 255) / 34000), 0, 255);
  const signedNoise = (x, y, z) => stretch(noiseAt(x, y, z)) / 127.5 - 1;

  function swirl(x, y, t, spin, twist) {
    const dx = x - 3.5, dy = y - 3.5;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = t * spin + r * twist * Math.sin(t * 0.07);
    const c = Math.cos(a), s = Math.sin(a);
    return [dx * c - dy * s, dx * s + dy * c];
  }

  // ---------- Palettes (FastLED gradient -> CRGBPalette16 conversion) ----------
  const OCEAN_GP = [[0, 0, 2, 10], [60, 0, 10, 55], [120, 0, 45, 115], [175, 0, 105, 135], [225, 35, 165, 190], [255, 90, 200, 215]];
  const LAVA_GP = [[0, 8, 0, 0], [55, 70, 2, 0], [115, 180, 15, 0], [170, 255, 55, 0], [220, 255, 120, 5], [255, 255, 170, 30]];

  function fillGradientRGB(out, startpos, sc, endpos, ec) {
    if (endpos < startpos) { [startpos, endpos] = [endpos, startpos]; [sc, ec] = [ec, sc]; }
    const div = endpos - startpos || 1;
    const d = [0, 1, 2].map((k) => i16(Math.trunc(((ec[k] - sc[k]) * 128) / div) * 2));
    const acc = [sc[0] << 8, sc[1] << 8, sc[2] << 8];
    for (let i = startpos; i <= endpos; i++) {
      out[i] = [acc[0] >> 8, acc[1] >> 8, acc[2] >> 8];
      for (let k = 0; k < 3; k++) acc[k] = u16(acc[k] + d[k]);
    }
  }

  function gradientToPalette16(gp) {
    const pal = Array.from({ length: 16 }, () => [0, 0, 0]);
    let lastSlotUsed = -1, indexstart = 0, rgbstart = gp[0].slice(1), k = 0;
    while (indexstart < 255) {
      k++;
      const indexend = gp[k][0], rgbend = gp[k].slice(1);
      let istart8 = indexstart >> 4, iend8 = indexend >> 4;
      if (gp.length < 16) {
        if (istart8 <= lastSlotUsed && lastSlotUsed < 15) {
          istart8 = lastSlotUsed + 1;
          if (iend8 < istart8) iend8 = istart8;
        }
        lastSlotUsed = iend8;
      }
      fillGradientRGB(pal, istart8, rgbstart, iend8, rgbend);
      indexstart = indexend;
      rgbstart = rgbend;
    }
    return pal;
  }

  function colorFromPalette(pal, index, brightness) {   // LINEARBLEND
    const hi4 = index >> 4, lo4 = index & 15;
    let [r, g, b] = pal[hi4];
    if (lo4) {
      const e2 = pal[hi4 === 15 ? 0 : hi4 + 1];
      const f2 = u8(lo4 << 4), f1 = 255 - f2;
      r = u8(scale8(r, f1) + scale8(e2[0], f2));
      g = u8(scale8(g, f1) + scale8(e2[1], f2));
      b = u8(scale8(b, f1) + scale8(e2[2], f2));
    }
    if (brightness !== 255) {
      if (brightness) {
        const br = brightness + 1;
        if (r) r = scale8(r, br);
        if (g) g = scale8(g, br);
        if (b) b = scale8(b, br);
      } else { r = g = b = 0; }
    }
    return [r, g, b];
  }

  const nscale8 = (c, s) => [scale8(c[0], s), scale8(c[1], s), scale8(c[2], s)];
  const addSat = (a, b) => [qadd8(a[0], b[0]), qadd8(a[1], b[1]), qadd8(a[2], b[2])];

  // Same luminance-preserving hue rotation as hueRotate() in the firmware.
  function hueRotate(c, deg) {
    const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const [r, g, b] = c;
    const nr = (0.213 + co * 0.787 - si * 0.213) * r + (0.715 - co * 0.715 - si * 0.715) * g + (0.072 - co * 0.072 + si * 0.928) * b;
    const ng = (0.213 - co * 0.213 + si * 0.143) * r + (0.715 + co * 0.285 + si * 0.140) * g + (0.072 - co * 0.072 - si * 0.283) * b;
    const nb = (0.213 - co * 0.213 - si * 0.787) * r + (0.715 - co * 0.715 + si * 0.715) * g + (0.072 + co * 0.928 + si * 0.072) * b;
    return [clamp(Math.trunc(nr + 0.5), 0, 255), clamp(Math.trunc(ng + 0.5), 0, 255), clamp(Math.trunc(nb + 0.5), 0, 255)];
  }

  // FastLED blend8 / blend (FASTLED_BLEND_FIXED)
  const blend8 = (a, b, amt) => ((((a << 8) | b) + b * amt - a * amt) >> 8) & 0xff;
  const scaled = (c, v) => nscale8(c, Math.trunc(clamp(v * 255, 0, 255)));

  function hash32(x) {
    x = x >>> 0;
    x = Math.imul(x, 0x9e3779b1) >>> 0; x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x85ebca77) >>> 0; x = (x ^ (x >>> 13)) >>> 0;
    x = Math.imul(x, 0xc2b2ae3d) >>> 0; x = (x ^ (x >>> 16)) >>> 0;
    return x;
  }

  // ---------- More palettes (same as effects.h) ----------
  const AURORA_GP = [[0, 0, 0, 0], [70, 0, 30, 12], [130, 0, 140, 60], [175, 0, 170, 120], [215, 70, 40, 170], [255, 150, 70, 210]];
  const CANDLE_GP = [[0, 0, 0, 0], [60, 60, 8, 0], [120, 170, 45, 0], [180, 255, 100, 8], [230, 255, 150, 40], [255, 255, 190, 90]];
  const MUSIC_GP = [[0, 20, 0, 60], [64, 0, 60, 255], [128, 0, 220, 160], [192, 255, 180, 0], [255, 255, 40, 80]];
  const SUNRISE_GP = [[0, 0, 0, 0], [40, 40, 0, 0], [90, 120, 10, 0], [150, 255, 60, 0], [200, 255, 140, 30], [255, 255, 200, 120]];

  const BASE_PALS = {
    ocean: gradientToPalette16(OCEAN_GP),
    lava: gradientToPalette16(LAVA_GP),
    aurora: gradientToPalette16(AURORA_GP),
    candle: gradientToPalette16(CANDLE_GP),
    music: gradientToPalette16(MUSIC_GP),
  };
  const SUNRISE_PAL = gradientToPalette16(SUNRISE_GP);

  // ---------- Modes (same names, commands and breathing depths as the firmware) ----------
  const MODES = {
    ocean: { cmd: 'OCEAN', breathe: 40 },
    lava: { cmd: 'LAVA', breathe: 40 },
    caustic: { cmd: 'CAUSTIC', breathe: 15 },
    aurora: { cmd: 'AURORA', breathe: 30 },
    fireflies: { cmd: 'FIREFLIES', breathe: 0 },
    candle: { cmd: 'CANDLE', breathe: 0 },
    rain: { cmd: 'RAIN', breathe: 10 },
    music: { cmd: 'MUSIC', breathe: 0 },
    sunrise: { cmd: 'SUNRISE', breathe: 0 },
  };
  const EFFECTS = ['ocean', 'lava', 'caustic', 'aurora', 'fireflies', 'candle', 'rain', 'music'];
  const EFFECT_ORDER = ['ocean', 'lava', 'caustic', 'aurora', 'fireflies', 'candle', 'rain'];   // NEXT without scenes
  const isEffect = (m) => EFFECTS.includes(m);
  const NUM_SCENES = 8;

  // ---------- Effect constants ----------
  const CAUSTIC_WIDTH = 0.55, WARP_AMOUNT = 0.7, STRAND_AMOUNT = 0.55, STRAND_SHARP = 6;
  const SEED_MOTION = [
    [0.21, 0.17, 0.0, 1.3], [0.15, 0.23, 2.1, 0.4], [0.27, 0.13, 4.0, 2.7], [0.12, 0.19, 1.1, 5.2],
    [0.18, 0.29, 3.3, 3.9], [0.24, 0.11, 5.5, 0.9], [0.14, 0.25, 2.8, 4.6]];
  const OFFS = [-0.333, 0, 0.333];
  const FLY_MOTION = [
    [0.13, 0.11, 0.0, 1.7, 3.1, 0.00], [0.09, 0.15, 2.3, 0.4, 4.3, 0.37], [0.17, 0.08, 4.1, 2.9, 3.7, 0.71],
    [0.11, 0.13, 1.2, 5.0, 5.1, 0.15], [0.07, 0.19, 3.6, 3.3, 4.7, 0.55], [0.15, 0.10, 5.2, 0.8, 3.3, 0.86],
    [0.12, 0.17, 2.7, 4.4, 5.9, 0.27]];
  const RAIN_INTERVAL = 1.4, RAIN_LIFE = 4.0, RAIN_SPEED = 1.8;

  const now = () => performance.now();

  // ---------- The simulated board ----------
  class MatrixSim {
    constructor() {
      this.mode = 'none';        // none | ocean | lava | ... | sunrise
      this.speed = 3;
      this.brightness = 32;
      this.hue = 0;
      this.flip = false;
      this.t = 0;
      this.leds = new Uint8Array(N * 3);   // row-major, what the board would show
      this.xfadeFrom = new Uint8Array(N * 3);
      this.xfade = 255;
      this.scenes = new Array(NUM_SCENES).fill(null);   // {mode, speed, bright, hue, name}
      this.currentScene = -1;
      this.cycleMinutes = 0;
      this.cycleLastSwitch = now();
      this.lastOnMode = 'ocean';
      this.sleepStart = 0; this.sleepMs = 0;
      this.sunriseStart = 0; this.sunriseMs = 20 * 60000; this.sunrisePeak = 150;
      this.alarm = { on: false, hh: 7, mm: 0, dur: 20, days: 0x3e, peak: 150 };
      this.audio = { level: 0, bass: 0, mid: 0, high: 0, at: -1e9 };
      this.timersEnabled = true;  // the app turns these off while the real board is in charge
      this.applyHue();
    }

    applyHue() {
      const h = this.hue;
      this.pal = {};
      for (const k in BASE_PALS) this.pal[k] = BASE_PALS[k].map((c) => (h ? hueRotate(c, h) : c));
      this.ripple = hueRotate([0, 170, 255], h);
      this.causticLight = hueRotate([150, 225, 255], h);
      this.firefly = hueRotate([190, 255, 40], h);
      this.rainRing = hueRotate([110, 180, 255], h);
    }

    set(x, y, c) { const p = (y * W + x) * 3; this.leds[p] = c[0]; this.leds[p + 1] = c[1]; this.leds[p + 2] = c[2]; }
    fill(c) { for (let i = 0; i < N; i++) this.leds.set(c, i * 3); }
    anyLit() { return this.leds.some((v) => v > 0); }
    rowFromTop(y) { return this.flip ? H - 1 - y : y; }

    startMode(m) { this.xfadeFrom.set(this.leds); this.xfade = 0; this.mode = m; }
    stopAnimation() { this.mode = 'none'; }
    stopForStatic() { if (this.mode !== 'none') { this.mode = 'none'; this.fill([0, 0, 0]); } }
    manualChange() { this.currentScene = -1; this.cycleMinutes = 0; }

    // ---------- Lamp features (lamp.h) ----------
    sceneUsed(i) { return i >= 0 && i < NUM_SCENES && !!this.scenes[i]; }
    nextScene(from) {
      for (let k = 1; k <= NUM_SCENES; k++) {
        const i = ((from < 0 ? -1 : from) + k + NUM_SCENES) % NUM_SCENES;
        if (this.sceneUsed(i)) return i;
      }
      return -1;
    }
    applyScene(i) {
      const s = this.scenes[i];
      this.speed = clamp(s.speed, 1, 10); this.brightness = s.bright; this.hue = s.hue % 360;
      this.applyHue();
      this.startMode(s.mode);
      this.currentScene = i;
    }
    doNext() {
      const n = this.nextScene(this.currentScene);
      if (n >= 0) return this.applyScene(n);
      const at = EFFECT_ORDER.indexOf(this.mode);
      this.startMode(EFFECT_ORDER[(at + 1) % EFFECT_ORDER.length]);
    }
    doToggle() {
      if (this.mode !== 'none' || this.anyLit()) {
        if (isEffect(this.mode)) this.lastOnMode = this.mode;
        this.stopAnimation(); this.fill([0, 0, 0]);
      } else {
        this.startMode(this.lastOnMode);
      }
    }
    sleepFactor() {
      if (!this.sleepMs) return 1;
      const p = (now() - this.sleepStart) / this.sleepMs;
      return p >= 1 ? 0 : (1 - p) * (1 - p);
    }
    sleepRemainingS() { return this.sleepMs ? Math.max(0, Math.ceil((this.sleepMs - (now() - this.sleepStart)) / 1000)) : 0; }
    sunriseProgress() { return this.sunriseMs ? Math.min(1, (now() - this.sunriseStart) / this.sunriseMs) : 1; }
    startSunrise(minutes, peak) {
      this.sunriseStart = now(); this.sunriseMs = Math.max(1, minutes) * 60000; this.sunrisePeak = peak;
      this.sleepMs = 0; this.cycleMinutes = 0;
      this.startMode('sunrise');
    }
    outputBrightness() {
      let b = this.mode === 'sunrise' ? this.sunrisePeak * Math.pow(this.sunriseProgress(), 1.8) : this.brightness;
      b *= this.sleepFactor();
      return clamp(Math.trunc(b + 0.5), 0, 255);
    }
    setAudio(level, bass, mid, high) { this.audio = { level, bass, mid, high, at: now() }; }

    /** Sleep timer and scene cycling, like lampLoop(). Returns true if something changed. */
    timers() {
      if (!this.timersEnabled) return false;
      let changed = false;
      if (this.sleepMs && now() - this.sleepStart >= this.sleepMs) {
        this.sleepMs = 0; this.stopAnimation(); this.fill([0, 0, 0]); changed = true;
      }
      if (this.cycleMinutes && now() - this.cycleLastSwitch >= this.cycleMinutes * 60000) {
        this.cycleLastSwitch = now();
        const n = this.nextScene(this.currentScene);
        if (n >= 0 && n !== this.currentScene) { this.applyScene(n); changed = true; }
      }
      return changed;
    }

    /** Applies one text command, like the firmware. Returns "OK" or "ERR ...". */
    command(line) {
      const raw = line.trim();
      const tok = raw.toUpperCase().split(/\s+/);
      const cmd = tok.shift();
      const int = (s, lo, hi) => (/^-?\d+$/.test(s || '') && +s >= lo && +s <= hi ? +s : null);
      const ints = (n, lo, hi) => {
        if (tok.length < n) return null;
        const v = tok.slice(0, n).map((s) => int(s, lo, hi));
        return v.every((x) => x !== null) ? v : null;
      };
      const effect = EFFECTS.find((m) => MODES[m].cmd === cmd);
      if (effect) { this.startMode(effect); this.manualChange(); return 'OK'; }

      switch (cmd) {
        case 'ALL': { const c = ints(3, 0, 255); if (!c) return 'ERR usage: ALL r g b'; this.stopAnimation(); this.manualChange(); this.fill(c); break; }
        case 'OFF': case 'STOP': this.stopAnimation(); this.manualChange(); this.fill([0, 0, 0]); break;
        case 'PIXEL': {
          const v = ints(5, 0, 255);
          if (!v || v[0] > 7 || v[1] > 7) return 'ERR usage: PIXEL x y r g b';
          this.stopForStatic(); this.manualChange(); this.set(v[0], v[1], v.slice(2)); break;
        }
        case 'ROW': case 'COL': {
          const sel = parseList(tok.shift());
          const c = ints(3, 0, 255);
          if (!sel || !c) return 'ERR usage: ' + cmd + ' list r g b';
          this.stopForStatic(); this.manualChange();
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sel[cmd === 'ROW' ? y : x]) this.set(x, y, c);
          break;
        }
        case 'BRIGHT': { const v = ints(1, 0, 255); if (!v) return 'ERR usage: BRIGHT 0-255'; this.brightness = v[0]; break; }
        case 'SPEED': { const v = ints(1, 1, 10); if (!v) return 'ERR usage: SPEED 1-10'; this.speed = v[0]; break; }
        case 'HUE': { const v = ints(1, 0, 359); if (!v) return 'ERR usage: HUE 0-359'; this.hue = v[0]; this.applyHue(); break; }
        case 'SUNRISE': {
          const m = tok.length ? int(tok[0], 1, 60) : 20;
          if (m === null) return 'ERR usage: SUNRISE [1-60 minutes]';
          this.startSunrise(m, this.alarm.peak); this.currentScene = -1; break;
        }
        case 'SCENE': {
          const sub = tok.shift();
          if (sub === 'SAVE') {
            const i = int(tok[0], 0, NUM_SCENES - 1);
            if (i === null) return 'ERR usage: SCENE SAVE 0-7 [name]';
            if (!isEffect(this.mode)) return 'ERR start an effect first';
            const name = raw.split(/\s+/).slice(3).join(' ').slice(0, 17) || 'Scene ' + (i + 1);
            this.scenes[i] = { mode: this.mode, speed: this.speed, bright: this.brightness, hue: this.hue, name };
            this.currentScene = i;
          } else if (sub === 'DEL') {
            const i = int(tok[0], 0, NUM_SCENES - 1);
            if (i === null) return 'ERR usage: SCENE DEL 0-7';
            this.scenes[i] = null;
            if (this.currentScene === i) this.currentScene = -1;
          } else {
            const i = int(sub, 0, NUM_SCENES - 1);
            if (i === null) return 'ERR usage: SCENE 0-7 | SCENE SAVE i [name] | SCENE DEL i';
            if (!this.sceneUsed(i)) return 'ERR empty scene';
            this.applyScene(i); this.cycleLastSwitch = now();
          }
          break;
        }
        case 'CYCLE': {
          const m = int(tok[0], 0, 240);
          if (m === null) return 'ERR usage: CYCLE 0-240 minutes';
          if (m && this.nextScene(-1) < 0) return 'ERR save a scene first';
          this.cycleMinutes = m; this.cycleLastSwitch = now();
          if (m && this.currentScene < 0) this.applyScene(this.nextScene(-1));
          break;
        }
        case 'NEXT': this.doNext(); this.cycleLastSwitch = now(); break;
        case 'TOGGLE': this.doToggle(); break;
        case 'SLEEP': {
          const m = int(tok[0], 0, 480);
          if (m === null) return 'ERR usage: SLEEP 0-480 minutes';
          this.sleepMs = m * 60000; this.sleepStart = now(); break;
        }
        case 'ALARM': {
          if (tok[0] === 'OFF') { this.alarm = Object.assign({}, this.alarm, { on: false }); break; }
          const hh = int(tok[0], 0, 23), mm = int(tok[1], 0, 59), dur = int(tok[2], 1, 60), days = int(tok[3], 1, 127), peak = int(tok[4], 1, 255);
          if ([hh, mm, dur, days, peak].includes(null)) return 'ERR usage: ALARM hh mm dur(1-60) days(1-127) peak(1-255) | ALARM OFF';
          this.alarm = { on: true, hh, mm, dur, days, peak };
          break;
        }
        case 'FLIP': { const v = ints(1, 0, 1); if (!v) return 'ERR usage: FLIP 0|1'; this.flip = !!v[0]; break; }
        case 'TIME': case 'STATUS': case 'HELP': case 'SCENES': break;
        default: return 'ERR unknown command (type HELP)';
      }
      return 'OK';
    }

    /** Advances one animation frame (call every FRAME_MS). */
    step() {
      if (this.mode === 'none') return;
      this.t = f32(this.t + f32(0.01 * this.speed));
      const t = this.t;
      switch (this.mode) {
        case 'ocean': this.renderOcean(t); break;
        case 'lava': this.renderLava(t); break;
        case 'caustic': this.renderCaustic(t); break;
        case 'aurora': this.renderAurora(t); break;
        case 'fireflies': this.renderFireflies(t); break;
        case 'candle': this.renderCandle(t); break;
        case 'rain': this.renderRain(t); break;
        case 'music': this.renderMusic(t); break;
        case 'sunrise': this.renderSunrise(t, this.sunriseProgress()); break;
        default: return;
      }
      const depth = MODES[this.mode].breathe;
      const breathe = 255 - depth + Math.trunc(depth * Math.sin(t * 0.2));
      for (let i = 0; i < N * 3; i++) this.leds[i] = scale8(this.leds[i], breathe);
      if (this.xfade < 255) {
        this.xfade = this.xfade > 252 ? 255 : this.xfade + 3;
        for (let i = 0; i < N * 3; i++) this.leds[i] = blend8(this.xfadeFrom[i], this.leds[i], this.xfade);
      }
    }

    renderOcean(t) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [rx, ry] = swirl(x, y, t, 0.12, 0.25);
        const deep = stretch(noiseAt(rx * 0.16, ry * 0.16, t * 0.1));
        const shimmer = stretch(noiseAt(rx * 0.3 + t * 0.05 + 40, ry * 0.3 - t * 0.04, t * 0.17));
        const idx = ((deep * 3 + shimmer) / 4) | 0;
        let col = colorFromPalette(this.pal.ocean, idx, 255);
        if (shimmer > 205) {
          const h = shimmer - 205;
          col = addSat(col, this.hue === 0 ? [0, (h / 3) | 0, (h / 2) | 0] : nscale8(this.ripple, (h / 2) | 0));
        }
        this.set(x, y, col);
      }
    }

    renderLava(t) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const [rx, ry] = swirl(x, y, t, 0.06, 0.2);
        const blob = stretch(noiseAt(rx * 0.18, ry * 0.18 + t * 0.08, t * 0.06));
        const heat = stretch(noiseAt(rx * 0.12 - 30, ry * 0.12 + t * 0.05, t * 0.04 + 10));
        const idx = ((blob * 2 + heat) / 3) | 0;
        const col = colorFromPalette(this.pal.lava, idx, 255);
        this.set(x, y, nscale8(col, u8(70 + ((idx * 185) / 255 | 0))));
      }
    }

    renderCaustic(t) {
      const sx = [], sy = [];
      for (const m of SEED_MOTION) {
        sx.push(3.5 + 5 * Math.sin(t * m[0] + m[2]));
        sy.push(3.5 + 5 * Math.cos(t * m[1] + m[3]));
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let lineSum = 0;
        for (const oy of OFFS) for (const ox of OFFS) {
          const px = x + ox, py = y + oy;
          const wx = px + WARP_AMOUNT * signedNoise(px * 0.22, py * 0.22, t * 0.18);
          const wy = py + WARP_AMOUNT * signedNoise(px * 0.22 + 50, py * 0.22, t * 0.18);
          let f1 = 1e9, f2 = 1e9;
          for (let i = 0; i < sx.length; i++) {
            const dx = wx - sx[i], dy = wy - sy[i];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
          }
          const v = 1 - (f2 - f1) / CAUSTIC_WIDTH;
          if (v > 0) lineSum += v * v;
          const ridge = 1 - Math.abs(signedNoise(wx * 0.45 + 30, wy * 0.45, t * 0.22));
          lineSum += STRAND_AMOUNT * Math.pow(ridge, STRAND_SHARP);
        }
        const line = lineSum / 9;
        const glint = 0.55 + 0.45 * (signedNoise(x * 0.35 + 20, y * 0.35, t * 0.25) * 0.5 + 0.5);
        const lineVal = Math.trunc(clamp(line * glint * 1.6 * 255, 0, 255));
        const baseIdx = ((stretch(noiseAt(x * 0.12, y * 0.12, t * 0.05)) * 150) / 255) | 0;
        const col = colorFromPalette(this.pal.ocean, baseIdx, 200);
        this.set(x, y, addSat(col, nscale8(this.causticLight, lineVal)));
      }
    }

    renderAurora(t) {
      for (let x = 0; x < W; x++) {
        const curtain = stretch(noiseAt(x * 0.22 + t * 0.06, t * 0.05, 7)) / 255;
        const rays = stretch(noiseAt(x * 0.55 - t * 0.09, 3, t * 0.12)) / 255;
        const edge = 0.35 + 0.45 * (stretch(noiseAt(x * 0.15 + 20, t * 0.04, 2)) / 255);
        for (let y = 0; y < H; y++) {
          const fy = (this.rowFromTop(y) + 0.5) / H;
          const shape = fy <= edge ? 0.3 + 0.7 * (fy / edge) * (fy / edge) : Math.max(0, 1 - (fy - edge) * 5);
          const level = clamp(shape * (curtain * 0.7 + rays * 0.5), 0, 1);
          const colIdx = clamp(150 + Math.trunc((edge - fy) * 220) + Math.trunc((rays - 0.5) * 64), 60, 255);
          const col = colorFromPalette(this.pal.aurora, colIdx, Math.trunc(level * 255));
          this.set(x, y, addSat(col, [0, 1, 4]));
        }
      }
    }

    renderFireflies(t) {
      const fx = [], fy = [], fb = [];
      for (const m of FLY_MOTION) {
        fx.push(3.5 + 3.8 * Math.sin(t * m[0] + m[2]) + 0.6 * Math.sin(t * m[0] * 2.7 + m[3]));
        fy.push(3.5 + 3.8 * Math.cos(t * m[1] + m[3]) + 0.6 * Math.cos(t * m[1] * 3.1 + m[2]));
        let ph = t / m[4] + m[5];
        ph -= Math.floor(ph);
        const env = ph < 0.22 ? Math.sin((ph / 0.22) * Math.PI) : 0;
        fb.push(env * env);
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0;
        for (let i = 0; i < fx.length; i++) {
          if (fb[i] <= 0) continue;
          const dx = x - fx[i], dy = y - fy[i];
          v += fb[i] * Math.exp(-(dx * dx + dy * dy) / 0.9);
        }
        this.set(x, y, addSat([0, 3, 1], scaled(this.firefly, v)));
      }
    }

    renderCandle(t) {
      let flame = 0.78 + 0.22 * signedNoise(t * 1.6, 3, 0);
      const gust = stretch(noiseAt(t * 0.35, 9, 0));
      if (gust > 200) flame *= 1 - (gust - 200) / 255;
      for (let y = 0; y < H; y++) {
        const fy = this.rowFromTop(y) / (H - 1);
        for (let x = 0; x < W; x++) {
          const local = stretch(noiseAt(x * 0.45, this.rowFromTop(y) * 0.45 + t * 0.8, t * 0.5));
          const idx = clamp(Math.trunc(fy * 150) + 40 + Math.trunc((local - 128) / 2), 0, 255);
          const bright = flame * (0.55 + 0.45 * fy);
          this.set(x, y, colorFromPalette(this.pal.candle, idx, Math.trunc(clamp(bright * 255, 0, 255))));
        }
      }
    }

    renderRain(t) {
      const kmax = Math.floor(t / RAIN_INTERVAL);
      const drops = [];
      for (let k = Math.max(0, kmax - 3); k <= kmax; k++) {
        const h = hash32(k);
        const jitter = (((hash32((k ^ 0xa5a5) >>> 0) & 0xffff) / 65535) - 0.5) * 0.8 * RAIN_INTERVAL;
        const age = t - (k * RAIN_INTERVAL + jitter);
        if (age < 0 || age > RAIN_LIFE) continue;
        drops.push({ cx: ((h & 0xffff) / 65535) * 8 - 0.5, cy: ((h >>> 16) / 65535) * 8 - 0.5, age });
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const baseIdx = 40 + Math.trunc(stretch(noiseAt(x * 0.15, y * 0.15, t * 0.06)) / 6);
        const col = colorFromPalette(this.pal.ocean, baseIdx, 160);
        let v = 0;
        for (const d of drops) {
          const dx = x - d.cx, dy = y - d.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const r = d.age * RAIN_SPEED;
          let fade = 1 - d.age / RAIN_LIFE;
          fade *= fade;
          v += Math.exp(-((dist - r) * (dist - r)) / 0.3) * fade;
          if (d.age < 0.3) v += (1 - d.age / 0.3) * Math.exp(-(dist * dist) / 0.4);
        }
        this.set(x, y, addSat(col, scaled(this.rainRing, v)));
      }
    }

    renderMusic(t) {
      const alive = now() - this.audio.at < 1500 ? 1 : 0;
      const bass = (alive * this.audio.bass) / 255, mid = (alive * this.audio.mid) / 255;
      const high = (alive * this.audio.high) / 255, level = (alive * this.audio.level) / 255;
      const radius = 0.6 + bass * 5;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - 3.5, dy = y - 3.5;
        const d = Math.sqrt(dx * dx + dy * dy);
        const ring = Math.max(0, 1 - Math.abs(d - radius) / 1.6);
        const glow = Math.max(0, 1 - d / 6) * (0.15 + 0.85 * mid);
        const v = clamp(0.08 + ring * (0.3 + 0.7 * bass) + glow * 0.6 + level * 0.2, 0, 1);
        const idx = Math.trunc(t * 12 + d * 20) & 0xff;
        let col = colorFromPalette(this.pal.music, idx, Math.trunc(v * 255));
        const s = stretch(noiseAt(x * 0.9, y * 0.9, t * 3));
        if (high > 0.05 && s > 200) col = addSat(col, scaled([255, 255, 255], (high * (s - 200)) / 55));
        this.set(x, y, col);
      }
    }

    renderSunrise(t, p) {
      for (let y = 0; y < H; y++) {
        const h = 1 - this.rowFromTop(y) / (H - 1);
        for (let x = 0; x < W; x++) {
          const local = clamp(p * 1.3 - h * 0.3, 0, 1);
          const shimmer = 0.04 * signedNoise(x * 0.3, y * 0.3, t * 0.1);
          this.set(x, y, colorFromPalette(SUNRISE_PAL, Math.trunc(clamp(local + shimmer, 0, 1) * 255), 255));
        }
      }
    }
  }

  function parseList(text) {
    if (!text) return null;
    const sel = new Array(8).fill(false);
    for (const part of text.split(',')) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!m) return null;
      const a = +m[1], b = m[2] === undefined ? a : +m[2];
      if (a > b || b > 7) return null;
      for (let i = a; i <= b; i++) sel[i] = true;
    }
    return sel;
  }

  MatrixSim.FRAME_MS = FRAME_MS;
  MatrixSim.MODES = MODES;
  MatrixSim.EFFECTS = EFFECTS;
  MatrixSim.NUM_SCENES = NUM_SCENES;
  MatrixSim.PALETTES = Object.assign({ sunrise: SUNRISE_PAL }, BASE_PALS);
  MatrixSim.hueRotate = hueRotate;
  global.MatrixSim = MatrixSim;
})(window);
