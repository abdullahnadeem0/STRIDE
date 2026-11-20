import type { CSSProperties } from 'react';

export const SHEET_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261116_132032_30242d8c-5062-4d60-8a3d-238f0a2ff788.png&w=2200&q=85';

export const INTRO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261116_131908_b6239896-c077-450c-ad91-575153973fcf.mp4';

export const SW = 2688;
export const SH = 1520;
export const BH = (849 + 8) / (403 + 8); // ~2.085158

export type RectBox = [number, number, number, number];

export interface FlavorDef {
  id: number;
  name: string;
  lines: [string, string?];
  box: RectBox;
  color: string;
  bit: number;
  ingredients: string;
}

export const FLAVORS: FlavorDef[] = [
  {
    id: 0,
    name: 'Peanut Cocoa',
    lines: ['Peanut', 'Cocoa'],
    box: [98, 145, 403, 849],
    color: '#b79474',
    bit: 1,
    ingredients: 'Peanuts, oats, dates, cocoa, pea protein, sea salt.',
  },
  {
    id: 1,
    name: 'Berry Oat',
    lines: ['Berry', 'Oat'],
    box: [620, 145, 402, 849],
    color: '#ab9ac4',
    bit: 0,
    ingredients: 'Oats, blueberries, raspberries, dates, pea protein, almonds.',
  },
  {
    id: 2,
    name: 'Salted Caramel',
    lines: ['Salted', 'Caramel'],
    box: [1137, 145, 402, 849],
    color: '#d1ad6c',
    bit: 2,
    ingredients: 'Dates, cashews, oats, pea protein, sea salt, vanilla.',
  },
  {
    id: 3,
    name: 'Mint Chip',
    lines: ['Mint', 'Chip'],
    box: [1661, 145, 402, 849],
    color: '#94bdb4',
    bit: 3,
    ingredients: 'Oats, dark chocolate, almonds, pea protein, peppermint oil.',
  },
  {
    id: 4,
    name: 'Strawberry',
    lines: ['Strawberry'],
    box: [2184, 145, 403, 849],
    color: '#d396a7',
    bit: 4,
    ingredients: 'Oats, strawberries, dates, cashews, pea protein, lemon.',
  },
];

export const BITS: RectBox[] = [
  [650, 1090, 340, 305],  // 0: blueberries and raspberry
  [110, 1125, 280, 255],  // 1: chocolate chunks and peanuts
  [1175, 1110, 320, 285], // 2: salted caramel cube
  [1680, 1085, 380, 305], // 3: mint leaves and dark chocolate
  [2280, 1095, 250, 295], // 4: half strawberry
];

export interface HeroBitDef {
  x: number;
  y: number;
  size: number;
  rot: number;
  bit: number;
  hideOnPhone: boolean;
}

export const HERO_BITS: HeroBitDef[] = [
  { x: 0.12, y: 0.2, size: 120, rot: -18, bit: 0, hideOnPhone: false },
  { x: 0.86, y: 0.18, size: 96, rot: 22, bit: 2, hideOnPhone: true },
  { x: 0.07, y: 0.74, size: 84, rot: 12, bit: 3, hideOnPhone: false },
  { x: 0.655, y: 0.15, size: 78, rot: -10, bit: 4, hideOnPhone: true },
  { x: 0.205, y: 0.885, size: 70, rot: 30, bit: 1, hideOnPhone: true },
];

export interface InsideStepDef {
  num: string;
  headline: string[];
  caption: string[];
  ry: number;
}

export const INSIDE_STEPS: InsideStepDef[] = [
  {
    num: '01',
    headline: ['REAL FOOD,', 'FIRST'],
    caption: ['Oats, nuts, fruit.', "Nothing you can't say."],
    ry: 0,
  },
  {
    num: '02',
    headline: ['PRESSED,', 'NOT BAKED'],
    caption: ['Real ingredients.', 'Clean energy.'],
    ry: 180,
  },
  {
    num: '03',
    headline: ['WRAPPED', 'SAME DAY'],
    caption: ['Cold-pressed at dawn.', 'Sealed by noon.'],
    ry: 360,
  },
  {
    num: '04',
    headline: ['BERRY', 'OAT'],
    caption: ['12g plant protein.', 'No crash.'],
    ry: 720,
  },
];

export function spriteStyle(box: RectBox, pad = 0): CSSProperties {
  const x = box[0] - pad;
  const y = box[1] - pad;
  const w = box[2] + 2 * pad;
  const h = box[3] + 2 * pad;
  return {
    backgroundSize: `${(SW / w) * 100}% ${(SH / h) * 100}%`,
    backgroundPosition: `${(x / (SW - w)) * 100}% ${(y / (SH - h)) * 100}%`,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function cubicBezierSolver(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-5) break;
      const dx = sampleDX(t);
      if (Math.abs(dx) < 1e-5) break;
      t -= err / dx;
    }
    return clamp(sampleY(clamp(t, 0, 1)), 0, 1);
  };
}
