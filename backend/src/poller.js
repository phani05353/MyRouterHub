'use strict';

const AsusClient = require('./asus-client');
const db = require('./db');

const POLL_INTERVAL_MS = 2000;     // Real-time poll: every 2s
const HISTORY_INTERVAL_MS = 60000;  // Write history: every 60s
const RATE_SMOOTH_SAMPLES = 2;     // 2-sample smoothing (~4s) — minimal noise reduction
const WAN_POLL_EVERY = 1;          // Poll WAN every cycle (~2s) — it's the most accurate real-time signal

class Poller {
  constructor(config, emitter) {
    this.client = new AsusClient(config);
    this.emit = emitter;
    this.running = false;

    // Session totals: this firmware returns empty totalRx/totalTx for every client,
    // so we can't diff cumulative counters. Integrate smoothed rates over time
    // (rate × dt) to estimate bytes-since-RouterHub-started per device.
    this._sessionTotals = {};     // mac → { rx, tx, lastTs }
    this._rateBuffer    = {};     // mac → { rx: number[], tx: number[] }
    this._accumulator   = {};     // mac → { rxRates[], txRates[], rxBytes, txBytes }
    this._prevBytes     = {};     // mac → { rx, tx, ts } — for rate fallback when curRx=0
    this._prevWan       = null;   // { rx, tx, ts }
    this._wanCounter    = WAN_POLL_EVERY - 1; // WAN poll fires on first cycle

    this._historyTimer  = null;
    this._pollTimer     = null;
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

      db.upsertDevices(clients);

      const now = Date.now();
      const enriched = clients.map((c) => this._computeRates(c, now));

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

      this._wanCounter++;
      if (this._wanCounter >= WAN_POLL_EVERY) {
        this._wanCounter = 0;
        this._pollWan(now);
      }
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

  // ─── WAN polling ─────────────────────────────────────────────────────────────

  async _pollWan(now) {
    try {
      const wan = await this.client.getNetDev();
      if (wan.wanRx === 0 && wan.wanTx === 0 && !this._prevWan) return;

      const prev = this._prevWan;
      let rxRate = 0, txRate = 0;

      if (prev && wan.wanRx >= prev.rx && wan.wanTx >= prev.tx) {
        const dt = (now - prev.ts) / 1000;
        if (dt > 0) {
          rxRate = (wan.wanRx - prev.rx) / dt;
          txRate = (wan.wanTx - prev.tx) / dt;
        }
      }

      this._prevWan = { rx: wan.wanRx, tx: wan.wanTx, ts: now };
      this.emit('wan', { rxRate, txRate });
    } catch (err) {
      console.error('[poller] WAN poll failed:', err.message);
    }
  }

  // ─── Per-device rate computation ─────────────────────────────────────────────

  /**
   * RATES: use the router's own curRx/curTx directly — same values as the
   *   router's Traffic Analyzer UI. NOTE: ASUS TA samples on a slow internal
   *   cycle, so per-device peaks are damped (a 4K stream may show as ~1 Mbps
   *   instead of 15–25 Mbps). The true real-time internet throughput comes
   *   from WAN byte-counter diffs (see _pollWan), which is what the user sees
   *   in the "Internet (WAN)" row.
   *
   * TOTALS: this firmware returns empty totalRx/totalTx per client, so we
   *   integrate smoothed rates over time (rate × dt) to get session totals.
   */
  _computeRates(client, now) {
    const mac  = client.mac;
    const prev = this._prevBytes[mac];

    let rxRate = client.curRx || 0;
    let txRate = client.curTx || 0;

    // Fallback only if firmware exposes totalRx/totalTx (this one doesn't)
    if (rxRate === 0 && txRate === 0 && client.totalRx > 0 && prev) {
      const dt = (now - prev.ts) / 1000;
      if (dt > 0) {
        rxRate = Math.max(0, (client.totalRx - prev.rx) / dt);
        txRate = Math.max(0, (client.totalTx - prev.tx) / dt);
      }
    }
    this._prevBytes[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now };

    // Smoothing
    if (!this._rateBuffer[mac]) this._rateBuffer[mac] = { rx: [], tx: [] };
    const buf = this._rateBuffer[mac];
    buf.rx.push(rxRate);
    buf.tx.push(txRate);
    if (buf.rx.length > RATE_SMOOTH_SAMPLES) buf.rx.shift();
    if (buf.tx.length > RATE_SMOOTH_SAMPLES) buf.tx.shift();
    const smoothRx = buf.rx.reduce((a, b) => a + b, 0) / buf.rx.length;
    const smoothTx = buf.tx.reduce((a, b) => a + b, 0) / buf.tx.length;

    // Integrate smoothed rates into session totals (bytes since RouterHub started)
    if (!this._sessionTotals[mac]) {
      this._sessionTotals[mac] = { rx: 0, tx: 0, lastTs: now };
    }
    const st = this._sessionTotals[mac];
    const dt = (now - st.lastTs) / 1000;
    if (dt > 0 && dt < 30) { // skip long gaps (device offline, clock jump)
      st.rx += smoothRx * dt;
      st.tx += smoothTx * dt;
    }
    st.lastTs = now;

    return {
      ...client,
      rxRate: smoothRx,
      txRate: smoothTx,
      rawRxRate: rxRate,
      rawTxRate: txRate,
      totalRx: st.rx,
      totalTx: st.tx,
    };
  }

  // ─── History flush ────────────────────────────────────────────────────────────

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

    const h = new Date().getHours(), m = new Date().getMinutes();
    if (h === 0 && m === 0) db.pruneOldData(30);
  }
}

module.exports = Poller;
