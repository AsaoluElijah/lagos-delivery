/**
 * Fixed-angle isometric follow camera.
 *
 * The world-space offset from the rider never changes direction, so the camera
 * rotation is computed once at construction and the camera is only ever
 * translated. That removes all rotational jitter and guarantees a consistent
 * viewing angle — and because the camera sits well above the tallest roof it
 * can never clip through a building.
 */

import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { CAMERA, RIDER } from "../config";
import { clamp, damp } from "../mathx";

export class CameraRig {
  readonly camera: TargetCamera;
  private readonly baseOffset: Vector3;
  private readonly scratch = new Vector3();
  private followX = 0;
  private followZ = 0;
  private zoom = 1;
  private speedZoom = 1;
  private shake = 0;
  private shakeSeed = Math.random() * 100;
  private menuT = 0;
  private mode: "follow" | "menu" = "menu";

  constructor(scene: Scene) {
    this.baseOffset = new Vector3(CAMERA.offset.x, CAMERA.offset.y, CAMERA.offset.z);

    this.camera = new TargetCamera("cam", new Vector3(0, CAMERA.offset.y, CAMERA.offset.z), scene);
    this.camera.fov = CAMERA.fov;
    this.camera.minZ = 2;
    this.camera.maxZ = 520;
    scene.activeCamera = this.camera;

    // Pitch that corresponds to the fixed offset; yaw/roll stay at zero.
    this.camera.rotation.set(Math.atan2(CAMERA.offset.y, -CAMERA.offset.z), 0, 0);
  }

  /** Call on resize: widens the framing on narrow/portrait screens. */
  setViewport(width: number, height: number) {
    const aspect = width / Math.max(1, height);
    this.zoom = clamp(1 + (1.6 - aspect) * 0.4, 1, 1.52);
  }

  setMode(mode: "follow" | "menu") {
    this.mode = mode;
  }

  snapTo(x: number, z: number) {
    this.followX = x;
    this.followZ = z;
    this.speedZoom = 1;
    this.shake = 0;
    this.applyFollow(0);
  }

  addShake(amount: number) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  update(dt: number, rider: { x: number; z: number; yaw: number; speed: number }) {
    if (this.mode === "menu") {
      this.updateMenu(dt);
      return;
    }

    // Bias the framing in the direction of travel so the player sees ahead.
    const lead = (rider.speed / RIDER.maxSpeed) * CAMERA.lookAhead * 18;
    const targetX = rider.x + Math.sin(rider.yaw) * lead;
    const targetZ = rider.z + Math.cos(rider.yaw) * lead;

    this.followX = damp(this.followX, targetX, CAMERA.followLerp, dt);
    this.followZ = damp(this.followZ, targetZ, CAMERA.followLerp, dt);

    // Pull back slightly at speed for a sense of rush.
    const want = 1 + clamp(Math.abs(rider.speed) / RIDER.maxSpeed, 0, 1) * 0.1;
    this.speedZoom = damp(this.speedZoom, want, 2.4, dt);

    this.shake = Math.max(0, this.shake - dt / 0.42);
    this.applyFollow(dt);
  }

  private applyFollow(dt: number) {
    const k = this.zoom * this.speedZoom;
    this.shakeSeed += dt * 48;

    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      const m = this.shake * this.shake * 1.1;
      sx = Math.sin(this.shakeSeed * 1.7) * m;
      sy = Math.cos(this.shakeSeed * 2.3) * m;
    }

    this.camera.position.set(
      this.followX + this.baseOffset.x * k + sx,
      this.baseOffset.y * k + sy,
      this.followZ + this.baseOffset.z * k,
    );
    this.camera.rotation.set(Math.atan2(CAMERA.offset.y, -CAMERA.offset.z), 0, 0);
  }

  /** Slow drift across the city, used behind the main menu. */
  private updateMenu(dt: number) {
    this.menuT += dt * 0.055;
    const radius = 105;
    const cx = Math.sin(this.menuT) * radius;
    const cz = Math.cos(this.menuT * 0.8) * radius * 0.7;

    this.camera.position.set(cx, 86, cz - 96);
    this.scratch.set(cx * 0.3, 4, cz * 0.3 + 16);
    this.camera.setTarget(this.scratch);
  }

  dispose() {
    this.camera.dispose();
  }
}
