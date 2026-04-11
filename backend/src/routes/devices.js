'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/devices — all known devices
router.get('/', (req, res) => {
  try {
    const devices = db.getAllDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/:mac/history?start=&end=&bucket=
router.get('/:mac/history', (req, res) => {
  try {
    const { mac } = req.params;
    const now = Math.floor(Date.now() / 1000);
    const start = parseInt(req.query.start) || now - 3600; // default 1 hour
    const end = parseInt(req.query.end) || now;
    const bucket = parseInt(req.query.bucket) || 60;

    const history = db.getDeviceHistory(mac.toUpperCase(), start, end, bucket);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/:mac/daily?days=7
router.get('/:mac/daily', (req, res) => {
  try {
    const { mac } = req.params;
    const days = parseInt(req.query.days) || 7;
    const data = db.getDeviceDailyUsage(mac.toUpperCase(), days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/top?start=&end=&limit=
router.get('/top', (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = parseInt(req.query.start) || now - 86400; // default 24h
    const end = parseInt(req.query.end) || now;
    const limit = parseInt(req.query.limit) || 20;

    const top = db.getTopDevices(start, end, limit);
    res.json(top);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
