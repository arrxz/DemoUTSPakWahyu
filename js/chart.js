// Grafik baterai SVG buatan sendiri. Mengembalikan string SVG; ui.js yang memasangnya.

const W = 640;
const H = 220;
const PAD = { l: 36, r: 10, t: 10, b: 28 };

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function batteryChartSVG(records, maxBattery = 100) {
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (v) => PAD.t + ih - (v / maxBattery) * ih;

  const grid = [0, 25, 50, 75, 100].map((v) =>
    `<line class="gridline" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>`
    + `<text class="label" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const axes = `<line class="axis" x1="${PAD.l}" x2="${PAD.l}" y1="${PAD.t}" y2="${PAD.t + ih}"/>`
    + `<line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + ih}" y2="${PAD.t + ih}"/>`;

  if (!records.length) {
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik baterai kosong">${grid}${axes}`
      + `<text class="empty-text" x="${PAD.l + 16}" y="${PAD.t + ih / 2}">Grafik muncul setelah tick pertama.</text></svg>`;
  }

  const n = records.length;
  const step = n > 1 ? iw / (n - 1) : 0;
  const x = (i) => PAD.l + (n > 1 ? i * step : iw / 2);

  const batt = records.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.battery).toFixed(1)}`).join('');
  // batas pulang berbentuk tangga karena hanya berubah saat robot pindah ruangan
  let limit = '';
  records.forEach((r, i) => {
    const yy = y(r.thresholdAfter).toFixed(1);
    limit += i ? `H${x(i).toFixed(1)}V${yy}` : `M${x(0).toFixed(1)},${yy}`;
  });
  const band = `${limit}V${y(0)}H${x(0)}Z`;

  // blok kuning di dasar grafik untuk setiap rangkaian tick mengisi daya
  let charges = '';
  for (let i = 0; i < n; i++) {
    if (records[i].action !== 'CHARGE') continue;
    let j = i;
    while (j + 1 < n && records[j + 1].action === 'CHARGE') j++;
    const x0 = x(i) - step / 2;
    const w = Math.max(3, x(j) - x(i) + step);
    charges += `<rect class="charge-mark" x="${Math.max(PAD.l, x0).toFixed(1)}" y="${PAD.t + ih - 7}" width="${w.toFixed(1)}" height="7"/>`;
    i = j;
  }

  const deadIdx = records.findIndex((r) => r.events.includes('dead'));
  const dead = deadIdx >= 0
    ? `<line class="dead-mark" x1="${x(deadIdx)}" x2="${x(deadIdx)}" y1="${PAD.t}" y2="${PAD.t + ih}"/>` : '';

  const first = records[0].tick;
  const last = records[n - 1].tick;
  const min = Math.min(...records.map((r) => r.battery));
  const xLabels = `<text class="label" x="${PAD.l}" y="${H - 8}">tick ${first}</text>`
    + `<text class="label" x="${W - PAD.r}" y="${H - 8}" text-anchor="end">tick ${last}</text>`;

  const summary = `Baterai dari tick ${first} sampai ${last}. Terakhir ${fmt(records[n - 1].battery)}%, terendah ${fmt(min)}%.`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${summary}">`
    + `${grid}<path class="limit-band" d="${band}"/>${charges}`
    + `<path class="limit-line" d="${limit}"/><path class="battery-line" d="${batt}"/>${dead}${axes}${xLabels}</svg>`;
}
