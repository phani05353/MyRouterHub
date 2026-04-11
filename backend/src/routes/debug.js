'use strict';

const express = require('express');
const AsusClient = require('../asus-client');
const router = express.Router();

// GET /api/debug/login
// Attempts login and returns raw response details — useful for diagnosing auth issues.
// WARNING: never expose this route publicly; it confirms valid credentials.
router.get('/login', async (req, res) => {
  const client = new AsusClient({
    ip:       process.env.ROUTER_IP       || '192.168.50.1',
    username: process.env.ROUTER_USER     || 'admin',
    password: process.env.ROUTER_PASS     || 'admin',
    protocol: process.env.ROUTER_PROTOCOL || 'http',
  });

  const result = await client.debugLogin();
  res.json(result);
});

// GET /api/debug/clients
// Attempts login + clientlist fetch and returns raw + parsed data from both hooks.
router.get('/clients', async (req, res) => {
  const client = new AsusClient({
    ip:       process.env.ROUTER_IP       || '192.168.50.1',
    username: process.env.ROUTER_USER     || 'admin',
    password: process.env.ROUTER_PASS     || 'admin',
    protocol: process.env.ROUTER_PROTOCOL || 'http',
  });

  try {
    const [main, all] = await Promise.allSettled([
      client.appGet('get_clientlist()'),
      client.appGet('get_allclientlist()'),
    ]);
    const parsed = await client.getClientList();
    res.json({
      get_clientlist:    main.status === 'fulfilled' ? main.value    : { error: main.reason?.message },
      get_allclientlist: all.status  === 'fulfilled' ? all.value     : { error: all.reason?.message },
      parsed_count: parsed.length,
      parsed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
