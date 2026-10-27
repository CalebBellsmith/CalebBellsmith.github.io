/*
  LED Matrix control panel: preview rendering, controls, and keeping the simulation,
  the UI and the real board in agreement.
*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const W = 8, H = 8;
  const EFFECTS = MatrixSim.EFFECTS;                 // ocean ... music
  const REAL_FRAME_STALE_MS = 2500;
  const MODE_TILES = [
    ['ocean', 'Ocean'], ['lava', 'Lava'], ['caustic', 'Caustic'], ['aurora', 'Aurora'],
    ['fireflies', 'Fireflies'], ['candle', 'Candle'], ['rain', 'Rain'], ['music', 'Music'],
    ['solid', 'Solid'], ['paint', 'Paint'], ['off', 'Off'],
  ];
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const sim = new MatrixSim();
  const link = createLink();

  // ---------- Persistent preferences (this app / browser only) ----------
  const prefs = (() => {
    const def = { view: 'leds', rot: 0, mirror: false, solid: '#ff9329', brush: '#3ad0ff', scenes: null };
    try { return Object.assign(def, JSON.parse(localStorage.getItem('ledMatrixPrefs') || '{}')); }
    catch (e) { return def; }
  })();
  const savePrefs = () => { try { localStorage.setItem('ledMatrixPrefs', JSON.stringify(prefs)); } catch (e) { /* private mode */ } };
  if (Array.isArray(prefs.scenes) && prefs.scenes.length === MatrixSim.NUM_SCENES) sim.scenes = prefs.scenes;

  // ---------- State ----------
  let paired = false;
  let realFrame = null;
  let realBright = 32;
  let realFrameAt = 0;
  let boardClock = false;
  let uiMode = 'ocean';          // an effect, sunrise, solid, paint or off
  let eraser = false;
  let audioOn = false;
  let offlineDirty = false;      // changed things while the board wasn't connected
  let pendingSync = null;        // snapshot offered to send once it reconnects
  const replyQueue = [];         // commands awaiting OK/ERR: {fromConsole, kind}
  let sceneLines = null;         // SCENES reply being collected

  // ---------- Helpers ----------
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgbToHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const isEffect = (m) => EFFECTS.includes(m);
  const firstWord = (line) => line.trim().split(/\s+/)[0].toUpperCase();

  function throttle(fn, ms) {
    let last = 0, timer = null, pendingArgs = null;
    return function (...args) {
      const t = performance.now();
      pendingArgs = args;
      if (t - last >= ms) { last = t; fn(...args); pendingArgs = null; }
      else if (!timer) {
        timer = setTimeout(() => { timer = null; last = performance.now(); if (pendingArgs) fn(...pendingArgs); pendingArgs = null; }, ms - (t - last));
      }
    };
  }

  // ---------- Console log ----------
  const logEl = $('log');
  function log(text, cls) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    logEl.appendChild(line);
    while (logEl.childElementCount > 300) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- Sending commands ----------
  // Every command goes to the simulation (so the preview and UI always respond) and,
  // when paired, to the board.
  const QUIET = ['TIME', 'STATUS', 'HELP', 'SCENES'];
  function send(line, opts = {}) {
    const simReply = sim.command(line);
    if (paired) {
      link.send(line);
      replyQueue.push({ fromConsole: !!opts.fromConsole, kind: opts.kind || null });
      if (!opts.silent) log('→ ' + line, 'tx');
    } else {
      if (!opts.silent) log('→ ' + line + '   (preview only)', 'tx');
      if (opts.fromConsole || simReply !== 'OK') log('← ' + simReply, simReply === 'OK' ? '' : 'err');
      if (simReply === 'OK' && link.kind === 'native' && !QUIET.includes(firstWord(line))) offlineDirty = true;
    }
    if (firstWord(line) === 'SCENE') saveSceneCache();
    return simReply;
  }

  // What the mode tiles should show, from what the simulation is doing.
  function deriveUiMode() {
    if (sim.mode !== 'none') uiMode = sim.mode;
    else if (isEffect(uiMode) || uiMode === 'sunrise') uiMode = sim.anyLit() ? 'solid' : 'off';
    else if (uiMode === 'off' && sim.anyLit()) uiMode = 'solid';
  }

  function saveSceneCache() { prefs.scenes = sim.scenes; savePrefs(); renderScenes(); }

  // ---------- Link events ----------
  const LINK_TEXT = {
    'offline': 'Offline',
    'preview-only': 'Preview only',
    'bluetooth-off': 'Bluetooth is off',
    'unauthorized': 'Bluetooth permission needed',
    'scanning': 'Looking for your matrix…',
    'connecting': 'Connecting…',
    'handshake': 'Checking key…',
    'paired': 'Connected',
    'rejected': 'Board has the wrong key',
    'needs-pairing': 'Pair this browser',
    'ready': 'Connect to board',
  };

  link.on('link', (msg) => {
    const wasPaired = paired;
    paired = msg.state === 'paired';
    sim.timersEnabled = !paired;
    $('link').dataset.state = msg.state;
    $('linkText').textContent = LINK_TEXT[msg.state] || msg.state;
    $('link').title = msg.detail || 'Click to search again';
    if (!paired) { $('rssi').textContent = ''; realFrame = null; replyQueue.length = 0; }
    if (paired !== wasPaired) log(paired ? 'Board connected.' : 'Board disconnected.', 'sys');
    if (msg.detail && msg.state !== 'paired') log(msg.detail, 'sys');
    if (paired && !wasPaired) onPaired();
    updateNote();
    syncControls();
  });

  function onPaired() {
    if (offlineDirty) { pendingSync = snapshot(); $('syncBanner').hidden = false; }
    offlineDirty = false;
    send(`TIME ${Math.floor(Date.now() / 1000)} ${-new Date().getTimezoneOffset()}`, { silent: true });
    sceneLines = [];
    send('SCENES', { silent: true, kind: 'scenes' });
  }

  link.on('frame', ({ bytes }) => {
    if (bytes.length < W * H * 3) return;
    realFrame = bytes.subarray(0, W * H * 3);
    realBright = bytes.length > W * H * 3 ? bytes[W * H * 3] : sim.brightness;
    realFrameAt = performance.now();
    if (sim.mode === 'none') {
      sim.leds.set(realFrame);                       // keep the simulation's picture in step
      if (uiMode === 'solid' && !sim.anyLit()) { uiMode = 'off'; syncControls(); }
    }
  });

  link.on('state', ({ line }) => applyBoardState(line));

  link.on('reply', ({ line }) => {
    if (line === 'OK' || line.startsWith('ERR')) {
      const q = replyQueue.shift();
      if (q && q.kind === 'scenes' && line === 'OK' && sceneLines) {
        const list = new Array(MatrixSim.NUM_SCENES).fill(null);
        for (const s of sceneLines) list[s.i] = s.scene;
        sim.scenes = list;
        sceneLines = null;
        saveSceneCache();
      }
      if (line !== 'OK' || (q && q.fromConsole)) log('← ' + line, line === 'OK' ? '' : 'err');
    } else if (sceneLines && line.startsWith('scene ')) {
      // "scene i mode speed bright hue name..."
      const p = line.split(' ');
      sceneLines.push({ i: +p[1], scene: { mode: p[2], speed: +p[3], bright: +p[4], hue: +p[5], name: p.slice(6).join(' ') } });
    } else {
      log('← ' + line);
    }
  });

  link.on('rssi', ({ value }) => { $('rssi').textContent = value ? value + ' dBm' : ''; });

  link.on('audio', ({ level, bass, mid, high }) => {
    sim.setAudio(level, bass, mid, high);
    $('mBass').style.width = (bass / 2.55) + '%';
    $('mMid').style.width = (mid / 2.55) + '%';
    $('mHigh').style.width = (high / 2.55) + '%';
  });

  link.on('menu', ({ line }) => { send(line); deriveUiMode(); syncControls(); });

  let otaHideTimer = null;
  link.on('ota', ({ state, progress, message }) => {
    const b = $('otaBanner');
    clearTimeout(otaHideTimer);
    b.hidden = false;
    b.classList.toggle('error', state === 'error');
    $('otaBar').style.width = Math.round((progress || 0) * 100) + '%';
    if (state === 'start' || state === 'progress') {
      $('otaText').textContent = `Updating firmware… ${Math.round((progress || 0) * 100)}%  Keep the board powered.`;
    } else if (state === 'done') {
      $('otaText').textContent = 'Firmware updated. The board is restarting and will reconnect.';
      otaHideTimer = setTimeout(() => { b.hidden = true; }, 8000);
    } else if (state === 'error') {
      $('otaText').textContent = 'Update failed: ' + (message || 'unknown error') + '. The old firmware is still running.';
      otaHideTimer = setTimeout(() => { b.hidden = true; }, 15000);
    }
    if (message && state !== 'progress') log('Firmware update: ' + message, state === 'error' ? 'err' : 'sys');
  });

  $('link').addEventListener('click', () => link.reconnect());

  // The board's STATUS line: "mode=ocean speed=3 brightness=32 ... hue=0 ble=paired sleep=0 ..."
  function applyBoardState(line) {
    const kv = {};
    line.trim().split(/\s+/).forEach((p) => { const i = p.indexOf('='); if (i > 0) kv[p.slice(0, i)] = p.slice(i + 1); });
    if (kv.mode && kv.mode !== sim.mode) {
      if (MatrixSim.MODES[kv.mode]) sim.startMode(kv.mode); else sim.mode = 'none';
      if (kv.mode === 'sunrise') sim.sunriseStart = performance.now();
    }
    if (kv.speed) sim.speed = +kv.speed;
    if (kv.brightness) sim.brightness = +kv.brightness;
    if (kv.hue && +kv.hue !== sim.hue) { sim.hue = +kv.hue; sim.applyHue(); }
    if (kv.flip) sim.flip = kv.flip === '1';
    if (kv.cycle) sim.cycleMinutes = +kv.cycle;
    if (kv.scene) sim.currentScene = +kv.scene;
    if (kv.sleep !== undefined) {
      const s = +kv.sleep;
      if (!s) sim.sleepMs = 0;
      else if (Math.abs(sim.sleepRemainingS() - s) > 3) { sim.sleepMs = s * 1000; sim.sleepStart = performance.now(); }
    }
    if (kv.alarm) {
      const m = /^(\d+):(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(kv.alarm);
      sim.alarm = m ? { on: true, hh: +m[1], mm: +m[2], dur: +m[3], days: +m[4], peak: +m[5] } : Object.assign({}, sim.alarm, { on: false });
    }
    boardClock = kv.clock === '1';
    deriveUiMode();
    syncControls();
  }

  function readyToConnect() {
    return !['ready', 'needs-pairing'].includes($('link').dataset.state);
  }

  function updateNote() {
    const note = $('stageNote');
    if (paired) note.textContent = 'Live from the board.';
    else if (link.kind === 'preview') note.textContent = 'Simulated preview. Controlling the board needs Chrome, Edge or Arc (Web Bluetooth) or the Mac app.';
    else if (link.kind === 'web' && !readyToConnect()) note.textContent = 'Simulated preview. Use the button above to connect to the board.';
    else note.textContent = 'Simulated preview. Changes reach the board once it connects.';
  }

  // ---------- Offline changes ----------
  function snapshot() {
    return {
      mode: sim.mode, speed: sim.speed, brightness: sim.brightness, hue: sim.hue, flip: sim.flip,
      cycle: sim.cycleMinutes, alarm: Object.assign({}, sim.alarm),
      frame: sim.mode === 'none' ? sim.leds.slice() : null,
      scenes: sim.scenes.map((s) => (s ? Object.assign({}, s) : null)),
    };
  }

  $('syncSend').addEventListener('click', () => {
    const s = pendingSync;
    pendingSync = null;
    $('syncBanner').hidden = true;
    if (!s || !paired) return;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    s.scenes.forEach((sc, i) => {
      if (same(sc, sim.scenes[i])) return;
      if (!sc) { send(`SCENE DEL ${i}`); return; }
      send(MatrixSim.MODES[sc.mode].cmd);
      send(`SPEED ${sc.speed}`); send(`BRIGHT ${sc.bright}`); send(`HUE ${sc.hue}`);
      send(`SCENE SAVE ${i} ${sc.name}`);
    });
    if (isEffect(s.mode)) send(MatrixSim.MODES[s.mode].cmd);
    else if (s.frame) {
      send('OFF');
      for (let i = 0; i < W * H; i++) {
        const c = s.frame.subarray(i * 3, i * 3 + 3);
        if (c[0] || c[1] || c[2]) send(`PIXEL ${i % W} ${Math.floor(i / W)} ${c[0]} ${c[1]} ${c[2]}`, { silent: true });
      }
    }
    send(`BRIGHT ${s.brightness}`); send(`SPEED ${s.speed}`); send(`HUE ${s.hue}`); send(`FLIP ${s.flip ? 1 : 0}`);
    if (s.cycle) send(`CYCLE ${s.cycle}`);
    const a = s.alarm;
    send(a.on ? `ALARM ${a.hh} ${a.mm} ${a.dur} ${a.days} ${a.peak}` : 'ALARM OFF');
    deriveUiMode();
    syncControls();
  });
  $('syncKeep').addEventListener('click', () => { pendingSync = null; $('syncBanner').hidden = true; });

  // ---------- Mode tiles ----------
  MODE_TILES.forEach(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode';
    b.dataset.mode = id;
    b.setAttribute('role', 'radio');
    const sw = document.createElement('span');
    sw.className = 'sw sw-' + id;
    if (id === 'solid') sw.id = 'solidSwatch';
    b.append(sw, label);
    b.addEventListener('click', () => selectMode(id));
    $('modes').appendChild(b);
  });
  const modeButtons = [...document.querySelectorAll('.mode')];

  function selectMode(m) {
    if (isEffect(m)) send(MatrixSim.MODES[m].cmd);
    else if (m === 'solid') send('ALL ' + hexToRgb(prefs.solid).join(' '));
    else if (m === 'paint') { if (sim.mode !== 'none') send('OFF'); }
    else if (m === 'off') send('OFF');
    uiMode = m;
    syncControls();
  }

  // ---------- Controls ----------
  const bright = $('bright'), speed = $('speed'), hue = $('hue');

  function syncControls() {
    modeButtons.forEach((b) => {
      const on = b.dataset.mode === uiMode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });
    const effect = isEffect(uiMode);
    document.querySelectorAll('.effect-only').forEach((el) => {
      el.classList.toggle('disabled', !effect);
      el.querySelector('input').disabled = !effect;
    });
    $('solidGroup').hidden = uiMode !== 'solid';
    $('paintGroup').hidden = uiMode !== 'paint';
    $('musicGroup').hidden = uiMode !== 'music';
    $('musicHint').textContent = link.kind === 'native'
      ? "The Mac's microphone drives the board while this mode is on."
      : link.kind === 'web' ? "This computer's microphone drives the board while this mode is on."
      : 'Music mode listens through the Mac app.';
    document.body.classList.toggle('painting', uiMode === 'paint');

    const wantAudio = uiMode === 'music';
    if (wantAudio !== audioOn) { audioOn = wantAudio; link.setAudio(wantAudio); }

    if (document.activeElement !== bright) bright.value = sim.brightness;
    if (document.activeElement !== speed) speed.value = sim.speed;
    if (document.activeElement !== hue) hue.value = sim.hue;
    $('brightOut').textContent = Math.round((bright.value / 255) * 100) + '%';
    $('speedOut').textContent = speed.value;
    $('hueOut').textContent = hue.value + '°';

    $('cycle').value = String(sim.cycleMinutes);
    if ($('cycle').value !== String(sim.cycleMinutes)) {       // a value not in the list
      $('cycle').add(new Option(`every ${sim.cycleMinutes} min`, String(sim.cycleMinutes)));
      $('cycle').value = String(sim.cycleMinutes);
    }
    $('flip').checked = sim.flip;
    syncAlarm();
    renderScenes();
    updateSleep();
    report();
  }

  const sendBright = throttle((v) => send('BRIGHT ' + v), 70);
  const sendHue = throttle((v) => send('HUE ' + v), 70);
  bright.addEventListener('input', () => { sendBright(bright.value); syncControls(); });
  speed.addEventListener('input', () => { send('SPEED ' + speed.value); syncControls(); });
  hue.addEventListener('input', () => { sendHue(hue.value); syncControls(); });
  $('hueReset').addEventListener('click', (e) => { e.preventDefault(); hue.value = 0; send('HUE 0'); syncControls(); });

  // Solid colour
  const PRESETS = [[255, 147, 41], [255, 197, 143], [180, 205, 255], [255, 40, 0], [255, 0, 70], [140, 0, 255], [0, 70, 255], [0, 200, 120]];
  const sendSolid = throttle((hex) => send('ALL ' + hexToRgb(hex).join(' ')), 70);
  function setSolid(hex) {
    prefs.solid = hex; savePrefs();
    $('solidColor').value = hex;
    $('solidSwatch').style.background = hex;
    sendSolid(hex);
    uiMode = 'solid';
    syncControls();
  }
  $('solidColor').value = prefs.solid;
  $('solidSwatch').style.background = prefs.solid;
  $('solidColor').addEventListener('input', (e) => setSolid(e.target.value));

  // Paint
  function setBrush(hex) {
    prefs.brush = hex; savePrefs();
    $('brushColor').value = hex;
    eraser = false; $('eraserBtn').setAttribute('aria-pressed', 'false');
  }
  $('brushColor').value = prefs.brush;
  $('brushColor').addEventListener('input', (e) => setBrush(e.target.value));
  $('eraserBtn').addEventListener('click', () => { eraser = !eraser; $('eraserBtn').setAttribute('aria-pressed', String(eraser)); });
  $('fillBtn').addEventListener('click', () => send('ALL ' + hexToRgb(prefs.brush).join(' ')));
  $('clearBtn').addEventListener('click', () => send('OFF'));

  function makeSwatches(el, onPick) {
    PRESETS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = rgbToHex(c);
      b.title = c.join(', ');
      b.addEventListener('click', () => onPick(rgbToHex(c)));
      el.appendChild(b);
    });
  }
  makeSwatches($('solidSwatches'), setSolid);
  makeSwatches($('brushSwatches'), setBrush);

  // ---------- Scenes ----------
  // A small swatch for a scene: its effect's palette, recoloured by its hue.
  function sceneSwatch(s) {
    const palName = { caustic: 'ocean', rain: 'ocean', fireflies: 'aurora' }[s.mode] || s.mode;
    const pal = MatrixSim.PALETTES[palName] || MatrixSim.PALETTES.ocean;
    const cols = [6, 10, 14].map((i) => MatrixSim.hueRotate(pal[i], s.hue)).map((c) => `rgb(${c.join(',')})`);
    return `linear-gradient(135deg, ${cols.join(', ')})`;
  }

  function renderScenes() {
    const box = $('scenes');
    box.textContent = '';
    sim.scenes.forEach((s, i) => {
      if (!s) return;
      const chip = document.createElement('span');
      chip.className = 'scene' + (sim.currentScene === i ? ' on' : '');
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'apply';
      apply.title = `${s.mode}, speed ${s.speed}, brightness ${Math.round((s.bright / 255) * 100)}%, hue ${s.hue}°`;
      const dot = document.createElement('span');
      dot.className = 'dotsw';
      dot.style.background = sceneSwatch(s);
      apply.append(dot, s.name);
      apply.addEventListener('click', () => { send(`SCENE ${i}`); deriveUiMode(); syncControls(); });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '×';
      del.title = 'Delete ' + s.name;
      del.setAttribute('aria-label', 'Delete scene ' + s.name);
      del.addEventListener('click', () => { send(`SCENE DEL ${i}`); syncControls(); });
      chip.append(apply, del);
      box.appendChild(chip);
    });
  }

  $('sceneForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('sceneName');
    if (!isEffect(sim.mode)) { input.value = ''; input.placeholder = 'Pick an effect first'; return; }
    const slot = sim.scenes.findIndex((s) => !s);
    if (slot < 0) { input.value = ''; input.placeholder = 'All 8 slots used: delete one first'; return; }
    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 17) || `Scene ${slot + 1}`;
    send(`SCENE SAVE ${slot} ${name}`);
    input.value = '';
    input.placeholder = 'Name this look';
    syncControls();
  });

  $('cycle').addEventListener('change', (e) => {
    const r = send('CYCLE ' + e.target.value);
    if (r !== 'OK') { e.target.value = String(sim.cycleMinutes); $('sceneName').placeholder = 'Save a scene first'; }
    deriveUiMode();
    syncControls();
  });

  // ---------- Sleep timer ----------
  document.querySelectorAll('[data-sleep]').forEach((b) => b.addEventListener('click', () => {
    send('SLEEP ' + b.dataset.sleep);
    syncControls();
  }));

  function updateSleep() {
    const left = sim.sleepRemainingS();
    const mm = Math.floor(left / 60), ss = left % 60;
    $('sleepLeft').textContent = left ? `Fading out… off in ${mm}:${String(ss).padStart(2, '0')}` : '';
    document.querySelectorAll('[data-sleep]').forEach((b) => b.classList.toggle('on', b.dataset.sleep === '0' && !left));
  }

  // ---------- Sunrise alarm ----------
  DAY_LABELS.forEach((d, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d;
    b.title = DAY_NAMES[i];
    b.setAttribute('aria-label', DAY_NAMES[i]);
    b.addEventListener('click', () => {
      const days = sim.alarm.days ^ (1 << i);
      if (!days) return;                       // keep at least one day
      sim.alarm.days = days;
      sendAlarm();
    });
    $('alarmDays').appendChild(b);
  });

  function syncAlarm() {
    const a = sim.alarm;
    $('alarmOn').checked = a.on;
    if (document.activeElement !== $('alarmTime')) $('alarmTime').value = `${String(a.hh).padStart(2, '0')}:${String(a.mm).padStart(2, '0')}`;
    $('alarmDur').value = String(a.dur);
    if (document.activeElement !== $('alarmPeak')) $('alarmPeak').value = a.peak;
    $('peakOut').textContent = Math.round(($('alarmPeak').value / 255) * 100) + '%';
    [...$('alarmDays').children].forEach((b, i) => b.setAttribute('aria-pressed', String(!!(a.days & (1 << i)))));
    ['alarmFields', 'alarmDays'].forEach((id) => $(id).classList.toggle('disabled-block', !a.on));
    $('clockNote').textContent = !a.on ? ''
      : paired ? (boardClock ? 'The board keeps time while it has power.' : 'Setting the board clock…')
      : 'The board keeps time while powered. After a power cut, the alarm waits until this app connects once.';
  }

  function sendAlarm() {
    const [hh, mm] = ($('alarmTime').value || '07:00').split(':').map(Number);
    const on = $('alarmOn').checked;
    send(on ? `ALARM ${hh} ${mm} ${$('alarmDur').value} ${sim.alarm.days} ${$('alarmPeak').value}` : 'ALARM OFF');
    syncControls();
  }
  ['alarmOn', 'alarmTime', 'alarmDur', 'alarmPeak'].forEach((id) => $(id).addEventListener('change', sendAlarm));
  $('alarmPeak').addEventListener('input', () => { $('peakOut').textContent = Math.round(($('alarmPeak').value / 255) * 100) + '%'; });
  $('sunriseTry').addEventListener('click', () => { send('SUNRISE 1'); deriveUiMode(); syncControls(); });

  // ---------- Board ----------
  $('flip').addEventListener('change', (e) => { send('FLIP ' + (e.target.checked ? 1 : 0)); syncControls(); });
  $('nativeOnly').hidden = link.kind !== 'native';
  $('otaBtn').addEventListener('click', () => link.requestOta());

  // ---------- Console ----------
  $('cmdForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const line = $('cmdInput').value.trim();
    if (!line) return;
    send(line, { fromConsole: true });
    $('cmdInput').value = '';
    if (['PIXEL', 'ROW', 'COL'].includes(firstWord(line)) && uiMode !== 'paint') uiMode = 'paint';
    deriveUiMode();
    syncControls();
  });

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const step = e.shiftKey ? 32 : 8;
    if (k >= '1' && k <= '8') selectMode(EFFECTS[+k - 1]);
    else if (k === '9') selectMode('solid');
    else if (k === '0') selectMode('off');
    else if (k === 'p' || k === 'P') selectMode('paint');
    else if (k === 'n' || k === 'N') { send('NEXT'); deriveUiMode(); }
    else if (k === ' ') { send('TOGGLE'); deriveUiMode(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') send('BRIGHT ' + Math.max(0, Math.min(255, sim.brightness + (k === 'ArrowUp' ? step : -step))));
    else if (k === '[' || k === ']') send('SPEED ' + Math.max(1, Math.min(10, sim.speed + (k === ']' ? 1 : -1))));
    else return;
    e.preventDefault();
    syncControls();
  });

  // ---------- Report to the Mac menu bar ----------
  const report = throttle(() => link.report({
    connected: paired,
    mode: uiMode,
    brightness: sim.brightness,
    sleep: sim.sleepRemainingS(),
    currentScene: sim.currentScene,
    scenes: sim.scenes.map((s, i) => (s ? { i, name: s.name } : null)).filter(Boolean),
  }), 250);

  // ---------- Preview orientation ----------
  // Maps a display cell to the board's logical (x, y), so the preview can be turned to
  // match how the board physically sits.
  let displayToLogical = [];
  function buildOrientation() {
    displayToLogical = new Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a = prefs.mirror ? W - 1 - x : x, b = y;
      for (let r = 0; r < prefs.rot; r++) [a, b] = [W - 1 - b, a];   // quarter turn clockwise
      displayToLogical[b * W + a] = y * W + x;
    }
  }
  buildOrientation();
  $('rotateBtn').addEventListener('click', () => { prefs.rot = (prefs.rot + 1) % 4; savePrefs(); buildOrientation(); });
  $('mirrorBtn').addEventListener('click', () => { prefs.mirror = !prefs.mirror; savePrefs(); buildOrientation(); });

  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === prefs.view);
    b.addEventListener('click', () => {
      prefs.view = b.dataset.view; savePrefs();
      document.querySelectorAll('[data-view]').forEach((o) => o.classList.toggle('on', o === b));
    });
  });

  // ---------- Rendering ----------
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  const sctx = small.getContext('2d');
  const smallImg = sctx.createImageData(W, H);
  const supportsFilter = 'filter' in ctx;
  let geom = null;
  let lastDrawn = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.max(64, Math.round(Math.min(r.width, r.height) * dpr));
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const pad = size * 0.06;
    const cell = (size - pad * 2) / W;
    geom = { size, pad, cell };
    if (lastDrawn) draw(lastDrawn.frame, lastDrawn.bright);      // resizing clears the canvas; repaint at once
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // On-screen intensity for a given board brightness. Real LEDs look bright even at low
  // settings, so the curve is gentler than linear.
  const displayGain = (b) => (b <= 0 ? 0 : 0.5 + 0.7 * Math.pow(b / 255, 0.5));

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(frame, bright) {
    lastDrawn = { frame, bright };
    const { size, pad, cell } = geom;
    const gain = displayGain(bright);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, size, size);

    // Board
    roundRect(pad * 0.35, pad * 0.35, size - pad * 0.7, size - pad * 0.7, cell * 0.25);
    ctx.fillStyle = '#0d0f14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, size / 400);
    ctx.stroke();

    const colourAt = (d) => {
      const p = displayToLogical[d] * 3;
      return [frame[p] * gain, frame[p + 1] * gain, frame[p + 2] * gain];
    };

    if (prefs.view === 'diffused') {
      for (let d = 0; d < W * H; d++) {
        const c = colourAt(d);
        smallImg.data.set([Math.min(255, c[0] * 1.2), Math.min(255, c[1] * 1.2), Math.min(255, c[2] * 1.2), 255], d * 4);
      }
      sctx.putImageData(smallImg, 0, 0);
      ctx.save();
      roundRect(pad, pad, cell * W, cell * H, cell * 0.2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (supportsFilter) ctx.filter = `blur(${cell * 0.45}px)`;
      ctx.drawImage(small, pad - cell * 0.5, pad - cell * 0.5, cell * (W + 1), cell * (H + 1));
      ctx.restore();
      ctx.filter = 'none';
      return;
    }

    // Glow (additive), then the LED packages on top.
    ctx.globalCompositeOperation = 'lighter';
    for (let d = 0; d < W * H; d++) {
      const c = colourAt(d);
      const peak = Math.max(c[0], c[1], c[2]);
      if (peak < 2) continue;
      const cx = pad + (d % W + 0.5) * cell, cy = pad + (Math.floor(d / W) + 0.5) * cell;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 1.25);
      const rgb = c.map((v) => Math.round(Math.min(255, v))).join(',');
      g.addColorStop(0, `rgba(${rgb},0.75)`);
      g.addColorStop(0.35, `rgba(${rgb},0.25)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - cell * 1.25, cy - cell * 1.25, cell * 2.5, cell * 2.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    const s = cell * 0.56, r = cell * 0.08;
    for (let d = 0; d < W * H; d++) {
      const c = colourAt(d);
      const x = pad + (d % W + 0.5) * cell - s / 2, y = pad + (Math.floor(d / W) + 0.5) * cell - s / 2;
      roundRect(x, y, s, s, r);
      ctx.fillStyle = '#1b1e25';
      ctx.fill();
      // Emissive core: unlit packages stay dark grey, lit ones take the LED colour.
      const k = Math.min(1, Math.max(c[0], c[1], c[2]) / 25);
      if (k > 0) {
        const lift = (v) => Math.round(Math.min(255, v * 1.35 + 22));
        ctx.globalAlpha = k;
        ctx.fillStyle = `rgb(${lift(c[0])},${lift(c[1])},${lift(c[2])})`;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Fixed-step simulation (same 30 ms frame as the firmware) + render every display frame.
  let lastTick = performance.now(), acc = 0, lastSecond = 0;
  function tick(t) {
    acc += Math.min(250, t - lastTick);
    lastTick = t;
    while (acc >= MatrixSim.FRAME_MS) { sim.step(); acc -= MatrixSim.FRAME_MS; }
    if (sim.timers()) { deriveUiMode(); syncControls(); }
    if (t - lastSecond > 1000) { lastSecond = t; updateSleep(); report(); }
    const live = paired && realFrame && t - realFrameAt < REAL_FRAME_STALE_MS;
    draw(live ? realFrame : sim.leds, live ? realBright : sim.outputBrightness());
    requestAnimationFrame(tick);
  }

  // ---------- Painting ----------
  let painting = false;
  const painted = new Set();
  function cellFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const scale = geom.size / r.width;
    const px = (e.clientX - r.left) * scale - geom.pad, py = (e.clientY - r.top) * scale - geom.pad;
    const dx = Math.floor(px / geom.cell), dy = Math.floor(py / geom.cell);
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) return null;
    return displayToLogical[dy * W + dx];
  }
  function paintAt(e) {
    const idx = cellFromEvent(e);
    if (idx == null || painted.has(idx)) return;
    painted.add(idx);
    const c = eraser ? [0, 0, 0] : hexToRgb(prefs.brush);
    send(`PIXEL ${idx % W} ${Math.floor(idx / W)} ${c.join(' ')}`);
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (uiMode !== 'paint') return;
    painting = true;
    painted.clear();
    canvas.setPointerCapture(e.pointerId);
    paintAt(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e); });
  const endPaint = () => { painting = false; };
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);

  // ---------- Start ----------
  sim.startMode('ocean');
  syncControls();
  updateNote();
  link.start();
  requestAnimationFrame(tick);
})();
