/*
  How the page talks to the board.

  NativeLink      inside the Mac app: Swift does the Bluetooth LE work (scan, connect,
                  key handshake) and passes messages through window.webkit.messageHandlers.
  PreviewLink     in an ordinary browser (e.g. on your website): no board, simulation only.

  Both expose the same small interface, so another transport (Web Bluetooth, a websocket
  relay...) can be added later without touching app.js:
    on(type, fn)   'link' {state, detail}, 'frame' {bytes}, 'state' {line}, 'reply' {line}, 'rssi' {value},
                   'audio' {level, bass, mid, high}, 'ota' {state, progress, message}, 'menu' {line}
    start()        begin connecting
    send(line)     send one text command
    reconnect()    drop the current link and search again
    setAudio(on)   start / stop listening to the microphone for MUSIC (Mac app only)
    requestOta()   pick a firmware file and update the board (Mac app only)
    report(state)  current UI state, for the Mac menu bar
*/
(function (global) {
  'use strict';

  class Emitter {
    constructor() { this.handlers = {}; }
    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    emit(type, msg) { (this.handlers[type] || []).forEach((fn) => fn(msg)); }
  }

  function decodeBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  class NativeLink extends Emitter {
    constructor(port) {
      super();
      this.port = port;
      this.kind = 'native';
      // Swift calls window.ledNative.receive({...}) for every event.
      global.ledNative = {
        receive: (msg) => {
          if (msg.type === 'frame') this.emit('frame', { bytes: decodeBase64(msg.data) });
          else this.emit(msg.type, msg);
        },
      };
    }
    start() { this.port.postMessage({ type: 'ready' }); }
    send(line) { this.port.postMessage({ type: 'cmd', line }); }
    reconnect() { this.port.postMessage({ type: 'reconnect' }); }
    setAudio(on) { this.port.postMessage({ type: 'audio', on: !!on }); }
    requestOta() { this.port.postMessage({ type: 'ota' }); }
    report(state) { this.port.postMessage({ type: 'report', state }); }
  }

  class PreviewLink extends Emitter {
    constructor() { super(); this.kind = 'preview'; }
    start() { setTimeout(() => this.emit('link', { state: 'preview-only' }), 0); }
    send() {}
    reconnect() {}
    setAudio() {}
    requestOta() {}
    report() {}
  }

  /*
    WebLink: Web Bluetooth straight from Chrome / Edge / Arc. Same protocol as the Mac app
    (see ble_link.h): read AUTH for the board's nonce Nb, write Nm + HMAC(key, "MAC"|Nb|Nm),
    then check the board's HMAC(key, "ESP"|Nb|Nm). The service UUID and key come from the
    pairing.json pasted on the LED tab, kept in this browser only, never on the website.
    Browsers can't scan in the background, so the first connection needs a click (it opens
    Chrome's device picker); after that the same board reconnects on its own.
  */
  const CH = {
    auth: '6e3a0001-5d2c-4b8f-9a1e-3c7d2f4b8a10',
    cmd: '6e3a0002-5d2c-4b8f-9a1e-3c7d2f4b8a10',
    reply: '6e3a0003-5d2c-4b8f-9a1e-3c7d2f4b8a10',
    state: '6e3a0004-5d2c-4b8f-9a1e-3c7d2f4b8a10',
    frame: '6e3a0005-5d2c-4b8f-9a1e-3c7d2f4b8a10',
    audio: '6e3a0007-5d2c-4b8f-9a1e-3c7d2f4b8a10',
  };
  const FRAME_SIZE = 8 * 8 * 3 + 1;

  function readPairing() {
    try {
      const p = JSON.parse(localStorage.getItem('ledPairing') || 'null');
      if (p && /^[0-9a-f-]{36}$/i.test(p.serviceUUID) && /^[0-9a-f]{64}$/i.test(p.key)) return p;
    } catch (e) { /* missing or private mode */ }
    return null;
  }

  const hexBytes = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  };
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  class WebLink extends Emitter {
    constructor() {
      super();
      this.kind = 'web';
      this.device = null;
      this.chars = {};
      this.paired = false;
      this.frame = new Uint8Array(FRAME_SIZE);
      this.writes = Promise.resolve();      // GATT allows one operation at a time
      this.audioBusy = false;
      this.retry = null;
      this.meter = null;
    }

    emitLink(state, detail) { this.emit('link', detail ? { state, detail } : { state }); }

    async start() {
      this.pairing = readPairing();
      if (!this.pairing) return this.emitLink('needs-pairing', 'Paste your pairing.json on the LED tab, then click here.');
      // Boards picked before can reconnect without the picker (where Chrome supports it).
      if (navigator.bluetooth.getDevices) {
        try {
          const known = (await navigator.bluetooth.getDevices())[0];
          if (known) { this.adopt(known); return this.connect(); }
        } catch (e) { /* not supported here */ }
      }
      this.emitLink('ready', 'Click to pick your matrix in the Bluetooth window.');
    }

    // Clicking the status pill: open the picker (needs that click as a user gesture).
    async reconnect() {
      this.pairing = readPairing();
      if (!this.pairing) return this.emitLink('needs-pairing', 'Paste your pairing.json on the LED tab first.');
      if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
      try {
        const dev = await navigator.bluetooth.requestDevice({
          filters: [{ services: [this.pairing.serviceUUID] }],
        });
        this.adopt(dev);
        this.connect();
      } catch (e) {
        this.emitLink('ready', e.name === 'NotFoundError' ? 'No board picked. Click to try again.' : e.message);
      }
    }

    adopt(dev) {
      if (this.device === dev) return;
      this.device = dev;
      dev.addEventListener('gattserverdisconnected', () => {
        const was = this.paired;
        this.paired = false;
        this.chars = {};
        this.emitLink('scanning', was ? 'Lost the board; trying to reconnect.' : undefined);
        this.scheduleRetry(1500);
      });
    }

    scheduleRetry(ms) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), ms);
    }

    async connect() {
      const dev = this.device;
      if (!dev) return;
      clearTimeout(this.retry);
      try {
        this.emitLink('connecting');
        const server = await dev.gatt.connect();
        const svc = await server.getPrimaryService(this.pairing.serviceUUID);
        const chars = {};
        for (const [name, uuid] of Object.entries(CH)) {
          try { chars[name] = await svc.getCharacteristic(uuid); } catch (e) { /* optional */ }
        }
        if (!chars.auth || !chars.cmd) throw new Error("The board's firmware looks out of date.");
        this.chars = chars;
        for (const name of ['auth', 'reply', 'state', 'frame']) {
          if (!chars[name]) continue;
          chars[name].addEventListener('characteristicvaluechanged', (e) => this.onValue(name, new Uint8Array(e.target.value.buffer)));
          await chars[name].startNotifications();
        }
        await this.handshake();
      } catch (e) {
        if (!dev.gatt.connected) {
          this.emitLink('scanning', 'Board not in range yet; still looking.');
          this.scheduleRetry(4000);
        } else {
          this.emitLink('connecting', e.message);
          dev.gatt.disconnect();
        }
      }
    }

    async hmac(label, nb, nm) {
      const key = await crypto.subtle.importKey('raw', hexBytes(this.pairing.key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(new TextEncoder().encode(label), nb, nm)));
    }

    async handshake() {
      this.emitLink('handshake');
      const nb = new Uint8Array((await this.chars.auth.readValue()).buffer);
      if (nb.length !== 16) throw new Error('Unexpected challenge from the board.');
      const nm = crypto.getRandomValues(new Uint8Array(16));
      this.expect = await this.hmac('ESP', nb, nm);
      const proof = await this.hmac('MAC', nb, nm);
      const answered = new Promise((resolve, reject) => {
        this.authDone = resolve;
        setTimeout(() => reject(new Error("The board didn't finish the key check in time.")), 8000);
      });
      await this.chars.auth.writeValueWithResponse(concat(nm, proof));
      await answered;
      this.paired = true;
      this.emitLink('paired');
      if (this.chars.state) {
        const v = await this.chars.state.readValue();
        this.emit('state', { line: new TextDecoder().decode(v) });
      }
    }

    onValue(name, v) {
      if (name === 'auth') {
        if (v.length === 32 && this.expect && this.authDone) {
          if (sameBytes(v, this.expect)) this.authDone();
          else {
            this.emitLink('rejected', 'A board answered with the wrong key and was ignored.');
            this.device.gatt.disconnect();
          }
        }
        return;
      }
      if (!this.paired) return;
      if (name === 'reply') this.emit('reply', { line: new TextDecoder().decode(v) });
      else if (name === 'state') this.emit('state', { line: new TextDecoder().decode(v) });
      else if (name === 'frame' && v.length >= 2) {
        // Packets are [byte offset][bytes...]; the frame is complete at the last one.
        const off = v[0];
        const n = Math.min(v.length - 1, FRAME_SIZE - off);
        if (n <= 0) return;
        this.frame.set(v.subarray(1, 1 + n), off);
        if (off + n === FRAME_SIZE) this.emit('frame', { bytes: this.frame.slice() });
      }
    }

    send(line) {
      if (!this.paired || !this.chars.cmd) return;
      const data = new TextEncoder().encode(line);
      this.writes = this.writes.then(() => this.chars.cmd.writeValueWithResponse(data)).catch(() => {});
    }

    // MUSIC mode: the browser's microphone, same bands and gain as the Mac app's meter.
    async setAudio(on) {
      if (!on) { if (this.meter) this.meter.stop(); this.meter = null; return; }
      if (this.meter) return;
      try {
        this.meter = await AudioMeter.start((levels) => {
          this.emit('audio', { level: levels[0], bass: levels[1], mid: levels[2], high: levels[3] });
          if (this.paired && this.chars.audio && !this.audioBusy) {
            this.audioBusy = true;      // drop, don't queue: the board wants the newest levels
            this.chars.audio.writeValueWithoutResponse(levels).catch(() => {}).finally(() => { this.audioBusy = false; });
          }
        });
      } catch (e) {
        this.emit('reply', { line: 'ERR microphone access was refused' });
      }
    }

    requestOta() {
      this.emit('ota', { state: 'error', progress: 0, message: 'firmware updates run from the Mac app' });
    }
    report() {}
  }

  // Port of app/mac/AudioMeter.swift: loudness plus bass / mid / high bands, auto-gained.
  const AudioMeter = {
    async start(onLevels) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0;
      src.connect(an);
      const time = new Float32Array(an.fftSize);
      const freq = new Float32Array(an.frequencyBinCount);
      const binHz = ctx.sampleRate / an.fftSize;
      const smooth = [0, 0, 0, 0];
      const peak = [1e-4, 1e-4, 1e-4, 1e-4];
      const band = (lo, hi) => {
        const a = Math.max(1, Math.floor(lo / binHz)), b = Math.min(freq.length - 1, Math.floor(hi / binHz));
        let s = 0;
        for (let i = a; i <= b; i++) s += Math.pow(10, freq[i] / 20);
        return b >= a ? s / (b - a + 1) : 0;
      };
      const timer = setInterval(() => {
        an.getFloatTimeDomainData(time);
        an.getFloatFrequencyData(freq);
        let sq = 0;
        for (let i = 0; i < time.length; i++) sq += time[i] * time[i];
        const rms = Math.sqrt(sq / time.length);
        const raw = [rms, band(40, 250), band(250, 2000), band(2000, 8000)];
        const out = new Uint8Array(4);
        for (let i = 0; i < 4; i++) {
          peak[i] = Math.max(raw[i], peak[i] * 0.997);
          const v = Math.min(1, raw[i] / Math.max(peak[i], 1e-4));
          smooth[i] = v > smooth[i] ? smooth[i] + (v - smooth[i]) * 0.6 : smooth[i] * 0.85 + v * 0.15;
          const gate = rms < 0.002 ? 0 : 1;
          out[i] = Math.max(0, Math.min(255, smooth[i] * smooth[i] * 255 * gate));
        }
        onLevels(out);
      }, 1000 / 30);
      return {
        stop() { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); ctx.close(); },
      };
    },
  };

  global.createLink = function () {
    const port = global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.led;
    if (port) return new NativeLink(port);
    return navigator.bluetooth ? new WebLink() : new PreviewLink();
  };
})(window);
