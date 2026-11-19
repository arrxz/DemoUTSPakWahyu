// Semua angka simulasi ada di sini. Jangan hardcode di file lain.

export const CONFIG = Object.freeze({
  rooms: Object.freeze([1, 2, 3]),
  roomNames: Object.freeze({ 1: 'Ruang tamu', 2: 'Dapur', 3: 'Kamar tidur' }),
  stationRoom: 1,
  maxDust: 3,

  maxBattery: 100,
  cleanCost: 3,
  moveCost: 2,
  waitCost: 0.5,
  chargeRate: 10, // per tick, hanya di stasiun
  chargeTarget: 95, // R1: isi daya sampai baterai >= nilai ini
  safetyMargin: 5, // ditambahkan ke biaya perjalanan pulang

  dustSpawnChance: 0.05, // peluang tiap ruangan bertambah 1 debu per tick
  patrolInterval: 15, // mode Lokal: ruangan dianggap basi setelah sekian tick

  defaultSeed: 42,
  baseTickMs: 1000, // durasi satu tick pada kecepatan 1x; robot butuh waktu untuk berjalan antar ruangan
  maxSpeed: 20,
  historyLimit: 5000, // jumlah catatan keputusan yang disimpan
  chartWindow: 200, // jumlah tick terakhir yang digambar di grafik
});

export const PRESETS = Object.freeze([
  {
    id: 'standar',
    name: 'Awal standar',
    state: { tick: 0, robot: { room: 1, battery: 100 }, rooms: { 1: { dust: 0 }, 2: { dust: 2 }, 3: { dust: 3 } } },
  },
  {
    id: 'semua-kotor',
    name: 'Semua kotor',
    state: { tick: 0, robot: { room: 1, battery: 100 }, rooms: { 1: { dust: 3 }, 2: { dust: 3 }, 3: { dust: 3 } } },
  },
  {
    id: 'baterai-tipis',
    name: 'Baterai tipis di kamar tidur',
    state: { tick: 0, robot: { room: 3, battery: 12 }, rooms: { 1: { dust: 1 }, 2: { dust: 2 }, 3: { dust: 3 } } },
  },
  {
    id: 'bersih',
    name: 'Rumah bersih',
    state: { tick: 0, robot: { room: 2, battery: 60 }, rooms: { 1: { dust: 0 }, 2: { dust: 0 }, 3: { dust: 0 } } },
  },
  {
    id: 'paksa-gagal',
    name: 'Paksa gagal (demo)',
    forceFail: true, // baterai awal di bawah biaya pulang: robot pasti mati
    state: { tick: 0, robot: { room: 3, battery: 3 }, rooms: { 1: { dust: 3 }, 2: { dust: 3 }, 3: { dust: 3 } } },
  },
]);
