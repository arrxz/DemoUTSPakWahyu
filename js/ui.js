// Satu-satunya modul yang menyentuh DOM: render, event, panel "Isi kepala robot".
import { PRESETS } from './config.js';
import { RULES, ACTION_LABEL, returnThreshold } from './agent.js';
import { Simulation } from './simulation.js';
import { mulberry32 } from './world.js';
import { batteryChartSVG } from './chart.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const sim = new Simulation();
const cfg = sim.cfg;
const station = cfg.stationRoom;

const el = {
  run: $('btn-run'), step: $('btn-step'), reset: $('btn-reset'),
  speed: $('speed'), speedOut: $('speed-out'), runState: $('run-state'),
  plan: $('denah'), rooms: $('rooms'), robot: $('robot'), trail: $('trail'),
  preset: $('preset'), seed: $('seed'), seedMsg: $('seed-msg'), dust: $('dust'), dustOut: $('dust-out'),
  battery: document.querySelector('.battery'), batteryValue: $('battery-value'), batteryFill: $('battery-fill'),
  returnMark: $('return-mark'), returnLabel: $('return-label'), formula: $('battery-formula'), status: $('battery-status'),
  percept: $('percept'), rules: $('rules'), actionName: $('action-name'), actionReason: $('action-reason'),
  chart: $('chart'), logFilter: $('log-filter'), logBody: $('log-body'), logEmpty: $('log-empty'),
  exportBtn: $('btn-export'), metrics: $('metrics'), announce: $('announce'),
};

// ---------- Ikon SVG buatan sendiri ----------
const ICON_PLUG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v5M16 2v5M5 7h14v4a7 7 0 0 1-14 0zM12 18v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 23 21H1z" fill="#B93A2E"/><path d="M12 9v5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.5" fill="#fff"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" fill="#B93A2E"/><path d="M7 7l10 10M17 7 7 17" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

