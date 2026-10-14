/**
 * Collision handling.
 *
 * Road containment: the drivable area is the union of axis-aligned road
 * rectangles (grown by a forgiving sidewalk band). If a proposed position
 * falls outside every rectangle we clamp it to the nearest one. Because
 * buildings are always set back beyond that band, this single rule is what
 * stops the rider driving through buildings.
 *
 * Traffic: an oriented-box vs circle test against each vehicle — accurate for
 * long danfos without needing a physics engine.
 */

import { COLLISION, RIDER, ROAD } from "../config";
import { drivableRects, roadRects } from "../data/map";
import type { Vehicle } from "../scene/Traffic";
import type { ConstraintResult } from "../scene/Rider";
import { clamp, pointInRect, rectDistanceSq, type Rect } from "../mathx";

export interface TrafficHit {
  vehicle: Vehicle;
  /** Unit push-out direction, away from the vehicle. */
  nx: number;
  nz: number;
}

export class CollisionSystem {
  /** Asphalt only — used to detect "riding the kerb". */
  private readonly core: Rect[] = roadRects();
  /** Asphalt + sidewalk — the hard limit. */
  private readonly soft: Rect[] = drivableRects();

  private readonly result: ConstraintResult = { x: 0, z: 0, onSidewalk: false, blocked: false };

  /** Bound method so it can be handed straight to the Rider. */
  readonly constrain = (x: number, z: number): ConstraintResult => {
    const r = this.result;

    let inSoft = false;
    for (const rect of this.soft) {
      if (pointInRect(x, z, rect)) {
        inSoft = true;
        break;
      }
    }

    if (inSoft) {
      let onCore = false;
      for (const rect of this.core) {
        if (pointInRect(x, z, rect)) {
          onCore = true;
          break;
        }
      }
      r.x = x;
      r.z = z;
      r.onSidewalk = !onCore;
      r.blocked = false;
      return r;
    }

    // Outside everything: slide back onto the closest drivable rectangle.
    let best = this.soft[0];
    let bestD = Infinity;
    for (const rect of this.soft) {
      const d = rectDistanceSq(x, z, rect);
      if (d < bestD) {
        bestD = d;
        best = rect;
      }
    }
    r.x = clamp(x, best.minX, best.maxX);
    r.z = clamp(z, best.minZ, best.maxZ);
    r.onSidewalk = true;
    r.blocked = true;
    return r;
  };

  /** Speed multiplier for the rider's current surface. */
  surfaceSpeedCap(onSidewalk: boolean): number {
    return onSidewalk ? RIDER.sidewalkSpeedFactor : 1;
  }

  /**
   * Returns the first vehicle overlapping the rider, with a push-out normal.
   * Uses the axis of least penetration in the vehicle's local frame.
   */
  checkTraffic(x: number, z: number, vehicles: readonly Vehicle[]): TrafficHit | null {
    const r = RIDER.radius;

    for (const v of vehicles) {
      if (!v.active) continue;

      const dx = x - v.x;
      const dz = z - v.z;
      // Cheap reject before the oriented test.
      const reach = v.halfL + r;
      if (dx * dx + dz * dz > reach * reach) continue;

      // Rotate into the vehicle's frame (forward = +Z at heading 0).
      const s = Math.sin(v.heading);
      const c = Math.cos(v.heading);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;

      const ox = v.halfW + r - Math.abs(lx);
      const oz = v.halfL + r - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;

      // Push out along whichever local axis is least penetrated.
      let nlx = 0;
      let nlz = 0;
      if (ox < oz) nlx = Math.sign(lx) || 1;
      else nlz = Math.sign(lz) || 1;

      // Back to world space.
      return {
        vehicle: v,
        nx: nlx * c + nlz * s,
        nz: -nlx * s + nlz * c,
      };
    }
    return null;
  }

  static get cooldown(): number {
    return COLLISION.cooldown;
  }

  /** Exposed for debugging / tests. */
  get sidewalkWidth(): number {
    return ROAD.sidewalk;
  }
}
