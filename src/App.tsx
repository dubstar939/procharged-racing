/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import { socket } from './services/socket';
import { Player, CAR_TYPES, RaceMode } from './types';

export default function App() {
  const [view, setView] = useState<'landing' | 'game'>('landing');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [selectedCar, setSelectedCar] = useState('balanced');
  const [cpuCount, setCpuCount] = useState(3);

  useEffect(() => {
    socket.on('init', ({ id, players: initialPlayers }) => {
      setPlayers(initialPlayers);
    });

    socket.on('gameStarted', ({ players: initialPlayers }) => {
      setPlayers(initialPlayers);
      setView('game');
    });

    return () => {
      socket.off('init');
      socket.off('gameStarted');
    };
  }, []);

  const handleStartGame = () => {
    socket.emit('startGame', { cpuCount });
  };

  const handleCarSelect = (type: string) => {
    setSelectedCar(type);
    // In single player, we can just update local state or tell server
  };

  return (
    <div 
      className={`min-h-screen flex flex-col items-center ${view === 'game' ? 'justify-start bg-slate-900' : 'justify-center'} font-sans text-slate-100 relative overflow-hidden`}
      style={view !== 'game' ? {
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.6), rgba(15, 23, 42, 0.8)), url('https://ais-pre-efrpbwan3gem77t3ahkbm4-19220502019.us-east1.run.app/api/attachments/racing-bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : {}}
    >
      <header className={`w-full max-w-4xl mx-auto ${view === 'game' ? 'p-2' : 'p-6'} flex justify-between items-center transition-all z-10`}>
        <h1 className={`${view === 'game' ? 'text-2xl' : 'text-6xl'} font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-pink-500 via-purple-500 to-blue-500 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] transform -skew-x-12 transition-all uppercase`}>
          PRO CHARGED<br/>
          <span className="text-yellow-400 text-[0.8em] tracking-widest">RACING</span>
        </h1>
      </header>

      <main className={`flex-1 w-full flex flex-col items-center ${view === 'game' ? 'p-0' : 'p-4'} transition-all z-10`}>
        {view === 'landing' && (
          <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10 max-w-2xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h2 className="text-2xl font-bold mb-6 text-white/90">Select Your Machine</h2>
                <div className="grid grid-cols-1 gap-3">
                    {Object.entries(CAR_TYPES).map(([id, car]) => (
                        <button
                            key={id}
                            onClick={() => handleCarSelect(id)}
                            className={`p-4 rounded-xl border-2 transition-all text-left flex justify-between items-center ${
                                selectedCar === id 
                                ? 'border-pink-500 bg-pink-500/10' 
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                        >
                            <div>
                                <div className="font-bold text-lg">{car.name}</div>
                                <div className="text-xs text-slate-400">
                                    {car.bodyStyle} Body | {car.spoilerType} Spoiler
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full border border-white/20" style={{ backgroundColor: car.color }}></div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col justify-between">
                <div>
                    <h3 className="text-lg font-bold mb-4 text-white/80">Race Settings</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs text-slate-400 uppercase block mb-2 font-bold tracking-widest">CPU Opponents: {cpuCount}</label>
                            <input
                                type="range"
                                min="1"
                                max="7"
                                value={cpuCount}
                                onChange={(e) => setCpuCount(parseInt(e.target.value))}
                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
                            />
                        </div>
                        <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                            <p className="text-xs text-slate-400 leading-relaxed">
                                Race against advanced AI drivers in a 3-lap circuit battle. Use <span className="text-blue-400 font-bold">SHIFT</span> for Nitro and <span className="text-yellow-400 font-bold">SPACE</span> to drift.
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleStartGame}
                    className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.3)] text-xl tracking-widest transition-all active:scale-95 uppercase italic mt-8"
                >
                    Start Race
                </button>
            </div>
          </div>
        )}

        {view === 'game' && (
          <GameCanvas initialPlayers={players} />
        )}
      </main>
    </div>
  );
}