// Memulai ulang animasi CSS satu kali (micro animation reaktif).
function restartAnim(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

// ---------- Denah ----------
const DOT_COUNT = [0, 6, 14, 26]; // tingkat debu = kerapatan partikel, bukan warna
const roomEls = {};

function dustDots(room) {
  const rng = mulberry32(room * 7919);
  return Array.from({ length: DOT_COUNT[cfg.maxDust] }, () => ({
    x: 8 + rng() * 84, y: 22 + rng() * 40, r: 2 + rng() * 2.2,
  }));
}

const roomName = (r) => cfg.roomNames?.[r] ?? `Ruang ${r}`;

// Perabot tampak atas sebagai garis denah. Koordinat dalam persen supaya ikut ukuran ruangan.
const DECOR = {
  1: { floor: 'wood', svg: `
    <rect x="8%" y="30%" width="58%" height="12%" rx="3"/>
    <rect x="8%" y="30%" width="6%" height="12%" rx="2"/><rect x="60%" y="30%" width="6%" height="12%" rx="2"/>
    <rect x="22%" y="47%" width="30%" height="8%" rx="2"/>
    <circle cx="86%" cy="34%" r="10"/><circle cx="86%" cy="34%" r="4"/>`, extra: '<span class="front-door"><span class="gap"></span>'
      + '<svg class="door-swing" viewBox="0 0 52 52"><path class="leaf" d="M0 0H52"/><path class="swing" d="M52 0A52 52 0 0 1 0 52"/></svg></span>'
      + '<span class="window"></span>' },
  2: { floor: 'tile', svg: `
    <rect x="0" y="25%" width="100%" height="11%"/>
    <rect x="14%" y="27%" width="20%" height="7%" rx="3"/>
    <circle cx="62%" cy="28.5%" r="3.5"/><circle cx="74%" cy="28.5%" r="3.5"/><circle cx="62%" cy="32.5%" r="3.5"/><circle cx="74%" cy="32.5%" r="3.5"/>
    <rect x="34%" y="64%" width="14%" height="5%" rx="2"/><rect x="52%" y="64%" width="14%" height="5%" rx="2"/>
    <rect x="34%" y="85%" width="14%" height="5%" rx="2"/><rect x="52%" y="85%" width="14%" height="5%" rx="2"/>
    <rect x="28%" y="70%" width="44%" height="14%" rx="3"/>`, extra: '<span class="window"></span>' },
  3: { floor: 'carpet', svg: `
    <rect class="rug" x="10%" y="54%" width="76%" height="42%" rx="2"/>
    <rect x="58%" y="25%" width="36%" height="10%"/><line class="line" x1="76%" y1="25%" x2="76%" y2="35%"/>
    <rect x="18%" y="60%" width="56%" height="34%" rx="3"/>
    <rect x="22%" y="62.5%" width="22%" height="7%" rx="3"/><rect x="48%" y="62.5%" width="22%" height="7%" rx="3"/>
    <line class="line" x1="18%" y1="74%" x2="74%" y2="74%"/>
    <rect x="78%" y="60%" width="12%" height="9%" rx="2"/>`, extra: '<span class="window"></span><span class="window side"></span>' },
};

const DOOR_SWING = '<svg class="door-swing" viewBox="0 0 52 52" aria-hidden="true"><path class="leaf" d="M52 0H0"/><path class="swing" d="M0 0A52 52 0 0 0 52 52"/></svg>';

function buildRooms() {
  const parts = [];
  cfg.rooms.forEach((r, i) => {
    if (i > 0) parts.push(`<div class="wall" aria-hidden="true"><span class="gap"></span>${DOOR_SWING}</div>`);
    const d = DECOR[r] ?? { floor: 'tile', svg: '', extra: '' };
    const dots = dustDots(r).map((p, k) =>
      `<circle data-k="${k}" cx="${p.x.toFixed(1)}%" cy="${p.y.toFixed(1)}%" r="${p.r.toFixed(1)}"/>`).join('');
    parts.push(`<button type="button" class="room" data-room="${r}" data-floor="${d.floor}" aria-describedby="robot-help">
      <svg class="furniture" aria-hidden="true">${d.svg}</svg>
      ${r === station ? `<div class="station" aria-hidden="true">${ICON_PLUG}<span>stasiun</span></div>` : ''}
      <svg class="dust-layer" aria-hidden="true">${dots}</svg>
      <span class="room-name">${roomName(r)}</span>
      <span class="room-dust"></span>
      <span aria-hidden="true">${d.extra}</span>
    </button>`);
  });
  el.rooms.innerHTML = parts.join('');
  for (const b of el.rooms.querySelectorAll('.room')) {
    const r = Number(b.dataset.room);
    roomEls[r] = { btn: b, dots: [...b.querySelectorAll('.dust-layer circle')], label: b.querySelector('.room-dust') };
    b.addEventListener('animationend', () => b.classList.remove('tapped'));
    b.addEventListener('click', (e) => changeDust(r, e.shiftKey ? -1 : 1));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); changeDust(r, -1); });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); changeDust(r, -1); }
    });
  }
}

function changeDust(room, delta) {
  restartAnim(roomEls[room].btn, 'tapped');
  sim.setDust(room, sim.world.rooms[room].dust + delta);
}

// ---------- Gerak robot ala robot vakum ----------
// Robot tidak melompat: ia berputar di tempat menghadap titik berikut, lalu maju.
// Antar ruangan lewat celah pintu. Semua ini hanya tampilan; posisi logis tetap milik simulasi.

// Kotak ruangan dalam px relatif denah (tempat robot diposisikan).
function roomBox(room) {
  const b = roomEls[room].btn;
  const left = el.rooms.offsetLeft + el.rooms.clientLeft + b.offsetLeft;
  const top = el.rooms.offsetTop + el.rooms.clientTop + b.offsetTop;
  return { left, top, w: b.offsetWidth, h: b.offsetHeight, cx: left + b.offsetWidth / 2, doorY: top + b.offsetHeight * 0.5 };
}

// Titik istirahat: di dok kuning untuk ruangan stasiun, di tengah untuk ruangan lain.
function restSpot(room) {
  const b = roomBox(room);
  return { x: b.cx, y: b.top + b.h * (room === station ? 0.84 : 0.55) };
}

let pose = null; // { x, y, a }: pusat robot dan arah hadap (derajat, 0 = atas)
let poseRoom = null; // ruangan yang sudah tergambar
let anim = null;
let animatedTick = null;
let dropped = false;
const TURN_PX = 60; // waktu putar 180° setara waktu maju 60 px
const DOOR_PAD = 34; // jarak titik antre sebelum dan sesudah celah pintu

