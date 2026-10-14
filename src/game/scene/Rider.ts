/**
 * The player's okada (motorcycle) — geometry plus arcade movement.
 *
 * Movement is kinematic and delta-time based: no physics engine, just
 * acceleration curves tuned to feel snappy. Road containment is delegated to
 * a constraint function so the rider can never leave the street network.
 */

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { COLLISION, RIDER } from "../config";
import { RIDER_SPAWN } from "../data/map";
import { clamp, damp } from "../mathx";
import { combine, part_box, part_cyl, part_sphere } from "./meshkit";

export interface RiderInput {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
}

export interface ConstraintResult {
  x: number;
  z: number;
  /** True when the rider is off the asphalt but still on the sidewalk band. */
  onSidewalk: boolean;
  /** True when the rider was pushed back by a hard boundary. */
  blocked: boolean;
}

export type RoadConstraint = (x: number, z: number) => ConstraintResult;

const BIKE_RED = "#d93b35";
const BIKE_DARK = "#2b2f36";
const TYRE = "#1d2024";
const RIM = "#d8dde1";
const SHIRT = "#2f9e63";
const SKIN = "#7a4a28";
const HELMET = "#f7c520";

function buildWheel(scene: Scene, diameter: number): Mesh {
  const parts: Mesh[] = [
    // Baked rz so the cylinder's axle lies along X; spinning is then rotation.x.
    part_cyl(scene, { diameter, h: 0.3, tess: 14, rz: Math.PI / 2, color: TYRE }),
    part_cyl(scene, { diameter: diameter * 0.52, h: 0.34, tess: 10, rz: Math.PI / 2, color: RIM }),
    part_box(scene, { w: 0.36, h: diameter * 0.86, d: 0.08, color: RIM }),
    part_box(scene, { w: 0.36, h: 0.08, d: diameter * 0.86, color: RIM }),
  ];
  return combine("wheel", parts, scene);
}

