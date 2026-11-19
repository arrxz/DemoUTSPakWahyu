// Otak agen: percept -> aturan condition-action -> aksi.
// Tidak boleh menyentuh document/window.
import { CONFIG } from './config.js';
import { distance } from './world.js';

// Urutan = prioritas. Aturan pertama yang cocok menang.
// R4b hanya aktif di mode persepsi Lokal.
export const RULES = Object.freeze([
  { id: 'R1', name: 'charge-until-full', condition: 'di stasiun dan baterai < target isi', action: 'CHARGE' },
  { id: 'R2', name: 'return-to-base', condition: 'baterai ≤ batas pulang dan tidak di stasiun', action: 'gerak ke stasiun' },
  { id: 'R3', name: 'clean-here', condition: 'ada debu di sini dan baterai cukup untuk CLEAN plus pulang', action: 'CLEAN' },
  { id: 'R4', name: 'go-to-dirtiest', condition: 'ada ruangan berdebu yang terjangkau', action: 'gerak ke target' },
  { id: 'R4b', name: 'patrol-stale', condition: 'mode Lokal: ada ruangan yang lama tidak dikunjungi', action: 'gerak ke ruangan basi', localOnly: true },
  { id: 'R5', name: 'idle-at-base', condition: 'tidak ada pekerjaan yang terjangkau', action: 'ke stasiun, lalu WAIT' },
]);

export const ACTION_LABEL = Object.freeze({
  CLEAN: 'bersihkan',
  MOVE_LEFT: 'gerak ke kiri',
  MOVE_RIGHT: 'gerak ke kanan',
  CHARGE: 'isi daya',
  WAIT: 'tunggu',
});

// Ambang pulang dihitung dari jarak, bukan konstan.
export const returnThreshold = (room, cfg = CONFIG) =>
  distance(room, cfg.stationRoom) * cfg.moveCost + cfg.safetyMargin;

export function createMemory(cfg = CONFIG) {
  return {
    target: null, // ruangan yang sedang dituju (komitmen)
    targetKind: null, // 'dust' (R4) atau 'patrol' (R4b)
    belief: Object.fromEntries(cfg.rooms.map((r) => [r, null])), // debu terakhir yang diketahui; null = belum pernah dilihat
    lastSeen: Object.fromEntries(cfg.rooms.map((r) => [r, null])), // tick terakhir ruangan dilihat
  };
}

const roomName = (r, cfg) => cfg.roomNames?.[r] ?? `Ruang ${r}`;
const stepToward = (from, to) => (to > from ? 'MOVE_RIGHT' : 'MOVE_LEFT');
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Cukup baterai untuk ke ruangan itu, membersihkan sekali, lalu masih di atas batas pulang di sana?
function canServe(p, room, cfg) {
  const after = p.battery - distance(p.room, room) * cfg.moveCost - cfg.cleanCost;
  return after >= returnThreshold(room, cfg);
}

function pickBest(rooms, score, p) {
  // skor tertinggi menang; seri -> terdekat; seri lagi -> nomor ruangan terkecil
  return [...rooms].sort((a, b) =>
    score(b) - score(a) || distance(p.room, a) - distance(p.room, b) || a - b,
  )[0];
}

function updateMemory(p, m, cfg) {
  if (p.dustAll) {
    for (const r of cfg.rooms) { m.belief[r] = p.dustAll[r]; m.lastSeen[r] = p.tick; }
  } else {
    m.belief[p.room] = p.dustHere;
    m.lastSeen[p.room] = p.tick;
  }
  if (m.target === p.room) { m.target = null; m.targetKind = null; }
}

/**
 * Memilih aksi dari percept. Memori milik agen dan diperbarui di sini.
 * @returns {{action: string, ruleId: string, reason: string, target: number|null, threshold: number}}
 */
export function decide(p, memory, cfg = CONFIG) {
  updateMemory(p, memory, cfg);
  const thr = returnThreshold(p.room, cfg);
  const b = fmt(p.battery);
  const nm = (r) => roomName(r, cfg);
  const out = (ruleId, action, reason) => ({ action, ruleId, reason, target: memory.target, threshold: thr });

  // R1 charge-until-full
  if (p.atStation && p.battery < cfg.chargeTarget) {
    return out('R1', 'CHARGE', `Di stasiun dengan baterai ${b}%, di bawah target ${cfg.chargeTarget}%. Isi daya.`);
  }

  // R2 return-to-base
  if (!p.atStation && p.battery <= thr) {
    memory.target = null; memory.targetKind = null;
    const rel = p.battery < thr ? 'di bawah' : 'tepat di';
    return out('R2', stepToward(p.room, cfg.stationRoom),
      `Baterai ${b}%, ${rel} batas pulang ${fmt(thr)}%. Robot kembali ke stasiun.`);
  }

  // R3 clean-here
  if (p.dustHere > 0 && p.battery - cfg.cleanCost >= thr) {
    return out('R3', 'CLEAN',
      `Debu ${p.dustHere} di ${nm(p.room).toLowerCase()}. Setelah membersihkan, baterai ${fmt(p.battery - cfg.cleanCost)}% masih ≥ batas pulang ${fmt(thr)}%.`);
  }

  // R4 go-to-dirtiest (dengan komitmen target)
  const dirty = cfg.rooms.filter((r) => r !== p.room && memory.belief[r] > 0);
  const reachable = dirty.filter((r) => canServe(p, r, cfg));
  if (reachable.length) {
    const keep = memory.targetKind === 'dust' && reachable.includes(memory.target);
    if (!keep) {
      memory.target = pickBest(reachable, (r) => memory.belief[r], p);
      memory.targetKind = 'dust';
    }
    const t = memory.target;
    const why = keep
      ? `Tetap menuju target ${nm(t).toLowerCase()} (debu ${memory.belief[t]}).`
      : `Target baru ${nm(t).toLowerCase()}: debu tertinggi (${memory.belief[t]})${reachable.length > 1 ? ', terdekat jika seri' : ''}.`;
    return out('R4', stepToward(p.room, t), `${why} Gerak satu langkah.`);
  }

  // R4b patrol-stale (mode Lokal saja)
  if (!p.dustAll) {
    const stale = cfg.rooms.filter((r) => r !== p.room
      && (memory.lastSeen[r] === null || p.tick - memory.lastSeen[r] >= cfg.patrolInterval)
      && canServe(p, r, cfg));
    if (stale.length) {
      const keep = memory.targetKind === 'patrol' && stale.includes(memory.target);
      if (!keep) {
        const age = (r) => (memory.lastSeen[r] === null ? Infinity : p.tick - memory.lastSeen[r]);
        memory.target = pickBest(stale, age, p);
        memory.targetKind = 'patrol';
      }
      const t = memory.target;
      const seen = memory.lastSeen[t] === null ? 'belum pernah dilihat' : `terakhir dilihat ${p.tick - memory.lastSeen[t]} tick lalu`;
      return out('R4b', stepToward(p.room, t), `${nm(t)} ${seen}. Patroli untuk memeriksa debu.`);
    }
  }

  // R5 idle-at-base
  memory.target = null; memory.targetKind = null;
  const leftover = cfg.rooms.some((r) => memory.belief[r] > 0);
  const situation = leftover ? 'Sisa debu di luar jangkauan baterai.' : 'Semua ruangan yang diketahui bersih.';
  if (!p.atStation) {
    return out('R5', stepToward(p.room, cfg.stationRoom), `${situation} Kembali ke stasiun.`);
  }
  return out('R5', 'WAIT', `${situation} Menunggu di stasiun.`);
}
