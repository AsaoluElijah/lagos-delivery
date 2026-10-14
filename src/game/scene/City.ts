/**
 * Procedurally assembles the whole neighbourhood from primitives.
 *
 * Everything static is merged into a handful of meshes (asphalt, markings,
 * buildings, facades) and repeated props become hardware instances, so the
 * entire city renders in roughly a dozen draw calls.
 */

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { PALETTE, ROAD } from "../config";
import {
  BLOCKS,
  H_LINES,
  V_LINES,
  generateBuildings,
  generateOutskirts,
  generateProps,
  roadRects,
  type BuildingSpec,
  type PropSpec,
} from "../data/map";
import { LOCATIONS, type GameLocation } from "../data/locations";
import { makeRng, type Rect } from "../mathx";
import { combine, part_box, part_cyl, part_slab, part_sphere } from "./meshkit";

const GLASS_DARK = "#33505f";
const GLASS_LIT = "#ffdd8a";
const GLASS_COOL = "#a9dcf0";

const Y = {
  road: 0.02,
  crosswalk: 0.09,
  lane: 0.16,
  pavement: 0.24,
  blockFill: 0.3,
} as const;

const rectW = (r: Rect) => r.maxX - r.minX;
const rectD = (r: Rect) => r.maxZ - r.minZ;
const rectCX = (r: Rect) => (r.minX + r.maxX) / 2;
const rectCZ = (r: Rect) => (r.minZ + r.maxZ) / 2;

/* ------------------------------------------------------------------ roads */

