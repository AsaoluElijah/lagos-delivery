/**
 * Lagos traffic: danfo buses, private cars and keke napeps.
 *
 * Vehicles ride predetermined lane-centre polylines, so they can never leave
 * the road or clip a building. A cheap forward-cone check makes them brake
 * behind each other, which is enough to look intentional at intersections.
 */

import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { PALETTE, TRAFFIC } from "../config";
import { ROUTES, sampleRoute, type Route } from "../data/routes";
import { angleDelta, clamp, makeRng, pick } from "../mathx";
import { combine, part_box, part_cyl } from "./meshkit";

export type VehicleKind = "danfo" | "car" | "keke";

const TYRE = "#191c20";
const GLASS = "#9fd0e4";

function wheelPair(scene: Scene, parts: Mesh[], z: number, halfW: number, r: number) {
  parts.push(
    part_cyl(scene, { diameter: r * 2, h: 0.34, tess: 10, x: -halfW, y: r, z, rz: Math.PI / 2, color: TYRE }),
    part_cyl(scene, { diameter: r * 2, h: 0.34, tess: 10, x: halfW, y: r, z, rz: Math.PI / 2, color: TYRE }),
  );
}

function buildDanfo(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const w = 2.5;
  const len = 6.4;
  const y0 = 0.55;

  // Body with the signature yellow + black stripes.
  parts.push(part_box(scene, { w, h: 1.9, d: len, y: y0 + 0.95, color: PALETTE.danfo }));
  parts.push(part_box(scene, { w: w + 0.06, h: 0.34, d: len * 0.98, y: y0 + 0.5, color: "#23262b" }));
  parts.push(part_box(scene, { w: w + 0.06, h: 0.26, d: len * 0.98, y: y0 + 1.72, color: "#23262b" }));
  parts.push(part_box(scene, { w: w * 0.92, h: 0.22, d: len * 0.9, y: y0 + 1.96, color: "#e8b21b" }));

  // Windows: windscreen, rear and a run of side glass.
  parts.push(part_box(scene, { w: w * 0.82, h: 0.86, d: 0.14, y: y0 + 1.3, z: len / 2 - 0.02, color: GLASS }));
  parts.push(part_box(scene, { w: w * 0.82, h: 0.7, d: 0.14, y: y0 + 1.3, z: -len / 2 + 0.02, color: GLASS }));
  for (let i = 0; i < 3; i++) {
    const z = -1.6 + i * 1.6;
    parts.push(
      part_box(scene, { w: 0.14, h: 0.78, d: 1.25, x: -w / 2, y: y0 + 1.32, z, color: GLASS }),
      part_box(scene, { w: 0.14, h: 0.78, d: 1.25, x: w / 2, y: y0 + 1.32, z, color: GLASS }),
    );
  }

  // Bumpers, lights, roof rack, sliding-door handle.
  parts.push(part_box(scene, { w: w + 0.16, h: 0.3, d: 0.26, y: y0 + 0.2, z: len / 2, color: "#b7bcc2" }));
  parts.push(part_box(scene, { w: w + 0.16, h: 0.3, d: 0.26, y: y0 + 0.2, z: -len / 2, color: "#b7bcc2" }));
  parts.push(part_box(scene, { w: 0.5, h: 0.26, d: 0.12, x: -0.85, y: y0 + 0.68, z: len / 2 + 0.06, color: "#fff6d8" }));
  parts.push(part_box(scene, { w: 0.5, h: 0.26, d: 0.12, x: 0.85, y: y0 + 0.68, z: len / 2 + 0.06, color: "#fff6d8" }));
  parts.push(part_box(scene, { w: 0.42, h: 0.24, d: 0.12, x: -0.85, y: y0 + 0.7, z: -len / 2 - 0.06, color: "#e5533d" }));
  parts.push(part_box(scene, { w: 0.42, h: 0.24, d: 0.12, x: 0.85, y: y0 + 0.7, z: -len / 2 - 0.06, color: "#e5533d" }));
  parts.push(part_box(scene, { w: w * 0.8, h: 0.14, d: 1.8, y: y0 + 2.2, z: -1.2, color: "#8a8f94" }));
  parts.push(part_box(scene, { w: 1.1, h: 0.5, d: 1.3, y: y0 + 2.45, z: -1.2, color: "#c98a4b" }));

  wheelPair(scene, parts, len / 2 - 1.5, w / 2 - 0.1, 0.55);
  wheelPair(scene, parts, -len / 2 + 1.5, w / 2 - 0.1, 0.55);

  const mesh = combine("veh_danfo", parts, scene);
  mesh.setEnabled(false);
  return mesh;
}

