import React, { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; s: number; sx: number; sy: number;
  bo: number; to: number; co: number; wf: number;
  wa: number; wo: number; cm: number; z: number;
}

let _particles: Particle[] = [];
let _mouse = { x: -9999, y: -9999, vx: 0, vy: 0, px: -9999, py: -9999 };
let _time = 0;
let _clr: number[] = [184, 137, 80];
let _clr2: number[] = [200, 180, 230];
let _animId = 0;
let _W = 0, _H = 0;

function getAccentRGB(): number[] {
  const s = getComputedStyle(document.documentElement);
  const p = s.getPropertyValue("--accent-rgb").trim().split(",").map(Number);
  return p.length === 3 ? p : [184, 137, 80];
}

function getAccentRGB2(): number[] {
  const s = getComputedStyle(document.documentElement);
  const p = s.getPropertyValue("--particle-color2").trim().split(",").map(Number);
  return p.length === 3 ? p : [200, 180, 230];
}

function createParticle(W: number, H: number): Particle {
  return {
    x: Math.random() * W, y: Math.random() * H,
    s: 1.2 + Math.random() * 2.2,
    sx: (Math.random() - 0.5) * 0.2, sy: (Math.random() - 0.5) * 0.2,
    bo: 0.12 + Math.random() * 0.35, to: 0.12 + Math.random() * 0.35,
    co: 0.12 + Math.random() * 0.35,
    wf: 0.005 + Math.random() * 0.015, wa: 0.3 + Math.random() * 0.8,
    wo: Math.random() * 6.28, cm: Math.random(), z: 0.5 + Math.random() * 0.5,
  };
}

function initParticles(W: number, H: number) {
  _particles = [];
  for (let i = 0; i < 200; i++) _particles.push(createParticle(W, H));
}

export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let W: number, H: number, running = true;
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      _W = W; _H = H;
      if (_particles.length === 0) initParticles(W, H);
    }
    resize();
    window.addEventListener("resize", resize);
    const onMove = (e: MouseEvent) => {
      _mouse.px = _mouse.x; _mouse.py = _mouse.y;
      _mouse.x = e.clientX; _mouse.y = e.clientY;
      _mouse.vx = _mouse.x - _mouse.px; _mouse.vy = _mouse.y - _mouse.py;
    };
    const onLeave = () => { _mouse.x = -9999; _mouse.y = -9999; _mouse.vx = 0; _mouse.vy = 0; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    let fc = 0;
    function animate() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      _time += 0.015; fc++;
      if (fc % 30 === 0) { _clr = getAccentRGB(); _clr2 = getAccentRGB2(); }
      for (const p of _particles) {
        const wb = Math.sin(_time * p.wf + p.wo) * p.wa;
        p.sx += (Math.random() - 0.5) * 0.02;
        p.sy += (Math.random() - 0.5) * 0.02;
        p.sx *= 0.96; p.sy *= 0.96;
        const dx = p.x - _mouse.x, dy = p.y - _mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const md = 200 * p.z;
        if (dist < md && dist > 0) {
          const force = (1 - dist / md) * 0.7 * p.z;
          const angle = Math.atan2(dy, dx);
          const fa = Math.atan2(_mouse.vy, _mouse.vx);
          const fi = Math.min(1, Math.sqrt(_mouse.vx * _mouse.vx + _mouse.vy * _mouse.vy) * 0.08);
          p.sx += Math.cos(angle) * force + Math.cos(fa) * fi * 0.4;
          p.sy += Math.sin(angle) * force + Math.sin(fa) * fi * 0.4;
          p.to = 0.05 + (dist / md) * p.bo;
        } else { p.to = p.bo; }
          p.co += (p.to - p.co) * 0.06;
        p.x += p.sx + wb * 0.02;
        p.y += p.sy + Math.cos(_time * p.wf + p.wo) * 0.1;
        if (p.x < -20) p.x = W + 20;
        if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20;
        if (p.y > H + 20) p.y = -20;
        const r = _clr[0] + (_clr2[0] - _clr[0]) * p.cm;
        const g = _clr[1] + (_clr2[1] - _clr[1]) * p.cm;
        const b = _clr[2] + (_clr2[2] - _clr[2]) * p.cm;
        const a = p.co * p.z;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * p.z * 3);
        grad.addColorStop(0, `rgba(${r|0},${g|0},${b|0},${a * 0.5})`);
        grad.addColorStop(0.3, `rgba(${r|0},${g|0},${b|0},${a * 0.15})`);
        grad.addColorStop(1, `rgba(${r|0},${g|0},${b|0},0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * p.z, 0, 6.28);
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * p.z * 0.35, 0, 6.28);
        ctx.fillStyle = `rgba(255,255,255,${a * 0.2})`; ctx.fill();
      }
      if (fc % 2 === 0) {
        for (let i = 0; i < _particles.length; i++) {
          for (let j = i + 1; j < _particles.length; j++) {
            const dx = _particles[i].x - _particles[j].x;
            const dy = _particles[i].y - _particles[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 100) {
              const a = (1 - d / 100) * 0.04;
              ctx.beginPath();
              ctx.moveTo(_particles[i].x, _particles[i].y);
              ctx.lineTo(_particles[j].x, _particles[j].y);
              ctx.strokeStyle = `rgba(${_clr[0]},${_clr[1]},${_clr[2]},${a})`;
              ctx.lineWidth = 0.4; ctx.stroke();
            }
          }
        }
      }
      _animId = requestAnimationFrame(animate);
    }
    initParticles(W, H);
    animate();
    window.__onThemeChange = () => { _clr = getAccentRGB(); _clr2 = getAccentRGB2(); };
    window.__burstParticles = (cx: number, cy: number, count = 30) => {
      for (let i = 0; i < count; i++) {
        const p = createParticle(_W || window.innerWidth, _H || window.innerHeight);
        p.x = cx; p.y = cy;
        p.s = 1 + Math.random() * 4;
        const angle = Math.random() * 6.28;
        const speed = 3 + Math.random() * 8;
        p.sx = Math.cos(angle) * speed; p.sy = Math.sin(angle) * speed;
        p.bo = 0.2 + Math.random() * 0.6;
        _particles.push(p);
      }
      if (_particles.length > 400) _particles.splice(0, _particles.length - 400);
    };
    return () => {
      running = false; cancelAnimationFrame(_animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      delete (win