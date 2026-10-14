/**
 * Navigation aids and celebration effects.
 *
 * - `DestinationMarker`: an animated pad, floating pin, name billboard and a
 *   tall light column that stays visible over the rooftops.
 * - `DirectionArrow`: a ground chevron beside the rider pointing at the target.
 * - `Burst`: a pooled confetti/debris puff used for deliveries and crashes.
 */

import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { combine, glowMaterial, part_box } from "./meshkit";

export const MARKER_COLORS = {
  food: "#ff7a3d",
  parcel: "#3f8fe0",
  dropoff: "#2fbf7f",
} as const;

export type MarkerTone = keyof typeof MARKER_COLORS;

/* ------------------------------------------------------- text billboard */

class Billboard {
  readonly mesh: Mesh;
  private readonly texture: DynamicTexture;
  private readonly material: StandardMaterial;

  constructor(scene: Scene, width: number, height: number) {
    this.texture = new DynamicTexture("marker_label", { width: 512, height: 128 }, scene, false);
    this.texture.hasAlpha = true;

    this.material = new StandardMaterial("mat_marker_label", scene);
    this.material.diffuseTexture = this.texture;
    this.material.opacityTexture = this.texture;
    this.material.emissiveColor = new Color3(1, 1, 1);
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.material.useAlphaFromDiffuseTexture = true;

    this.mesh = MeshBuilder.CreatePlane("marker_label", { width, height }, scene);
    this.mesh.material = this.material;
    this.mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
  }

  draw(title: string, subtitle: string, accent: string) {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 512, 128);

