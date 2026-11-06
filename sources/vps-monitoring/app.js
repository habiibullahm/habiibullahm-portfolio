(() => {
  'use strict';
  const POLL_MS = 5000;
  const WINDOW_S = 3600;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtTime = (ts) => timeFmt.format(new Date(ts * 1000)) + ' WIB';
  const fmtB = (n) => {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n.toFixed(0) : n.toFixed(n >= 100 ? 0 : 1)) + ' ' + u[i];
  };
  const fmtGiB = (n) => (n / 1073741824).toFixed(1);
  const fmtDur = (s) => {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };
  const pct = (a, b) => (b ? (100 * a) / b : 0);

  let hist = [];
  let paused = false;
  let timer = null;
  let lastOk = 0;
  let failures = 0;

  function banner(kind, text) {
    const b = $('banner');
    b.className = 'banner ' + kind;
    $('bannerText').textContent = text;
  }

  function setBar(id, level, value) {
    const bar = $(id);
    bar.className = 'progress ' + level;
    bar.firstElementChild.style.width = Math.min(100, Math.max(0, value)).toFixed(0) + '%';
  }

  function svgChart(host, series, opts) {
    host.replaceChildren();
    if (hist.length < 2) {
      host.appendChild(el('div', 'none', 'Collecting samples'));
      return;
    }
    const now = hist[hist.length - 1].t;
    const span = Math.max(60, Math.min(WINDOW_S, now - hist[0].t));
    const t0 = now - span;
    let max = opts.fixedMax || 0;
    if (!opts.fixedMax) {
      for (const p of hist) for (const s of series) max = Math.max(max, s.get(p));
      max = Math.max(max * 1.15, opts.minMax || 1);
    }
    const W = 600, H = 100;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
    for (const s of series) {
      const pts = hist.filter((p) => p.t >= t0).map((p) => `${(((p.t - t0) / span) * W).toFixed(1)},${(H - (s.get(p) / max) * H).toFixed(1)}`);
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('points', pts.join(' '));
      line.setAttribute('class', s.cls);
      svg.appendChild(line);
    }
    host.appendChild(svg);
    host.appendChild(el('span', 'axis', opts.fmt(max)));
    host.appendChild(el('span', 'axis b', '0'));
    host.appendChild(el('span', 'axis l', span >= 3600 ? '1 h ago' : Math.round(span / 60) + ' min ago'));  }

  function renderTable(body, rows, cells) {
    body.replaceChildren();
    if (!rows.length) {
      const tr = el('tr');
      const td = el('td', 'note', 'Nothing to show');
      td.colSpan = 5;
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    for (const r of rows) {
      const tr = el('tr');
      for (const c of cells(r)) {
        const td = el('td', c.cls || '');
        if (c.node) td.appendChild(c.node); else td.textContent = c.text;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  function status(level, label) {
    const s = el('span', 'status ' + level);
    s.appendChild(el('span', 'dot'));
    s.appendChild(document.createTextNode(label));
    return s;
  }

  function render(s) {
    const p = s.point, lv = s.levels;
    const worst = s.alerts.some((a) => a.sev === 'crit') ? 'crit' : s.alerts.length ? 'warn' : 'ok';
    $('bHost').className = 'badge ' + worst;
    $('bHostText').textContent = worst === 'ok' ? 'Host online, no alerts' : `Host online, ${s.alerts.length} alert${s.alerts.length > 1 ? 's' : ''}`;
    $('bTime').textContent = fmtTime(s.now);

    $('cpuVal').textContent = lv.cpu_avg.toFixed(0) + '%';
    $('cpuHint').textContent = 'avg 1 min';
    $('cpuSub').textContent = `Load ${p.load.join(' / ')} on ${s.cores} cores`;
    setBar('cpuBar', lv.cpu, lv.cpu_avg);

    const ramUsed = p.ram_total - p.ram_avail;
    $('ramVal').replaceChildren(document.createTextNode(fmtGiB(ramUsed)), Object.assign(el('small', '', ` / ${fmtGiB(p.ram_total)} GiB`)));
    $('ramSub').textContent = `Available ${fmtGiB(p.ram_avail)} GiB, used ${pct(ramUsed, p.ram_total).toFixed(0)}%`;
    setBar('ramBar', lv.ram, pct(ramUsed, p.ram_total));

    $('diskVal').replaceChildren(document.createTextNode(fmtGiB(p.disk_used)), el('small', '', ` / ${fmtGiB(p.disk_total)} GiB`));
    $('diskSub').textContent = `Free ${fmtGiB(p.disk_total - p.disk_used)} GiB, used ${pct(p.disk_used, p.disk_total).toFixed(0)}%`;
    setBar('diskBar', lv.disk, pct(p.disk_used, p.disk_total));

    $('swapVal').replaceChildren(document.createTextNode(fmtGiB(p.swap_used)), el('small', '', ` / ${fmtGiB(p.swap_total)} GiB`));
    $('swapSub').textContent = `Used ${pct(p.swap_used, p.swap_total).toFixed(0)}%, warn at 40%, critical at 80%`;
    setBar('swapBar', lv.swap, pct(p.swap_used, p.swap_total));

    const al = $('alerts');
    al.replaceChildren();
    if (!s.alerts.length) {
      al.appendChild(el('div', 'empty', 'No active alerts.'));
    } else {
      for (const a of s.alerts) {
        const row = el('div', 'alert');
        row.appendChild(el('span', 'sev ' + a.sev, a.sev === 'crit' ? 'CRIT' : 'WARN'));
        const body = el('div', 'body');
        body.appendChild(el('div', 'title', a.title));
        if (a.detail) body.appendChild(el('div', 'detail', a.detail));
        row.appendChild(body);
        row.appendChild(el('span', 'time mono', 'since ' + fmtTime(a.since)));
        al.appendChild(row);
      }
    }

    renderTable($('svcBody'), s.services, (r) => [
      { text: r.name },
      { node: status(r.status === 'down' ? (r.alert ? 'warn' : 'crit') : r.status === 'ok' ? 'ok' : 'off', r.label || (r.status === 'down' ? 'down' : r.status === 'ok' ? 'running' : 'not running')) },
      { text: r.detail, cls: 'mono note' },
      { text: r.extra || (r.optional && r.status === 'off' ? 'optional' : ''), cls: 'note' },
    ]);
    renderTable($('plBody'), s.platforms, (r) => {
      const st = r.state.toLowerCase();
      const lvl = st === 'connected' && !r.attention ? 'ok' :(['disabled', 'none'].includes(st) || st.startsWith('off')) ? 'off' : r.attention ? 'crit' : 'warn';
      return [{ text: r.profile }, { text: r.platform }, { node: status(lvl, r.state) }];
    });
    renderTable($('cronBody'), s.cron, (r) => [
      { text: r.profile }, { text: String(r.total ?? 'n/a'), cls: 'num' }, { text: String(r.enabled ?? 'n/a'), cls: 'num' },
      { text: String(r.paused ?? 'n/a'), cls: 'num' }, { text: String(r.failing ?? 'n/a'), cls: 'num' },
    ]);
    renderTable($('procBody'), s.procs, (r) => [{ text: r.name }, { text: String(r.count), cls: 'num' }, { text: fmtB(r.rss), cls: 'num mono' }]);

    const rt = s.router || { available: false };
    if (!rt.available) {
      $('routerVal').textContent = 'no probe yet';
      $('routerHint').textContent = '';
      $('routerSub').textContent = 'Run the probe script to populate model health.';
      renderTable($('routerBody'), [], () => []);
      renderTable($('rpBody'), [], () => []);
      renderTable($('rcBody'), [], () => []);
    } else {
      const upd = rt.updated_at ? fmtTime(rt.updated_at) : 'unknown';
      $('routerVal').textContent = `${rt.ok}/${rt.total} models up`;
      $('routerHint').textContent = rt.failed ? `${rt.failed} failing` : 'all healthy';
      const hour = (rt.usage && rt.usage.hour) || {};
      const hourReq = Object.values(hour).reduce((a, v) => a + (v.requests || 0), 0);
      const dayTotal = (rt.usage && rt.usage.day_total) || { requests: 0, cost: 0 };
      $('routerSub').textContent = `Probed ${upd}. Requests last hour ${hourReq}, last 24 h ${dayTotal.requests} (cost ${Number(dayTotal.cost).toFixed(3)}).`;
      renderTable($('routerBody'), rt.models, (r) => [
        { text: r.model, cls: 'mono' },
        { node: status(r.ok ? 'ok' : 'crit', r.ok ? 'up' : 'down') },
        { text: r.latency_ms != null ? r.latency_ms + ' ms' : '', cls: 'num mono' },
        { text: r.error ? r.error.slice(0, 90) : '', cls: 'note' },
      ]);
      const failedByModel = {};
      for (const m of rt.models) if (!m.ok) failedByModel[m.model] = true;
      renderTable($('rpBody'), (rt.providers || []).filter((p) => p.active), (r) => {
        const st = r.status === 'active' ? 'ok' : r.status === 'unavailable' ? 'crit' : 'warn';
        return [
          { text: r.provider },
          { node: status(st, r.status || 'unknown') },
          { text: r.proxy ? 'yes' : 'no', cls: 'note' },
          { text: r.last_error ? r.last_error.slice(0, 70) : '', cls: 'note' },
        ];
      });
      renderTable($('rcBody'), rt.combos || [], (r) => {
        const failing = (r.models || []).filter((m) => failedByModel[m]).length;
        return [
          { text: r.name },
          { text: String(r.count), cls: 'num' },
          { text: String(failing), cls: 'num' },
        ];
      });
    }

    const ev = $('events');
    ev.replaceChildren();
    if (!s.events.length) ev.appendChild(el('div', 'empty', 'No events since the monitor started.'));
    for (const e of s.events.slice(0, 8)) {
      const row = el('div', 'alert');
      row.appendChild(el('span', 'sev ' + (e.event === 'resolved' ? 'ok' : e.sev), e.event === 'resolved' ? 'OK' : e.sev === 'crit' ? 'CRIT' : 'WARN'));
      const body = el('div', 'body');
      body.appendChild(el('div', 'title', (e.event === 'resolved' ? 'Resolved: ' : 'Raised: ') + e.title));
      row.appendChild(body);
      row.appendChild(el('span', 'time mono', fmtTime(e.ts)));
      ev.appendChild(row);
    }

    $('netNow').textContent = `down ${fmtB(p.rx)}/s, up ${fmtB(p.tx)}/s`;
    $('ioNow').textContent = `read ${fmtB(p.dr)}/s, write ${fmtB(p.dw)}/s`;
    $('footInfo').textContent = `${s.host}, host up ${fmtDur(s.uptime_s)}, monitor up ${fmtDur(s.monitor_up_s)}, history in memory`;

    const last = hist[hist.length - 1];
    if (!last || p.t > last.t) hist.push(p);
    if (hist.length > 720) hist.shift();
    svgChart($('chNet'), [{ get: (x) => x.rx, cls: 'l1' }, { get: (x) => x.tx, cls: 'l2' }], { label: 'Network throughput, last hour', fmt: (v) => fmtB(v) + '/s', minMax: 1024 });
    svgChart($('chIo'), [{ get: (x) => x.dr, cls: 'l1' }, { get: (x) => x.dw, cls: 'l2' }], { label: 'Disk throughput, last hour', fmt: (v) => fmtB(v) + '/s', minMax: 1024 });
    svgChart($('chRes'), [
      { get: (x) => x.cpu, cls: 'l1' },
      { get: (x) => pct(x.ram_total - x.ram_avail, x.ram_total), cls: 'l2' },
      { get: (x) => pct(x.swap_used, x.swap_total), cls: 'l3' },
    ], { label: 'CPU, RAM and swap usage, last hour', fmt: (v) => v.toFixed(0) + '%', fixedMax: 100 });
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function tick() {
    try {
      const s = await getJSON('/api/snapshot');
      if (!s.ready) { banner('loading', 'Monitor is warming up.'); return; }
      render(s);
      lastOk = Date.now();
      failures = 0;
      banner(paused ? 'paused' : 'live', paused ? 'Paused. Showing the last update.' : `Live, refreshing every ${POLL_MS / 1000} s.`);
    } catch (e) {
      failures++;
      const age = lastOk ? Math.round((Date.now() - lastOk) / 1000) : null;
      banner('error', age == null
        ? 'Cannot reach the monitor. Check the SSH tunnel and the vps-monitor service.'
        : `Cannot reach the monitor, showing data from ${age} s ago. Retrying.`);
    }
  }

  function schedule() {
    clearInterval(timer);
    if (!paused && !document.hidden) timer = setInterval(tick, POLL_MS);
  }

  $('btnPause').addEventListener('click', () => {
    paused = !paused;
    $('btnPause').textContent = paused ? 'Resume' : 'Pause';
    schedule();
    if (!paused) tick(); else banner('paused', 'Paused. Showing the last update.');
  });
  document.addEventListener('visibilitychange', () => { schedule(); if (!document.hidden && !paused) tick(); });

  (async () => {
    try { hist = await getJSON('/api/history'); } catch (e) { hist = []; }
    await tick();
    schedule();
  })();
})();
