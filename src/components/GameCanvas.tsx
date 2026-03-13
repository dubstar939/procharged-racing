/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { socket } from '../services/socket';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Player } from '../types';

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 850;

// Car physics constants
const ACCELERATION = 0.06;
const MAX_SPEED = 2.4;
const NITRO_SPEED = 4.125;
const NITRO_ACCEL = 0.12;
const FRICTION = 0.97;
const TURN_SPEED = 0.035;
import { CAR_TYPES, RaceMode } from '../types';

// Track Geometry
const TRACK_RADIUS = 50; // Slightly narrower for more technical turns
const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500}, angle: 0 },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300}, angle: -Math.PI/2 },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300}, angle: Math.PI },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100}, angle: -Math.PI/2 },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100}, angle: 0 },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400}, angle: Math.PI/2 },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400}, angle: Math.PI },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600}, angle: Math.PI/2 },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600}, angle: 0 },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150}, angle: -Math.PI/2 },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150}, angle: 0 },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750}, angle: Math.PI/2 },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750}, angle: Math.PI },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500}, angle: -Math.PI/2 }
];

// Math helpers for collision
function getClosestPointOnSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return v;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
}

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
  if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
}

function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
  return Math.sqrt(distToSegmentSquared(p, v, w));
}

const isPointOnTrackMath = (x: number, y: number, buffer: number = 0): boolean => {
  const p = {x, y};
  let minDist = Infinity;
  
  for (const seg of TRACK_SEGMENTS) {
    const d = distToSegment(p, seg.start, seg.end);
    if (d < minDist) minDist = d;
  }

  return minDist <= (TRACK_RADIUS + buffer);
};

