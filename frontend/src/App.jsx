import React from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import { useSocket } from './hooks/useSocket';

export default function App() {
  const { connected, routerConnected, routerError, clients, history, wanRates } = useSocket();

  return (
    <div className="min-h-screen flex flex-col">
      <Header connected={connected} routerConnected={routerConnected} routerError={routerError} />
      <main className="flex-1">
        <Dashboard
          clients={clients}
          history={history}
          routerConnected={routerConnected}
          routerError={routerError}
          wanRates={wanRates}
        />
      </main>
    </div>
  );
}