    // Rounded pill background.
    const r = 26;
    ctx.beginPath();
    ctx.moveTo(r, 4);
    ctx.lineTo(512 - r, 4);
    ctx.quadraticCurveTo(512 - 4, 4, 512 - 4, r + 4);
    ctx.lineTo(512 - 4, 124 - r);
    ctx.quadraticCurveTo(512 - 4, 124, 512 - r, 124);
    ctx.lineTo(r, 124);
    ctx.quadraticCurveTo(4, 124, 4, 124 - r);
    ctx.lineTo(4, r + 4);
    ctx.quadraticCurveTo(4, 4, r, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(14,18,24,0.88)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.font = "bold 30px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(subtitle.toUpperCase(), 256, 44);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px system-ui, -apple-system, Segoe UI, sans-serif";
    let text = title;
    while (ctx.measureText(text).width > 470 && text.length > 6) text = text.slice(0, -2);
    ctx.fillText(text === title ? text : text + "…", 256, 96);

    this.texture.update(false);
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/* ------------------------------------------------------ destination marker */

export class DestinationMarker {
  private readonly root: TransformNode;
  private readonly ring: Mesh;
  private readonly pin: Mesh;
  private readonly column: Mesh;
  private readonly columnMat: StandardMaterial;
  private readonly ringMat: StandardMaterial;
  private readonly pinMat: StandardMaterial;
  private readonly label: Billboard;
  private t = 0;
  private visible = false;

  constructor(scene: Scene) {
    this.root = new TransformNode("marker_root", scene);
    this.root.setEnabled(false);

    this.ringMat = new StandardMaterial("mat_marker_ring", scene);
    this.ringMat.disableLighting = true;
    this.ringMat.backFaceCulling = false;
    this.ringMat.alpha = 0.85;

    this.ring = MeshBuilder.CreateTorus("marker_ring", { diameter: 7, thickness: 0.7, tessellation: 24 }, scene);
    this.ring.material = this.ringMat;
    this.ring.parent = this.root;
    this.ring.position.y = 0.5;
    this.ring.isPickable = false;

    // Floating map-pin: an inverted cone with a sphere cap.
    this.pinMat = new StandardMaterial("mat_marker_pin", scene);
    this.pinMat.disableLighting = true;
    this.pin = MeshBuilder.CreateCylinder(
      "marker_pin",
      { diameterTop: 2.4, diameterBottom: 0, height: 3.2, tessellation: 10 },
      scene,
    );
    this.pin.material = this.pinMat;
    this.pin.parent = this.root;
    this.pin.position.y = 4.6;
    this.pin.isPickable = false;

    // Tall soft light column — the main long-range wayfinding cue.
    this.columnMat = new StandardMaterial("mat_marker_col", scene);
    this.columnMat.disableLighting = true;
    this.columnMat.alpha = 0.2;
    this.columnMat.backFaceCulling = false;
    this.columnMat.disableDepthWrite = true;

    this.column = MeshBuilder.CreateCylinder(
      "marker_column",
      { diameterTop: 7.5, diameterBottom: 5.2, height: 60, tessellation: 18 },
      scene,
    );
    this.column.material = this.columnMat;
    this.column.parent = this.root;
    this.column.position.y = 30;
    this.column.isPickable = false;
    this.column.renderingGroupId = 1;

    this.label = new Billboard(scene, 15, 3.75);
    this.label.mesh.parent = this.root;
    this.label.mesh.position.y = 9.2;
  }

  show(x: number, z: number, tone: MarkerTone, title: string, subtitle: string) {
    const hex = MARKER_COLORS[tone];
    const c = Color3.FromHexString(hex);
    this.ringMat.emissiveColor = c;
    this.pinMat.emissiveColor = c.scale(1.15);
    this.columnMat.emissiveColor = c;
    this.label.draw(title, subtitle, hex);
    this.root.position.set(x, 0, z);
    this.root.setEnabled(true);
    this.visible = true;
  }

  hide() {
    this.root.setEnabled(false);
    this.visible = false;
  }

  update(dt: number) {
    if (!this.visible) return;
    this.t += dt;
    const pulse = Math.sin(this.t * 3.4) * 0.5 + 0.5;
    const s = 1 + pulse * 0.16;
    this.ring.scaling.set(s, 1, s);
    this.ring.rotation.y = this.t * 0.8;
    this.pin.rotation.y = this.t * 1.6;
    this.pin.position.y = 4.6 + Math.sin(this.t * 2.6) * 0.45;
    this.columnMat.alpha = 0.14 + pulse * 0.12;
    this.ringMat.alpha = 0.7 + pulse * 0.3;
  }

  dispose() {
    this.label.dispose();
    this.column.dispose();
    this.pin.dispose();
    this.ring.dispose();
    this.columnMat.dispose();
    this.ringMat.dispose();
    this.pinMat.dispose();
    this.root.dispose();
  }
}

/* ------------------------------------------------------- direction arrow */

export class DirectionArrow {
  private readonly root: TransformNode;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private t = 0;
  private visible = false;

  constructor(scene: Scene) {
    this.root = new TransformNode("arrow_root", scene);
    this.root.setEnabled(false);

    // Two angled blades forming a chevron, pointing along local +Z.
    const parts: Mesh[] = [
      part_box(scene, { w: 3.0, h: 0.3, d: 0.95, x: -0.95, ry: -0.72, color: "#ffffff" }),
      part_box(scene, { w: 3.0, h: 0.3, d: 0.95, x: 0.95, ry: 0.72, color: "#ffffff" }),
    ];
    this.mesh = combine("arrow", parts, scene);
    this.material = new StandardMaterial("mat_arrow", scene);
    this.material.disableLighting = true;
    this.material.alpha = 0.92;
    this.mesh.material = this.material;
    this.mesh.parent = this.root;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
  }

  hide() {
    this.root.setEnabled(false);
    this.visible = false;
  }

  setTone(tone: MarkerTone) {
    this.material.emissiveColor = Color3.FromHexString(MARKER_COLORS[tone]).scale(1.2);
  }

  /** Places the chevron a few metres in front of the rider, aimed at the goal. */
  update(dt: number, riderX: number, riderZ: number, targetX: number, targetZ: number) {
    this.t += dt;
    const dx = targetX - riderX;
    const dz = targetZ - riderZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 1) {
      this.hide();
      return;
    }
    if (!this.visible) {
      this.root.setEnabled(true);
      this.visible = true;
    }
    const heading = Math.atan2(dx, dz);
    const lead = Math.min(6.5, dist * 0.45);
    this.root.position.set(
      riderX + (dx / dist) * lead,
      0.75 + Math.sin(this.t * 5) * 0.14,
      riderZ + (dz / dist) * lead,
    );
    this.root.rotation.y = heading;
    this.material.alpha = 0.72 + (Math.sin(this.t * 5) * 0.5 + 0.5) * 0.28;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
    this.root.dispose();
  }
}

/* ----------------------------------------------------------------- bursts */

interface Particle {
  mesh: Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  spin: number;
}

/** A small pool of spinning cubes reused for every celebration and crash. */
export class Burst {
  private readonly particles: Particle[] = [];
  private readonly prototypes: Mesh[];

