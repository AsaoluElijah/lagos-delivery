/**
 * Hand-authored layout of the fictional Yaba-inspired neighbourhood.
 *
 * The road network is a set of axis-aligned rectangles. Because the drivable
 * area is exactly the union of those rectangles (plus a forgiving sidewalk
 * band), keeping the rider on the roads also guarantees the rider can never
 * drive through a building — no physics engine required.
 */

import { BLOCK_INSET, PALETTE, PROP_BAND, ROAD } from "../config";
import {
  expandRect,
  makeRng,
  pick,
  rectFromCenter,
  rectsOverlap,
  type Rect,
} from "../mathx";

export interface Street {
  name: string;
  axis: "x" | "z";
  /** Position on the perpendicular axis (z for an x-axis street). */
  at: number;
  /** Extent along the street's own axis. */
  from: number;
  to: number;
}

/** Streets that run east/west (along X). */
export const H_STREETS: readonly Street[] = [
  { name: "Ojuelegba Road", axis: "x", at: -72, from: -60, to: 60 },
  { name: "Herbert Macaulay Way", axis: "x", at: -24, from: -60, to: 60 },
  { name: "Commercial Avenue", axis: "x", at: 24, from: -60, to: 60 },
  { name: "Murtala Muhammed Way", axis: "x", at: 72, from: -60, to: 60 },
];

/** Streets that run north/south (along Z). */
export const V_STREETS: readonly Street[] = [
  { name: "Queen Street", axis: "z", at: -60, from: -72, to: 72 },
  { name: "Tejuosho Street", axis: "z", at: 0, from: -72, to: 72 },
  { name: "Birrel Avenue", axis: "z", at: 60, from: -72, to: 72 },
];

export const STREETS: readonly Street[] = [...H_STREETS, ...V_STREETS];

export const H_LINES = H_STREETS.map((s) => s.at);
export const V_LINES = V_STREETS.map((s) => s.at);

/** Playable bounds (outer edge of the ring road). */
export const BOUNDS = {
  minX: V_LINES[0] - ROAD.halfWidth,
  maxX: V_LINES[V_LINES.length - 1] + ROAD.halfWidth,
  minZ: H_LINES[0] - ROAD.halfWidth,
  maxZ: H_LINES[H_LINES.length - 1] + ROAD.halfWidth,
};

/** Ground plane size — larger than the playable area for visual depth. */
export const WORLD = { width: 300, depth: 340 };

/**
 * Asphalt rectangles. Streets are extended by halfWidth on each end so the
 * intersections are fully paved (no missing corners).
 */
export function roadRects(): Rect[] {
  return STREETS.map((s) =>
    s.axis === "x"
      ? {
          minX: s.from - ROAD.halfWidth,
          maxX: s.to + ROAD.halfWidth,
          minZ: s.at - ROAD.halfWidth,
          maxZ: s.at + ROAD.halfWidth,
        }
      : {
          minX: s.at - ROAD.halfWidth,
          maxX: s.at + ROAD.halfWidth,
          minZ: s.from - ROAD.halfWidth,
          maxZ: s.to + ROAD.halfWidth,
        },
  );
}

/** Road rects grown by the sidewalk band — this is the full drivable area. */
export function drivableRects(): Rect[] {
  return roadRects().map((r) => expandRect(r, ROAD.sidewalk));
}

export interface Block {
  id: string;
  /** Full block footprint, from road edge to road edge. */
  rect: Rect;
  /** Buildable area, inset to leave room for sidewalks and markers. */
  buildable: Rect;
  center: { x: number; z: number };
  /** Flavour drives building height/shape and whether it becomes a park. */
  flavour: "market" | "residential" | "commercial" | "park";
}

const BLOCK_FLAVOURS: Block["flavour"][] = [
  "commercial",
  "residential",
  "market",
  "residential",
  "park",
  "commercial",
];

/** The six city blocks enclosed by the street grid. */
export function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  for (let c = 0; c < V_LINES.length - 1; c++) {
    for (let r = 0; r < H_LINES.length - 1; r++) {
      const rect: Rect = {
        minX: V_LINES[c] + ROAD.halfWidth,
        maxX: V_LINES[c + 1] - ROAD.halfWidth,
        minZ: H_LINES[r] + ROAD.halfWidth,
        maxZ: H_LINES[r + 1] - ROAD.halfWidth,
      };
      blocks.push({
        id: `b${c}${r}`,
        rect,
        buildable: expandRect(rect, -BLOCK_INSET),
        center: { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 },
        flavour: BLOCK_FLAVOURS[i % BLOCK_FLAVOURS.length],
      });
      i++;
    }
  }
  return blocks;
}