const norm = (d) => ((d % 360) + 540) % 360 - 180;
const toCss = (p) => {
  const s = el.robot.offsetWidth / 2;
  return `translate(${(p.x - s).toFixed(1)}px, ${(p.y - s).toFixed(1)}px) rotate(${p.a.toFixed(1)}deg)`;
};

// Pose yang sedang terlihat, termasuk di tengah animasi.
function visualPose() {
  if (!pose) return null;
  const m = new DOMMatrix(getComputedStyle(el.robot).transform);
  const s = el.robot.offsetWidth / 2;
  const a = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return { x: m.m41 + s, y: m.m42 + s, a: pose.a + norm(a - pose.a) };
}

function snapRobot(room = sim.world.robot.room) {
  anim?.cancel();
  anim = null;
  pose = { ...restSpot(room), a: pose?.a ?? 0 };
  poseRoom = room;
  el.robot.style.transform = toCss(pose);
}

// Jalankan jalur titik demi titik. finalA: arah akhir opsional (mis. menghadap atas saat parkir di dok).
function drive(points, finalA) {
  const start = visualPose() ?? pose;
  anim?.cancel();
  const frames = [start];
  const cost = [0];
  let cur = start;
  const push = (p, c) => { frames.push(p); cost.push(cost[cost.length - 1] + c); cur = p; };
  const turnTo = (a) => {
    const t = cur.a + norm(a - cur.a);
    if (Math.abs(t - cur.a) > 2) push({ ...cur, a: t }, (Math.abs(t - cur.a) / 180) * TURN_PX);
  };
  for (const pt of points) {
    const dist = Math.hypot(pt.x - cur.x, pt.y - cur.y);
    if (dist < 2) continue;
    turnTo((Math.atan2(pt.x - cur.x, cur.y - pt.y) * 180) / Math.PI);
    push({ x: pt.x, y: pt.y, a: cur.a }, dist);
  }
  if (finalA !== undefined) turnTo(finalA);

  pose = cur;
  el.robot.style.transform = toCss(pose);
  const total = cost[cost.length - 1];
  const ms = reduceMotion.matches ? 0 : (cfg.baseTickMs / sim.speed) * 0.92; // selesai sebelum tick berikutnya
  if (total < 1 || ms < 16) { anim = null; return; }
  // tiap segmen pelan di awal dan akhir, seperti robot vakum yang berhenti lalu berputar
  anim = el.robot.animate(
    frames.map((f, i) => ({ transform: toCss(f), offset: cost[i] / total, easing: 'ease-in-out' })),
    { duration: ms },
  );
}

// Jalur lewat setiap pintu di antara dua ruangan.
function doorPath(from, to) {
  const pts = [];
  const dir = to > from ? 1 : -1;
  for (let r = from; r !== to; r += dir) {
    const left = roomBox(Math.min(r, r + dir));
    const wallX = left.left + left.w + 2;
    pts.push({ x: wallX - dir * DOOR_PAD, y: left.doorY }, { x: wallX + dir * DOOR_PAD, y: left.doorY });
  }
  pts.push(restSpot(to));
  return pts;
}

// Saat CLEAN robot menyapu melengkung ke titik lain di ruangan.
// Math.random dipakai karena ini hanya tampilan; tidak memengaruhi seed simulasi.
function sweepPath(room) {
  const b = roomBox(room);
  const m = el.robot.offsetWidth * 0.7;
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const clampX = (x) => Math.min(b.left + b.w - m, Math.max(b.left + m, x));
  const clampY = (y) => Math.min(b.top + b.h - m, Math.max(b.top + b.h * 0.3, y));
  const cur = visualPose() ?? pose;
  const end = { x: rnd(b.left + m, b.left + b.w - m), y: rnd(b.top + b.h * 0.35, b.top + b.h - m) };
  const dx = end.x - cur.x;
  const dy = end.y - cur.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = rnd(-0.4, 0.4) * len; // geser titik tengah tegak lurus supaya jalurnya melengkung
  const mid = { x: clampX((cur.x + end.x) / 2 - (dy / len) * bend), y: clampY((cur.y + end.y) / 2 + (dx / len) * bend) };
  return [mid, end];
}

function animateRecord(r) {
  if (r.fromRoom !== r.room) {
    drive(doorPath(r.fromRoom, r.room), r.room === station ? 0 : undefined);
  } else if (r.action === 'CLEAN') {
    drive(sweepPath(r.room));
  } else if ((r.action === 'CHARGE' || r.action === 'WAIT') && r.room === station) {
    drive([restSpot(station)], 0); // kembali ke dok dan menghadap atas
  }
  poseRoom = r.room;
}

