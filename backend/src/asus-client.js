'use strict';

const axios = require('axios');
const https = require('https');

/**
 * ASUS Router API Client
 * Supports ASUS stock firmware (AX6600 / ZenWiFi / RT-AX series)
 *
 * Auth:   POST /login.cgi  →  asus_token (cookie or body)
 * Data:   POST /appGet.cgi with hook=...
 */

class AsusClient {
  constructor(config) {
    this.ip       = config.ip       || '192.168.50.1';
    this.username = config.username || 'admin';
    this.password = config.password || 'admin';
    this.protocol = config.protocol || 'http';
    this.token    = null;
    this.tokenExpiry = null;

    this.http = axios.create({
      baseURL: `${this.protocol}://${this.ip}`,
      timeout: 10000,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  }

  get origin() {
    return `${this.protocol}://${this.ip}`;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  async login() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    // ASUS firmware checks Referer/Origin — requests without them are rejected.
    const res = await this.http.post(
      '/login.cgi',
      new URLSearchParams({ login_authorization: credentials }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.origin}/`,
          'Origin':  this.origin,
          'User-Agent': 'Mozilla/5.0 RouterHub/1.0',
        },
        // Follow redirects — some firmware versions redirect after login
        maxRedirects: 5,
        validateStatus: () => true, // never throw on HTTP status
      }
    );

    const token = this._extractToken(res);

    if (!token) {
      // Provide as much context as possible so the problem is diagnosable
      const preview = JSON.stringify(res.data).slice(0, 300);
      const cookies = JSON.stringify(res.headers['set-cookie'] || null);
      throw new Error(
        `Login failed (HTTP ${res.status}). ` +
        `No asus_token in cookies (${cookies}) or body (${preview}). ` +
        `Verify ROUTER_IP, ROUTER_USER, ROUTER_PASS in .env`
      );
    }

    this.token = token;
    this.tokenExpiry = Date.now() + 25 * 60 * 1000; // 25-min sliding window
    return token;
  }

  /** Pull asus_token from Set-Cookie header or response body. */
  _extractToken(res) {
    // 1. Set-Cookie header (most common)
    const rawCookies = res.headers['set-cookie'];
    if (rawCookies) {
      const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      for (const c of cookies) {
        const m = c.match(/asus_token=([^;,\s]+)/i);
        if (m && m[1] && m[1] !== 'deleted') return m[1];
      }
    }

    // 2. JSON body  { asus_token: "..." }
    if (res.data) {
      try {
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        if (body.asus_token) return body.asus_token;
        if (body.token)      return body.token;
      } catch (_) {}

      // 3. Plain-text token (some older firmware just returns the token string)
      if (typeof res.data === 'string') {
        const t = res.data.trim();
        if (t && t.length < 128 && !/[\s<>{]/.test(t)) return t;
      }
    }

    return null;
  }

  async ensureAuth() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.login();
    }
  }

  // ─── Raw API call ─────────────────────────────────────────────────────────

  /**
   * POST /appGet.cgi with a hook string.
   * Returns parsed JSON (or raw string if parsing fails).
   */
  async appGet(hook) {
    await this.ensureAuth();

    const res = await this.http.post(
      '/appGet.cgi',
      new URLSearchParams({ hook }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie':   `asus_token=${this.token}`,
          'Referer':  `${this.origin}/`,
          'Origin':   this.origin,
          'User-Agent': 'Mozilla/5.0 RouterHub/1.0',
        },
        validateStatus: () => true,
      }
    );

    if (res.status === 401 || res.status === 403) {
      // Token expired mid-session — force re-auth once
      this.token = null;
      return this.appGet(hook);
    }

    if (typeof res.data === 'string') {
      try { return JSON.parse(res.data); } catch (_) { return res.data; }
    }
    return res.data;
  }

  // ─── Debug helper (used by /api/debug route) ──────────────────────────────

  /**
   * Returns raw login response details without throwing.
   * Used by the debug endpoint to diagnose auth problems.
   */
  async debugLogin() {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');

    let res;
    try {
      res = await this.http.post(
        '/login.cgi',
        new URLSearchParams({ login_authorization: credentials }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': `${this.origin}/`,
            'Origin':  this.origin,
            'User-Agent': 'Mozilla/5.0 RouterHub/1.0',
          },
          maxRedirects: 5,
          validateStatus: () => true,
        }
      );
    } catch (err) {
      return { error: err.message, step: 'request' };
    }

    const token = this._extractToken(res);
    return {
      status:      res.status,
      headers:     res.headers,
      body:        typeof res.data === 'string' ? res.data.slice(0, 500) : res.data,
      tokenFound:  !!token,
      token:       token ? `${token.slice(0, 6)}…` : null, // partial — never log full token
    };
  }

  // ─── Domain helpers ──────────────────────────────────────────────────────

  /**
   * Returns all connected clients with per-device stats.
   * Traffic fields (curRx/curTx) are non-zero only if Traffic Analyzer
   * is enabled in the router (Advanced Settings → Traffic Analyzer).
   */
  async getClientList() {
    // ZenWiFi mesh routers report all clients (across nodes) in get_clientlist().
    // Some firmware also exposes get_allclientlist() — try both and merge.
    const [mainData, allData] = await Promise.allSettled([
      this.appGet('get_clientlist()'),
      this.appGet('get_allclientlist()'),
    ]);

    const sources = [];
    if (mainData.status === 'fulfilled') sources.push(mainData.value.get_clientlist || mainData.value);
    if (allData.status  === 'fulfilled') sources.push(allData.value.get_allclientlist || allData.value);

    // Merge unique MACs from all sources
    const seen = new Map(); // MAC → client object

    for (const cl of sources) {
      if (!cl || typeof cl !== 'object') continue;

      // Extract MAC list — router sends "<MAC1><MAC2>..." or an array
      let macs = [];
      if (cl.maclist) {
        if (typeof cl.maclist === 'string') {
          macs = cl.maclist.match(/([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}/g) || [];
        } else if (Array.isArray(cl.maclist)) {
          macs = cl.maclist;
        }
      } else {
        // Fallback: every key that looks like a MAC is a client entry
        macs = Object.keys(cl).filter((k) => /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/i.test(k));
      }

      for (const rawMac of macs) {
        const mac = rawMac.toUpperCase().replace(/-/g, ':');
        if (seen.has(mac)) continue; // prefer first source

        const c = cl[rawMac] || cl[mac] || cl[rawMac.toLowerCase()] || {};

        // isOnline: different firmware versions use different field names / values
        const online =
          c.isOnline === '1' || c.isOnline === 1 ||
          c.online   === '1' || c.online   === 1 ||
          c.status   === '1' || c.status   === 1 ||
          // If no online field at all but the entry exists in the maclist, assume online
          (c.isOnline === undefined && c.online === undefined && c.status === undefined && !!c.ip);

        // Determine connection type from rssi:
        //   rssi is a negative dBm value for wireless devices (e.g. "-65")
        //   rssi is empty or "0" for wired devices
        const rssiVal = parseFloat(c.rssi);
        const isWireless = rssiVal < 0;
        const node = c.associatedNode || c.aimesh_node || '';
        let connectionType = 'wired';
        if (node && !isWireless) connectionType = 'mesh';
        else if (isWireless)     connectionType = 'wifi';

        seen.set(mac, {
          mac,
          ip:      c.ip      || '',
          name:    c.nickName || c.name || c.dpiDevice || c.ip || mac,
          isOnline: online,
          // Router reports curRx/curTx in Kbps (kilobits/s) from the router's perspective:
          //   curRx = router receives from device = device upload
          //   curTx = router transmits to device  = device download
          // We flip them so curRx = device download, curTx = device upload
          // Convert Kbps → bytes/s: × 1000 ÷ 8 = × 125
          curRx:   (parseFloat(c.curTx)   || 0) * 125,  // device download
          curTx:   (parseFloat(c.curRx)   || 0) * 125,  // device upload
          // totalRx/totalTx are in KB — convert to bytes (often 0 on some firmware)
          totalRx: (parseFloat(c.totalTx) || 0) * 1024,
          totalTx: (parseFloat(c.totalRx) || 0) * 1024,
          vendor:  c.vendor || '',
          connectionType,           // 'wired' | 'wifi' | 'mesh'
          type:    c.type   || '0', // ASUS device category code (not band)
          rssi:    c.rssi   || '',
          node,
        });
      }
    }

    return Array.from(seen.values()).filter((c) => c.isOnline);
  }

  async getNetDev() {
    const data = await this.appGet('netdev(appobj)');
    const nd = data.netdev || data;

    // Some firmware returns values as decimal strings, others as hex ("0x7a3b...").
    // parseFloat("0x1234") = 0 in JS — must handle hex explicitly.
    function parseNetBytes(val) {
      if (val == null || val === '') return 0;
      const s = String(val).trim();
      if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s, 16) || 0;
      return parseFloat(s) || 0;
    }

    // Try all field name conventions seen across ASUS firmware versions.
    // INTERNET_rx/tx is most common; some routers use WAN_ or ppp0_ prefix.
    const wanRx =
      parseNetBytes(nd.INTERNET_rx) ||
      parseNetBytes(nd.WAN_rx)      ||
      parseNetBytes(nd.wan_rx)      ||
      parseNetBytes(nd.ppp0_rx)     || 0;

    const wanTx =
      parseNetBytes(nd.INTERNET_tx) ||
      parseNetBytes(nd.WAN_tx)      ||
      parseNetBytes(nd.wan_tx)      ||
      parseNetBytes(nd.ppp0_tx)     || 0;

    return { wanRx, wanTx };
  }

  /** Returns raw netdev(appobj) response — used by the debug endpoint. */
  async getNetDevRaw() {
    return this.appGet('netdev(appobj)');
  }

  async getTrafficMeter() {
    try {
      const data = await this.appGet('get_traffic_meter_daily()');
      return data.get_traffic_meter_daily || data;
    } catch (_) { return {}; }
  }
}

module.exports = AsusClient;
