// Lingkungan: ruangan, debu, stasiun, dan aturan fisika aksi.
// Tidak boleh menyentuh document/window.
import { CONFIG } from './config.js';

export const distance = (a, b) => Math.abs(a - b);

const round1 = (n) => Math.round(n * 10) / 10;

// PRNG deterministik supaya simulasi bisa diulang dengan seed yang sama.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(init, cfg = CONFIG) {
  return {
    tick: init.tick ?? 0,
    robot: { room: init.robot.room, battery: init.robot.battery },
    rooms: Object.fromEntries(cfg.rooms.map((r) => [r, { dust: init.rooms[r]?.dust ?? 0 }])),
    dead: false,
  };
}

export function actionCost(action, cfg = CONFIG) {
  switch (action) {
    case 'CLEAN': return cfg.cleanCost;
    case 'MOVE_LEFT':
    case 'MOVE_RIGHT': return cfg.moveCost;
    case 'WAIT': return cfg.waitCost;
    case 'CHARGE': return 0;
    default: throw new Error(`Aksi tidak dikenal: ${action}. Pakai CLEAN, MOVE_LEFT, MOVE_RIGHT, CHARGE, atau WAIT.`);
  }
}

// mode 'full': agen melihat debu semua ruangan. mode 'local': hanya ruangannya sendiri.
export function perceive(world, mode = 'full', cfg = CONFIG) {
  const { room, battery } = world.robot;
  const p = {
    tick: world.tick,
    room,
    dustHere: world.rooms[room].dust,
    battery,
    atStation: room === cfg.stationRoom,
    distanceToStation: distance(room, cfg.stationRoom),
  };
  if (mode === 'full') {
    p.dustAll = Object.fromEntries(cfg.rooms.map((r) => [r, world.rooms[r].dust]));
  }
  return p;
}

// Menerapkan aksi ke dunia. Mengembalikan ringkasan efek untuk metrik.
export function applyAction(world, action, cfg = CONFIG) {
  const r = world.robot;
  const result = { cost: 0, gained: 0, cleaned: 0 };
  if (world.dead) return result;

  if (action === 'CHARGE' && r.room === cfg.stationRoom) {
    const before = r.battery;
    r.battery = Math.min(cfg.maxBattery, round1(r.battery + cfg.chargeRate));
    result.gained = round1(r.battery - before);
    return result;
  }

  // CHARGE di luar stasiun diperlakukan sebagai WAIT.
  const cost = actionCost(action === 'CHARGE' ? 'WAIT' : action, cfg);
  if (cost > r.battery) {
    // Tenaga tidak cukup untuk aksi ini: robot berhenti di tempat.
    result.cost = r.battery;
    r.battery = 0;
    world.dead = r.room !== cfg.stationRoom;
    return result;
  }

  r.battery = round1(r.battery - cost);
  result.cost = cost;

  const first = cfg.rooms[0];
  const last = cfg.rooms[cfg.rooms.length - 1];
  if (action === 'CLEAN' && world.rooms[r.room].dust > 0) {
    world.rooms[r.room].dust -= 1;
    result.cleaned = 1;
  } else if (action === 'MOVE_LEFT' && r.room > first) {
    r.room -= 1;
  } else if (action === 'MOVE_RIGHT' && r.room < last) {
    r.room += 1;
  }

  if (r.battery <= 0 && r.room !== cfg.stationRoom) world.dead = true;
  return result;
}

export function spawnDust(world, rng, chance, cfg = CONFIG) {
  // Selalu panggil rng untuk tiap ruangan supaya urutan acak tetap sama walau debu penuh.
  for (const r of cfg.rooms) {
    const roll = rng();
    if (roll < chance && world.rooms[r].dust < cfg.maxDust) world.rooms[r].dust += 1;
  }
}
