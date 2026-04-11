import React, { useState, useMemo } from 'react';
import DeviceCard from './DeviceCard';
import DeviceDetail from './DeviceDetail';
import TotalBandwidth from './TotalBandwidth';

const SORT_OPTIONS = [
  { value: 'rx',   label: '↓ Download' },
  { value: 'tx',   label: '↑ Upload' },
  { value: 'name', label: 'Name' },
  { value: 'type', label: 'Type' },
];

export default function Dashboard({ clients, history, routerConnected, routerError }) {
  const [sort, setSort] = useState('rx');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

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

  if (!routerConnected && clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <svg className="w-12 h-12 text-slate-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <p className="text-slate-400 font-medium mb-1">Cannot reach router</p>
        <p className="text-sm text-slate-600 max-w-xs">
          {routerError || 'Check that the router IP and credentials in your .env file are correct.'}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Total bandwidth widget */}
      <TotalBandwidth clients={clients} history={history} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search devices…"
            className="w-full bg-surface-card border border-surface-border rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand transition-colors"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Sort:</span>
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setSort(o.value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-mono ${
                sort === o.value ? 'bg-brand text-white' : 'bg-surface-card border border-surface-border text-slate-400 hover:text-white'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Device count */}
        <div className="flex items-center gap-1.5 ml-auto text-sm text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
          {clients.length} online
        </div>
      </div>

      {/* Device grid */}
      {sorted.length === 0 ? (
        <p className="text-center text-slate-600 py-16">No devices match your search.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((c) => (
            <DeviceCard
              key={c.mac}
              client={c}
              history={history[c.mac]}
              onClick={() => setSelected(c)}
            />
          ))}
        </div>
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
