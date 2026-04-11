'use strict';

const AsusClient = require('./asus-client');
const db = require('./db');

const POLL_INTERVAL_MS = 2000;   // Real-time poll: every 2s
const HISTORY_INTERVAL_MS = 60000; // Write history: every 60s
const RATE_SMOOTH_SAMPLES = 10;  // Rolling average over last 10 polls (~20s) — matches router's averaging window

class Poller {
  constructor(config, emitter) {
    this.client = new AsusClient(config);
    this.emit = emitter;     // fn(event, data)
    this.running = false;
    this._prevBytes = {};    // mac → { rx, tx, ts }
    this._sessionTotals = {}; // mac → { rxBytes, txBytes } — accumulated since start
    this._rateBuffer = {};   // mac → { rx: number[], tx: number[] } — rolling window for smoothing
    this._accumulator = {};  // mac → { rxRate[], txRate[], rxBytes, txBytes }
    this._historyTimer = null;
    this._pollTimer = null;
    this.lastError = null;
    this.connected = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._poll();
    this._historyTimer = setInterval(() => this._flushHistory(), HISTORY_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    clearTimeout(this._pollTimer);
    clearInterval(this._historyTimer);
  }

  async _poll() {
    if (!this.running) return;

    try {
      const clients = await this.client.getClientList();
      this.lastError = null;

      if (!this.connected) {
        this.connected = true;
        this.emit('status', { connected: true, error: null });
      }

      // Upsert devices
      db.upsertDevices(clients);

      const now = Date.now();
      const enriched = clients.map((c) => this._computeRates(c, now));

      // Accumulate for history flush — use rawRxRate/rawTxRate to avoid smoothing inflation
      enriched.forEach((c) => {
        if (!this._accumulator[c.mac]) {
          this._accumulator[c.mac] = { rxRates: [], txRates: [], rxBytes: 0, txBytes: 0 };
        }
        const acc = this._accumulator[c.mac];
        acc.rxRates.push(c.rawRxRate);
        acc.txRates.push(c.rawTxRate);
        if (c.totalRx > acc.rxBytes) acc.rxBytes = c.totalRx;
        if (c.totalTx > acc.txBytes) acc.txBytes = c.totalTx;
      });

      this.emit('clients', enriched);
    } catch (err) {
      this.lastError = err.message;
      if (this.connected) {
        this.connected = false;
        this.emit('status', { connected: false, error: err.message });
      }
    }

    if (this.running) {
      this._pollTimer = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
    }
  }

  /**
   * Compute bandwidth rates by diffing cumulative byte counters.
   * Falls back to curRx/curTx if the router provides them directly.
   */
  _computeRates(client, now) {
    const mac = client.mac;
    const prev = this._prevBytes[mac];

    let rxRate = client.curRx || 0;
    let txRate = client.curTx || 0;

    if (client.totalRx > 0 && prev) {
      const dt = (now - prev.ts) / 1000; // seconds
      if (dt > 0) {
        const computedRx = Math.max(0, (client.totalRx - prev.rx) / dt);
        const computedTx = Math.max(0, (client.totalTx - prev.tx) / dt);
        // Use computed if curRx not provided
        if (client.curRx === 0) rxRate = computedRx;
        if (client.curTx === 0) txRate = computedTx;
      }
    }

    this._prevBytes[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now };

    // Accumulate session totals using RAW rates (before smoothing)
    // Using smoothed rates here would inflate totals as decaying averages
    // keep adding phantom bytes after a burst ends
    if (!this._sessionTotals[mac]) {
      this._sessionTotals[mac] = { rxBytes: client.totalRx, txBytes: client.totalTx };
    }
    if (client.totalRx > 0) {
      this._sessionTotals[mac].rxBytes = client.totalRx;
      this._sessionTotals[mac].txBytes = client.totalTx;
    } else if (prev) {
      const dt = (now - prev.ts) / 1000;
      this._sessionTotals[mac].rxBytes += rxRate * dt;
      this._sessionTotals[mac].txBytes += txRate * dt;
    }

    const totalRx = this._sessionTotals[mac].rxBytes;
    const totalTx = this._sessionTotals[mac].txBytes;

    // Smooth rates for display only — keeps UI stable without inflating totals
    if (!this._rateBuffer[mac]) this._rateBuffer[mac] = { rx: [], tx: [] };
    const buf = this._rateBuffer[mac];
    buf.rx.push(rxRate);
    buf.tx.push(txRate);
    if (buf.rx.length > RATE_SMOOTH_SAMPLES) buf.rx.shift();
    if (buf.tx.length > RATE_SMOOTH_SAMPLES) buf.tx.shift();
    const smoothRx = buf.rx.reduce((a, b) => a + b, 0) / buf.rx.length;
    const smoothTx = buf.tx.reduce((a, b) => a + b, 0) / buf.tx.length;

    return { ...client, rxRate: smoothRx, txRate: smoothTx, rawRxRate: rxRate, rawTxRate: txRate, totalRx, totalTx };
  }

  _flushHistory() {
    const samples = Object.entries(this._accumulator).map(([mac, acc]) => ({
      mac,
      rxRate: acc.rxRates.length ? acc.rxRates.reduce((a, b) => a + b, 0) / acc.rxRates.length : 0,
      txRate: acc.txRates.length ? acc.txRates.reduce((a, b) => a + b, 0) / acc.txRates.length : 0,
      rxBytes: acc.rxBytes,
      txBytes: acc.txBytes,
    }));

    if (samples.length) {
      db.recordUsage(samples);
    }
    this._accumulator = {};

    // Prune once a day (approximately — check if midnight ± 1min)
    const h = new Date().getHours(), m = new Date().getMinutes();
    if (h === 0 && m === 0) db.pruneOldData(30);
  }
}

module.exports = Poller;
