'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'routerhub.db'));

// Enable WAL for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    mac       TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    ip        TEXT,
    vendor    TEXT,
    type      TEXT,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    mac       TEXT NOT NULL,
    ts        INTEGER NOT NULL,   -- unix epoch seconds
    rx_bytes  REAL NOT NULL DEFAULT 0,
    tx_bytes  REAL NOT NULL DEFAULT 0,
    rx_rate   REAL NOT NULL DEFAULT 0,  -- bytes/s
    tx_rate   REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (mac) REFERENCES devices(mac)
  );

  CREATE INDEX IF NOT EXISTS idx_usage_mac_ts ON usage_history (mac, ts);
  CREATE INDEX IF NOT EXISTS idx_usage_ts     ON usage_history (ts);
`);

// ─── Devices ────────────────────────────────────────────────────────────────

const upsertDevice = db.prepare(`
  INSERT INTO devices (mac, name, ip, vendor, type, first_seen, last_seen)
  VALUES (@mac, @name, @ip, @vendor, @type, @now, @now)
  ON CONFLICT(mac) DO UPDATE SET
    name      = COALESCE(NULLIF(@name, ''),   devices.name),
    ip        = COALESCE(NULLIF(@ip,  ''),    devices.ip),
    vendor    = COALESCE(NULLIF(@vendor,''),  devices.vendor),
    type      = @type,
    last_seen = @now
`);

function upsertDevices(clients) {
  const now = Date.now();
  const update = db.transaction((list) => {
    for (const c of list) {
      upsertDevice.run({ mac: c.mac, name: c.name, ip: c.ip, vendor: c.vendor, type: c.type, now });
    }
  });
  update(clients);
}

function getAllDevices() {
  return db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
}

function getDevice(mac) {
  return db.prepare('SELECT * FROM devices WHERE mac = ?').get(mac);
}

// ─── Usage History ───────────────────────────────────────────────────────────

const insertUsage = db.prepare(`
  INSERT INTO usage_history (mac, ts, rx_bytes, tx_bytes, rx_rate, tx_rate)
  VALUES (@mac, @ts, @rxBytes, @txBytes, @rxRate, @txRate)
`);

function recordUsage(samples) {
  const ts = Math.floor(Date.now() / 1000);
  const insert = db.transaction((list) => {
    for (const s of list) {
      if (s.rxRate > 0 || s.txRate > 0 || s.rxBytes > 0) {
        insertUsage.run({ mac: s.mac, ts, rxBytes: s.rxBytes, txBytes: s.txBytes, rxRate: s.rxRate, txRate: s.txRate });
      }
    }
  });
  insert(samples);
}

/**
 * Get usage history for one device within [startTs, endTs].
 * Aggregated into `bucketSeconds` buckets (avg rate, total bytes).
 */
function getDeviceHistory(mac, startTs, endTs, bucketSeconds = 60) {
  return db.prepare(`
    SELECT
      (ts / @bucket * @bucket) AS bucket,
      AVG(rx_rate)  AS avgRxRate,
      AVG(tx_rate)  AS avgTxRate,
      MAX(rx_bytes) AS maxRxBytes,
      MAX(tx_bytes) AS maxTxBytes
    FROM usage_history
    WHERE mac = @mac AND ts BETWEEN @start AND @end
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all({ mac, start: startTs, end: endTs, bucket: bucketSeconds });
}

/**
 * Get per-device totals for a time range.
 */
function getTopDevices(startTs, endTs, limit = 20) {
  return db.prepare(`
    SELECT
      h.mac,
      d.name,
      d.vendor,
      d.type,
      MAX(h.rx_bytes)           AS totalRx,
      MAX(h.tx_bytes)           AS totalTx,
      AVG(h.rx_rate)            AS avgRxRate,
      AVG(h.tx_rate)            AS avgTxRate
    FROM usage_history h
    JOIN devices d ON d.mac = h.mac
    WHERE h.ts BETWEEN @start AND @end
    GROUP BY h.mac
    ORDER BY (MAX(h.rx_bytes) + MAX(h.tx_bytes)) DESC
    LIMIT @limit
  `).all({ start: startTs, end: endTs, limit });
}

/**
 * Prune records older than retentionDays.
 */
function pruneOldData(retentionDays = 30) {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  const info = db.prepare('DELETE FROM usage_history WHERE ts < ?').run(cutoff);
  return info.changes;
}

module.exports = { upsertDevices, getAllDevices, getDevice, recordUsage, getDeviceHistory, getTopDevices, pruneOldData };
