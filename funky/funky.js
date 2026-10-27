/* Funky side: tab routing, theme, owner mode, remember-me, tracking links.
   Shared helpers live on window.Funky so each tab's script can use them. */
(function () {
  const SITE = 'https://calebbellsmith.github.io/';
  const GC = 'https://calebbellsmith.goatcounter.com/api/v0';

  // ---------- storage (never throws: private windows can block it) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // Remember the funky side. The main site only acts on this in owner mode.
  store.set('funky_last', '1');
  document.getElementById('backBtn').addEventListener('click', () => store.set('funky_last', '0'));

  // ---------- toast ----------
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
    catch (e) { toast('Copy failed: select and copy manually'); }
  }

  // ---------- tabs ----------
  const TABS = ['dashboard', 'links', 'led', 'starksight', 'library'];
  const sidebar = document.getElementById('sidebar');
  const listeners = {};

  function route() {
    const id = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
    document.querySelectorAll('.panel-page').forEach(p => p.classList.toggle('active', p.dataset.page === id));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    sidebar.classList.remove('open');
    window.scrollTo(0, 0);
    (listeners[id] || []).forEach(fn => fn());
  }
  function onTab(id, fn) { (listeners[id] = listeners[id] || []).push(fn); }
  window.addEventListener('hashchange', route);

  document.getElementById('menuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));

  // ---------- theme ----------
  const themeLabel = document.getElementById('themeLabel');
  function syncTheme() {
    themeLabel.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark mode' : 'Light mode';
  }
  document.getElementById('themeBtn').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    store.set('funky_theme', light ? 'light' : 'dark');
    syncTheme();
  });
  syncTheme();

  // ---------- owner mode ----------
  const owner = {
    key() { return store.get('gc_key'); },
    on() { return !!store.get('gc_key'); },
  };

  // GoatCounter allows 4 requests a second, so calls go out one at a time, spaced
  let gcQueue = Promise.resolve();
  function gc(path, params) {
    const run = gcQueue.then(() => gcFetch(path, params));
    gcQueue = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, 280)));
    return run;
  }
  async function gcFetch(path, params) {
    const key = owner.key();
    if (!key) throw new Error('locked');
    const url = new URL(GC + path);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
      else if (v !== undefined) url.searchParams.set(k, v);
    });
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' } });
    if (res.status === 401) throw new Error('bad-key');
    if (res.status === 403) throw new Error('no-permission');
    if (!res.ok) throw new Error('http-' + res.status);
    return res.json();
  }

  const dlg = document.getElementById('ownerDialog');
  const ownerBtn = document.getElementById('ownerBtn');
  const ownerLabel = document.getElementById('ownerLabel');
  const ownerErr = document.getElementById('ownerErr');
  const ownerChange = [];

  function syncOwner(notify = true) {
    const on = owner.on();
    ownerBtn.classList.toggle('owner-on', on);
    ownerLabel.textContent = on ? 'Owner mode: on' : 'Owner mode';
    document.getElementById('ownerLocked').hidden = on;
    document.getElementById('ownerUnlocked').hidden = !on;
    if (notify) ownerChange.forEach(fn => fn(on));
  }

  ownerBtn.addEventListener('click', () => {
    ownerErr.hidden = true;
    document.getElementById('ownerKey').value = '';
    dlg.showModal();
  });

  document.getElementById('ownerSave').addEventListener('click', async () => {
    const key = document.getElementById('ownerKey').value.trim();
    if (!key) return;
    ownerErr.hidden = true;
    try {
      const res = await fetch(GC + '/stats/total?start=' + gcTime(-1), { headers: { Authorization: 'Bearer ' + key } });
      if (res.status === 401) throw new Error("That key wasn't accepted.");
      if (res.status === 403) throw new Error('That key needs the "Read statistics" permission.');
      if (!res.ok) throw new Error('GoatCounter replied ' + res.status + '. Try again in a moment.');
    } catch (e) {
      ownerErr.textContent = e.message.startsWith('Failed') ? "Couldn't reach GoatCounter." : e.message;
      ownerErr.hidden = false;
      return;
    }
    store.set('gc_key', key);
    store.set('skipgc', 't');          // GoatCounter's own switch: don't count this browser
    dlg.close();
    syncOwner();
    toast('Owner mode on');
  });

  document.getElementById('ownerLock').addEventListener('click', () => {
    store.del('gc_key');
    store.del('skipgc');
    dlg.close();
    syncOwner();
    toast('Owner mode off');
  });

  // ---------- tracking links ----------
  function slugify(name) {
    return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  }
  function linkFor(slug) { return SITE + '?ref=' + encodeURIComponent(slug); }

  const links = {
    all() {
      try { return JSON.parse(store.get('funky_links') || '[]'); } catch (e) { return []; }
    },
    save(list) { store.set('funky_links', JSON.stringify(list)); },
    add(name) {
      const slug = slugify(name);
      if (!slug) return null;
      const list = links.all();
      let item = list.find(l => l.slug === slug);
      if (!item) {
        item = { name: name.trim(), slug, created: new Date().toISOString() };
        list.unshift(item);
        links.save(list);
      }
      return item;
    },
    remove(slug) { links.save(links.all().filter(l => l.slug !== slug)); },
  };

  // Any form with data-gen becomes a generator
  document.querySelectorAll('[data-gen]').forEach(form => {
    const card = form.closest('.card');
    const out = card.querySelector('[data-gen-out]');
    const code = card.querySelector('[data-gen-link]');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const item = links.add(form.name.value);
      if (!item) { toast('Add a name with letters or numbers'); return; }
      code.textContent = linkFor(item.slug);
      out.hidden = false;
      form.reset();
      copy(code.textContent);
      document.dispatchEvent(new CustomEvent('funky:links'));
    });
    card.querySelector('[data-copy]').addEventListener('click', () => copy(code.textContent));
  });

  // ---------- dates ----------
  function isoDay(offsetDays) {
    const d = new Date(); d.setDate(d.getDate() + (offsetDays || 0));
    return d.toISOString().slice(0, 10);
  }
  // API time bounds must sit on the hour
  function gcTime(offsetDays) { return isoDay(offsetDays) + 'T00:00:00Z'; }

  // ---------- dashboard glance ----------
  const glance = document.getElementById('glance');
  async function renderGlance() {
    if (!owner.on()) {
      glance.innerHTML = `
        <div class="locked">
          <p>Visitor stats are owner only.</p>
          <button class="btn ghost" type="button" data-unlock>Unlock</button>
        </div>`;
      glance.querySelector('[data-unlock]').addEventListener('click', () => ownerBtn.click());
      return;
    }
    glance.innerHTML = '<p class="locked">Loading&hellip;</p>';
    try {
      const [week, today] = await Promise.all([
        gc('/stats/total', { start: gcTime(-6), end: gcTime(1) }),
        gc('/stats/total', { start: gcTime(0), end: gcTime(1) }),
      ]);
      glance.innerHTML = `
        <div class="glance-row">
          <div><div class="glance-num">${today.total}</div><div class="glance-label">visitors today</div></div>
          <div><div class="glance-num">${week.total}</div><div class="glance-label">last 7 days</div></div>
        </div>
        <a class="tile-go" href="#links">Full analytics &rarr;</a>`;
    } catch (e) {
      glance.innerHTML = `<p class="locked">Couldn't load stats (${e.message}).</p>`;
    }
  }
  ownerChange.push(renderGlance);
  onTab('dashboard', renderGlance);

  window.Funky = { store, toast, copy, onTab, owner, gc, links, linkFor, slugify, isoDay, gcTime, ownerChange, SITE };

  syncOwner(false);
  route();
})();
