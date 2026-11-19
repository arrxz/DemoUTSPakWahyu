// Eksperimen untuk laporan: node eksperimen.js
// 100 seed x 1.000 tick untuk tiap kombinasi mode persepsi dan laju debu.
import { Simulation } from './js/simulation.js';
import { CONFIG } from './js/config.js';

const SEEDS = Array.from({ length: 100 }, (_, i) => i);
const TICKS = 1000;
const RATES = [0.05, 0.1, 0.2];
const MODES = ['full', 'local'];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (n, d = 1) => n.toFixed(d).replace('.', ',');

console.log(`Eksperimen: ${SEEDS.length} seed x ${TICKS} tick, preset "Awal standar"\n`);
console.log('mode   p     bersih%  debu/ruang  dibersihkan  energi%  sesi isi  tick isi  kritis  baterai min lantai  mati');
const t0 = Date.now();
for (const mode of MODES) {
  for (const p of RATES) {
    const rows = SEEDS.map((seed) => {
      const sim = new Simulation({ seed, dustChance: p, mode });
      let clean = 0;
      let charging = 0;
      let minFloor = Infinity;
      for (let t = 0; t < TICKS; t++) {
        const r = sim.step();
        clean += CONFIG.rooms.filter((k) => r.dust[k] === 0).length;
        if (r.action === 'CHARGE') charging++;
        if (r.room !== CONFIG.stationRoom) minFloor = Math.min(minFloor, r.battery);
      }
      const m = sim.metrics;
      const avg = sim.averageDust();
      return {
        clean: (clean / (CONFIG.rooms.length * TICKS)) * 100,
        dust: mean(CONFIG.rooms.map((k) => avg[k])),
        cleaned: m.dustCleaned,
        energy: m.energyUsed,
        sessions: m.chargeSessions,
        charging,
        critical: m.criticalEvents,
        minFloor,
        dead: sim.world.dead ? 1 : 0,
      };
    });
    const col = (k) => mean(rows.map((r) => r[k]));
    console.log([
      (mode === 'full' ? 'Penuh' : 'Lokal').padEnd(6),
      f(p, 2).padEnd(5),
      f(col('clean')).padStart(7),
      f(col('dust'), 2).padStart(11),
      f(col('cleaned')).padStart(12),
      f(col('energy'), 0).padStart(8),
      f(col('sessions')).padStart(9),
      f(col('charging')).padStart(9),
      f(col('critical')).padStart(7),
      f(Math.min(...rows.map((r) => r.minFloor))).padStart(19),
      String(rows.reduce((a, r) => a + r.dead, 0)).padStart(5),
    ].join('  '));
  }
}
console.log(`\nSelesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik.`);