  constructor(scene: Scene, count = 30) {
    const colors = ["#ffd447", "#ff7a3d", "#2fbf7f", "#ffffff", "#3f8fe0"];
    this.prototypes = colors.map((hex) => {
      const m = MeshBuilder.CreateBox(`burst_${hex}`, { size: 0.55 }, scene);
      m.material = glowMaterial(scene, hex);
      m.isPickable = false;
      m.renderingGroupId = 1;
      m.setEnabled(false);
      return m;
    });

    for (let i = 0; i < count; i++) {
      const proto = this.prototypes[i % this.prototypes.length];
      const mesh = proto.clone(`burst_p${i}`);
      mesh.setEnabled(false);
      mesh.isPickable = false;
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 });
    }
  }

  fire(x: number, y: number, z: number, strength = 1, count = 18) {
    let fired = 0;
    for (const p of this.particles) {
      if (fired >= count) break;
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const speed = (5 + Math.random() * 7) * strength;
      p.vx = Math.cos(a) * speed * 0.6;
      p.vz = Math.sin(a) * speed * 0.6;
      p.vy = (7 + Math.random() * 7) * strength;
      p.life = 0.75 + Math.random() * 0.55;
      p.spin = (Math.random() - 0.5) * 14;
      p.mesh.position.set(x, y, z);
      p.mesh.scaling.setAll(0.7 + Math.random() * 0.9);
      p.mesh.setEnabled(true);
      fired++;
    }
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.setEnabled(false);
        continue;
      }
      p.vy -= 26 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.25) {
        p.mesh.position.y = 0.25;
        p.vy *= -0.38;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.7 * dt;
    }
  }

  clear() {
    for (const p of this.particles) {
      p.life = 0;
      p.mesh.setEnabled(false);
    }
  }

  dispose() {
    for (const p of this.particles) p.mesh.dispose();
    for (const p of this.prototypes) p.dispose();
  }
}

/** Expanding shockwave ring used on pickup / delivery. */
export class Shockwave {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private t = -1;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateTorus("shock", { diameter: 6, thickness: 0.5, tessellation: 28 }, scene);
    this.material = new StandardMaterial("mat_shock", scene);
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.renderingGroupId = 1;
    this.mesh.setEnabled(false);
  }

  fire(x: number, z: number, hex: string) {
    this.material.emissiveColor = Color3.FromHexString(hex);
    this.mesh.position.set(x, 0.6, z);
    this.mesh.setEnabled(true);
    this.t = 0;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const k = this.t / 0.65;
    if (k >= 1) {
      this.t = -1;
      this.mesh.setEnabled(false);
      return;
    }
    const s = 0.4 + k * 3.4;
    this.mesh.scaling.set(s, 1, s);
    this.material.alpha = 1 - k;
  }

  dispose() {
    this.mesh.dispose();
    this.material.dispose();
  }
}
