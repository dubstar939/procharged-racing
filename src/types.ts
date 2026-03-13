/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type Player = {
  id: string;
  x: number;
  y: number;
  angle: number;
  color: string;
  name: string;
  speed: number;
  laps: number;
  bestLapTime: number;
  nitro: number;
  nitroActive: boolean;
  drifting: boolean;
  carType: string;
  isCPU?: boolean;
};

export type RaceMode = 'circuit' | 'sprint' | 'time-trial';

export const CAR_TYPES = {
  'speedster': { 
    name: 'Speedster', 
    acceleration: 0.07, 
    maxSpeed: 2.6, 
    turnSpeed: 0.03, 
    color: '#ff4444',
    bodyStyle: 'sleek',
    spoilerType: 'high',
    wheelStyle: 'sport'
  },
  'drifter': { 
    name: 'Drifter', 
    acceleration: 0.05, 
    maxSpeed: 2.2, 
    turnSpeed: 0.045, 
    color: '#4444ff',
    bodyStyle: 'wide',
    spoilerType: 'ducktail',
    wheelStyle: 'drift'
  },
  'balanced': { 
    name: 'Balanced', 
    acceleration: 0.06, 
    maxSpeed: 2.4, 
    turnSpeed: 0.035, 
    color: '#44ff44',
    bodyStyle: 'classic',
    spoilerType: 'standard',
    wheelStyle: 'classic'
  },
};
