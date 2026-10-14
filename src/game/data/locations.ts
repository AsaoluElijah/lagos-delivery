/**
 * Named pickup and drop-off points.
 *
 * Every location is authored relative to a street: pick a street, a side of it
 * and a position along it. The marker then lands on the sidewalk (reachable
 * from the road) and the building facade is pushed back behind it. This makes
 * it impossible to author a location the rider cannot reach.
 */

import { MARKER_OFFSET } from "../config";
import { rectFromCenter, type Rect } from "../mathx";

export type LocationKind = "food" | "parcel" | "dropoff";

export type FacadeStyle = "buka" | "hub" | "tower" | "flats" | "house" | "shop";

interface LocationDef {
  id: string;
  label: string;
  /** Short area name used in order text, e.g. "Sabo". */
  area: string;
  kind: LocationKind;
  /** Which street the entrance faces. */
  road: { axis: "x" | "z"; at: number };
  /** +1 = the block on the positive side of the street, -1 = negative side. */
  side: 1 | -1;
  /** Position along the street. */
  along: number;
  facade: { w: number; d: number; h: number; style: FacadeStyle; color: string; roof: string };
}

const DEFS: readonly LocationDef[] = [
  // ---- Food pickups ----
  {
    id: "mama-t",
    label: "Mama T's Buka",
    area: "Ojuelegba",
    kind: "food",
    road: { axis: "x", at: -72 },
    side: 1,
    along: -30,
    facade: { w: 16, d: 10, h: 6.5, style: "buka", color: "#e8724c", roof: "#8c4a36" },
  },
  {
    id: "iya-basira",
    label: "Iya Basira Kitchen",
    area: "Birrel",
    kind: "food",
    road: { axis: "z", at: 60 },
    side: -1,
    along: -48,
    facade: { w: 10, d: 14, h: 7, style: "buka", color: "#f2a93b", roof: "#9b6b2f" },
  },
  // ---- Parcel pickup ----
  {
    id: "parcel-hub",
    label: "Yaba Parcel Hub",
    area: "Yaba",
    kind: "parcel",
    road: { axis: "x", at: 72 },
    side: -1,
    along: 30,
    facade: { w: 22, d: 10, h: 8.5, style: "hub", color: "#4f9dd4", roof: "#36688f" },
  },
  // ---- Drop-offs ----
  {
    id: "sabo-flats",
    label: "Sabo Flats",
    area: "Sabo",
    kind: "dropoff",
    road: { axis: "z", at: -60 },
    side: 1,
    along: -4,
    facade: { w: 10, d: 18, h: 17, style: "flats", color: "#5fbfa5", roof: "#3d7f6c" },
  },
  {
    id: "alagomeji",
    label: "Alagomeji Estate",
    area: "Alagomeji",
    kind: "dropoff",
    road: { axis: "x", at: 72 },
    side: -1,
    along: -34,
    facade: { w: 14, d: 10, h: 11, style: "flats", color: "#e4557c", roof: "#9b3a56" },
  },
  {
    id: "tejuosho-towers",
    label: "Tejuosho Towers",
    area: "Tejuosho",
    kind: "dropoff",
    road: { axis: "x", at: -72 },
    side: 1,
    along: 26,
    facade: { w: 13, d: 10, h: 24, style: "tower", color: "#8d6fc4", roof: "#5c4a85" },
  },
  {
    id: "herbert-lofts",
    label: "Herbert Macaulay Lofts",
    area: "Alagomeji",
    kind: "dropoff",
    road: { axis: "x", at: -24 },
    side: -1,
    along: -40,
    facade: { w: 14, d: 10, h: 19, style: "tower", color: "#f0d35f", roof: "#9b6b2f" },
  },
  {
    id: "junction-stop",
    label: "Ojuelegba Junction Stop",
    area: "Ojuelegba",
    kind: "dropoff",
    road: { axis: "x", at: -24 },
    side: 1,
    along: 22,
    facade: { w: 12, d: 10, h: 5.5, style: "shop", color: "#5bb6c9", roof: "#36688f" },
  },
  {
    id: "akoka-lodge",
    label: "Akoka Lodge",
    area: "Akoka",
    kind: "dropoff",
    road: { axis: "z", at: 0 },
    side: 1,
    along: 48,
    facade: { w: 12, d: 10, h: 9, style: "house", color: "#eb8f5c", roof: "#8c4a36" },
  },
  {
    id: "jibowu",
    label: "Jibowu Terrace",
    area: "Jibowu",
    kind: "dropoff",
    road: { axis: "x", at: 24 },
    side: 1,
    along: -24,
    facade: { w: 12, d: 10, h: 13, style: "flats", color: "#d9643f", roof: "#8c4a36" },
  },
  {
    id: "queen-offices",
    label: "Queen Street Offices",
    area: "Sabo",
    kind: "dropoff",
    road: { axis: "x", at: -24 },
    side: 1,
    along: -18,
    facade: { w: 12, d: 10, h: 21, style: "tower", color: "#3f88c5", roof: "#36688f" },
  },
  {
    id: "tejuosho-gate",
    label: "Tejuosho Market Gate",
    area: "Tejuosho",
    kind: "dropoff",
    road: { axis: "z", at: 0 },
    side: -1,
    along: 52,
    facade: { w: 10, d: 10, h: 7.5, style: "shop", color: "#f0d35f", roof: "#9b3a56" },
  },
];

