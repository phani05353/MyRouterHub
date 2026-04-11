'use strict';

const AsusClient = require('./asus-client');
const db = require('./db');

const POLL_INTERVAL_MS = 2000;    // Real-time poll: every 2s
const HISTORY_INTERVAL_MS = 60000; // Write history: every 60s
const RATE_SMOOTH_SAMPLES = 3;    // Rolling average over 3 polls (~6s) — only smooths; accuracy comes from _lastTotalChange
const WAN_POLL_EVERY = 5;         // Poll WAN stats every 5 polls (~10s)

class Poller {
  constructor(config, emitter) {
    this.client = new AsusClient(config);
    this.emit = emitter;           // fn(event, data)
    this.running = false;
    this._prevBytes = {};          // mac → { rx, tx, ts }
    this._sessionTotals = {};      // mac → { rxBytes, txBytes }
    this._rateBuffer = {};         // mac → { rx: number[], tx: number[] }
    this._accumulator = {};        // mac → { rxRates[], txRates[], rxBytes, txBytes }
    this._lastTotalChange = {};    // mac → { rx, tx, ts, rxRate, txRate }
                                   //   tracks when totalRx actually updates so we can
                                   //   compute avg rate over the REAL TA interval, not our 2s poll
    this._prevWan = null;          // { rx, tx, ts }
    this._wanCounter = WAN_POLL_EVERY - 1; // trigger WAN poll on very first cycle
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

      // Accumulate for history flush — use rawRxRate/rawTxRate (pre-smooth)
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

      // Poll WAN stats every WAN_POLL_EVERY polls
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

  // ─── WAN ─────────────────────────────────────────────────────────────────────

  async _pollWan(now) {
    try {
      const wan = await this.client.getNetDev();
      if (wan.wanRx === 0 && wan.wanTx === 0) {
        // Either no WAN data or initial state — don't update prevWan yet
        if (!this._prevWan) return;
      }

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
   * Compute bandwidth rates accurately by tracking when totalRx byte counters
   * actually change (ASUS Traffic Analyzer update cycle, typically 30-120s).
   *
   * Naive approach (previous): diff totalRx against 2s-ago value → 0 for 29 polls,
   * then a 30× spike when TA updates. This approach instead divides the byte diff
   * by the actual elapsed time since the last TA update, giving the true average rate.
   *
   * Falls back to curRx/curTx (TA's pre-averaged rate) when totalRx is unavailable.
   */
  _computeRates(client, now) {
    const mac = client.mac;
    const prev = this._prevBytes[mac]; // used only for session-total fallback

    let rxRate, txRate;

    if (client.totalRx > 0) {
      const last = this._lastTotalChange[mac];

      if (!last) {
        // First time — seed with TA's estimate
        rxRate = client.curRx || 0;
        txRate = client.curTx || 0;
        this._lastTotalChange[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now, rxRate, txRate };

      } else if (client.totalRx !== last.rx || client.totalTx !== last.tx) {
        // Byte counters changed — compute true average rate over the actual TA interval
        const elapsed = (now - last.ts) / 1000;
        if (elapsed >= 1) {
          rxRate = Math.max(0, (client.totalRx - last.rx) / elapsed);
          txRate = Math.max(0, (client.totalTx - last.tx) / elapsed);
        } else {
          rxRate = last.rxRate;
          txRate = last.txRate;
        }
        this._lastTotalChange[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now, rxRate, txRate };

      } else {
        // Counters unchanged — TA hasn't updated yet; hold last computed rate
        rxRate = last.rxRate;
        txRate = last.txRate;
      }

      // Trust the TA explicitly reporting zero (device went idle)
      if (client.curRx === 0 && client.curTx === 0) {
        rxRate = 0;
        txRate = 0;
        // Keep _lastTotalChange so we don't spike if traffic resumes
        this._lastTotalChange[mac] = { ...this._lastTotalChange[mac], rxRate: 0, txRate: 0 };
      }
    } else {
      // No byte counters (some firmware) — use TA's pre-averaged rates
      rxRate = client.curRx || 0;
      txRate = client.curTx || 0;
    }

    this._prevBytes[mac] = { rx: client.totalRx, tx: client.totalTx, ts: now };

    // ─── Session totals ──────────────────────────────────────────────────────
    // Use router's totalRx directly when available (most accurate).
    // Fallback: integrate raw rate × dt when totalRx is 0.
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

    // ─── Smoothing (display only) ───────────────────────────────────────────
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

    // Prune once a day (check midnight ± 1min)
    const h = new Date().getHours(), m = new Date().getMinutes();
    if (h === 0 && m === 0) db.pruneOldData(30);
  }
}

module.exports = Poller;
