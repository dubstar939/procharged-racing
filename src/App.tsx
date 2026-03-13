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
  const [view, setView] = useState<'landing' | 'lobby' | 'game'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [raceMode, setRaceMode] = useState<RaceMode>('circuit');
  const [cpuCount, setCpuCount] = useState(0);
  const [selectedCar, setSelectedCar] = useState('balanced');

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players, isHost, raceMode, cpuCount }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setRaceMode(raceMode);
      setCpuCount(cpuCount);
      setView('lobby');
      setError('');
    });

    socket.on('roomJoined', ({ roomId, players, isHost, raceMode, cpuCount }) => {
      setRoomCode(roomId);
      setPlayers(players);
      setIsHost(isHost);
      setRaceMode(raceMode);
      setCpuCount(cpuCount);
      setView('lobby');
      setError('');
    });

    socket.on('playerJoinedRoom', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('playerUpdated', (player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    socket.on('roomSettingsUpdated', ({ raceMode, cpuCount }) => {
      setRaceMode(raceMode);
      setCpuCount(cpuCount);
    });

    socket.on('playerDisconnected', (id) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on('gameStarted', ({ players: initialPlayers, raceMode: finalMode }) => {
      setPlayers(initialPlayers);
      setRaceMode(finalMode);
      setView('game');
    });

    socket.on('error', (msg) => {
      setError(msg);
    });
    
    socket.on('hostMigrated', (newHostId) => {
        if (socket.id === newHostId) {
            setIsHost(true);
        }
    });

    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('playerJoinedRoom');
      socket.off('playerUpdated');
      socket.off('roomSettingsUpdated');
      socket.off('playerDisconnected');
      socket.off('gameStarted');
      socket.off('error');
      socket.off('hostMigrated');
    };
  }, []);

  const handleCreate = () => {
    socket.emit('createRoom');
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || joinCode.length !== 6) {
        setError('Please enter a valid 6-character room code');
        return;
    }
    socket.emit('joinRoom', { roomId: joinCode.toUpperCase() });
  };

  const handleStartGame = () => {
    socket.emit('startGame');
  };

  const handleCarSelect = (type: string) => {
    setSelectedCar(type);
    socket.emit('selectCar', { carType: type });
  };

  const handleSettingsChange = (mode: RaceMode, cpus: number) => {
    if (!isHost) return;
    socket.emit('updateRoomSettings', { raceMode: mode, cpuCount: cpus });
  };

  return (
    <div className={`min-h-screen bg-slate-900 flex flex-col items-center ${view === 'game' ? 'justify-start' : 'justify-center'} font-sans text-slate-100`}>
      <header className={`w-full max-w-4xl mx-auto ${view === 'game' ? 'p-2' : 'p-6'} flex justify-between items-center transition-all`}>
        <h1 className={`${view === 'game' ? 'text-2xl' : 'text-4xl'} font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 transform -skew-x-12 transition-all`}>
          PROCHARGED RACING
        </h1>
      </header>

      <main className={`flex-1 w-full flex flex-col items-center ${view === 'game' ? 'p-0' : 'p-4'} transition-all`}>
        {view === 'landing' && (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center">Start Your Engines</h2>
            
            <div className="space-y-6">
              {error && <div className="text-red-400 text-sm text-center bg-red-900/20 p-2 rounded">{error}</div>}

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={handleCreate}
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                >
                  CREATE RACE
                </button>
                
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-700"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-slate-800 text-slate-500">Or join a friend</span>
                    </div>
                </div>

                <form onSubmit={handleJoin} className="flex gap-2">
                    <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white uppercase tracking-widest font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="CODE"
                        maxLength={6}
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg transition-transform active:scale-95"
                    >
                        JOIN
                    </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {view === 'lobby' && (
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <div className="text-center mb-8">
                        <h2 className="text-xl text-slate-400 mb-2">Room Code</h2>
                        <div className="text-6xl font-mono font-black tracking-widest text-yellow-400 bg-black/30 p-4 rounded-xl inline-block border-2 border-dashed border-slate-600 select-all">
                            {roomCode}
                        </div>
                    </div>

                    <div className="mb-8">
                        <h3 className="text-lg font-bold mb-4 flex justify-between items-center">
                            <span>Racers ({Object.keys(players).length})</span>
                            {isHost && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">You are Host</span>}
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                            {Object.values(players).map(p => (
                                <div key={p.id} className="bg-slate-700/50 p-3 rounded-lg flex items-center gap-3 border border-slate-600">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                                    <div className="flex-1">
                                        <div className="font-bold truncate">{p.name}</div>
                                        <div className="text-xs text-slate-400 uppercase">{p.carType}</div>
                                    </div>
                                    {p.id === socket.id && <span className="text-xs text-slate-400">(You)</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-4">Select Your Car</h3>
                        <div className="grid grid-cols-1 gap-3">
                            {Object.entries(CAR_TYPES).map(([id, car]) => (
                                <button
                                    key={id}
                                    onClick={() => handleCarSelect(id)}
                                    className={`p-4 rounded-xl border-2 transition-all text-left flex justify-between items-center ${
                                        selectedCar === id 
                                        ? 'border-yellow-400 bg-yellow-400/10' 
                                        : 'border-slate-700 bg-slate-700/30 hover:border-slate-600'
                                    }`}
                                >
                                    <div>
                                        <div className="font-bold text-lg">{car.name}</div>
                                        <div className="text-xs text-slate-400">
                                            Speed: {car.maxSpeed} | Accel: {car.acceleration}
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: car.color }}></div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold mb-4">Race Settings</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 uppercase block mb-2">Race Mode</label>
                                <div className="flex gap-2">
                                    {(['circuit', 'time-trial'] as RaceMode[]).map(mode => (
                                        <button
                                            key={mode}
                                            disabled={!isHost}
                                            onClick={() => handleSettingsChange(mode, cpuCount)}
                                            className={`flex-1 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
                                                raceMode === mode 
                                                ? 'bg-blue-600 text-white' 
                                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            } ${!isHost && 'opacity-50 cursor-not-allowed'}`}
                                        >
                                            {mode.replace('-', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 uppercase block mb-2">CPU Racers: {cpuCount}</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    value={cpuCount}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingsChange(raceMode, parseInt(e.target.value))}
                                    className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-400 ${!isHost && 'opacity-50 cursor-not-allowed'}`}
                                />
                            </div>
                        </div>
                    </div>

                    {isHost ? (
                        <button
                            onClick={handleStartGame}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg text-xl tracking-wide transition-transform active:scale-95 animate-pulse"
                        >
                            START RACE
                        </button>
                    ) : (
                        <div className="text-center text-slate-400 italic animate-pulse py-4">
                            Waiting for host to start the race...
                        </div>
                    )}
                </div>
            </div>
        )}

        {view === 'game' && (
          <GameCanvas initialPlayers={players} raceMode={raceMode} />
        )}
      </main>
    </div>
  );
}