function buildBody(scene: Scene): Mesh {
  const parts: Mesh[] = [];

  // --- frame & panels (local forward is +Z) ---
  parts.push(part_box(scene, { w: 0.3, h: 0.32, d: 2.3, y: 0.74, z: -0.05, color: BIKE_DARK }));
  parts.push(part_box(scene, { w: 0.64, h: 0.54, d: 0.78, y: 0.62, z: -0.12, color: BIKE_DARK }));
  parts.push(part_box(scene, { w: 0.58, h: 0.46, d: 0.95, y: 1.02, z: 0.3, color: BIKE_RED }));
  parts.push(part_box(scene, { w: 0.5, h: 0.2, d: 0.95, y: 1.04, z: -0.62, color: "#1b1e22" }));
  parts.push(part_box(scene, { w: 0.66, h: 0.12, d: 0.72, y: 1.0, z: -1.26, color: BIKE_DARK }));
  // Side fairings angled outward.
  parts.push(part_box(scene, { w: 0.14, h: 0.44, d: 0.9, x: -0.34, y: 0.78, z: 0.1, rz: 0.2, color: BIKE_RED }));
  parts.push(part_box(scene, { w: 0.14, h: 0.44, d: 0.9, x: 0.34, y: 0.78, z: 0.1, rz: -0.2, color: BIKE_RED }));

  // --- front end ---
  parts.push(part_cyl(scene, { diameter: 0.12, h: 1.25, x: -0.22, y: 1.05, z: 1.0, rx: 0.42, tess: 6, color: RIM }));
  parts.push(part_cyl(scene, { diameter: 0.12, h: 1.25, x: 0.22, y: 1.05, z: 1.0, rx: 0.42, tess: 6, color: RIM }));
  parts.push(part_box(scene, { w: 1.12, h: 0.1, d: 0.1, y: 1.58, z: 1.03, color: BIKE_DARK }));
  parts.push(part_box(scene, { w: 0.16, h: 0.1, d: 0.26, x: -0.56, y: 1.58, z: 0.92, color: "#111417" }));
  parts.push(part_box(scene, { w: 0.16, h: 0.1, d: 0.26, x: 0.56, y: 1.58, z: 0.92, color: "#111417" }));
  parts.push(part_cyl(scene, { diameter: 0.42, h: 0.18, y: 1.34, z: 1.32, rx: Math.PI / 2, tess: 12, color: "#fff6d8" }));
  parts.push(part_box(scene, { w: 0.5, h: 0.1, d: 0.66, y: 1.0, z: 1.44, rx: -0.2, color: BIKE_RED }));
  // Mirrors.
  parts.push(part_box(scene, { w: 0.22, h: 0.14, d: 0.06, x: -0.62, y: 1.84, z: 1.0, color: BIKE_DARK }));
  parts.push(part_box(scene, { w: 0.22, h: 0.14, d: 0.06, x: 0.62, y: 1.84, z: 1.0, color: BIKE_DARK }));
  parts.push(part_cyl(scene, { diameter: 0.05, h: 0.3, x: -0.58, y: 1.72, z: 1.0, tess: 5, color: BIKE_DARK }));
  parts.push(part_cyl(scene, { diameter: 0.05, h: 0.3, x: 0.58, y: 1.72, z: 1.0, tess: 5, color: BIKE_DARK }));

  // --- rear ---
  parts.push(part_box(scene, { w: 0.5, h: 0.12, d: 0.6, y: 0.98, z: -1.62, rx: 0.22, color: BIKE_RED }));
  parts.push(part_cyl(scene, { diameter: 0.16, h: 0.9, x: 0.3, y: 0.52, z: -0.75, rx: Math.PI / 2, tess: 8, color: "#b7bcc2" }));
  parts.push(part_box(scene, { w: 0.26, h: 0.14, d: 0.08, y: 1.08, z: -1.66, color: "#e5533d" }));

  // --- footpegs ---
  parts.push(part_box(scene, { w: 0.5, h: 0.08, d: 0.2, x: -0.34, y: 0.42, z: -0.1, color: BIKE_DARK }));
  parts.push(part_box(scene, { w: 0.5, h: 0.08, d: 0.2, x: 0.34, y: 0.42, z: -0.1, color: BIKE_DARK }));

  // --- rider ---
  parts.push(part_box(scene, { w: 0.26, h: 0.72, d: 0.3, x: -0.3, y: 0.78, z: -0.12, rx: -0.3, color: "#30557f" }));
  parts.push(part_box(scene, { w: 0.26, h: 0.72, d: 0.3, x: 0.3, y: 0.78, z: -0.12, rx: -0.3, color: "#30557f" }));
  parts.push(part_box(scene, { w: 0.28, h: 0.22, d: 0.46, x: -0.32, y: 0.5, z: 0.18, color: "#1b1e22" }));
  parts.push(part_box(scene, { w: 0.28, h: 0.22, d: 0.46, x: 0.32, y: 0.5, z: 0.18, color: "#1b1e22" }));
  parts.push(part_box(scene, { w: 0.66, h: 0.8, d: 0.44, y: 1.62, z: -0.42, rx: -0.22, color: SHIRT }));
  parts.push(part_box(scene, { w: 0.2, h: 0.78, d: 0.2, x: -0.42, y: 1.62, z: 0.14, rx: 0.95, color: SHIRT }));
  parts.push(part_box(scene, { w: 0.2, h: 0.78, d: 0.2, x: 0.42, y: 1.62, z: 0.14, rx: 0.95, color: SHIRT }));
  parts.push(part_box(scene, { w: 0.16, h: 0.16, d: 0.16, x: -0.5, y: 1.56, z: 0.94, color: SKIN }));
  parts.push(part_box(scene, { w: 0.16, h: 0.16, d: 0.16, x: 0.5, y: 1.56, z: 0.94, color: SKIN }));
  parts.push(part_box(scene, { w: 0.3, h: 0.22, d: 0.28, y: 2.03, z: -0.3, color: SKIN }));
  parts.push(part_sphere(scene, { diameter: 0.56, segments: 8, y: 2.24, z: -0.3, color: HELMET }));
  parts.push(part_box(scene, { w: 0.46, h: 0.2, d: 0.2, y: 2.22, z: -0.05, color: "#23262b" }));
  parts.push(part_box(scene, { w: 0.58, h: 0.1, d: 0.42, y: 2.38, z: -0.34, color: "#e0a713" }));

  return combine("bike_body", parts, scene);
}

