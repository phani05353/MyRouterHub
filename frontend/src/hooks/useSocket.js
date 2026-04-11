import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || '';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [routerConnected, setRouterConnected] = useState(false);
  const [routerError, setRouterError] = useState(null);

  // Real-time client list: mac → client object
  const [clients, setClients] = useState([]);

  // Sliding window history for spark charts: mac → [{ts, rxRate, txRate}, ...]
  const historyRef = useRef({});
  const [history, setHistory] = useState({});

  const WINDOW = 60; // keep last 60 data points (~2 min at 2s poll)

  const pushHistory = useCallback((clientList) => {
    const now = Date.now();
    const next = { ...historyRef.current };
    for (const c of clientList) {
      const prev = next[c.mac] || [];
      const updated = [...prev, { ts: now, rxRate: c.rxRate, txRate: c.txRate }].slice(-WINDOW);
      next[c.mac] = updated;
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

    socket.on('clients', (list) => {
      setClients(list);
      pushHistory(list);
    });

    return () => { socket.disconnect(); };
  }, [pushHistory]);

  return { connected, routerConnected, routerError, clients, history };
}
