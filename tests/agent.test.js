import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, PRESETS } from '../js/config.js';
import { decide, createMemory, returnThreshold } from '../js/agent.js';
import { Simulation } from '../js/simulation.js';

const percept = (o) => ({
  tick: 0, room: 1, dustHere: 0, battery: 100, atStation: o.room === undefined || o.room === 1,
  distanceToStation: Math.abs((o.room ?? 1) - 1), dustAll: { 1: 0, 2: 0, 3: 0 }, ...o,
});

test('ambang pulang dihitung dari jarak: Ruang 3 > Ruang 2 > Ruang 1', () => {
  const [t1, t2, t3] = [1, 2, 3].map((r) => returnThreshold(r));
  assert.equal(t1, CONFIG.safetyMargin);
  assert.equal(t2, CONFIG.moveCost + CONFIG.safetyMargin);
  assert.equal(t3, 2 * CONFIG.moveCost + CONFIG.safetyMargin);
  assert.ok(t3 > t2 && t2 > t1);
});

test('baterai yang sama memicu R2 di Ruang 3 tetapi tidak di Ruang 2', () => {
  const b = returnThreshold(3); // 9
  const far = decide(percept({ room: 3, battery: b, dustHere: 3, dustAll: { 1: 0, 2: 0, 3: 3 } }), createMemory());
  assert.equal(far.ruleId, 'R2');
  assert.equal(far.action, 'MOVE_LEFT');
  const near = decide(percept({ room: 2, battery: b, dustHere: 0, dustAll: { 1: 0, 2: 0, 3: 0 } }), createMemory());
  assert.notEqual(near.ruleId, 'R2');
});

test('R1 mengisi daya di stasiun sampai target', () => {
  const d = decide(percept({ room: 1, battery: 60 }), createMemory());
  assert.deepEqual([d.ruleId, d.action], ['R1', 'CHARGE']);
  assert.equal(decide(percept({ room: 1, battery: 95 }), createMemory()).ruleId, 'R5');
});

test('R3 hanya membersihkan jika baterai cukup untuk CLEAN plus pulang', () => {
  const ok = decide(percept({ room: 3, battery: 12, dustHere: 2, dustAll: { 1: 0, 2: 0, 3: 2 } }), createMemory());
  assert.equal(ok.ruleId, 'R3');
  const no = decide(percept({ room: 3, battery: 11, dustHere: 2, dustAll: { 1: 0, 2: 0, 3: 2 } }), createMemory());
  assert.notEqual(no.ruleId, 'R3');
});

test('seri target: pilih ruangan terdekat', () => {
  const d = decide(percept({ room: 2, battery: 100, atStation: false, dustAll: { 1: 2, 2: 0, 3: 2 } }), createMemory());
  // Ruang 1 dan 3 sama jauh dari Ruang 2: aturan seri berikutnya memilih nomor terkecil
  assert.equal(d.target, 1);
  const d2 = decide(percept({ room: 1, battery: 100, dustAll: { 1: 0, 2: 3, 3: 3 } }), createMemory());
  assert.equal(d2.target, 2);
});

test('komitmen target: tidak berbalik saat ruangan di belakang menjadi lebih kotor', () => {
  const mem = createMemory();
  const d1 = decide(percept({ room: 1, battery: 100, dustAll: { 1: 0, 2: 0, 3: 2 } }), mem);
  assert.deepEqual([d1.ruleId, d1.target, d1.action], ['R4', 3, 'MOVE_RIGHT']);
  // Robot sudah di Ruang 2; Ruang 1 tiba-tiba lebih kotor daripada target.
  const d2 = decide(percept({ tick: 1, room: 2, atStation: false, battery: 98, dustAll: { 1: 3, 2: 0, 3: 2 } }), mem);
  assert.deepEqual([d2.ruleId, d2.target, d2.action], ['R4', 3, 'MOVE_RIGHT']);
});

test('R2 menyela komitmen target', () => {
  const mem = createMemory();
  decide(percept({ room: 1, battery: 100, dustAll: { 1: 0, 2: 0, 3: 2 } }), mem);
  const d = decide(percept({ tick: 1, room: 2, atStation: false, battery: 7, dustAll: { 1: 0, 2: 0, 3: 2 } }), mem);
  assert.equal(d.ruleId, 'R2');
  assert.equal(mem.target, null);
});

test('setiap keputusan berisi action, ruleId, dan reason berbahasa Indonesia', () => {
  const d = decide(percept({ room: 1, battery: 50 }), createMemory());
  assert.ok(d.action && d.ruleId && typeof d.reason === 'string' && d.reason.length > 10);
});

const safePresets = PRESETS.filter((p) => !p.forceFail);
const seeds = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);

for (const mode of ['full', 'local']) {
  test(`tidak pernah mati: 10.000 tick x 20 seed x ${safePresets.length} preset (mode ${mode})`, () => {
    for (const preset of safePresets) {
      for (const [i, seed] of seeds.entries()) {
        const dustChance = [0.02, 0.05, 0.15, 0.4][i % 4];
        const sim = new Simulation({ presetId: preset.id, seed, dustChance, mode });
        let prev = null;
        for (let t = 0; t < 10_000; t++) {
          const rec = sim.step();
          const where = `${preset.id} seed ${seed} tick ${t}`;
          assert.ok(rec && !sim.world.dead, `robot mati: ${where}`);
          if (rec.room !== CONFIG.stationRoom) assert.ok(rec.battery > 0, `baterai 0 di lantai: ${where}`);
          // tanpa osilasi: dua langkah R4 berturut-turut tidak pernah berlawanan arah
          if (prev?.ruleId === 'R4' && rec.ruleId === 'R4') {
            assert.ok(prev.action === rec.action || prev.room === prev.target || rec.fromRoom === prev.target,
              `osilasi target: ${where}`);
          }
          prev = rec;
        }
      }
    }
  });
}

test('preset paksa gagal memang membuat robot mati', () => {
  const sim = new Simulation({ presetId: 'paksa-gagal' });
  for (let t = 0; t < 50 && !sim.world.dead; t++) sim.step();
  assert.equal(sim.world.dead, true);
  assert.notEqual(sim.world.robot.room, CONFIG.stationRoom);
});

test('seed yang sama menghasilkan riwayat yang sama', () => {
  const run = () => {
    const s = new Simulation({ seed: 123, dustChance: 0.2 });
    for (let t = 0; t < 500; t++) s.step();
    return s.history.map((r) => `${r.action}${r.battery}${Object.values(r.dust).join('')}`).join('|');
  };
  assert.equal(run(), run());
  const s = new Simulation({ seed: 123, dustChance: 0.2 });
  for (let t = 0; t < 50; t++) s.step();
  const a = s.history.map((r) => r.action).join();
  s.reset();
  for (let t = 0; t < 50; t++) s.step();
  assert.equal(s.history.map((r) => r.action).join(), a);
});

test('mode Lokal: robot mengunjungi semua ruangan lewat patroli', () => {
  const sim = new Simulation({ presetId: 'bersih', mode: 'local', dustChance: 0.05, seed: 9 });
  const visited = new Set();
  const rules = new Set();
  for (let t = 0; t < 300; t++) { const r = sim.step(); visited.add(r.room); rules.add(r.ruleId); }
  assert.deepEqual([...visited].sort(), [1, 2, 3]);
  assert.ok(rules.has('R4b'));
});

test('mode Penuh tidak pernah memakai R4b', () => {
  const sim = new Simulation({ dustChance: 0.1 });
  for (let t = 0; t < 2000; t++) assert.notEqual(sim.step().ruleId, 'R4b');
});
