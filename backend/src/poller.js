'use strict';

const AsusClient = require('./asus-client');
const db = require('./db');

const POLL_INTERVAL_MS = 2000;     // Real-time poll: every 2s
const HISTORY_INTERVAL_MS = 60000;  // Write history: every 60s
const RATE_SMOOTH_SAMPLES = 2;     // 2-sample smoothing (~4s) — minimal noise reduction
const WAN_POLL_EVERY = 5;          // Poll WAN stats every 5 polls (~10s)

class Poller {
  constructor(config, emitter) {
    this.client = new AsusClient(config);
    this.emit = emitter;
    this.running = false;

    // Session tracking: remember the first totalRx we saw for each device, so
    // "Total Downloaded" shows bytes since RouterHub started watching this device
    // — NOT the router's lifetime counter (which is always much larger).
    this._sessionBase   = {};     // mac → { baseRx, baseTx }
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
   * RATES: use the router's own curRx/curTx directly.
   *   These are the same values shown in the router's Traffic Analyzer UI,
   *   so RouterHub's per-device rates match the router's display by construction.
   *   Only fall back to totalRx diff when curRx/curTx aren't provided.
   *
   * TOTALS: show delta since RouterHub first saw the device — NOT the router's
   *   lifetime counter. The router's counter accumulates since the device first
   *   connected (or Traffic Analyzer was enabled), which is always much larger
   *   than what the user expects from any rolling-window view in the router UI.
   */
  _computeRates(client, now) {
    const mac = client.mac;
    const prev = this._prevBytes[mac];

    // ── Rates: trust the router's curRx/curTx (matches router UI) ──
    let rxRate = client.curRx || 0;
    let txRate = client.curTx || 0;

    // Fallback only when the router doesn't provide curRx/curTx — derive from
    // the cumulative counter diff over the 2s poll interval.
    if (rxRate === 0 && txRate === 0 && client.totalRx > 0 && prev) {
      const dt = (now - prev.ts) / 1000;
      if (dt > 0) {
        rxRate = Math.max(0, (client.totalRx - prev.rx) / dt);
        txRate = Math.max(0, (client.totalTx - prev.tx) / dt);
      }
    }

    this._prevBytes[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now };

    // ── Totals: delta since RouterHub started watching this device ──
    if (!this._sessionBase[mac]) {
      this._sessionBase[mac] = {
        baseRx: client.totalRx || 0,
        baseTx: client.totalTx || 0,
      };
    }
    const base = this._sessionBase[mac];

    // Detect counter reset (device reconnected or router rebooted) and rebase
    if (client.totalRx > 0 && client.totalRx < base.baseRx) {
      base.baseRx = client.totalRx;
      base.baseTx = client.totalTx;
    }

    let totalRx = 0, totalTx = 0;
    if (client.totalRx > 0) {
      totalRx = Math.max(0, client.totalRx - base.baseRx);
      totalTx = Math.max(0, client.totalTx - base.baseTx);
    }

    // ── Light smoothing for display stability only ──
    if (!this._rateBuffer[mac]) this._rateBuffer[mac] = { rx: [], tx: [] };
    const buf = this._rateBuffer[mac];
    buf.rx.push(rxRate);
    buf.tx.push(txRate);
    if (buf.rx.length > RATE_SMOOTH_SAMPLES) buf.rx.shift();
    if (buf.tx.length > RATE_SMOOTH_SAMPLES) buf.tx.shift();
    const smoothRx = buf.rx.reduce((a, b) => a + b, 0) / buf.rx.length;
    const smoothTx = buf.tx.reduce((a, b) => a + b, 0) / buf.tx.length;

    return {
      ...client,
      rxRate: smoothRx,
      txRate: smoothTx,
      rawRxRate: rxRate,
      rawTxRate: txRate,
      totalRx,
      totalTx,
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
