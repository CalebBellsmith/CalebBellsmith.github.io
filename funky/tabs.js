/* LED Matrix and Stark Sight tabs. */
(function () {
  const F = window.Funky;
  const $ = id => document.getElementById(id);

  // ---------- LED Matrix ----------
  function pairing() {
    try { return JSON.parse(F.store.get('ledPairing') || 'null'); } catch (e) { return null; }
  }
  function syncLedPair() {
    const p = pairing();
    $('ledPairState').innerHTML = p
      ? '<span class="status-dot on"></span>This browser is paired with your board.'
      : (navigator.bluetooth
        ? '<span class="status-dot warn"></span>Not paired: the panel runs as a live simulation.'
        : '<span class="status-dot"></span>This browser has no Web Bluetooth (use Chrome, Edge or Arc). The panel runs as a simulation.');
    $('ledPairForget').hidden = !p;
  }
  $('ledPairSave').addEventListener('click', () => {
    let p;
    try { p = JSON.parse($('ledPairInput').value); } catch (e) { return F.toast("That isn't valid JSON"); }
    if (!p || !/^[0-9a-f-]{36}$/i.test(p.serviceUUID || '') || !/^[0-9a-f]{64}$/i.test(p.key || '')) {
      return F.toast('Expected {"serviceUUID": ..., "key": 64 hex characters}');
    }
    F.store.set('ledPairing', JSON.stringify({ serviceUUID: p.serviceUUID.toLowerCase(), key: p.key.toLowerCase() }));
    $('ledPairInput').value = '';
    syncLedPair();
    reloadLed();
    F.toast('Paired. Launch the panel and click "Connect to board".');
  });
  $('ledPairForget').addEventListener('click', () => {
    if (!confirm('Forget the pairing key on this browser?')) return;
    F.store.del('ledPairing');
    syncLedPair();
    reloadLed();
  });

  const ledEmbed = $('ledEmbed');
  function launchLed() {
    if (!ledEmbed.firstChild) {
      ledEmbed.innerHTML = '<iframe src="led/" title="LED Matrix control panel" allow="bluetooth; microphone"></iframe>';
    }
    ledEmbed.hidden = false;
    $('ledLaunch').textContent = 'Relaunch';
    ledEmbed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function reloadLed() { if (ledEmbed.firstChild) { ledEmbed.innerHTML = ''; launchLed(); } }
  $('ledLaunch').addEventListener('click', () => { ledEmbed.innerHTML = ''; launchLed(); });
  syncLedPair();

  // ---------- Stark Sight ----------
  // The app serves its own page at 127.0.0.1:8723 and only answers that page, so the site
  // just checks it's up and embeds it; the Launch button opens a starksight:// link that
  // the app's small launcher (tools/install-web-launch.sh) handles.
  const SS = 'http://127.0.0.1:8723/';
  const ssEmbed = $('ssEmbed');
  let ssUp = null, ssPoll = null;

  async function ssAlive() {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      await fetch(SS + 'static/style.css?probe=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      return true;
    } catch (e) { return false; }
  }

  function ssShow(up) {
    if (up === ssUp) return;
    ssUp = up;
    $('ssStatus').innerHTML = up
      ? '<span class="status-dot on"></span>Running on this Mac.'
      : '<span class="status-dot"></span>Not running.';
    $('ssLaunch').textContent = up ? 'Running' : 'Launch';
    $('ssLaunch').disabled = up;
    $('ssOpen').hidden = !up;
    if (up && !ssEmbed.firstChild) {
      ssEmbed.innerHTML = '<iframe src="' + SS + '" title="Stark Sight live view" ' +
        'allow="local-network-access; loopback-network; local-network; camera; microphone"></iframe>';
    }
    if (!up) ssEmbed.innerHTML = '';
    ssEmbed.hidden = !up;
  }

  async function ssCheck() { ssShow(await ssAlive()); }

  function ssWatch(on) {
    clearInterval(ssPoll);
    if (on) { ssCheck(); ssPoll = setInterval(ssCheck, 4000); }
  }

  $('ssLaunch').addEventListener('click', () => {
    location.href = 'starksight://launch';
    $('ssStatus').innerHTML = '<span class="status-dot warn"></span>Starting (camera warms up in a few seconds)&hellip;';
    ssUp = null;
    clearInterval(ssPoll);
    let tries = 0;
    ssPoll = setInterval(async () => {
      const up = await ssAlive();
      if (up || ++tries > 30) { ssShow(up); ssWatch(location.hash === '#starksight'); }
    }, 1500);
  });

  // Only poll while the tab is open
  F.onTab('starksight', () => ssWatch(true));
  window.addEventListener('hashchange', () => { if (location.hash !== '#starksight') ssWatch(false); });
  if (location.hash === '#starksight') ssWatch(true);
})();
