/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  // Game State
  type Player = {
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

  const players: Record<string, Player> = {};
  let gameStatus: 'waiting' | 'racing' = 'waiting';

  const TRACK_WIDTH = 1200;
  const TRACK_HEIGHT = 850;

  const TRACK_SEGMENTS = [
    { start: {x: 150, y: 500}, end: {x: 450, y: 500} },
    { start: {x: 450, y: 500}, end: {x: 450, y: 300} },
    { start: {x: 450, y: 300}, end: {x: 300, y: 300} },
    { start: {x: 300, y: 300}, end: {x: 300, y: 100} },
    { start: {x: 300, y: 100}, end: {x: 750, y: 100} },
    { start: {x: 750, y: 100}, end: {x: 750, y: 400} },
    { start: {x: 750, y: 400}, end: {x: 600, y: 400} },
    { start: {x: 600, y: 400}, end: {x: 600, y: 600} },
    { start: {x: 600, y: 600}, end: {x: 950, y: 600} },
    { start: {x: 950, y: 600}, end: {x: 950, y: 150} },
    { start: {x: 950, y: 150}, end: {x: 1100, y: 150} },
    { start: {x: 1100, y: 150}, end: {x: 1100, y: 750} },
    { start: {x: 1100, y: 750}, end: {x: 150, y: 750} },
    { start: {x: 150, y: 750}, end: {x: 150, y: 500} }
  ];

  const COLORS = [
    { name: 'Red', value: 'hsl(0, 70%, 50%)' },
    { name: 'Blue', value: 'hsl(210, 70%, 50%)' },
    { name: 'Green', value: 'hsl(120, 70%, 50%)' },
    { name: 'Yellow', value: 'hsl(60, 70%, 50%)' },
    { name: 'Purple', value: 'hsl(280, 70%, 50%)' },
    { name: 'Orange', value: 'hsl(30, 70%, 50%)' },
    { name: 'Cyan', value: 'hsl(180, 70%, 50%)' },
    { name: 'Pink', value: 'hsl(330, 70%, 50%)' },
  ];

  const createPlayer = (id: string, colorInfo: { name: string, value: string }, carType: string = 'balanced', isCPU: boolean = false): Player => ({
    id,
    x: 650 + (Math.random() * 40 - 20),
    y: 750 + (Math.random() * 20 - 10),
    angle: Math.PI,
    color: colorInfo.value,
    name: isCPU ? `CPU ${colorInfo.name}` : colorInfo.name,
    speed: 0,
    laps: 0,
    bestLapTime: Infinity,
    nitro: 100,
    nitroActive: false,
    drifting: false,
    carType,
    isCPU,
  });

  function distToSegment(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return Math.sqrt((p.x - v.x)**2 + (p.y - v.y)**2);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2);
  }

  // AI Update Loop
  setInterval(() => {
    if (gameStatus !== 'racing') return;

    Object.values(players).forEach(p => {
      if (p.isCPU) {
        // Find closest segment
        let minDist = Infinity;
        let closestSeg = TRACK_SEGMENTS[0];
        TRACK_SEGMENTS.forEach(seg => {
          const d = distToSegment({x: p.x, y: p.y}, seg.start, seg.end);
          if (d < minDist) {
            minDist = d;
            closestSeg = seg;
          }
        });

        // Target: end of current segment
        const dx = closestSeg.end.x - p.x;
        const dy = closestSeg.end.y - p.y;
        const targetAngle = Math.atan2(dy, dx);

        let angleDiff = targetAngle - p.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        p.angle += angleDiff * 0.05;
        p.speed = Math.min(p.speed + 0.04, 2.0);

        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;

        io.emit("playerMoved", p);
      }
    });
  }, 1000 / 60);

  // Socket.io Logic
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    const colorInfo = COLORS[Object.keys(players).length % COLORS.length];
    const newPlayer = createPlayer(socket.id, colorInfo);
    players[socket.id] = newPlayer;

    socket.emit("init", { id: socket.id, players });
    socket.broadcast.emit("playerJoined", newPlayer);

    socket.on("startGame", ({ cpuCount }) => {
      gameStatus = 'racing';
      
      // Add CPUs
      for (let i = 0; i < cpuCount; i++) {
        const cpuId = `cpu_${i}`;
        const cpuColor = COLORS[(Object.keys(players).length) % COLORS.length];
        const carTypes = ['speedster', 'drifter', 'balanced'];
        const cpuPlayer = createPlayer(cpuId, cpuColor, carTypes[i % 3], true);
        players[cpuId] = cpuPlayer;
      }

      io.emit("gameStarted", { players });
    });

    socket.on("playerMovement", (movementData) => {
      const player = players[socket.id];
      if (player) {
        player.x = movementData.x;
        player.y = movementData.y;
        player.angle = movementData.angle;
        player.speed = movementData.speed;
        player.nitro = movementData.nitro;
        player.nitroActive = movementData.nitroActive;
        player.drifting = movementData.drifting;
        
        socket.broadcast.emit("playerMoved", player);
      }
    });

    socket.on("lapFinished", (lapTime) => {
      const player = players[socket.id];
      if (player) {
        player.laps += 1;
        if (lapTime < player.bestLapTime) {
          player.bestLapTime = lapTime;
        }
        io.emit("lapUpdate", { id: player.id, laps: player.laps, bestLapTime: player.bestLapTime });
      }
    });

    socket.on("disconnect", () => {
      delete players[socket.id];
      io.emit("playerDisconnected", socket.id);
      if (Object.keys(players).filter(id => !id.startsWith('cpu_')).length === 0) {
        // Reset game if no humans left
        gameStatus = 'waiting';
        Object.keys(players).forEach(id => {
            if (id.startsWith('cpu_')) delete players[id];
        });
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed later)
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