export const BLOCKS = buildBlocks();

export interface BuildingSpec {
  rect: Rect;
  height: number;
  color: string;
  roof: string;
  /** Adds a stepped-back upper storey. */
  tiered: boolean;
  /** Adds a shop awning on the long side facing the nearest road. */
  awning: boolean;
}

/**
 * Fills each block with buildings.
 *
 * Rather than rejection-sampling random footprints (which starves once the
 * named-location facades take up space), each block's buildable area is
 * subdivided into a grid of plots. Free plots get a building, and adjacent
 * free plots are occasionally merged into a wider one for variety. `reserved`
 * holds the footprints of named locations, whose plots are simply skipped.
 */
export function generateBuildings(reserved: readonly Rect[]): BuildingSpec[] {
  const rng = makeRng(0x1a60513);
  const out: BuildingSpec[] = [];
  const blocked: Rect[] = reserved.map((r) => expandRect(r, 1.4));

  for (const block of BLOCKS) {
    if (block.flavour === "park") continue;

    const b = block.buildable;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;

    // Fine-grained plots: small footprints read as a dense Lagos street front,
    // and they waste far less space around the big named-location facades.
    const plotSize = block.flavour === "market" ? 8 : 9.5;
    const cols = Math.max(2, Math.round(spanX / plotSize));
    const rows = Math.max(1, Math.round(spanZ / plotSize));
    const cellW = spanX / cols;
    const cellD = spanZ / rows;

    const used: boolean[] = new Array(cols * rows).fill(false);
    const plotFree = (c: number, r: number) => {
      if (c < 0 || c >= cols || r < 0 || r >= rows) return false;
      if (used[r * cols + c]) return false;
      const plot: Rect = {
        minX: b.minX + c * cellW,
        maxX: b.minX + (c + 1) * cellW,
        minZ: b.minZ + r * cellD,
        maxZ: b.minZ + (r + 1) * cellD,
      };
      return !blocked.some((t) => rectsOverlap(plot, t));
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!plotFree(c, r)) continue;

        // Occasionally take the neighbouring plot too for a wider building.
        const wide = c + 1 < cols && plotFree(c + 1, r) && rng() > 0.62;
        const span = wide ? 2 : 1;
        for (let i = 0; i < span; i++) used[r * cols + c + i] = true;

        const gap = 1.9;
        const w = cellW * span - gap - rng() * 1.4;
        const d = cellD - gap - rng() * 1.4;
        const cx = b.minX + (c + span / 2) * cellW + (rng() - 0.5) * 0.9;
        const cz = b.minZ + (r + 0.5) * cellD + (rng() - 0.5) * 0.9;
        const rect = rectFromCenter(cx, cz, w, d);

        const tall = block.flavour === "commercial";
        const height =
          block.flavour === "market"
            ? 5 + rng() * 4.5
            : tall
              ? 11 + rng() * 16
              : 8 + rng() * 10;

        out.push({
          rect,
          height,
          color: pick(rng, PALETTE.buildings),
          roof: pick(rng, PALETTE.roofs),
          tiered: tall && rng() > 0.45,
          awning: block.flavour === "market" || rng() > 0.7,
        });
        c += span - 1;
      }
    }
  }
  return out;
}

export interface PropSpec {
  kind: "tree" | "palm" | "stall" | "sign" | "kiosk" | "barrel" | "umbrella";
  x: number;
  z: number;
  rotY: number;
  scale: number;
  color: string;
}

/**
 * Scatters street furniture along the sidewalk-adjacent band of every block.
 * Props sit just outside the drivable area so the rider never clips them.
 */
