/**
 * Traffic routes.
 *
 * Each route is a closed polyline of waypoints that already sit in a lane
 * centre, so vehicles always stay on asphalt and never cut through buildings.
 * Overlapping segments between routes always run in the same direction, which
 * keeps the flow readable and avoids head-on pile-ups.
 */

import { ROAD } from "../config";

const L = ROAD.laneOffset;

export interface RoutePoint {
  x: number;
  z: number;
}

export interface Route {
  id: string;
  points: RoutePoint[];
  /** Cumulative arc length at each waypoint; last entry is the total length. */
  cumulative: number[];
  length: number;
}

function route(id: string, raw: [number, number][]): Route {
  const points = raw.map(([x, z]) => ({ x, z }));
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
    cumulative.push(total);
  }
  return { id, points, cumulative, length: total };
}

// Street grid: vertical roads at x = -60, 0, 60; horizontal at z = -72, -24, 24, 72.
export const ROUTES: readonly Route[] = [
  // Outer ring road, outer lane, anticlockwise.
  route("ring-outer", [
    [-60 - L, -72 - L],
    [60 + L, -72 - L],
    [60 + L, 72 + L],
    [-60 - L, 72 + L],
  ]),
  // Loop around the central park block.
  route("park-loop", [
    [60 - L, -24 + L],
    [0 + L, -24 + L],
    [0 + L, 24 - L],
    [60 - L, 24 - L],
  ]),
  // Wide loop along Herbert Macaulay Way and Commercial Avenue.
  route("mid-belt", [
    [-60 + L, 24 - L],
    [60 - L, 24 - L],
    [60 - L, -24 + L],
    [-60 + L, -24 + L],
  ]),
  // South-west block loop.
  route("ojuelegba-sw", [
    [-60 + L, -72 + L],
    [0 - L, -72 + L],
    [0 - L, -24 - L],
    [-60 + L, -24 - L],
  ]),
  // South-east block loop.
  route("ojuelegba-se", [
    [0 + L, -24 - L],
    [0 + L, -72 + L],
    [60 - L, -72 + L],
    [60 - L, -24 - L],
  ]),
  // North-west block loop.
  route("yaba-nw", [
    [0 - L, 72 - L],
    [0 - L, 24 + L],
    [-60 + L, 24 + L],
    [-60 + L, 72 - L],
  ]),
  // North-east block loop.
  route("yaba-ne", [
    [0 + L, 24 + L],
    [0 + L, 72 - L],
    [60 - L, 72 - L],
    [60 - L, 24 + L],
  ]),
];

/** Position + heading at a given arc-length along a route (wraps around). */
export function sampleRoute(
  r: Route,
  distance: number,
): { x: number; z: number; heading: number } {
  const d = ((distance % r.length) + r.length) % r.length;
  let i = 0;
  while (i < r.points.length - 1 && r.cumulative[i + 1] <= d) i++;

  const a = r.points[i];
  const b = r.points[(i + 1) % r.points.length];
  const segLen = r.cumulative[i + 1] - r.cumulative[i];
  const t = segLen > 0.0001 ? (d - r.cumulative[i]) / segLen : 0;

  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    // Babylon is left-handed with +Z forward, so heading is measured from +Z.
    heading: Math.atan2(b.x - a.x, b.z - a.z),
  };
}
