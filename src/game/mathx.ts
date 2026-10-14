/** Small math helpers shared across game systems. */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential smoothing. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/** Shortest signed angular difference, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function moveTowards(current: number, target: number, maxStep: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export function rectFromCenter(cx: number, cz: number, w: number, d: number): Rect {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

export function expandRect(r: Rect, by: number): Rect {
  return { minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by };
}

export function pointInRect(x: number, z: number, r: Rect): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Squared distance from a point to the closest point inside/on a rect. */
export function rectDistanceSq(x: number, z: number, r: Rect): number {
  const dx = x < r.minX ? r.minX - x : x > r.maxX ? x - r.maxX : 0;
  const dz = z < r.minZ ? r.minZ - z : z > r.maxZ ? z - r.maxZ : 0;
  return dx * dx + dz * dz;
}

export function closestPointInRect(x: number, z: number, r: Rect): { x: number; z: number } {
  return { x: clamp(x, r.minX, r.maxX), z: clamp(z, r.minZ, r.maxZ) };
}

/** Deterministic PRNG (mulberry32) so the city looks identical every session. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** Road-network (Manhattan) distance — a good proxy for actual drive distance. */
export function manhattan(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}