function buildCargo(scene: Scene, kind: "food" | "parcel"): Mesh {
  const parts: Mesh[] = [];
  if (kind === "food") {
    parts.push(part_box(scene, { w: 0.86, h: 0.8, d: 0.8, y: 1.46, z: -1.42, color: "#ff7a3d" }));
    parts.push(part_box(scene, { w: 0.9, h: 0.1, d: 0.84, y: 1.88, z: -1.42, color: "#e2601f" }));
    parts.push(part_box(scene, { w: 0.5, h: 0.4, d: 0.1, y: 1.46, z: -1.84, color: "#fff2dd" }));
  } else {
    parts.push(part_box(scene, { w: 0.9, h: 0.72, d: 0.78, y: 1.42, z: -1.42, ry: 0.12, color: "#c98a4b" }));
    parts.push(part_box(scene, { w: 0.94, h: 0.1, d: 0.16, y: 1.6, z: -1.42, ry: 0.12, color: "#f0e4cc" }));
    parts.push(part_box(scene, { w: 0.16, h: 0.1, d: 0.82, y: 1.6, z: -1.42, ry: 0.12, color: "#f0e4cc" }));
  }
  const mesh = combine(`cargo_${kind}`, parts, scene);
  mesh.setEnabled(false);
  return mesh;
}

export class Rider {
  readonly root: TransformNode;
  private readonly lean: TransformNode;
  private readonly steerNode: TransformNode;
  private readonly frontWheel: Mesh;
  private readonly rearWheel: Mesh;
  private readonly body: Mesh;
  private readonly cargoFood: Mesh;
  private readonly cargoParcel: Mesh;

  x = RIDER_SPAWN.x;
  z = RIDER_SPAWN.z;
  yaw = RIDER_SPAWN.yaw;
  speed = 0;

  private leanAngle = 0;
  private steerVisual = 0;
  private wheelSpin = 0;
  private baseY = 0;
  private bounce = 0;
  /** >0 while collision feedback plays. */
  flash = 0;
  onSidewalk = false;

  private readonly constrain: RoadConstraint;

  constructor(scene: Scene, constrain: RoadConstraint) {
    this.constrain = constrain;
    this.root = new TransformNode("rider_root", scene);

    this.lean = new TransformNode("rider_lean", scene);
    this.lean.parent = this.root;

    this.body = buildBody(scene);
    this.body.parent = this.lean;

    this.rearWheel = buildWheel(scene, RIDER.wheelRadius * 2);
    this.rearWheel.parent = this.lean;
    this.rearWheel.position.set(0, RIDER.wheelRadius, -1.08);

    this.steerNode = new TransformNode("rider_steer", scene);
    this.steerNode.parent = this.lean;
    this.steerNode.position.set(0, RIDER.wheelRadius, 1.26);

    this.frontWheel = buildWheel(scene, RIDER.wheelRadius * 2);
    this.frontWheel.parent = this.steerNode;

    this.cargoFood = buildCargo(scene, "food");
    this.cargoFood.parent = this.lean;
    this.cargoParcel = buildCargo(scene, "parcel");
    this.cargoParcel.parent = this.lean;

    this.sync();
  }

  get meshes(): Mesh[] {
    return [this.body, this.frontWheel, this.rearWheel, this.cargoFood, this.cargoParcel];
  }

  setCargo(kind: "food" | "parcel" | null) {
    this.cargoFood.setEnabled(kind === "food");
    this.cargoParcel.setEnabled(kind === "parcel");
  }

  reset() {
    this.x = RIDER_SPAWN.x;
    this.z = RIDER_SPAWN.z;
    this.yaw = RIDER_SPAWN.yaw;
    this.speed = 0;
    this.leanAngle = 0;
    this.steerVisual = 0;
    this.wheelSpin = 0;
    this.flash = 0;
    this.bounce = 0;
    this.setCargo(null);
    this.sync();
  }