export function generateProps(blocked: readonly Rect[]): PropSpec[] {
  const rng = makeRng(0x7a8a77);
  const props: PropSpec[] = [];
  const taken: Rect[] = blocked.map((r) => expandRect(r, 1.2));

  const tryPlace = (kind: PropSpec["kind"], x: number, z: number, rotY: number) => {
    const size = kind === "tree" || kind === "palm" ? 3.4 : 3.0;
    const rect = rectFromCenter(x, z, size, size);
    if (taken.some((t) => rectsOverlap(rect, t))) return;
    taken.push(expandRect(rect, 1.0));
    props.push({
      kind,
      x,
      z,
      rotY,
      scale: 0.85 + rng() * 0.45,
      color:
        kind === "stall" || kind === "umbrella" || kind === "kiosk"
          ? pick(rng, PALETTE.stall)
          : PALETTE.tree,
    });
  };

  const bandAt = () => PROP_BAND.min + rng() * (PROP_BAND.max - PROP_BAND.min);
  const kinds: PropSpec["kind"][] = [
    "tree",
    "tree",
    "palm",
    "stall",
    "umbrella",
    "kiosk",
    "barrel",
    "sign",
  ];

  for (const block of BLOCKS) {
    const { rect } = block;
    // Walk each of the block's four road-facing edges at a regular spacing.
    const stepsX = Math.max(2, Math.floor((rect.maxX - rect.minX) / 11));
    const stepsZ = Math.max(2, Math.floor((rect.maxZ - rect.minZ) / 11));

    for (let i = 0; i <= stepsX; i++) {
      const x = rect.minX + ((rect.maxX - rect.minX) * i) / stepsX;
      const southRoad = rect.minZ - ROAD.halfWidth;
      const northRoad = rect.maxZ + ROAD.halfWidth;
      if (rng() > 0.25) tryPlace(pick(rng, kinds), x, southRoad + bandAt(), Math.PI);
      if (rng() > 0.25) tryPlace(pick(rng, kinds), x, northRoad - bandAt(), 0);
    }
    for (let i = 0; i <= stepsZ; i++) {
      const z = rect.minZ + ((rect.maxZ - rect.minZ) * i) / stepsZ;
      const westRoad = rect.minX - ROAD.halfWidth;
      const eastRoad = rect.maxX + ROAD.halfWidth;
      if (rng() > 0.25) tryPlace(pick(rng, kinds), westRoad + bandAt(), z, Math.PI / 2);
      if (rng() > 0.25) tryPlace(pick(rng, kinds), eastRoad - bandAt(), z, -Math.PI / 2);
    }

    // Parks get a dense cluster of greenery in the middle.
    if (block.flavour === "park") {
      for (let i = 0; i < 16; i++) {
        const x = block.buildable.minX + rng() * (block.buildable.maxX - block.buildable.minX);
        const z = block.buildable.minZ + rng() * (block.buildable.maxZ - block.buildable.minZ);
        tryPlace(rng() > 0.4 ? "tree" : "palm", x, z, rng() * Math.PI * 2);
      }
    }
  }

  return props;
}

/** Decorative buildings outside the ring road, for skyline depth. */
export function generateOutskirts(): BuildingSpec[] {
  const rng = makeRng(0x5151ac);
  const out: BuildingSpec[] = [];
  const pad = 16;
  const ring = [
    { minX: BOUNDS.minX - 70, maxX: BOUNDS.maxX + 70, minZ: BOUNDS.maxZ + pad, maxZ: BOUNDS.maxZ + 72 },
    { minX: BOUNDS.minX - 70, maxX: BOUNDS.maxX + 70, minZ: BOUNDS.minZ - 72, maxZ: BOUNDS.minZ - pad },
    { minX: BOUNDS.minX - 72, maxX: BOUNDS.minX - pad, minZ: BOUNDS.minZ - 20, maxZ: BOUNDS.maxZ + 20 },
    { minX: BOUNDS.maxX + pad, maxX: BOUNDS.maxX + 72, minZ: BOUNDS.minZ - 20, maxZ: BOUNDS.maxZ + 20 },
  ];
  const taken: Rect[] = [];
  for (const zone of ring) {
    for (let a = 0; a < 160; a++) {
      const w = 11 + rng() * 17;
      const d = 11 + rng() * 17;
      if (zone.maxX - zone.minX < w || zone.maxZ - zone.minZ < d) continue;
      const cx = zone.minX + w / 2 + rng() * (zone.maxX - zone.minX - w);
      const cz = zone.minZ + d / 2 + rng() * (zone.maxZ - zone.minZ - d);
      const rect = rectFromCenter(cx, cz, w, d);
      const padded = expandRect(rect, 2.4);
      if (taken.some((t) => rectsOverlap(padded, t))) continue;
      taken.push(padded);
      out.push({
        rect,
        height: 7 + rng() * 22,
        color: pick(rng, PALETTE.buildings),
        roof: pick(rng, PALETTE.roofs),
        tiered: rng() > 0.7,
        awning: false,
      });
    }
  }
  return out;
}

/** Where the rider spawns: northbound on Tejuosho Street. */
export const RIDER_SPAWN: { x: number; z: number; yaw: number } = {
  x: ROAD.laneOffset,
  z: -6,
  yaw: 0,
};