function buildCar(scene: Scene, color: string): Mesh {
  const parts: Mesh[] = [];
  const w = 2.0;
  const len = 4.5;
  const y0 = 0.42;

  parts.push(part_box(scene, { w, h: 0.78, d: len, y: y0 + 0.39, color }));
  parts.push(part_box(scene, { w: w * 0.92, h: 0.7, d: len * 0.52, y: y0 + 1.1, z: -0.25, color }));
  parts.push(part_box(scene, { w: w * 0.94, h: 0.46, d: 0.14, y: y0 + 1.12, z: 0.92, rx: -0.3, color: GLASS }));
  parts.push(part_box(scene, { w: w * 0.94, h: 0.46, d: 0.14, y: y0 + 1.12, z: -1.42, rx: 0.3, color: GLASS }));
  parts.push(
    part_box(scene, { w: 0.14, h: 0.44, d: len * 0.4, x: -w * 0.46, y: y0 + 1.12, z: -0.25, color: GLASS }),
    part_box(scene, { w: 0.14, h: 0.44, d: len * 0.4, x: w * 0.46, y: y0 + 1.12, z: -0.25, color: GLASS }),
  );
  parts.push(part_box(scene, { w: 0.44, h: 0.2, d: 0.12, x: -0.64, y: y0 + 0.44, z: len / 2, color: "#fff6d8" }));
  parts.push(part_box(scene, { w: 0.44, h: 0.2, d: 0.12, x: 0.64, y: y0 + 0.44, z: len / 2, color: "#fff6d8" }));
  parts.push(part_box(scene, { w: 0.44, h: 0.2, d: 0.12, x: -0.64, y: y0 + 0.44, z: -len / 2, color: "#e5533d" }));
  parts.push(part_box(scene, { w: 0.44, h: 0.2, d: 0.12, x: 0.64, y: y0 + 0.44, z: -len / 2, color: "#e5533d" }));
  parts.push(part_box(scene, { w: w + 0.1, h: 0.22, d: 0.2, y: y0 + 0.16, z: len / 2, color: "#2f3844" }));
  parts.push(part_box(scene, { w: w + 0.1, h: 0.22, d: 0.2, y: y0 + 0.16, z: -len / 2, color: "#2f3844" }));

  wheelPair(scene, parts, len / 2 - 1.1, w / 2 - 0.08, 0.42);
  wheelPair(scene, parts, -len / 2 + 1.1, w / 2 - 0.08, 0.42);

  const mesh = combine(`veh_car_${color}`, parts, scene);
  mesh.setEnabled(false);
  return mesh;
}

function buildKeke(scene: Scene): Mesh {
  const parts: Mesh[] = [];
  const w = 1.5;
  const len = 2.9;

  parts.push(part_box(scene, { w, h: 1.0, d: len, y: 0.85, color: PALETTE.danfo }));
  parts.push(part_box(scene, { w: w * 0.94, h: 0.8, d: len * 0.66, y: 1.7, z: -0.3, color: "#2f9e63" }));
  parts.push(part_box(scene, { w: w * 0.8, h: 0.5, d: 0.12, y: 1.6, z: 0.76, rx: -0.22, color: GLASS }));
  parts.push(part_box(scene, { w: 0.12, h: 0.52, d: 0.95, x: -w * 0.48, y: 1.72, z: -0.3, color: GLASS }));
  parts.push(part_box(scene, { w: 0.12, h: 0.52, d: 0.95, x: w * 0.48, y: 1.72, z: -0.3, color: GLASS }));
  parts.push(part_box(scene, { w: w + 0.1, h: 0.14, d: len * 0.7, y: 2.14, z: -0.3, color: "#23262b" }));
  parts.push(part_cyl(scene, { diameter: 0.3, h: 0.14, tess: 10, y: 1.5, z: len / 2 + 0.02, rx: Math.PI / 2, color: "#fff6d8" }));
  parts.push(part_cyl(scene, { diameter: 0.7, h: 0.28, tess: 10, y: 0.35, z: len / 2 - 0.3, rz: Math.PI / 2, color: TYRE }));
  wheelPair(scene, parts, -len / 2 + 0.7, w / 2 + 0.04, 0.38);

  const mesh = combine("veh_keke", parts, scene);
  mesh.setEnabled(false);
  return mesh;
}

export interface Vehicle {
  kind: VehicleKind;
  instance: InstancedMesh;
  route: Route;
  /** Arc length along the route. */
  s: number;
  baseSpeed: number;
  speed: number;
  /** Rough radius, used for the cheap follow-distance check. */
  radius: number;
  /** Oriented-box half extents, used for rider collision. */
  halfW: number;
  halfL: number;
  x: number;
  z: number;
  heading: number;
  /** Smoothed heading used for rendering, so corners look like turns. */
  visualHeading: number;
  active: boolean;
  phase: number;
}

export class Traffic {
  private readonly prototypes: Mesh[] = [];
  readonly vehicles: Vehicle[] = [];
  private activeCount: number;
  private speedScale = 1;