function buildRoadSurface(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (const r of roadRects()) {
    parts.push(
      part_slab(scene, {
        w: rectW(r),
        d: rectD(r),
        x: rectCX(r),
        z: rectCZ(r),
        y: Y.road,
        color: PALETTE.asphalt,
      }),
    );
  }
  const mesh = combine("roads", parts, scene);
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

function buildRoadMarkings(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const dash = 5;
  const gap = 5.5;
  const halfW = ROAD.halfWidth;

  const dashRun = (
    from: number,
    to: number,
    along: "x" | "z",
    at: number,
    skip: readonly number[],
  ) => {
    for (let p = from; p < to; p += dash + gap) {
      const c = p + dash / 2;
      if (c > to) break;
      // Leave intersections clear.
      if (skip.some((s) => Math.abs(c - s) < halfW + 3.5)) continue;
      parts.push(
        part_slab(scene, {
          w: along === "x" ? dash : 0.55,
          d: along === "x" ? 0.55 : dash,
          x: along === "x" ? c : at,
          z: along === "x" ? at : c,
          y: Y.lane,
          color: PALETTE.laneMark,
        }),
      );
    }
  };

  for (const z of H_LINES) dashRun(-60, 60, "x", z, V_LINES);
  for (const x of V_LINES) dashRun(-72, 72, "z", x, H_LINES);

  // Zebra crossings on every approach to every intersection.
  for (const x of V_LINES) {
    for (const z of H_LINES) {
      const stripes = 5;
      for (let s = 0; s < stripes; s++) {
        const o = -halfW + 1.2 + (s * (halfW * 2 - 2.4)) / (stripes - 1);
        const d = halfW + 3.4;
        // North & south approaches (stripes run along X).
        parts.push(
          part_slab(scene, { w: 1.1, d: 3.2, x: x + o, z: z + d, y: Y.crosswalk, color: PALETTE.laneMark }),
          part_slab(scene, { w: 1.1, d: 3.2, x: x + o, z: z - d, y: Y.crosswalk, color: PALETTE.laneMark }),
          part_slab(scene, { w: 3.2, d: 1.1, x: x + d, z: z + o, y: Y.crosswalk, color: PALETTE.laneMark }),
          part_slab(scene, { w: 3.2, d: 1.1, x: x - d, z: z + o, y: Y.crosswalk, color: PALETTE.laneMark }),
        );
      }
    }
  }

  const mesh = combine("markings", parts, scene);
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

function buildPavements(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (const block of BLOCKS) {
    const { rect } = block;
    // Raised pavement slab spanning the whole block, plus a kerb lip.
    parts.push(
      part_box(scene, {
        w: rectW(rect) + 0.4,
        h: Y.pavement,
        d: rectD(rect) + 0.4,
        x: rectCX(rect),
        y: Y.pavement / 2,
        z: rectCZ(rect),
        color: PALETTE.sidewalk,
      }),
    );
    // Inner surface: grass for parks, dusty concrete elsewhere.
    const fill = block.flavour === "park" ? PALETTE.grass : "#bdb3a1";
    parts.push(
      part_slab(scene, {
        w: rectW(block.buildable) + 2,
        d: rectD(block.buildable) + 2,
        x: block.center.x,
        z: block.center.z,
        y: Y.blockFill,
        color: fill,
      }),
    );
  }
  const mesh = combine("pavements", parts, scene);
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/* -------------------------------------------------------------- buildings */

interface WindowOpts {
  /** Which local faces receive windows. */
  faces: ReadonlyArray<"north" | "south" | "east" | "west">;
}

function addWindows(
  scene: Scene,
  parts: Mesh[],
  rect: Rect,
  height: number,
  seed: number,
  opts: WindowOpts,
) {
  const rng = makeRng(seed);
  const w = rectW(rect);
  const d = rectD(rect);
  const storey = 3.3;
  const winH = 1.45;
  const winW = 1.15;
  const floors = Math.max(1, Math.floor((height - 1.6) / storey));

  for (let f = 0; f < floors; f++) {
    const y = 2.1 + f * storey;
    if (y + winH / 2 > height - 0.5) break;

    const glass = () => {
      const r = rng();
      return r > 0.82 ? GLASS_LIT : r > 0.4 ? GLASS_DARK : GLASS_COOL;
    };

    const nx = Math.max(1, Math.round(w / 2.9));
    const nz = Math.max(1, Math.round(d / 2.9));

    if (opts.faces.includes("south")) {
      for (let i = 0; i < nx; i++) {
        const x = rect.minX + ((i + 0.5) * w) / nx;
        parts.push(
          part_box(scene, { w: winW, h: winH, d: 0.14, x, y, z: rect.minZ - 0.05, color: glass() }),
        );
      }
    }
    if (opts.faces.includes("north")) {
      for (let i = 0; i < nx; i++) {
        const x = rect.minX + ((i + 0.5) * w) / nx;
        parts.push(
          part_box(scene, { w: winW, h: winH, d: 0.14, x, y, z: rect.maxZ + 0.05, color: glass() }),
        );
      }
    }
    if (opts.faces.includes("west")) {
      for (let i = 0; i < nz; i++) {
        const z = rect.minZ + ((i + 0.5) * d) / nz;
        parts.push(
          part_box(scene, { w: 0.14, h: winH, d: winW, x: rect.minX - 0.05, y, z, color: glass() }),
        );
      }
    }
    if (opts.faces.includes("east")) {
      for (let i = 0; i < nz; i++) {
        const z = rect.minZ + ((i + 0.5) * d) / nz;
        parts.push(
          part_box(scene, { w: 0.14, h: winH, d: winW, x: rect.maxX + 0.05, y, z, color: glass() }),
        );
      }
    }
  }
}

/** Generic block building: body, roof cap, optional tier, awning and windows. */
function addBuilding(scene: Scene, parts: Mesh[], spec: BuildingSpec, seed: number, far: boolean) {
  const { rect, height, color, roof } = spec;
  const w = rectW(rect);
  const d = rectD(rect);
  const cx = rectCX(rect);
  const cz = rectCZ(rect);
  const mainH = spec.tiered ? height * 0.66 : height;

  parts.push(part_box(scene, { w, h: mainH, d, x: cx, y: mainH / 2, z: cz, color }));
  parts.push(
    part_box(scene, { w: w + 0.8, h: 0.55, d: d + 0.8, x: cx, y: mainH + 0.27, z: cz, color: roof }),
  );

  if (spec.tiered) {
    const w2 = w * 0.62;
    const d2 = d * 0.62;
    const h2 = height - mainH;
    parts.push(part_box(scene, { w: w2, h: h2, d: d2, x: cx, y: mainH + h2 / 2, z: cz, color }));
    parts.push(
      part_box(scene, {
        w: w2 + 0.6,
        h: 0.45,
        d: d2 + 0.6,
        x: cx,
        y: mainH + h2 + 0.22,
        z: cz,
        color: roof,
      }),
    );
    // Rooftop water tank — a very Lagos silhouette.
    parts.push(
      part_cyl(scene, {
        diameter: 1.9,
        h: 1.7,
        tess: 10,
        x: cx + w2 * 0.2,
        y: mainH + h2 + 1.3,
        z: cz,
        color: "#cfd6d8",
      }),
    );
  } else {
    parts.push(
      part_cyl(scene, {
        diameter: 1.7,
        h: 1.5,
        tess: 10,
        x: cx - w * 0.22,
        y: mainH + 1.3,
        z: cz + d * 0.15,
        color: "#cfd6d8",
      }),
    );
  }

  if (far) return;

  if (spec.awning) {
    const aw = Math.min(w * 0.82, 12);
    parts.push(
      part_box(scene, {
        w: aw,
        h: 0.26,
        d: 3.4,
        x: cx,
        y: 3.3,
        z: rect.minZ - 1.5,
        rx: -0.3,
        color: PALETTE.stall[seed % PALETTE.stall.length],
      }),
    );
    parts.push(
      part_box(scene, { w: 0.2, h: 2.8, d: 0.2, x: cx - aw / 2 + 0.4, y: 1.4, z: rect.minZ - 3.0, color: "#6b5b45" }),
      part_box(scene, { w: 0.2, h: 2.8, d: 0.2, x: cx + aw / 2 - 0.4, y: 1.4, z: rect.minZ - 3.0, color: "#6b5b45" }),
    );
    // Sign board over the awning.
    parts.push(
      part_box(scene, { w: aw * 0.7, h: 1.1, d: 0.22, x: cx, y: 4.9, z: rect.minZ - 0.18, color: "#f6f1e2" }),
      part_box(scene, { w: aw * 0.55, h: 0.22, d: 0.3, x: cx, y: 4.9, z: rect.minZ - 0.25, color: roof }),
    );
  }

  addWindows(scene, parts, rect, mainH, seed, { faces: ["south", "east", "west"] });
}

/* ----------------------------------------------------------- facades (POI) */

/**
 * Builds a named location's building in *local* space (front face toward -Z,
 * centred on the origin) then bakes it into world space using the location's
 * rotation. Authoring in local space keeps all four orientations identical.
 */
function buildFacade(scene: Scene, loc: GameLocation): Mesh {
  const { w, d, h, style, color, roof } = loc.facade;
  const parts: Mesh[] = [];
  const local: Rect = { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 };
  const front = -d / 2;

  parts.push(part_box(scene, { w, h, d, y: h / 2, color }));
  parts.push(part_box(scene, { w: w + 0.9, h: 0.6, d: d + 0.9, y: h + 0.3, color: roof }));

  // Entrance: doorway + step.
  parts.push(part_box(scene, { w: 2.4, h: 2.8, d: 0.2, y: 1.4, z: front - 0.1, color: "#4a3b2c" }));
  parts.push(part_box(scene, { w: 3.6, h: 0.22, d: 1.6, y: 0.11, z: front - 0.9, color: "#e3dccb" }));

  // Big sign board above the door, with an accent stripe.
  const signW = Math.min(w * 0.78, 13);
  parts.push(part_box(scene, { w: signW, h: 1.5, d: 0.26, y: Math.min(h - 0.9, 4.4), z: front - 0.2, color: "#fbf6e8" }));
  parts.push(
    part_box(scene, { w: signW * 0.9, h: 0.3, d: 0.34, y: Math.min(h - 0.9, 4.4) - 0.5, z: front - 0.24, color: roof }),
  );

  if (style === "buka" || style === "shop") {
    const aw = w * 0.9;
    parts.push(part_box(scene, { w: aw, h: 0.28, d: 3.8, y: 3.0, z: front - 1.7, rx: -0.32, color: "#e45a4f" }));
    parts.push(
      part_box(scene, { w: 0.22, h: 2.6, d: 0.22, x: -aw / 2 + 0.5, y: 1.3, z: front - 3.3, color: "#6b5b45" }),
      part_box(scene, { w: 0.22, h: 2.6, d: 0.22, x: aw / 2 - 0.5, y: 1.3, z: front - 3.3, color: "#6b5b45" }),
    );
    // Plastic tables and stools out front.
    for (let i = -1; i <= 1; i += 2) {
      const tx = i * (w * 0.26);
      parts.push(part_cyl(scene, { diameter: 1.9, h: 0.12, tess: 10, x: tx, y: 0.78, z: front - 2.3, color: "#f0f2f3" }));
      parts.push(part_cyl(scene, { diameter: 0.3, h: 0.78, tess: 6, x: tx, y: 0.39, z: front - 2.3, color: "#dfe3e5" }));
      parts.push(part_box(scene, { w: 0.6, h: 0.5, d: 0.6, x: tx - 1.3, y: 0.25, z: front - 2.3, color: "#e8b23c" }));
      parts.push(part_box(scene, { w: 0.6, h: 0.5, d: 0.6, x: tx + 1.3, y: 0.25, z: front - 2.3, color: "#36a07a" }));
    }
    if (style === "buka") {
      // Cooking pot on a stand, with a little steam puff.
      parts.push(part_cyl(scene, { diameter: 1.5, h: 1.0, tess: 10, x: -w * 0.38, y: 0.75, z: front - 1.2, color: "#3b3f45" }));
      parts.push(part_sphere(scene, { diameter: 1.3, segments: 6, x: -w * 0.38, y: 1.9, z: front - 1.2, color: "#f4f1ea", scaleY: 0.6 }));
    }
  }

  if (style === "hub") {
    // Roller shutter + stacked crates.
    parts.push(part_box(scene, { w: w * 0.5, h: 3.6, d: 0.22, y: 1.8, z: front - 0.14, color: "#b9c0c6" }));
    for (let i = 0; i < 4; i++) {
      parts.push(
        part_box(scene, {
          w: 1.5,
          h: 1.5,
          d: 1.5,
          x: w * 0.33 - (i % 2) * 1.7,
          y: 0.75 + Math.floor(i / 2) * 1.55,
          z: front - 1.4,
          ry: 0.2 * i,
          color: i % 2 === 0 ? "#c98a4b" : "#d9a35f",
        }),
      );
    }
  }

  if (style === "flats" || style === "tower") {
    // Balcony slabs with a railing and posts, up the front face.
    const storeys = Math.max(1, Math.floor((h - 4) / 3.3));
    const bw = w * 0.74;
    for (let f = 0; f < storeys; f++) {
      const y = 5.9 + f * 3.3;
      if (y > h - 1.2) break;
      parts.push(part_box(scene, { w: bw, h: 0.16, d: 1.05, y, z: front - 0.52, color: "#efe8da" }));
      parts.push(part_box(scene, { w: bw, h: 0.62, d: 0.1, y: y + 0.38, z: front - 1.0, color: roof }));
      for (let i = -1; i <= 1; i++) {
        parts.push(
          part_box(scene, { w: 0.12, h: 0.62, d: 0.12, x: (i * bw) / 2.1, y: y + 0.38, z: front - 1.0, color: "#efe8da" }),
        );
      }
    }
    parts.push(part_cyl(scene, { diameter: 2.1, h: 1.9, tess: 10, x: w * 0.22, y: h + 1.5, color: "#cfd6d8" }));
  }

  if (style === "house") {
    // Pitched roof from two tilted slabs.
    parts.push(part_box(scene, { w: w * 0.62, h: 0.4, d: d + 1.2, y: h + 1.4, z: -w * 0.16, rz: 0.52, color: roof }));
    parts.push(part_box(scene, { w: w * 0.62, h: 0.4, d: d + 1.2, y: h + 1.4, z: w * 0.16, rz: -0.52, color: roof }));
    // Compound gate.
    parts.push(part_box(scene, { w: w + 1.5, h: 2.2, d: 0.3, y: 1.1, z: front - 3.6, color: "#5fbfa5" }));
    parts.push(part_box(scene, { w: 0.5, h: 2.7, d: 0.5, x: -(w + 1.5) / 2, y: 1.35, z: front - 3.6, color: "#b6ab96" }));
    parts.push(part_box(scene, { w: 0.5, h: 2.7, d: 0.5, x: (w + 1.5) / 2, y: 1.35, z: front - 3.6, color: "#b6ab96" }));
  }

  addWindows(scene, parts, local, h, loc.id.length * 977 + 13, {
    faces: ["south", "east", "west", "north"],
  });

  const mesh = combine(`facade_${loc.id}`, parts, scene);
  mesh.position.set(loc.facadeX, 0, loc.facadeZ);
  mesh.rotation.y = loc.rotY;
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

/** Permanent ground pad + pylon identifying every pickup/drop-off. */
function buildLocationPads(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  for (const loc of LOCATIONS) {
    const accent =
      loc.kind === "food" ? "#ff7a3d" : loc.kind === "parcel" ? "#3f8fe0" : "#2fbf7f";

    parts.push(part_cyl(scene, { diameter: 6.6, h: 0.1, tess: 20, x: loc.x, y: 0.34, z: loc.z, color: "#ffffff" }));
    parts.push(part_cyl(scene, { diameter: 5.4, h: 0.12, tess: 20, x: loc.x, y: 0.36, z: loc.z, color: accent }));
    parts.push(part_cyl(scene, { diameter: 3.2, h: 0.14, tess: 20, x: loc.x, y: 0.38, z: loc.z, color: "#fdf8ec" }));

    // Signpost beside the pad.
    const px = loc.x + Math.sin(loc.rotY + Math.PI / 2) * 2.6;
    const pz = loc.z + Math.cos(loc.rotY + Math.PI / 2) * 2.6;
    parts.push(part_cyl(scene, { diameter: 0.26, h: 3.4, tess: 6, x: px, y: 1.7, z: pz, color: "#9aa0a6" }));
    parts.push(
      part_box(scene, { w: 2.2, h: 1.2, d: 0.18, x: px, y: 3.5, z: pz, ry: loc.rotY, color: accent }),
    );
  }
  const mesh = combine("location_pads", parts, scene);
  mesh.isPickable = false;
  mesh.freezeWorldMatrix();
  return mesh;
}

/* ------------------------------------------------------------------ props */

function propPrototype(scene: Scene, kind: PropSpec["kind"], color: string): Mesh {
  const parts: Mesh[] = [];
  switch (kind) {
    case "tree":
      parts.push(part_cyl(scene, { diameter: 0.5, h: 2.4, tess: 6, y: 1.2, color: PALETTE.trunk }));
      parts.push(part_sphere(scene, { diameter: 3.6, segments: 6, y: 3.5, color: PALETTE.tree, scaleY: 0.85 }));
      parts.push(part_sphere(scene, { diameter: 2.6, segments: 6, x: 0.8, y: 4.4, z: 0.3, color: PALETTE.treeDark }));
      break;
    case "palm":
      parts.push(part_cyl(scene, { diameter: 0.42, dTop: 0.3, h: 5.2, tess: 6, y: 2.6, color: "#8a6b47" }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push(
          part_box(scene, {
            w: 3.4,
            h: 0.14,
            d: 0.85,
            x: Math.cos(a) * 1.5,
            y: 5.1,
            z: Math.sin(a) * 1.5,
            ry: -a,
            rz: 0.3,
            color: i % 2 ? PALETTE.tree : PALETTE.treeDark,
          }),
        );
      }
      break;
    case "stall":
      parts.push(part_box(scene, { w: 3.2, h: 0.9, d: 1.9, y: 0.75, color: "#8a6b47" }));
      parts.push(part_box(scene, { w: 3.6, h: 0.2, d: 2.4, y: 2.3, rx: -0.14, color }));
      parts.push(part_box(scene, { w: 0.16, h: 2.2, d: 0.16, x: -1.5, y: 1.1, z: -0.9, color: "#6b5b45" }));
      parts.push(part_box(scene, { w: 0.16, h: 2.2, d: 0.16, x: 1.5, y: 1.1, z: -0.9, color: "#6b5b45" }));
      parts.push(part_sphere(scene, { diameter: 0.55, segments: 5, x: -0.7, y: 1.4, color: "#e5533d" }));
      parts.push(part_sphere(scene, { diameter: 0.55, segments: 5, x: 0.1, y: 1.4, color: "#e8b23c" }));
      parts.push(part_sphere(scene, { diameter: 0.55, segments: 5, x: 0.9, y: 1.4, color: "#3aa066" }));
      break;
    case "umbrella":
      parts.push(part_cyl(scene, { diameter: 0.16, h: 2.7, tess: 6, y: 1.35, color: "#8a8f94" }));
      parts.push(part_cyl(scene, { dTop: 0.2, dBottom: 4.0, h: 0.8, tess: 10, y: 2.7, color }));
      parts.push(part_box(scene, { w: 1.6, h: 0.75, d: 1.0, y: 0.38, z: 0.4, color: "#d9cdb4" }));
      break;
    case "kiosk":
      parts.push(part_box(scene, { w: 2.6, h: 2.6, d: 2.2, y: 1.3, color }));
      parts.push(part_box(scene, { w: 2.9, h: 0.25, d: 2.5, y: 2.72, color: "#4a4d55" }));
      parts.push(part_box(scene, { w: 1.7, h: 0.9, d: 0.16, y: 1.6, z: -1.15, color: "#2f3844" }));
      parts.push(part_box(scene, { w: 2.0, h: 0.2, d: 0.9, y: 1.1, z: -1.55, color: "#e3dccb" }));
      break;
    case "barrel":
      parts.push(part_cyl(scene, { diameter: 1.0, h: 1.4, tess: 8, y: 0.7, color: "#3f88c5" }));
      parts.push(part_cyl(scene, { diameter: 1.1, h: 0.14, tess: 8, y: 1.1, color: "#f6f1e2" }));
      parts.push(part_cyl(scene, { diameter: 1.1, h: 0.14, tess: 8, y: 0.35, color: "#f6f1e2" }));
      break;
    case "sign":
      parts.push(part_cyl(scene, { diameter: 0.22, h: 3.6, tess: 6, y: 1.8, color: "#9aa0a6" }));
      parts.push(part_box(scene, { w: 2.6, h: 0.9, d: 0.14, y: 3.4, color: "#2f7d4f" }));
      parts.push(part_box(scene, { w: 2.2, h: 0.18, d: 0.2, y: 3.4, color: "#f6f1e2" }));
      break;
  }
  const mesh = combine(`prop_${kind}_${color}`, parts, scene);
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}

function buildProps(scene: Scene, specs: PropSpec[]): { prototypes: Mesh[]; count: number } {
  const protos = new Map<string, Mesh>();
  for (const p of specs) {
    const key = `${p.kind}|${p.color}`;
    let proto = protos.get(key);
    if (!proto) {
      proto = propPrototype(scene, p.kind, p.color);
      protos.set(key, proto);
    }
    const inst = proto.createInstance(`${p.kind}_i`);
    inst.position.set(p.x, 0, p.z);
    inst.rotation.y = p.rotY;
    inst.scaling.setAll(p.scale);
    inst.isPickable = false;
    inst.freezeWorldMatrix();
  }
  // Instances only render if the source mesh is enabled.
  for (const proto of protos.values()) {
    proto.setEnabled(true);
    proto.isVisible = false;
  }
  return { prototypes: [...protos.values()], count: specs.length };
}

/* ------------------------------------------------------------------ public */

export interface CityHandles {
  /** Meshes that should cast shadows. */
  shadowCasters: Mesh[];
  dispose(): void;
}

export function createCity(scene: Scene): CityHandles {
  const roads = buildRoadSurface(scene);
  const markings = buildRoadMarkings(scene);
  const pavements = buildPavements(scene);
  const pads = buildLocationPads(scene);

  // Named locations are placed first; generated buildings grow around them.
  const reserved = LOCATIONS.map((l) => l.facadeRect);
  const facades = LOCATIONS.map((l) => buildFacade(scene, l));

  const buildingParts: Mesh[] = [];
  const specs = generateBuildings(reserved);
  specs.forEach((s, i) => addBuilding(scene, buildingParts, s, i * 131 + 7, false));
  const buildings = combine("buildings", buildingParts, scene);
  buildings.receiveShadows = true;
  buildings.isPickable = false;
  buildings.freezeWorldMatrix();

  const facadeMesh = combine("facades", facades, scene);
  facadeMesh.receiveShadows = true;
  facadeMesh.isPickable = false;
  facadeMesh.freezeWorldMatrix();

  // Decorative skyline beyond the ring road (no shadows, fewer details).
  const outskirtParts: Mesh[] = [];
  generateOutskirts().forEach((s, i) => addBuilding(scene, outskirtParts, s, i * 71 + 3, true));
  const outskirts = combine("outskirts", outskirtParts, scene);
  outskirts.isPickable = false;
  outskirts.freezeWorldMatrix();

  const blockedForProps: Rect[] = [...specs.map((s) => s.rect), ...reserved];
  for (const loc of LOCATIONS) {
    blockedForProps.push({
      minX: loc.x - 5,
      maxX: loc.x + 5,
      minZ: loc.z - 5,
      maxZ: loc.z + 5,
    });
  }
  const props = buildProps(scene, generateProps(blockedForProps));

  return {
    shadowCasters: [buildings, facadeMesh, ...props.prototypes],
    dispose() {
      roads.dispose();
      markings.dispose();
      pavements.dispose();
      pads.dispose();
      buildings.dispose();
      facadeMesh.dispose();
      outskirts.dispose();
      for (const p of props.prototypes) p.dispose();
    },
  };
}