// 3D Components
const CarModel = ({ color, isLocal, drifting, nitroActive, carType = 'balanced' }: { color: string, isLocal?: boolean, drifting?: boolean, nitroActive?: boolean, carType?: string }) => {
  const stats = CAR_TYPES[carType as keyof typeof CAR_TYPES] || CAR_TYPES.balanced;
  
  return (
    <group scale={[2, 2, 2]}>
      {/* Exhaust Flames when Nitro is active */}
      {nitroActive && (
        <group position={[0, 0.5, -2.1]}>
          <mesh position={[0.5, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
            <coneGeometry args={[0.2, 0.8, 8]} />
            <meshStandardMaterial color="#44aaff" emissive="#44aaff" emissiveIntensity={2} transparent opacity={0.8} />
          </mesh>
          <mesh position={[-0.5, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
            <coneGeometry args={[0.2, 0.8, 8]} />
            <meshStandardMaterial color="#44aaff" emissive="#44aaff" emissiveIntensity={2} transparent opacity={0.8} />
          </mesh>
          <pointLight position={[0, 0, 0]} color="#44aaff" intensity={5} distance={5} />
        </group>
      )}
      
      {/* Chassis */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.4, 4.2]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Body Kits based on style */}
      {stats.bodyStyle === 'wide' && (
        <group>
          <mesh position={[1.1, 0.5, 0]}>
            <boxGeometry args={[0.2, 0.6, 3.8]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[-1.1, 0.5, 0]}>
            <boxGeometry args={[0.2, 0.6, 3.8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      )}

      {/* Main Body */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={stats.bodyStyle === 'sleek' ? [1.8, 0.5, 4.2] : [2, 0.6, 4]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Hood/Nose */}
      <mesh position={[0, 0.6, 1.5]} rotation={[-0.2, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.4, 1.5]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 1.2, -0.5]} castShadow>
        <boxGeometry args={[1.6, 0.8, 1.8]} />
        <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} transparent opacity={0.8} />
      </mesh>

      {/* Spoilers */}
      {stats.spoilerType === 'high' && (
        <group position={[0, 1.5, -1.8]}>
          <mesh position={[0.8, -0.5, 0]}>
              <boxGeometry args={[0.1, 1.0, 0.2]} />
              <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[-0.8, -0.5, 0]}>
              <boxGeometry args={[0.1, 1.0, 0.2]} />
              <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation={[0.2, 0, 0]}>
              <boxGeometry args={[2.4, 0.1, 1.0]} />
              <meshStandardMaterial color={color} metalness={0.7} />
          </mesh>
        </group>
      )}
      {stats.spoilerType === 'ducktail' && (
        <mesh position={[0, 1.1, -2.0]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[2.0, 0.2, 0.4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {stats.spoilerType === 'standard' && (
        <group position={[0, 1.2, -1.8]}>
          <mesh position={[0.8, -0.2, 0]}>
              <boxGeometry args={[0.1, 0.6, 0.2]} />
              <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[-0.8, -0.2, 0]}>
              <boxGeometry args={[0.1, 0.6, 0.2]} />
              <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation={[0.1, 0, 0]}>
              <boxGeometry args={[2.2, 0.1, 0.8]} />
              <meshStandardMaterial color={color} metalness={0.7} />
          </mesh>
        </group>
      )}

      {/* Wheels & Rims */}
      {[
        [1.1, 0.4, 1.2], [-1.1, 0.4, 1.2],
        [1.1, 0.4, -1.2], [-1.1, 0.4, -1.2]
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
            <mesh rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.45, 0.45, 0.5, 24]} />
                <meshStandardMaterial color="#111" roughness={0.8} />
            </mesh>
            {/* Rims based on style */}
            <mesh position={[pos[0] > 0 ? 0.26 : -0.26, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[0.3, 0.3, 0.05, stats.wheelStyle === 'sport' ? 5 : 12]} />
                <meshStandardMaterial color={stats.wheelStyle === 'drift' ? "#555" : "#888"} metalness={1} roughness={0.2} />
            </mesh>
        </group>
      ))}

      {/* Headlights */}
      <mesh position={[0.7, 0.6, 2.05]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={5} />
      </mesh>
      <mesh position={[-0.7, 0.6, 2.05]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={5} />
      </mesh>

      {/* Taillights */}
      <mesh position={[0.7, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.7, 0.6, -2.05]}>
        <boxGeometry args={[0.5, 0.2, 0.1]} />
        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} />
      </mesh>
      
      {/* Drift Smoke Particles */}
      {drifting && (
        <group position={[0, 0.2, -1.8]}>
          <mesh position={[1.0, 0, 0]}>
             <sphereGeometry args={[0.4, 8, 8]} />
             <meshBasicMaterial color="#ccc" transparent opacity={0.4} />
          </mesh>
          <mesh position={[-1.0, 0, 0]}>
             <sphereGeometry args={[0.4, 8, 8]} />
             <meshBasicMaterial color="#ccc" transparent opacity={0.4} />
          </mesh>
        </group>
      )}

      {isLocal && (
        <spotLight position={[0, 2, 5]} angle={0.6} penumbra={0.5} intensity={20} distance={40} color="white" castShadow />
      )}
    </group>
  );
};

const Tree = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 3, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 6, 8]} />
        <meshStandardMaterial color="#4d2926" />
      </mesh>
      {/* Leaves */}
      <mesh position={[0, 9, 0]} castShadow>
        <coneGeometry args={[4, 10, 8]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>
      <mesh position={[0, 13, 0]} castShadow>
        <coneGeometry args={[3, 7, 8]} />
        <meshStandardMaterial color="#3a7532" />
      </mesh>
    </group>
  );
};

const Rock = ({ position, scale = 1 }: { position: [number, number, number], scale?: number }) => {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1.5, 0]} />
      <meshStandardMaterial color="#666" roughness={0.9} />
    </mesh>
  );
};