  constructor(scene: Scene) {
    const rng = makeRng(0x7acc1c);
    const danfo = buildDanfo(scene);
    const keke = buildKeke(scene);
    const cars = PALETTE.cars.map((c) => buildCar(scene, c));
    this.prototypes.push(danfo, keke, ...cars);

    // Spread vehicles evenly around each route so traffic reads as continuous.
    const perRoute = Math.ceil(TRAFFIC.maxCount / ROUTES.length);
    let created = 0;
    for (const route of ROUTES) {
      for (let i = 0; i < perRoute && created < TRAFFIC.maxCount; i++) {
        const roll = rng();
        const kind: VehicleKind = roll < 0.42 ? "danfo" : roll < 0.78 ? "car" : "keke";
        const proto = kind === "danfo" ? danfo : kind === "keke" ? keke : pick(rng, cars);
        const instance = proto.createInstance(`veh_${created}`);
        instance.isPickable = false;

        const spacing = route.length / perRoute;
        this.vehicles.push({
          kind,
          instance,
          route,
          s: i * spacing + rng() * spacing * 0.5,
          baseSpeed: TRAFFIC.baseSpeed + rng() * TRAFFIC.speedVariance,
          speed: TRAFFIC.baseSpeed,
          radius: kind === "danfo" ? 2.7 : kind === "car" ? 2.1 : 1.6,
          halfW: kind === "danfo" ? 1.25 : kind === "car" ? 1.0 : 0.78,
          halfL: kind === "danfo" ? 3.2 : kind === "car" ? 2.25 : 1.45,
          x: 0,
          z: 0,
          heading: 0,
          visualHeading: 0,
          active: true,
          phase: rng() * Math.PI * 2,
        });
        created++;
      }
    }

    for (const p of this.prototypes) {
      p.setEnabled(true);
      p.isVisible = false;
    }

    this.activeCount = TRAFFIC.baseCount;
    this.applyActive();
    this.update(0);
  }

  get shadowCasters(): Mesh[] {
    return this.prototypes;
  }

  /** Scales traffic density and speed with the number of completed deliveries. */
  setDifficulty(completed: number) {
    const t = clamp(completed / TRAFFIC.rampDeliveries, 0, 1);
    this.activeCount = Math.min(
      TRAFFIC.maxCount,
      Math.round(TRAFFIC.baseCount + completed * TRAFFIC.perDelivery),
    );
    this.speedScale = 1 + (TRAFFIC.maxSpeedScale - 1) * t;
    this.applyActive();
  }

  private applyActive() {
    this.vehicles.forEach((v, i) => {
      v.active = i < this.activeCount;
      v.instance.setEnabled(v.active);
    });
  }

  reset() {
    this.speedScale = 1;
    this.activeCount = TRAFFIC.baseCount;
    this.applyActive();
    this.update(0);
  }

  update(dt: number) {
    const active = this.vehicles.filter((v) => v.active);

    for (const v of active) {
      // Brake if another vehicle sits just ahead and is roughly aligned.
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      let blockedAt = Infinity;
      for (const other of active) {
        if (other === v) continue;
        const dx = other.x - v.x;
        const dz = other.z - v.z;
        const forward = dx * fx + dz * fz;
        if (forward <= 0 || forward > TRAFFIC.followDistance) continue;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (lateral > v.radius + other.radius - 1.2) continue;
        blockedAt = Math.min(blockedAt, forward);
      }

      const gap = v.radius + 2.2;
      const target =
        blockedAt === Infinity
          ? v.baseSpeed * this.speedScale
          : v.baseSpeed * this.speedScale * clamp((blockedAt - gap) / TRAFFIC.followDistance, 0, 1);

      // Gentle accel/brake so stops look deliberate rather than teleporting.
      const rate = target < v.speed ? 14 : 5;
      v.speed += clamp(target - v.speed, -rate * dt, rate * dt);
      v.s += v.speed * dt;

      const p = sampleRoute(v.route, v.s);
      v.x = p.x;
      v.z = p.z;
      v.heading = p.heading;
      v.visualHeading =
        dt > 0
          ? v.visualHeading + angleDelta(v.visualHeading, p.heading) * (1 - Math.exp(-9 * dt))
          : p.heading;

      v.phase += dt * (2 + v.speed * 0.25);
      const bob = Math.sin(v.phase) * 0.025;
      const turnLean = angleDelta(v.visualHeading, p.heading) * 0.5;
      v.instance.position.set(v.x, bob, v.z);
      v.instance.rotation.set(Math.cos(v.phase * 0.7) * 0.012, v.visualHeading, bob * 0.5 + turnLean);
    }
  }

  dispose() {
    for (const v of this.vehicles) v.instance.dispose();
    for (const p of this.prototypes) p.dispose();
  }
}