// Dipanggil setiap render: menggerakkan robot hanya bila ada keputusan baru atau ruangan berubah.
function syncRobot() {
  if (dragging) return;
  const room = sim.world.robot.room;
  if (!pose || poseRoom === null) { snapRobot(room); animatedTick = sim.last?.tick ?? null; return; }
  const last = sim.last;
  if (last && last.tick !== animatedTick) {
    animatedTick = last.tick;
    if (poseRoom === last.fromRoom && last.room === room) { animateRecord(last); return; }
  }
  if (poseRoom !== room) {
    // dipindah pengguna: dari titik lepas seret langsung ke titik istirahat, dari keyboard lewat pintu
    drive(dropped ? [restSpot(room)] : doorPath(poseRoom, room));
    dropped = false;
    poseRoom = room;
  }
}

// ---------- Jejak roda ----------
const trail = [];
const TRAIL_MAX = 14;

function renderTrail() {
  const lines = trail.map((seg, i) => {
    const a = roomBox(seg.from);
    const b = roomBox(seg.to);
    const lane = a.doorY + (seg.to > seg.from ? -9 : 9); // gerak kanan di lajur atas, kiri di bawah
    const op = (0.15 + 0.7 * ((i + 1) / trail.length)).toFixed(2);
    return [-4, 4].map((o) =>
      `<line x1="${a.cx}" y1="${lane + o}" x2="${b.cx}" y2="${lane + o}" stroke-dasharray="7 5" opacity="${op}"/>`).join('');
  });
  el.trail.innerHTML = lines.join('');
}

// ---------- Seret robot ----------
let dragging = false;
let dragStart = null;
let dropRoom = null;

function roomAtX(clientX) {
  for (const r of cfg.rooms) {
    const rect = roomEls[r].btn.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) return r;
  }
  return null;
}

el.robot.addEventListener('pointerdown', (e) => {
  if (sim.world.dead) return;
  dragStart = { x: e.clientX, y: e.clientY };
  el.robot.setPointerCapture(e.pointerId);
});
el.robot.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  if (!dragging && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 6) return;
  if (!dragging) { anim?.cancel(); anim = null; }
  dragging = true;
  el.robot.classList.add('dragging');
  const p = el.plan.getBoundingClientRect();
  pose = { x: e.clientX - p.left, y: e.clientY - p.top, a: pose?.a ?? 0 };
  el.robot.style.transform = toCss(pose);
  const r = roomAtX(e.clientX);
  if (r !== dropRoom) {
    if (dropRoom) roomEls[dropRoom].btn.removeAttribute('data-drop');
    dropRoom = r;
    if (r) roomEls[r].btn.dataset.drop = 'true';
  }
});
function endDrag() {
  const wasDragging = dragging;
  const target = dragging ? dropRoom : null;
  if (dropRoom) roomEls[dropRoom].btn.removeAttribute('data-drop');
  dragging = false;
  dragStart = null;
  dropRoom = null;
  el.robot.classList.remove('dragging');
  if (target && target !== sim.world.robot.room && !sim.world.dead) {
    dropped = true;
    sim.moveRobot(target); // render berikutnya menjalankan robot ke titik istirahat
  } else if (wasDragging) {
    drive([restSpot(sim.world.robot.room)]); // dilepas di ruangan yang sama atau di luar: kembali
  }
}
el.robot.addEventListener('pointerup', endDrag);
el.robot.addEventListener('pointercancel', endDrag);
el.robot.addEventListener('keydown', (e) => {
  const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (!d) return;
  e.preventDefault();
  e.stopPropagation();
  const next = sim.world.robot.room + d;
  if (cfg.rooms.includes(next)) sim.moveRobot(next);
});

// ---------- Render ----------
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  // setTimeout, bukan rAF: rAF berhenti total di panel/tab tersembunyi
  setTimeout(() => { renderQueued = false; render(); }, 0);
}

