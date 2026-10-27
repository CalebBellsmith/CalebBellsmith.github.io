/* Software Library: the live Meeting Cost meter (a browser rebuild of the desktop app). */
(function () {
  const F = window.Funky;
  const $ = id => document.getElementById(id);
  const HOURS_PER_YEAR = 2080;
  const money = n => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clock = s => [s / 3600, (s % 3600) / 60, s % 60].map(v => String(Math.floor(v)).padStart(2, '0')).join(':');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // People and who's "in the room" are kept in this browser only
  let people = [];
  try { people = JSON.parse(F.store.get('meetingPeople') || '[]'); } catch (e) {}
  const save = () => F.store.set('meetingPeople', JSON.stringify(people));

  let running = false, elapsed = 0, cost = 0, mark = 0, timer = null, maxHeads = 0;

  const rate = () => people.filter(p => p.in).reduce((a, p) => a + p.salary / HOURS_PER_YEAR / 3600, 0);

  // Fold time since the last tick into the totals at the current rate, so changing who's
  // in the room only affects cost from that moment on.
  function tick() {
    if (!running) return;
    const now = performance.now();
    const dt = (now - mark) / 1000;
    mark = now;
    elapsed += dt;
    cost += dt * rate();
    draw();
  }

  function draw() {
    $('mcCost').textContent = money(cost);
    $('mcClock').textContent = clock(elapsed);
    $('mcRate').textContent = money(rate() * 3600) + ' / hr';
  }

  function drawRoom() {
    $('mcRoom').innerHTML = people.length
      ? people.map((p, i) => `<button type="button" class="person${p.in ? ' in' : ''}" data-i="${i}" title="${p.in ? 'In the room: click to take out' : 'Click to add to the room'}">
          ${esc(p.name)}<span class="x" data-del="${i}" title="Remove">&times;</span></button>`).join('')
      : '<span class="small muted">Add the people in the meeting below.</span>';
    draw();
  }

  $('mcRoom').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      tick();
      people.splice(+del.dataset.del, 1);
      save(); drawRoom();
      return;
    }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    tick();                                  // settle cost at the old rate first
    const p = people[+b.dataset.i];
    p.in = !p.in;
    maxHeads = Math.max(maxHeads, people.filter(x => x.in).length);
    save(); drawRoom();
  });

  $('mcAdd').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const salary = parseFloat(f.salary.value);
    if (!f.name.value.trim() || !(salary > 0)) return;
    tick();
    people.push({ name: f.name.value.trim(), salary, in: true });
    maxHeads = Math.max(maxHeads, people.filter(x => x.in).length);
    save(); drawRoom(); f.reset(); f.name.focus();
  });

  $('mcStart').addEventListener('click', () => {
    if (running) {
      tick();
      running = false;
      clearInterval(timer);
      $('mcStart').textContent = 'Start';
      const heads = Math.max(maxHeads, 1);
      $('mcSummary').textContent = `Stopped: ${clock(elapsed)}, up to ${maxHeads} ${maxHeads === 1 ? 'person' : 'people'}, ${money(cost)} total, ${money(cost / heads)} per head.`;
    } else {
      running = true;
      mark = performance.now();
      maxHeads = Math.max(maxHeads, people.filter(x => x.in).length);
      timer = setInterval(tick, 100);
      $('mcStart').textContent = 'Stop';
      $('mcSummary').textContent = '';
    }
  });

  $('mcReset').addEventListener('click', () => {
    running = false; clearInterval(timer);
    elapsed = 0; cost = 0; maxHeads = 0;
    $('mcStart').textContent = 'Start';
    $('mcSummary').textContent = '';
    draw();
  });

  drawRoom();
})();