  /** Knocks the rider back after hitting traffic. */
  bump(nx: number, nz: number) {
    this.speed = clamp(this.speed * COLLISION.speedRetain, -4, 4);
    // Shove slightly out of the obstacle so we do not immediately re-collide.
    const len = Math.hypot(nx, nz) || 1;
    const pushed = this.constrain(this.x + (nx / len) * 1.3, this.z + (nz / len) * 1.3);
    this.x = pushed.x;
    this.z = pushed.z;
    this.flash = 1;
    this.bounce = 1;
  }

  update(dt: number, input: RiderInput, speedCap: number) {
    const cfg = RIDER;
    const maxFwd = cfg.maxSpeed * speedCap;

    if (input.throttle > 0.02) {
      this.speed += cfg.accel * input.throttle * dt;
    } else if (input.brake > 0.02) {
      if (this.speed > 0.4) {
        this.speed -= cfg.brakeAccel * input.brake * dt;
      } else {
        this.speed -= cfg.accel * 0.55 * input.brake * dt;
      }
    } else {
      const drag = cfg.coastDrag * dt;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    this.speed = clamp(this.speed, -cfg.maxReverseSpeed, maxFwd);

    // Steering authority ramps in with speed and eases off at top speed so the
    // bike stays stable on straights but is nimble in traffic.
    const sp = Math.abs(this.speed);
    const ramp = clamp(sp / cfg.turnSpeedFloor, 0, 1);
    const damping = 1 - cfg.highSpeedSteerDamp * clamp(sp / cfg.maxSpeed, 0, 1);
    const dir = this.speed < -0.05 ? -1 : 1;
    this.yaw += input.steer * cfg.turnRate * ramp * damping * dir * dt;

    const nx = this.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    const c = this.constrain(nx, nz);
    this.x = c.x;
    this.z = c.z;
    this.onSidewalk = c.onSidewalk;
    if (c.blocked) {
      // Scrub speed against walls rather than stopping dead.
      this.speed *= 0.55;
    }

    // --- visuals ---
    const speedFrac = clamp(sp / cfg.maxSpeed, 0, 1);
    const leanTarget = -input.steer * cfg.maxLean * ramp * (0.35 + 0.65 * speedFrac);
    this.leanAngle = damp(this.leanAngle, leanTarget, cfg.leanLerp, dt);
    this.steerVisual = damp(this.steerVisual, input.steer * 0.42, 10, dt);
    this.wheelSpin += (this.speed / cfg.wheelRadius) * dt;

    // Ride up onto the kerb when on the sidewalk, and rumble a little.
    const targetY = c.onSidewalk ? 0.24 : 0;
    this.baseY = damp(this.baseY, targetY, 12, dt);
    this.bounce = Math.max(0, this.bounce - dt * 3.2);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.9);

    this.sync();
  }

  private sync() {
    const rumble = this.onSidewalk ? Math.sin(this.wheelSpin * 4) * 0.035 : 0;
    this.root.position.set(this.x, this.baseY + rumble + this.bounce * 0.22, this.z);
    this.root.rotation.y = this.yaw;

    // Squash-and-stretch on impact reads clearly without touching materials.
    const squash = this.bounce * 0.22;
    this.lean.scaling.set(1 + squash, 1 - squash * 0.8, 1 + squash * 0.5);
    this.lean.rotation.z = this.leanAngle + this.bounce * Math.sin(this.flash * 30) * 0.12;
    this.lean.rotation.x = this.bounce * 0.16;

    this.frontWheel.rotation.x = this.wheelSpin;
    this.rearWheel.rotation.x = this.wheelSpin;
    this.steerNode.rotation.y = this.steerVisual;
  }

  dispose() {
    this.cargoFood.dispose();
    this.cargoParcel.dispose();
    this.frontWheel.dispose();
    this.rearWheel.dispose();
    this.body.dispose();
    this.steerNode.dispose();
    this.lean.dispose();
    this.root.dispose();
  }
}
