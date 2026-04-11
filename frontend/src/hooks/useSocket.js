import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || '';
const WINDOW = 60; // keep last 60 data points (~2 min at 2s poll)

// Pre-load the last 2 minutes of history from the REST API for a list of MACs
async function prefetchHistory(macs) {
  const now = Math.floor(Date.now() / 1000);
  const start = now - 120;
  const results = {};
  await Promise.allSettled(
    macs.map(async (mac) => {
      try {
        const res = await fetch(`/api/devices/${mac}/history?start=${start}&end=${now}&bucket=2`);
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) {
          results[mac] = rows.map((r) => ({
            ts: r.bucket * 1000,
            rxRate: r.avgRxRate,
            txRate: r.avgTxRate,
          })).slice(-WINDOW);
        }
      } catch (_) {}
    })
  );
  return results;
}

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected]         = useState(false);
  const [routerConnected, setRouterConnected] = useState(false);
  const [routerError, setRouterError]     = useState(null);
  const [clients, setClients]             = useState([]);

  const historyRef  = useRef({});
  const [history, setHistory] = useState({});
  const seenMacs    = useRef(new Set());
  const [wanRates, setWanRates] = useState(null); // null until first 'wan' event

  const pushHistory = useCallback((clientList) => {
    const now = Date.now();
    const next = { ...historyRef.current };
    for (const c of clientList) {
      const prev = next[c.mac] || [];
      next[c.mac] = [...prev, { ts: now, rxRate: c.rxRate, txRate: c.txRate }].slice(-WINDOW);
    }
    historyRef.current = next;
    setHistory(next);
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('status', ({ connected: rc, error }) => {
      setRouterConnected(rc);
      setRouterError(error);
    });

    socket.on('wan', (data) => setWanRates(data));

    socket.on('clients', async (list) => {
      setClients(list);

      // On the first batch, pre-fetch recent history from the REST API
      const newMacs = list.map((c) => c.mac).filter((m) => !seenMacs.current.has(m));
      if (newMacs.length > 0) {
        newMacs.forEach((m) => seenMacs.current.add(m));
        const prefetched = await prefetchHistory(newMacs);
        historyRef.current = { ...historyRef.current, ...prefetched };
      }

      pushHistory(list);
    });

    return () => { socket.disconnect(); };
  }, [pushHistory]);

  return { connected, routerConnected, routerError, clients, history, wanRates };
}