export interface GameLocation {
  id: string;
  label: string;
  area: string;
  kind: LocationKind;
  /** Where the marker sits — on the sidewalk, reachable from the road. */
  x: number;
  z: number;
  /** Facade centre. */
  facadeX: number;
  facadeZ: number;
  /** Y-rotation so the facade's front faces the street. */
  rotY: number;
  facadeRect: Rect;
  facade: LocationDef["facade"];
}

/** Gap between the marker and the front wall of the building. */
const FACADE_SETBACK = 2.5;

function resolve(def: LocationDef): GameLocation {
  const perp = def.road.at + def.side * MARKER_OFFSET;
  const depthOffset = def.side * (FACADE_SETBACK + def.facade.d / 2);

  // A street on the "x" axis runs east/west, so its sides differ in z.
  const x = def.road.axis === "x" ? def.along : perp;
  const z = def.road.axis === "x" ? perp : def.along;
  const facadeX = def.road.axis === "x" ? def.along : perp + depthOffset;
  const facadeZ = def.road.axis === "x" ? perp + depthOffset : def.along;

  // Facades are authored with their front face toward local -Z; rotate so that
  // front ends up pointing back at the street.
  let rotY: number;
  if (def.road.axis === "x") rotY = def.side === 1 ? 0 : Math.PI;
  else rotY = def.side === 1 ? Math.PI / 2 : -Math.PI / 2;

  // The authored w/d are in facade-local space; swap for z-axis streets.
  const swapped = def.road.axis === "z";
  const w = swapped ? def.facade.d : def.facade.w;
  const d = swapped ? def.facade.w : def.facade.d;

  return {
    id: def.id,
    label: def.label,
    area: def.area,
    kind: def.kind,
    x,
    z,
    facadeX,
    facadeZ,
    rotY,
    facadeRect: rectFromCenter(facadeX, facadeZ, w, d),
    facade: def.facade,
  };
}

export const LOCATIONS: readonly GameLocation[] = DEFS.map(resolve);

export const LOCATION_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

export const FOOD_PICKUPS = LOCATIONS.filter((l) => l.kind === "food");
export const PARCEL_PICKUPS = LOCATIONS.filter((l) => l.kind === "parcel");
export const DROPOFFS = LOCATIONS.filter((l) => l.kind === "dropoff");

export function getLocation(id: string): GameLocation {
  const l = LOCATION_BY_ID.get(id);
  if (!l) throw new Error(`Unknown location: ${id}`);
  return l;
}

/** Order flavour text. */
export const FOOD_ITEMS = [
  "jollof rice & chicken",
  "amala and ewedu",
  "suya platter",
  "pepper soup",
  "puff-puff tray",
  "egusi and pounded yam",
  "asun and chips",
  "small chops combo",
] as const;

export const PARCEL_ITEMS = [
  "phone in a sealed box",
  "roll of ankara fabric",
  "envelope of documents",
  "laptop bag",
  "bundle of textbooks",
  "pair of sneakers",
  "box of hair products",
  "generator spare part",
] as const;

export const CUSTOMERS = [
  "Chidi",
  "Amaka",
  "Tunde",
  "Bisi",
  "Emeka",
  "Ngozi",
  "Yemi",
  "Fatima",
  "Seun",
  "Ada",
  "Kunle",
  "Zainab",
] as const;