function render() {
  const w = sim.world;
  const last = sim.last;
  const { room, battery } = w.robot;
  const atStation = room === station;
  const thr = returnThreshold(room, cfg);
  const charging = last?.action === 'CHARGE' && atStation && !w.dead;
  const critical = !atStation && battery <= thr && !w.dead;

  // kontrol
  el.run.textContent = sim.running ? 'Jeda' : 'Jalankan';
  el.run.disabled = w.dead;
  el.step.disabled = w.dead;
  el.runState.textContent = w.dead ? 'Robot mati' : sim.running ? 'Berjalan' : 'Dijeda';
  el.runState.dataset.state = w.dead ? 'dead' : sim.running ? 'running' : 'paused';

  // ruangan
  for (const r of cfg.rooms) {
    const dust = w.rooms[r].dust;
    const { btn, dots, label } = roomEls[r];
    dots.forEach((d, k) => d.classList.toggle('on', k < DOT_COUNT[dust]));
    let text = dust === 0 ? 'bersih' : `debu ${dust}`;
    if (sim.mode === 'local') {
      const b = sim.memory.belief[r];
      text += b === null ? ', memori: belum dilihat' : `, memori: ${b}`;
    }
    label.textContent = text;
    btn.setAttribute('aria-label', `${roomName(r)}${r === station ? ' dengan stasiun' : ''}, ${dust === 0 ? 'bersih' : `debu ${dust} dari ${cfg.maxDust}`}${r === room ? ', robot di sini' : ''}`);
  }

  // robot
  el.robot.dataset.dead = String(w.dead);
  el.robot.dataset.charging = String(charging);
  el.robot.dataset.action = w.dead ? '' : (last?.action ?? '');
  el.robot.setAttribute('aria-label', `Robot di ${roomName(room).toLowerCase()}, baterai ${fmt(battery)}%`);
  syncRobot();
  renderTrail();

  renderBattery({ room, battery, atStation, thr, charging, critical, dead: w.dead });
  renderMind(last);
  el.chart.innerHTML = batteryChartSVG(sim.history.slice(-cfg.chartWindow), cfg.maxBattery);
  renderLog();
  renderMetrics();
}

let prevBattery = null;
let prevKind = '';
function renderBattery({ room, battery, atStation, thr, charging, critical, dead }) {
  if (prevBattery !== null && battery > prevBattery) restartAnim(el.batteryValue, 'bump');
  prevBattery = battery;
  el.battery.dataset.critical = String(critical || dead);
  el.battery.dataset.charging = String(charging);
  el.batteryValue.textContent = `${fmt(battery)}%`;
  el.batteryFill.style.width = `${(battery / cfg.maxBattery) * 100}%`;
  el.returnMark.style.left = `${(thr / cfg.maxBattery) * 100}%`;
  el.returnMark.dataset.flip = String(thr > 70);
  el.returnLabel.textContent = `batas pulang ${fmt(thr)}%`;

  const dist = Math.abs(room - station);
  el.formula.textContent = atStation
    ? `Di stasiun, jarak 0. Batas pulang = 0 × ${cfg.moveCost} + ${cfg.safetyMargin} = ${fmt(thr)}%.`
    : `${roomName(room)}, ${dist} pintu ke stasiun. Batas pulang = ${dist} × ${cfg.moveCost} + ${cfg.safetyMargin} = ${fmt(thr)}%.`;

  let html = '';
  let kind = '';
  if (dead) {
    kind = 'dead';
    html = `${ICON_STOP}<span>Baterai habis di ${roomName(room).toLowerCase()}. Robot berhenti di tengah lantai. Pilih keadaan awal lain lalu tekan Reset.</span>`;
  } else if (critical) {
    kind = 'critical';
    const rel = battery < thr ? 'di bawah' : 'tepat di';
    html = `${ICON_WARN}<span>Baterai ${fmt(battery)}%, ${rel} batas pulang ${fmt(thr)}%. Robot kembali ke stasiun.</span>`;
  } else if (charging) {
    kind = 'charge';
    html = `${ICON_PLUG}<span>Mengisi daya: +${cfg.chargeRate}% per tick sampai ${cfg.chargeTarget}%.</span>`;
  }
  el.status.dataset.kind = kind;
  el.status.innerHTML = html;
  if (kind === 'critical' && prevKind !== 'critical') restartAnim(el.status, 'nudge');
  prevKind = kind;
}

