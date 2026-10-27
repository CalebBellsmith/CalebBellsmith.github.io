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
})();