const TrackMesh = () => {
  const segments = useMemo(() => {
    return TRACK_SEGMENTS.map((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (seg.start.x + seg.end.x) / 2;
      const centerY = (seg.start.y + seg.end.y) / 2;
      return { length, angle, centerX, centerY, id: i };
    });
  }, []);

  const corners = useMemo(() => {
    return TRACK_SEGMENTS.map((seg) => seg.start);
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={[1, -1, 1]}>
      {/* Grass/Off-track */}
      <mesh position={[TRACK_WIDTH/2, TRACK_HEIGHT/2, -0.1]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color="#1a472a" roughness={1} />
      </mesh>
      
      {/* Track Segments */}
      {segments.map((seg) => (
        <group key={seg.id} position={[seg.centerX, seg.centerY, 0.1]} rotation={[0, 0, seg.angle]}>
          <mesh receiveShadow>
            <planeGeometry args={[seg.length, TRACK_RADIUS * 2]} />
            <meshStandardMaterial color="#333" roughness={0.8} />
          </mesh>
          {/* Curbs */}
          <mesh position={[0, TRACK_RADIUS + 0.5, 0.05]}>
            <planeGeometry args={[seg.length, 1]} />
            <meshStandardMaterial color="#ff3333" />
          </mesh>
          <mesh position={[0, -TRACK_RADIUS - 0.5, 0.05]}>
            <planeGeometry args={[seg.length, 1]} />
            <meshStandardMaterial color="#ff3333" />
          </mesh>
          {/* Barriers */}
          <mesh position={[0, TRACK_RADIUS + 3, 1]}>
            <boxGeometry args={[seg.length, 0.5, 2]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[0, -TRACK_RADIUS - 3, 1]}>
            <boxGeometry args={[seg.length, 0.5, 2]} />
            <meshStandardMaterial color="#444" />
          </mesh>
        </group>
      ))}

      {/* Smooth Corners */}
      {corners.map((pos, i) => (
        <group key={i} position={[pos.x, pos.y, 0.1]}>
          <mesh receiveShadow>
            <circleGeometry args={[TRACK_RADIUS, 32]} />
            <meshStandardMaterial color="#333" roughness={0.8} />
          </mesh>
          {/* Outer Curb */}
          <mesh position={[0, 0, -0.01]}>
            <ringGeometry args={[TRACK_RADIUS, TRACK_RADIUS + 1, 32]} />
            <meshStandardMaterial color="#ff3333" />
          </mesh>
        </group>
      ))}
      
      {/* Start Line */}
      <group position={[625, 750, 0.2]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[15, TRACK_RADIUS * 2 + 2, 0.2]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        {/* Checkered Pattern */}
        <group position={[0, 0, 0.11]}>
            {Array.from({length: 12}).map((_, i) => (
                <group key={i} position={[0, (i - 5.5) * (TRACK_RADIUS * 2 / 10), 0]}>
                    <mesh position={[-3.75, 0, 0]}>
                        <planeGeometry args={[7.5, TRACK_RADIUS * 2 / 10]} />
                        <meshStandardMaterial color={i % 2 === 0 ? "white" : "black"} />
                    </mesh>
                    <mesh position={[3.75, 0, 0]}>
                        <planeGeometry args={[7.5, TRACK_RADIUS * 2 / 10]} />
                        <meshStandardMaterial color={i % 2 === 0 ? "black" : "white"} />
                    </mesh>
                </group>
            ))}
        </group>
        {/* Flags */}
        <group position={[0, TRACK_RADIUS + 5, 0]}>
            <mesh position={[0, 5, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 10]} />
                <meshStandardMaterial color="#888" />
            </mesh>
            <mesh position={[2, 8, 0]} rotation={[0, 0, 0.2]}>
                <planeGeometry args={[4, 2]} />
                <meshStandardMaterial color="yellow" />
            </mesh>
        </group>
        <group position={[0, -TRACK_RADIUS - 5, 0]}>
            <mesh position={[0, 5, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 10]} />
                <meshStandardMaterial color="#888" />
            </mesh>
            <mesh position={[2, 8, 0]} rotation={[0, 0, 0.2]}>
                <planeGeometry args={[4, 2]} />
                <meshStandardMaterial color="yellow" />
            </mesh>
        </group>
      </group>
    </group>
  );
};

const GameScene = ({ 
  localPlayerRef, 
  players, 
  myId 
}: { 
  localPlayerRef: React.MutableRefObject<any>, 
  players: Record<string, Player>, 
  myId: string | null 
}) => {
  const { camera } = useThree();
  const carRef = useRef<THREE.Group>(null);

  const decorations = useMemo(() => {
    const items: { type: 'tree' | 'rock', pos: [number, number, number], scale: number }[] = [];
    const count = 350; // Increased for better density
    const seed = 42;
    const rng = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };
    let s = seed;

    for (let i = 0; i < count; i++) {
      // Area large enough to fill the new draw distance
      const x = rng(s++) * 2400 - 800; 
      const z = rng(s++) * 2200 - 800;
      
      // Check if on track using the math helper with a buffer to account for decoration size
      if (!isPointOnTrackMath(x, z, 20)) {
        const type = rng(s++) > 0.4 ? 'tree' : 'rock';
        const scale = type === 'tree' ? 2.5 + rng(s++) * 3.5 : 3 + rng(s++) * 5;
        items.push({ type, pos: [x, 0, z], scale });
      }
    }
    return items;
  }, []);
  
  useFrame((state, delta) => {
    if (localPlayerRef.current && carRef.current) {
      const p = localPlayerRef.current;
      
      // Map 2D (x, y) to 3D (x, 0, z)
      carRef.current.position.set(p.x, 0, p.y);
      
      // Rotation: 2D angle 0 is Right (+X). 3D Box faces +Z.
      // We need to rotate Y.
      // If angle=0, we want car to face +X.
      // Box faces +Z. Rotate Y by +PI/2 faces +X.
      // 2D angle increases clockwise (screen Y down).
      // 3D Y-rotation increases counter-clockwise.
      // So rotation = -angle + PI/2.
      carRef.current.rotation.y = -p.angle + Math.PI/2; 

      // Camera Follow
      const dist = 40;
      const height = 20;
      const angle = p.angle;
      
      // Camera behind car
      // 2D velocity vector is (cos(angle), sin(angle))
      // Camera should be at p - velocity * dist
      const targetCamX = p.x - Math.cos(angle) * dist;
      const targetCamZ = p.y - Math.sin(angle) * dist;
      
      // Smooth camera
      camera.position.lerp(new THREE.Vector3(targetCamX, height, targetCamZ), 0.1);
      camera.lookAt(p.x, 0, p.y);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight 
        position={[600, 300, 425]} 
        intensity={1} 
        castShadow 
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-700}
        shadow-camera-right={700}
        shadow-camera-top={700}
        shadow-camera-bottom={-700}
        shadow-camera-far={1000}
      />
      <Environment preset="sunset" />
      
      <TrackMesh />
      
      {/* Decorative Elements */}
      {decorations.map((item, i) => (
        item.type === 'tree' ? (
          <Tree key={i} position={item.pos} scale={item.scale} />
        ) : (
          <Rock key={i} position={item.pos} scale={item.scale} />
        )
      ))}
      
      {/* Local Player */}
      <group ref={carRef}>
        <CarModel 
            color={players[myId || '']?.color || 'red'} 
            carType={players[myId || '']?.carType}
            isLocal 
            drifting={localPlayerRef.current?.drifting} 
        />
      </group>
      
      {/* Remote Players & CPUs */}
      {Object.values(players).map(p => {
        if (p.id === myId) return null;
        return (
          <group key={p.id} position={[p.x, 0, p.y]} rotation={[0, -p.angle + Math.PI/2, 0]}>
            <CarModel color={p.color} carType={p.carType} drifting={p.drifting} nitroActive={p.nitroActive} />
            <Text position={[0, 4, 0]} fontSize={2.5} color={p.isCPU ? "#aaa" : "white"} anchorX="center" anchorY="middle">
              {p.name} {p.isCPU ? "(AI)" : ""}
            </Text>
          </group>
        );
      })}
    </>
  );
};

export default function GameCanvas({ initialPlayers, raceMode = 'circuit' }: { initialPlayers?: Record<string, Player>, raceMode?: RaceMode }) {
  // Sanitize initial players to handle Infinity/null issue
  const sanitizedInitial = useMemo(() => {
      if (!initialPlayers) return {};
      return Object.entries(initialPlayers).reduce((acc, [id, p]) => {
        acc[id] = { ...p, bestLapTime: p.bestLapTime || Infinity };
        return acc;
      }, {} as Record<string, Player>);
  }, [initialPlayers]);

  const [players, setPlayers] = useState<Record<string, Player>>(sanitizedInitial);
  const [myId, setMyId] = useState<string | null>(socket.id || null);
  const [laps, setLaps] = useState(0);
  const [lastLapTime, setLastLapTime] = useState<number | null>(null);
  const [currentLapStart, setCurrentLapStart] = useState<number>(Date.now());
  const [nitro, setNitro] = useState(100);
  const [wrongWay, setWrongWay] = useState(false);
  const timerRef = useRef<HTMLDivElement>(null);
  
  // HUD Helper
  const formatTime = (ms: number) => {
      if (ms === Infinity || !ms) return "--:--";
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const rs = s % 60;
      const msPart = Math.floor((ms % 1000) / 10);
      return `${m}:${rs.toString().padStart(2, '0')}.${msPart.toString().padStart(2, '0')}`;
  };
  
  // Local state for smooth physics
  const localPlayer = useRef<{
    x: number;
    y: number;
    angle: number;
    speed: number;
    keys: Record<string, boolean>;
    checkpoint: number; // 0: Start, 1: Top, 2: Bottom
    nitro: number;
    nitroActive: boolean;
    drifting: boolean;
    wrongWayTimer: number | null;
    lapCount: number;
    carType: string;
  }>({
    x: 650,
    y: 750,
    angle: Math.PI,
    speed: 0,
    keys: {},
    checkpoint: 3, // Start in sector 3 (before finish line)
    nitro: 100,
    nitroActive: false,
    drifting: false,
    wrongWayTimer: null,
    lapCount: 0,
    carType: 'balanced',
  });

  const cpuPlayersRef = useRef<Record<string, { x: number, y: number, angle: number, speed: number }>>({});

  // Initialize local player position from props if available
  useEffect(() => {
      if (myId && players[myId]) {
          const p = players[myId];
          localPlayer.current.x = p.x;
          localPlayer.current.y = p.y;
          localPlayer.current.angle = p.angle;
          localPlayer.current.carType = p.carType || 'balanced';
      }
  }, [myId, players]); // Run when ID or players change

  // Particle System
  const [particles, setParticles] = useState<{id: number, x: number, y: number, life: number}[]>([]);
  const particleIdCounter = useRef(0);

  useEffect(() => {
    // Socket event listeners
    socket.on('init', ({ id, players: initialPlayers }) => {
      setMyId(id);
      setPlayers(initialPlayers);
    });

    socket.on('playerJoined', (player: Player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: { ...player, bestLapTime: player.bestLapTime || Infinity } }));
    });

    socket.on('gameStarted', ({ players: startedPlayers }) => {
      setPlayers(startedPlayers);
    });

    socket.on('playerMoved', (player: Player) => {
      setPlayers((prev) => {
        if (player.id === socket.id) return prev;
        return { ...prev, [player.id]: { ...player, bestLapTime: player.bestLapTime || Infinity } };
      });
    });
    
    socket.on('lapUpdate', (data: {id: string, laps: number, bestLapTime: number}) => {
        setPlayers(prev => {
            if (!prev[data.id]) return prev;
            const serverBest = data.bestLapTime || Infinity;
            return {
                ...prev,
                [data.id]: {
                    ...prev[data.id],
                    laps: data.laps,
                    bestLapTime: serverBest
                }
            };
        });
    });

    socket.on('playerDisconnected', (id: string) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      socket.off('init');
      socket.off('playerJoined');
      socket.off('gameStarted');
      socket.off('playerMoved');
      socket.off('playerDisconnected');
      socket.off('lapUpdate');
    };
  }, []);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      localPlayer.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Physics Loop (runs independently of 3D render loop)
  useEffect(() => {
    let animationFrameId: number;

    const updatePhysics = () => {
      const p = localPlayer.current;
      const oldX = p.x;
      const oldY = p.y;

      const carStats = CAR_TYPES[p.carType as keyof typeof CAR_TYPES] || CAR_TYPES.balanced;
      const accel = carStats.acceleration;
      const maxSpd = carStats.maxSpeed;
      const turnSpd = carStats.turnSpeed;
      
      // Acceleration
      if (p.keys['ArrowUp'] || p.keys['KeyW']) {
        p.speed += accel;
      } else if (p.keys['ArrowDown'] || p.keys['KeyS']) {
        p.speed -= accel;
      } else {
        p.speed *= FRICTION;
      }

      // Nitro
      const wantsNitro = (p.keys['ShiftLeft'] || p.keys['ShiftRight']) && p.nitro > 0;
      if (wantsNitro) {
          p.speed += NITRO_ACCEL;
          p.nitro = Math.max(0, p.nitro - 1);
          p.nitroActive = true;
      } else {
          p.nitroActive = false;
          // Regenerate faster if drifting
          const regenRate = p.drifting ? 0.8 : 0.2;
          p.nitro = Math.min(100, p.nitro + regenRate);
      }
      setNitro(p.nitro);

      // Drifting Logic
      const isTurning = p.keys['ArrowLeft'] || p.keys['KeyA'] || p.keys['ArrowRight'] || p.keys['KeyD'];
      const wantsDrift = p.keys['Space'];
      
      if (wantsDrift && isTurning && Math.abs(p.speed) > 1.5) {
          p.drifting = true;
      } else {
          p.drifting = false;
      }

      // Max Speed Cap
      const isNitroActive = (p.keys['ShiftLeft'] || p.keys['ShiftRight']) && p.nitro > 0;
      const currentMaxSpeed = isNitroActive ? NITRO_SPEED : maxSpd;
      
      if (p.speed > currentMaxSpeed) {
          if (isNitroActive) {
              p.speed = currentMaxSpeed;
          } else {
              p.speed = Math.max(currentMaxSpeed, p.speed * 0.98);
          }
      }
      if (p.speed < -maxSpd / 2) p.speed = -maxSpd / 2;

      // Turning
      if (Math.abs(p.speed) > 0.1) {
        let turn = turnSpd * (p.speed / maxSpd);
        
        if (p.drifting) {
            turn *= 1.5;
            p.speed *= 0.98;
            
            if (Math.random() > 0.5) {
                setParticles(prev => [
                    ...prev, 
                    {
                        id: particleIdCounter.current++, 
                        x: p.x + (Math.random() - 0.5) * 2, 
                        y: p.y + (Math.random() - 0.5) * 2, 
                        life: 1.0
                    }
                ]);
            }
        }

        if (p.keys['ArrowLeft'] || p.keys['KeyA']) {
          p.angle -= turn;
        }
        if (p.keys['ArrowRight'] || p.keys['KeyD']) {
          p.angle += turn;
        }
      }

      // Movement
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;

      // Update Particles
      setParticles(prev => prev.map(pt => ({...pt, life: pt.life - 0.05})).filter(pt => pt.life > 0));

      // Find closest segment for target angle and collision
      let closestPt = {x: p.x, y: p.y};
      let minD2 = Infinity;
      let targetAngle = 0;
      
      TRACK_SEGMENTS.forEach(seg => {
          const pt = getClosestPointOnSegment({x: p.x, y: p.y}, seg.start, seg.end);
          const d2 = (pt.x - p.x)**2 + (pt.y - p.y)**2;
          if (d2 < minD2) {
              minD2 = d2;
              closestPt = pt;
              targetAngle = seg.angle;
          }
      });

      // Track Collision (Off-track logic)
      if (Math.sqrt(minD2) > TRACK_RADIUS) {
        // Off-track: Apply heavy friction/slowdown instead of hard wall
        p.speed *= 0.9; // Rapidly slow down
        
        // Cap max speed on grass
        if (p.speed > 1.2) p.speed = 1.2;
        if (p.speed < -0.75) p.speed = -0.75;

        p.drifting = false; // Harder to drift on grass
        
        // Optional: Add some wobble or vibration effect here if desired
      }

      // Sector/Lap Logic
      // Check distance to specific segments to act as checkpoints
      let currentSector = -1;
      const d0 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[0].start, TRACK_SEGMENTS[0].end);
      const d1 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[4].start, TRACK_SEGMENTS[4].end);
      const d2 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[8].start, TRACK_SEGMENTS[8].end);
      const d3 = distToSegment({x: p.x, y: p.y}, TRACK_SEGMENTS[11].start, TRACK_SEGMENTS[11].end);

      if (d0 < TRACK_RADIUS * 1.5) currentSector = 0;
      else if (d1 < TRACK_RADIUS * 1.5) currentSector = 1;
      else if (d2 < TRACK_RADIUS * 1.5) currentSector = 2;
      else if (d3 < TRACK_RADIUS * 1.5) currentSector = 3;
      
      // Checkpoint progression
      if (currentSector !== -1) {
          const nextCheckpoint = (p.checkpoint + 1) % 4;
          if (currentSector === nextCheckpoint) {
              p.checkpoint = currentSector;
          }
      }

      // Lap Finish Check (Crossing x=625 on segment 12)
      const onFinishStraight = p.y > 700 && p.y < 800;
      if (p.checkpoint === 3 && onFinishStraight && oldX >= 625 && p.x < 625) {
          const now = Date.now();
          const lapTime = now - currentLapStart;
          
          // Always reset timer for the next lap
          setCurrentLapStart(now);
          
          // Increment internal lap count
          p.lapCount = (p.lapCount || 0) + 1;
          setLaps(p.lapCount);
          
          // Only record best time if this wasn't the start-line crossing (Lap 1 start)
          if (p.lapCount > 1) {
              setLastLapTime(lapTime);
              
              // Optimistically update local player's best lap time
              setPlayers(prev => {
                  if (!myId || !prev[myId]) return prev;
                  const currentBest = prev[myId].bestLapTime;
                  if (!currentBest || lapTime < currentBest) {
                      return {
                          ...prev,
                          [myId]: {
                              ...prev[myId],
                              bestLapTime: lapTime
                          }
                      };
                  }
                  return prev;
              });

              // Send to server
              socket.emit('lapFinished', lapTime);
          }
          
          // Reset checkpoint for next lap
          p.checkpoint = -1; // Wait for sector 0
      }

      // Wrong Way Detection (Angle based)
      // Use targetAngle from the closest segment (calculated above in collision logic)
      
      // Normalize player angle to -PI to PI
      let pAngle = p.angle % (Math.PI * 2);
      if (pAngle > Math.PI) pAngle -= Math.PI * 2;
      if (pAngle < -Math.PI) pAngle += Math.PI * 2;
      
      // Calculate difference
      let diff = Math.abs(pAngle - targetAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      
      // If angle difference is > 115 degrees (approx 2.0 rad), show warning
      // Only if moving forward (speed > 0.5)
      // Removed isOnTrack check to ensure it triggers even if slightly off-line
      const isWrongWayConditionMet = diff > 2.0 && p.speed > 0.5;
      
      if (isWrongWayConditionMet) {
          if (p.wrongWayTimer === null) {
              p.wrongWayTimer = Date.now();
          } else if (Date.now() - p.wrongWayTimer > 100) {
              setWrongWay(true);
          }
      } else {
          // Reset timer if we are facing correct way OR moving slow
          p.wrongWayTimer = null;
          setWrongWay(false);
      }


      // Send update
      if (socket.connected) {
        socket.emit('playerMovement', {
          x: p.x,
          y: p.y,
          angle: p.angle,
          speed: p.speed,
          nitro: p.nitro,
          nitroActive: p.nitroActive,
          drifting: p.drifting
        });
      }

      // Update Timer DOM
      if (timerRef.current) {
          timerRef.current.innerText = formatTime(Date.now() - currentLapStart);
      }

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    updatePhysics();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentLapStart]);

  return (
    <div className="relative w-full h-[850px] bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-4 border-slate-700">
      <Canvas shadows>
        <color attach="background" args={['#0f172a']} />
        <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={60} far={1000} />
        <fog attach="fog" args={['#0f172a', 100, 900]} />
        <GameScene localPlayerRef={localPlayer} players={players} myId={myId} />
        
        {/* Particles */}
        {particles.map(pt => (
            <mesh key={pt.id} position={[pt.x, 2, pt.y]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[1.5 * pt.life, 1.5 * pt.life]} />
                <meshBasicMaterial color="#888" transparent opacity={0.4 * pt.life} />
            </mesh>
        ))}

        <OrbitControls enabled={false} />
      </Canvas>
      
      {/* HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
          {/* Top Row */}
          <div className="flex justify-between items-start">
              {/* Leaderboard */}
              <div className="bg-black/60 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-64 shadow-2xl">
                  <div className="flex items-center gap-2 mb-4">
                      <div className="w-1 h-4 bg-pink-500 rounded-full"></div>
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Leaderboard</span>
                  </div>
                  <div className="space-y-3">
                      {Object.values(players)
                        .map(p => p as Player)
                        .sort((a, b) => (a.bestLapTime || Infinity) - (b.bestLapTime || Infinity))
                        .slice(0, 5)
                        .map((p, i) => (
                          <div key={p.id} className="flex justify-between items-center group">
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-bold ${i === 0 ? 'text-yellow-400' : 'text-white/30'}`}>0{i+1}</span>
                                  <span className={`text-sm font-bold truncate max-w-[100px] ${p.id === socket.id ? 'text-pink-400' : 'text-white/80'}`}>
                                      {p.name}
                                  </span>
                              </div>
                              <span className="font-mono text-[11px] text-white/40 tabular-nums">
                                  {p.bestLapTime !== Infinity ? formatTime(p.bestLapTime) : '--:--.--'}
                              </span>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Lap & Timer */}
              <div className="flex gap-4">
                  <div className="bg-black/60 backdrop-blur-md border border-white/10 px-8 py-4 rounded-2xl shadow-2xl text-center min-w-[120px]">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Lap</div>
                      <div className="text-4xl font-black italic text-white tabular-nums">
                          {Math.min(3, (players[socket.id || '']?.laps || 0) + 1)}<span className="text-white/20 text-2xl">/3</span>
                      </div>
                  </div>
                  <div className="bg-black/60 backdrop-blur-md border border-white/10 px-8 py-4 rounded-2xl shadow-2xl text-center min-w-[180px]">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Current Time</div>
                      <div ref={timerRef} className="text-4xl font-black italic text-pink-500 tabular-nums">
                          {formatTime(Date.now() - currentLapStart)}
                      </div>
                  </div>
              </div>
          </div>

          {/* Bottom Row */}
          <div className="flex justify-between items-end">
              {/* Speed & Nitro */}
              <div className="flex items-end gap-6">
                  <div className="relative">
                      <svg className="w-32 h-32 transform -rotate-90">
                          <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                          <circle 
                              cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                              strokeDasharray={364}
                              strokeDashoffset={364 - (364 * (nitro / 100))}
                              className="text-blue-500 transition-all duration-300"
                          />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Nitro</span>
                          <span className="text-2xl font-black italic text-white">{Math.floor(nitro)}%</span>
                      </div>
                  </div>

                  <div className="bg-black/60 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-2xl min-w-[200px]">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2">Speedometer</div>
                      <div className="flex items-baseline gap-2">
                          <span className="text-6xl font-black italic text-white tabular-nums">
                              {Math.floor(Math.abs(localPlayer.current?.speed || 0) * 80)}
                          </span>
                          <span className="text-xl font-black italic text-pink-500">KM/H</span>
                      </div>
                      <div className="mt-4 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div 
                              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-100"
                              style={{ width: `${Math.min(100, (Math.abs(localPlayer.current?.speed || 0) / 4) * 100)}%` }}
                          ></div>
                      </div>
                  </div>
              </div>

              {/* Warnings */}
              <div className="flex flex-col gap-4 items-end">
                  {wrongWay && (
                      <div className="bg-red-600 text-white px-8 py-4 rounded-xl font-black italic text-2xl animate-bounce shadow-[0_0_30px_rgba(220,38,38,0.5)] uppercase tracking-tighter">
                          Wrong Way!
                      </div>
                  )}
                  {localPlayer.current?.drifting && (
                      <div className="bg-yellow-500 text-black px-6 py-2 rounded-lg font-black italic text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                          Drifting
                      </div>
                  )}
              </div>
          </div>
      </div>

      {/* Wrong Way Warning */}
      {wrongWay && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-red-600/90 text-white px-12 py-8 rounded-2xl border-8 border-white shadow-2xl animate-pulse">
                <div className="text-6xl font-black italic uppercase tracking-widest">WRONG WAY</div>
            </div>
        </div>
      )}

      {/* Bottom Left: Controls (Faded) */}
      <div className="absolute bottom-6 left-6 text-white pointer-events-none opacity-50 hover:opacity-100 transition-opacity duration-300">
        <div className="bg-black/40 p-5 rounded-xl backdrop-blur-md border border-white/10">
            <h3 className="font-bold text-sm mb-2 text-yellow-400/80">Controls</h3>
            <ul className="text-xs space-y-1 font-mono text-slate-300">
            <li>W / UP : Accelerate</li>
            <li>S / DOWN : Brake</li>
            <li>A / D  : Turn</li>
            <li>SPACE  : Drift</li>
            <li>SHIFT  : Nitro</li>
            </ul>
        </div>
      </div>
    </div>
  );
}