function renderMind(last) {
  const rules = RULES.filter((r) => !r.localOnly || sim.mode === 'local');
  const fired = last ? rules.findIndex((r) => r.id === last.ruleId) : -1;
  el.rules.innerHTML = rules.map((r, i) => {
    const status = fired < 0 ? 'idle' : i < fired ? 'checked' : i === fired ? 'fired' : 'skipped';
    const label = { idle: '', checked: 'tidak cocok', fired: 'menyala', skipped: 'tidak diperiksa' }[status];
    return `<li class="rule" data-status="${status}">
      <span class="rule-id">${r.id}</span>
      <span class="rule-name">${r.name}</span>
      <span class="rule-status">${label}</span>
      <span class="rule-cond">Jika ${esc(r.condition)}, maka ${esc(r.action)}.</span>
    </li>`;
  }).join('');

  if (!last) {
    el.percept.innerHTML = '<dt>Status</dt><dd>belum ada percept</dd>';
    el.actionName.textContent = '';
    el.actionReason.textContent = 'Belum ada keputusan. Tekan Jalankan atau Langkah berikutnya.';
    return;
  }
  const p = last.percept;
  const rows = [
    ['Tick', p.tick],
    ['Ruangan', roomName(p.room)],
    ['Debu di sini', p.dustHere],
    ['Baterai', `${fmt(p.battery)}%`],
    ['Di stasiun', p.atStation ? 'ya' : 'tidak'],
    ['Jarak ke stasiun', `${p.distanceToStation} pintu`],
  ];
  if (p.dustAll) {
    rows.push(['Debu semua ruangan', cfg.rooms.map((r) => `${roomName(r)} ${p.dustAll[r]}`).join(', ')]);
  } else {
    const m = last.memory;
    rows.push(['Memori debu', cfg.rooms.map((r) =>
      (m.belief[r] === null ? `${roomName(r)} ?` : `${roomName(r)} ${m.belief[r]} (t${m.lastSeen[r]})`)).join(', ')]);
  }
  rows.push(['Target', last.target ? roomName(last.target) : 'tidak ada']);
  el.percept.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  el.actionName.textContent = `${last.action} (${ACTION_LABEL[last.action]})`;
  el.actionReason.textContent = last.reason;
}

const LOG_ROWS = 150;
let lastLogTick;
function renderLog() {
  const f = el.logFilter.value;
  const rows = [];
  for (let i = sim.history.length - 1; i >= 0 && rows.length < LOG_ROWS; i--) {
    const r = sim.history[i];
    if (f && r.ruleId !== f) continue;
    rows.push(`<li data-rule="${r.ruleId}"><p class="log-meta"><b>${r.ruleId}</b> <span>${r.action}</span> <span>tick ${r.tick}</span> <span>baterai ${fmt(r.battery)}%</span></p><p>${esc(r.reason)}</p></li>`);
  }
  el.logBody.innerHTML = rows.join('');
  const top = sim.history[sim.history.length - 1]?.tick;
  if (rows.length && top !== lastLogTick && !f) el.logBody.firstElementChild.classList.add('fresh');
  lastLogTick = top;
  el.logEmpty.hidden = rows.length > 0;
  el.logEmpty.textContent = sim.history.length
    ? 'Belum ada keputusan dari aturan ini. Pilih "semua" untuk melihat log lengkap.'
    : 'Belum ada keputusan. Tekan Jalankan atau Langkah berikutnya.';
}

function metricRows() {
  const m = sim.metrics;
  const avg = sim.averageDust();
  return [
    ['Tingkat debu dibersihkan', m.dustCleaned],
    ['Total tick', m.ticks],
    ['Sesi isi daya', m.chargeSessions],
    ['Energi terpakai', `${fmt(m.energyUsed)}%`],
    ...cfg.rooms.map((r) => [`Rata-rata debu ${roomName(r).toLowerCase()}`, avg[r].toFixed(2)]),
    ['Kejadian baterai kritis', m.criticalEvents],
  ];
}

