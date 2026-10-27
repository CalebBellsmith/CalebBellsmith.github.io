/* Links & Analytics tab: saved tracking links, plus GoatCounter charts in owner mode. */
(function () {
  const F = window.Funky;
  const table = document.getElementById('linkTable');
  const box = document.getElementById('analytics');
  const rangeNote = document.getElementById('rangeNote');
  let days = 30;
  let data = null;          // last analytics fetch, so the table can show opens
  let loading = false;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDay = day => new Date(day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // ---------- range ----------
  document.getElementById('range').addEventListener('click', e => {
    const b = e.target.closest('button[data-days]');
    if (!b) return;
    days = +b.dataset.days;
    document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === b));
    load();
  });

  // ---------- link table ----------
  function opensFor(slug) {
    if (!data) return null;
    return data.byRef.get(slug) || { count: 0, last: null };
  }

  function renderTable() {
    const saved = F.links.all();
    const seen = data ? [...data.byRef.keys()].filter(s => !saved.some(l => l.slug === s)) : [];
    if (!saved.length && !seen.length) {
      table.innerHTML = '<tr><td class="empty">No links yet. Generate one above and it will be listed here.</td></tr>';
      return;
    }
    const owner = F.owner.on();
    const rows = saved.map(l => ({ ...l, saved: true })).concat(seen.map(s => ({ name: s, slug: s, saved: false })));
    table.innerHTML = `
      <thead><tr>
        <th>Name</th><th>Link</th><th>Created</th>
        ${owner ? '<th class="num">Opens</th><th>Last</th>' : ''}
        <th></th>
      </tr></thead>
      <tbody>${rows.map(r => {
        const o = opensFor(r.slug);
        return `<tr>
          <td><strong>${esc(r.name)}</strong>${r.saved ? '' : ' <span class="pill">seen in analytics</span>'}</td>
          <td><code class="mini">?ref=${esc(r.slug)}</code></td>
          <td class="muted">${r.created ? fmtDate(r.created) : '&mdash;'}</td>
          ${owner ? `<td class="num ${o && o.count ? 'hot' : 'muted'}">${o ? o.count : '&hellip;'}</td>
                     <td class="muted">${o && o.last ? fmtDay(o.last) : (o ? 'not yet' : '&hellip;')}</td>` : ''}
          <td class="actions">
            <button class="icon-btn" data-copy-slug="${esc(r.slug)}" title="Copy link">Copy</button>
            ${r.saved ? `<button class="icon-btn del" data-del="${esc(r.slug)}" title="Remove from this list">&times;</button>`
                      : `<button class="icon-btn" data-keep="${esc(r.slug)}" title="Save to your list">Save</button>`}
          </td>
        </tr>`;
      }).join('')}</tbody>`;
  }

  table.addEventListener('click', e => {
    const c = e.target.closest('[data-copy-slug]');
    if (c) return F.copy(F.linkFor(c.dataset.copySlug));
    const d = e.target.closest('[data-del]');
    if (d && confirm('Remove this link from your list? (Its analytics stay in GoatCounter.)')) {
      F.links.remove(d.dataset.del); renderTable();
    }
    const k = e.target.closest('[data-keep]');
    if (k) { F.links.add(k.dataset.keep); renderTable(); }
  });
  document.addEventListener('funky:links', renderTable);

  // ---------- data ----------
  async function load() {
    rangeNote.textContent = `Last ${days} days`;
    if (!F.owner.on()) { data = null; renderLocked(); renderTable(); return; }
    if (loading) return;
    loading = true;
    box.innerHTML = '<div class="card soon">Pulling stats from GoatCounter&hellip;</div>';
    const q = { start: F.gcTime(-(days - 1)), end: F.gcTime(1) };
    try {
      const total = await F.gc('/stats/total', q);
      const hits = await F.gc('/stats/hits', { ...q, limit: 100 });
      const campaigns = await F.gc('/stats/campaigns', { ...q, limit: 50 });
      const refs = await F.gc('/stats/toprefs', { ...q, limit: 8 });
      const locations = await F.gc('/stats/locations', { ...q, limit: 8 });
      const systems = await F.gc('/stats/systems', { ...q, limit: 6 });
      data = shape(total, hits, campaigns, refs, locations, systems);
      renderAnalytics();
    } catch (e) {
      box.innerHTML = `<div class="card soon">Couldn't load stats (${esc(e.message)}). ${e.message === 'bad-key' ? 'Your key may have been revoked: re-enter it in Owner mode.' : 'Try again shortly.'}</div>`;
    } finally {
      loading = false;
      renderTable();
    }
  }

  // Tracking opens are counted two ways GoatCounter records them: as a campaign
  // named after ?ref=, and as the visited path "/?ref=...". Take whichever is higher.
  function shape(total, hits, campaigns, refs, locations, systems) {
    const byRef = new Map();
    const bump = (slug, count, last) => {
      const cur = byRef.get(slug) || { count: 0, last: null, daily: {} };
      cur.count = Math.max(cur.count, count);
      if (last && (!cur.last || last > cur.last)) cur.last = last;
      byRef.set(slug, cur);
      return cur;
    };
    (campaigns.stats || []).forEach(c => bump(F.slugify(c.name), c.count, null));
    const pages = [];
    (hits.hits || []).forEach(h => {
      const m = /[?&]ref=([^&#]+)/.exec(h.path || '');
      if (m) {
        const days = (h.stats || []).filter(s => s.daily > 0);
        const cur = bump(decodeURIComponent(m[1]), h.count, days.length ? days[days.length - 1].day : null);
        days.forEach(s => { cur.daily[s.day] = (cur.daily[s.day] || 0) + s.daily; });
      }
      pages.push({ name: prettyPath(h.path), count: h.count });
    });
    const merged = new Map();
    pages.forEach(p => merged.set(p.name, (merged.get(p.name) || 0) + p.count));
    return {
      total: total.total || 0,
      daily: (total.stats || []).map(s => ({ day: s.day, n: s.daily || 0 })),
      byRef,
      opens: [...byRef.values()].reduce((a, r) => a + r.count, 0),
      pages: [...merged].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      refs: (refs.stats || []).map(r => ({ name: r.name || '(direct / unknown)', count: r.count })).sort((a, b) => b.count - a.count),
      locations: (locations.stats || []).map(r => ({ name: r.name || 'Unknown', count: r.count })),
      systems: (systems.stats || []).map(r => ({ name: r.name || 'Unknown', count: r.count })),
    };
  }

  function prettyPath(p) {
    if (!p) return '/';
    if (/^\/\?ref=/.test(p)) return 'Home (tracking link)';
    const proj = /project\.html\?id=([^&]+)/.exec(p);
    if (proj) {
      const hit = (window.PROJECT_TITLES || {})[decodeURIComponent(proj[1])];
      return 'Project: ' + (hit || decodeURIComponent(proj[1]));
    }
    return ({ '/': 'Home', '/projects.html': 'Projects', '/about.html': 'Experience', '/resume.html': 'Resume', '/funky/': 'Funky side' })[p] || p;
  }

  // ---------- rendering ----------
  function renderLocked() {
    box.innerHTML = `
      <div class="card locked-panel">
        <h2 class="card-title"><span class="tag pink">04</span>Live analytics</h2>
        <p>Charts of visitors, which tracking links were opened, where people came from and where they are. Owner only.</p>
        <button class="btn neon" type="button" data-unlock>Unlock owner mode</button>
      </div>`;
    box.querySelector('[data-unlock]').addEventListener('click', () => document.getElementById('ownerBtn').click());
  }

  function renderAnalytics() {
    const d = data;
    const named = d.refs.filter(r => !r.name.startsWith('(')).sort((a, b) => b.count - a.count);
    const topRef = named[0] ? named[0].name : 'Direct';
    const companies = [...d.byRef].map(([slug, r]) => ({ name: nameFor(slug), count: r.count })).sort((a, b) => b.count - a.count);
    box.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="kpi-n">${d.total}</span><span class="kpi-l">visitors</span></div>
        <div class="kpi pink"><span class="kpi-n">${d.opens}</span><span class="kpi-l">tracking-link opens</span></div>
        <div class="kpi yellow"><span class="kpi-n">${companies.filter(c => c.count).length}</span><span class="kpi-l">companies opened</span></div>
        <div class="kpi"><span class="kpi-n kpi-text">${esc(topRef)}</span><span class="kpi-l">top source</span></div>
      </div>
      <div class="grid">
        <article class="card span-3">
          <h2 class="card-title"><span class="tag cyan">05</span>Visitors per day</h2>
          ${lineChart(d.daily)}
        </article>
        <article class="card span-2">
          <h2 class="card-title"><span class="tag pink">06</span>Opens by company</h2>
          ${companies.length ? bars(companies, 'pink') : '<p class="muted">No tracking links opened in this range yet.</p>'}
        </article>
        <article class="card">
          <h2 class="card-title"><span class="tag yellow">07</span>Where they came from</h2>
          ${d.refs.length ? bars(d.refs, 'yellow') : '<p class="muted">No referrers yet.</p>'}
        </article>
        <article class="card">
          <h2 class="card-title"><span class="tag cyan">08</span>Top pages</h2>
          ${d.pages.length ? bars(d.pages, 'cyan') : '<p class="muted">No views yet.</p>'}
        </article>
        <article class="card">
          <h2 class="card-title"><span class="tag pink">09</span>Locations</h2>
          ${d.locations.length ? bars(d.locations, 'pink') : '<p class="muted">No data yet.</p>'}
        </article>
        <article class="card">
          <h2 class="card-title"><span class="tag yellow">10</span>Systems</h2>
          ${d.systems.length ? bars(d.systems, 'yellow') : '<p class="muted">No data yet.</p>'}
        </article>
      </div>
      <p class="fine">GoatCounter is anonymous: it never knows <em>who</em> a visitor is, only which link, page, source and country. Your own visits from this browser aren't counted.</p>`;
  }

  function nameFor(slug) {
    const l = F.links.all().find(x => x.slug === slug);
    return l ? l.name : slug;
  }

  function bars(rows, color) {
    const max = Math.max(1, ...rows.map(r => r.count));
    return `<ul class="bars ${color}">${rows.map(r => `
      <li><span class="bar-name" title="${esc(r.name)}">${esc(r.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(r.count / max * 100).toFixed(1)}%"></span></span>
          <span class="bar-n">${r.count}</span></li>`).join('')}</ul>`;
  }

  function lineChart(pts) {
    if (!pts.length) return '<p class="muted">No visits in this range yet.</p>';
    const W = 900, H = 220, P = { l: 34, r: 12, t: 14, b: 26 };
    const max = Math.max(1, ...pts.map(p => p.n));
    const nice = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
    const x = i => P.l + (pts.length === 1 ? 0.5 : i / (pts.length - 1)) * (W - P.l - P.r);
    const y = n => H - P.b - n / nice * (H - P.t - P.b);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.length - 1).toFixed(1)},${H - P.b}L${x(0).toFixed(1)},${H - P.b}Z`;
    const grid = [0, 0.5, 1].map(f => {
      const yy = y(nice * f);
      return `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" class="g"/><text x="${P.l - 6}" y="${yy + 4}" text-anchor="end">${Math.round(nice * f)}</text>`;
    }).join('');
    const step = Math.max(1, Math.ceil(pts.length / 6));
    const labels = pts.map((p, i) => (i % step === 0 || i === pts.length - 1)
      ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtDay(p.day)}</text>` : '').join('');
    const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.n)}" r="3.2"><title>${fmtDay(p.day)}: ${p.n} visitor${p.n === 1 ? '' : 's'}</title></circle>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitors per day">
      <defs><linearGradient id="fillc" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--cyan)" stop-opacity="0.35"/><stop offset="1" stop-color="var(--cyan)" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#fillc)"/><path d="${line}" class="ln"/>${dots}${labels}
    </svg>`;
  }

  // Project ids -> titles for the Top pages list (the data file sets PROJECTS globally)
  const s = document.createElement('script');
  s.src = '../data/projects.js';
  s.onload = () => {
    try { window.PROJECT_TITLES = Object.fromEntries(PROJECTS.map(p => [p.id, p.title])); } catch (e) {}
  };
  document.head.appendChild(s);

  F.onTab('links', load);
  if (location.hash === '#links') load();     // landed straight on this tab
  F.ownerChange.push(() => { if (location.hash === '#links') load(); else { data = null; renderTable(); } });
  renderTable();
})();
