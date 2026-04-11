import React, { useState, useMemo, useEffect } from 'react';
import DeviceCard from './DeviceCard';
import DeviceDetail from './DeviceDetail';
import TotalBandwidth from './TotalBandwidth';

const SORT_OPTIONS = [
  { value: 'rx',   label: '↓ Download' },
  { value: 'tx',   label: '↑ Upload' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
];

const PINNED_KEY = 'routerhub:pinned';

function loadPinned() {
  try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')); }
  catch { return new Set(); }
}

function savePinned(set) {
  localStorage.setItem(PINNED_KEY, JSON.stringify([...set]));
}

export default function Dashboard({ clients, history, routerConnected, routerError }) {
  const [sort, setSort]     = useState('rx');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [pinned, setPinned] = useState(loadPinned);

  // Persist pinned to localStorage
  useEffect(() => { savePinned(pinned); }, [pinned]);

  const togglePin = (mac) => {
    setPinned((prev) => {
      const next = new Set(prev);
      next.has(mac) ? next.delete(mac) : next.add(mac);
      return next;
    });
  };

  const sorted = useMemo(() => {
    let list = clients.filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.ip.includes(q) || c.mac.toLowerCase().includes(q);
    });
    if (sort === 'rx')   list = [...list].sort((a, b) => (b.rxRate || 0) - (a.rxRate || 0));
    if (sort === 'tx')   list = [...list].sort((a, b) => (b.txRate || 0) - (a.txRate || 0));
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'type') list = [...list].sort((a, b) => (a.type || '').localeCompare(b.type || ''));
    return list;
  }, [clients, sort, search]);

  const pinnedDevices = sorted.filter((c) => pinned.has(c.mac));
  const otherDevices  = sorted.filter((c) => !pinned.has(c.mac));

  if (!routerConnected && clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </div>
        <p className="text-slate-300 font-semibold mb-1">Cannot reach router</p>
        <p className="text-sm text-slate-500 max-w-xs">
          {routerError || 'Check that the router IP and credentials in your .env file are correct.'}
        </p>
      </div>
    );
  }

  const grid = (devices) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {devices.map((c) => (
        <DeviceCard
          key={c.mac}
          client={c}
          history={history[c.mac]}
          onClick={() => setSelected(c)}
          pinned={pinned.has(c.mac)}
          onTogglePin={togglePin}
        />
      ))}
    </div>
  );

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      {/* Total bandwidth widget */}
      <TotalBandwidth clients={clients} history={history} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices…"
            className="w-full bg-surface-card border border-surface-border rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand/60 transition-colors"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-600 mr-1">Sort:</span>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setSort(o.value)}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors font-mono ${
                sort === o.value
                  ? 'bg-brand text-white shadow-[0_0_8px_rgba(59,130,246,0.35)]'
                  : 'bg-surface-card border border-surface-border text-slate-500 hover:text-slate-300'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Device count */}
        <div className="flex items-center gap-1.5 sm:ml-auto text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          {clients.length} online
        </div>
      </div>

      {/* Pinned section */}
      {pinnedDevices.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <span className="text-xs font-semibold text-yellow-400/80 uppercase tracking-wider">Pinned</span>
          </div>
          {grid(pinnedDevices)}
        </section>
      )}

      {/* All devices section */}
      {otherDevices.length === 0 && pinnedDevices.length === 0 ? (
        <p className="text-center text-slate-600 py-16">No devices match your search.</p>
      ) : otherDevices.length > 0 && (
        <section>
          {pinnedDevices.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4" strokeLinecap="round"/>
              </svg>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">All Devices</span>
            </div>
          )}
          {grid(otherDevices)}
        </section>
      )}

      {/* Detail modal */}
      {selected && (
        <DeviceDetail
          client={clients.find((c) => c.mac === selected.mac) || selected}
          history={history[selected.mac]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