function renderMetrics() {
  el.metrics.innerHTML = metricRows().map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

// ---------- Ekspor CSV ----------
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function exportCSV() {
  const lines = [['metrik', 'nilai'], ...metricRows(), ['seed', sim.seed], ['preset', sim.preset.name], ['mode persepsi', sim.mode], []];
  lines.push(['tick', 'ruang_awal', 'aturan', 'aksi', 'baterai_setelah', 'batas_pulang_setelah',
    ...cfg.rooms.map((r) => `debu_ruang_${r}`), 'alasan']);
  for (const r of sim.history) {
    lines.push([r.tick, r.fromRoom, r.ruleId, r.action, r.battery, r.thresholdAfter, ...cfg.rooms.map((k) => r.dust[k]), r.reason]);
  }
  const csv = '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `robot-rumah-seed${sim.seed}-tick${sim.metrics.ticks}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Pengumuman aria-live (hanya kejadian penting) ----------
function announce(record) {
  const msgs = [];
  for (const e of record.events) {
    if (e === 'critical') msgs.push(record.reason);
    if (e === 'charge-start') msgs.push('Mulai mengisi daya di stasiun.');
    if (e === 'charge-end') msgs.push(`Selesai mengisi daya, baterai ${fmt(record.percept.battery)}%.`);
    if (e === 'dead') msgs.push(`Baterai habis. Robot mati di ${roomName(record.room).toLowerCase()}.`);
  }
  if (msgs.length) el.announce.textContent = msgs.join(' ');
}

// ---------- Kontrol ----------
function fullReset(opts) {
  sim.pause();
  trail.length = 0;
  poseRoom = null; // posisi awal preset: letakkan langsung tanpa animasi
  if (pose) pose.a = 0;
  prevBattery = null;
  sim.reset(opts);
}

el.run.addEventListener('click', () => sim.toggle());
el.step.addEventListener('click', () => { sim.pause(); sim.step(); });
el.reset.addEventListener('click', () => fullReset());
el.speed.addEventListener('input', () => {
  sim.setSpeed(Number(el.speed.value));
  el.speedOut.textContent = `${sim.speed}x`;
});

el.preset.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
el.preset.addEventListener('change', () => fullReset({ presetId: el.preset.value }));

const SEED_HINT = el.seedMsg.textContent;
el.seed.addEventListener('change', () => {
  const v = Number(el.seed.value);
  const ok = el.seed.value.trim() !== '' && Number.isInteger(v) && v >= 0 && v <= 4294967295;
  el.seed.setAttribute('aria-invalid', String(!ok));
  el.seedMsg.dataset.error = String(!ok);
  el.seedMsg.textContent = ok ? SEED_HINT
    : `Seed harus bilangan bulat 0 sampai 4294967295. Simulasi tetap memakai seed ${sim.seed}.`;
  if (ok) fullReset({ seed: v });
});
el.seed.value = sim.seed;

el.dust.value = Math.round(sim.dustChance * 100);
el.dustOut.textContent = `${el.dust.value}%`;
el.dust.addEventListener('input', () => {
  sim.dustChance = Number(el.dust.value) / 100;
  el.dustOut.textContent = `${el.dust.value}%`;
});

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => { if (radio.checked) sim.setMode(radio.value); });
}

el.logFilter.innerHTML += RULES.map((r) => `<option value="${r.id}">${r.id} ${r.name}</option>`).join('');
el.logFilter.addEventListener('change', renderLog);
el.exportBtn.addEventListener('click', exportCSV);

// Pintasan: Spasi jalan/jeda, panah kanan langkah, R reset. Tidak mengganggu kontrol yang sedang difokus.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing = t.matches?.('input, select, textarea');
  const control = t.matches?.('button, a, summary, [tabindex="0"]');
  if (e.key === ' ' && !typing && !control) { e.preventDefault(); sim.toggle(); }
  else if (e.key === 'ArrowRight' && !typing && t !== el.robot) { e.preventDefault(); sim.pause(); sim.step(); }
  else if ((e.key === 'r' || e.key === 'R') && !typing) { e.preventDefault(); fullReset(); }
});

sim.onChange((evt) => {
  if (evt.type === 'step') {
    const r = evt.record;
    if (r.fromRoom !== r.room) {
      trail.push({ from: r.fromRoom, to: r.room });
      if (trail.length > TRAIL_MAX) trail.shift();
    }
    announce(r);
  }
  if (evt.type === 'reset') el.announce.textContent = '';
  queueRender();
});

window.addEventListener('resize', () => { snapRobot(); renderTrail(); });

// ---------- Mulai ----------
buildRooms();
render();
if (!reduceMotion.matches) {
  el.robot.classList.add('intro');
  el.robot.addEventListener('animationend', () => el.robot.classList.remove('intro'), { once: true });
}
// Font web mengubah ukuran ruangan setelah dimuat: posisikan ulang robot.
document.fonts?.ready.then(() => { snapRobot(); renderTrail(); });
