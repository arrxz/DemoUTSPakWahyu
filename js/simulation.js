// Loop tick, jalan/jeda/langkah/kecepatan, riwayat, metrik, seed acak.
// Tidak boleh menyentuh document/window.
import { CONFIG, PRESETS } from './config.js';
import { createWorld, perceive, applyAction, spawnDust, mulberry32 } from './world.js';
import { decide, createMemory, returnThreshold } from './agent.js';

const emptyMetrics = (cfg) => ({
  ticks: 0,
  dustCleaned: 0,
  chargeSessions: 0,
  energyUsed: 0,
  criticalEvents: 0,
  dustSum: Object.fromEntries(cfg.rooms.map((r) => [r, 0])),
});

export class Simulation {
  constructor({ presetId = PRESETS[0].id, seed = CONFIG.defaultSeed, dustChance = CONFIG.dustSpawnChance, mode = 'full', cfg = CONFIG } = {}) {
    this.cfg = cfg;
    this.presetId = presetId;
    this.seed = seed;
    this.dustChance = dustChance;
    this.mode = mode;
    this.speed = 1;
    this.running = false;
    this.timer = null;
    this.listeners = new Set();
    this.reset();
  }

  get preset() { return PRESETS.find((p) => p.id === this.presetId) ?? PRESETS[0]; }

  reset({ presetId = this.presetId, seed = this.seed } = {}) {
    this.presetId = presetId;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.world = createWorld(this.preset.state, this.cfg);
    this.memory = createMemory(this.cfg);
    this.history = [];
    this.metrics = emptyMetrics(this.cfg);
    this.last = null;
    this.emit({ type: 'reset' });
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(evt) { for (const fn of this.listeners) fn(evt, this); }

  threshold(room = this.world.robot.room) { return returnThreshold(room, this.cfg); }

  step() {
    const w = this.world;
    if (w.dead) { this.pause(); return null; }

    const percept = perceive(w, this.mode, this.cfg);
    const decision = decide(percept, this.memory, this.cfg);
    const effect = applyAction(w, decision.action, this.cfg);
    spawnDust(w, this.rng, this.dustChance, this.cfg);
    w.tick += 1;

    const prev = this.last;
    const m = this.metrics;
    m.ticks += 1;
    m.dustCleaned += effect.cleaned;
    m.energyUsed = Math.round((m.energyUsed + effect.cost) * 10) / 10;
    for (const r of this.cfg.rooms) m.dustSum[r] += w.rooms[r].dust;

    const events = [];
    if (decision.ruleId === 'R2' && prev?.ruleId !== 'R2') { m.criticalEvents += 1; events.push('critical'); }
    if (decision.action === 'CHARGE' && prev?.action !== 'CHARGE') { m.chargeSessions += 1; events.push('charge-start'); }
    if (prev?.action === 'CHARGE' && decision.action !== 'CHARGE') events.push('charge-end');
    if (w.dead) events.push('dead');

    const record = {
      tick: percept.tick,
      percept,
      ...decision,
      fromRoom: percept.room,
      room: w.robot.room,
      battery: w.robot.battery,
      thresholdAfter: this.threshold(w.robot.room),
      dust: Object.fromEntries(this.cfg.rooms.map((r) => [r, w.rooms[r].dust])),
      memory: structuredClone(this.memory),
      events,
    };
    this.last = record;
    this.history.push(record);
    // potong per blok supaya tidak menggeser array setiap tick
    if (this.history.length > this.cfg.historyLimit + 500) this.history.splice(0, 500);

    this.emit({ type: 'step', record });
    if (w.dead) this.pause();
    return record;
  }

  // --- kontrol waktu ---
  start() {
    if (this.running || this.world.dead) return;
    this.running = true;
    this.emit({ type: 'run-state' });
    this.schedule();
  }

  schedule() {
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.step();
      if (this.running) this.schedule();
    }, this.cfg.baseTickMs / this.speed);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.timer);
    this.emit({ type: 'run-state' });
  }

  toggle() { this.running ? this.pause() : this.start(); }

  setSpeed(n) { this.speed = Math.min(this.cfg.maxSpeed, Math.max(1, n)); }

  // --- intervensi pengguna ---
  setDust(room, value) {
    const v = Math.min(this.cfg.maxDust, Math.max(0, value));
    this.world.rooms[room].dust = v;
    this.emit({ type: 'world', room });
  }

  moveRobot(room) {
    if (this.world.dead || this.world.robot.room === room) return;
    this.world.robot.room = room;
    this.memory.target = null; // situasi mendadak: komitmen lama tidak lagi berlaku
    this.memory.targetKind = null;
    this.emit({ type: 'world', room });
  }

  setMode(mode) {
    this.mode = mode;
    this.memory = createMemory(this.cfg); // mode baru mulai dari memori kosong
    this.emit({ type: 'world' });
  }

  averageDust() {
    const n = Math.max(1, this.metrics.ticks);
    return Object.fromEntries(this.cfg.rooms.map((r) => [r, this.metrics.dustSum[r] / n]));
  }
}
