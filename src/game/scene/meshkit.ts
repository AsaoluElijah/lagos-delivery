/**
 * Primitive-building helpers.
 *
 * Everything in the city is built from boxes/cylinders that are tinted with
 * *vertex colours* and then merged into a single mesh. That gives us a
 * multi-coloured low-poly model that still costs exactly one draw call, and
 * lets us use `createInstance()` for repeated props and vehicles.
 */

// Side-effect import: registers `Mesh.createInstance`, which City and Traffic
// rely on for repeated props and vehicles.
import "@babylonjs/core/Meshes/instancedMesh";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

const MATERIAL_CACHE = new WeakMap<Scene, Map<string, StandardMaterial>>();

function cacheFor(scene: Scene): Map<string, StandardMaterial> {
  let m = MATERIAL_CACHE.get(scene);
  if (!m) {
    m = new Map();
    MATERIAL_CACHE.set(scene, m);
  }
  return m;
}

/** Shared flat-shaded material that reads colour from the vertex buffer. */
export function vertexColorMaterial(scene: Scene): StandardMaterial {
  const cache = cacheFor(scene);
  const existing = cache.get("__vertex");
  if (existing) return existing;

  const mat = new StandardMaterial("mat_vertex", scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.06, 0.06, 0.06);
  mat.specularPower = 64;
  // FREEZE-TEST
  cache.set("__vertex", mat);
  return mat;
}

/** Flat colour material (no vertex colours), cached per hex string. */
export function solidMaterial(scene: Scene, hex: string, emissive = 0): StandardMaterial {
  const key = `solid:${hex}:${emissive}`;
  const cache = cacheFor(scene);
  const existing = cache.get(key);
  if (existing) return existing;

  const c = Color3.FromHexString(hex);
  const mat = new StandardMaterial(`mat_${key}`, scene);
  mat.diffuseColor = c;
  mat.specularColor = new Color3(0, 0, 0);
  if (emissive > 0) mat.emissiveColor = c.scale(emissive);
  // FREEZE-TEST
  cache.set(key, mat);
  return mat;
}

/** Unlit glowing material used for markers and UI-ish 3D elements. */
export function glowMaterial(scene: Scene, hex: string, alpha = 1): StandardMaterial {
  const key = `glow:${hex}:${alpha}`;
  const cache = cacheFor(scene);
  const existing = cache.get(key);
  if (existing) return existing;

  const c = Color3.FromHexString(hex);
  const mat = new StandardMaterial(`mat_${key}`, scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  mat.emissiveColor = c;
  mat.disableLighting = true;
  if (alpha < 1) {
    mat.alpha = alpha;
    mat.backFaceCulling = false;
  }
  cache.set(key, mat);
  return mat;
}

/** Writes a flat colour into a mesh's vertex colour buffer. */
export function tint(mesh: Mesh, hex: string): Mesh {
  const c = Color3.FromHexString(hex);
  const count = mesh.getTotalVertices();
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = c.r;
    colors[i * 4 + 1] = c.g;
    colors[i * 4 + 2] = c.b;
    colors[i * 4 + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false);
  return mesh;
}

export interface Transform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

function place(mesh: Mesh, t: Transform): Mesh {
  mesh.position.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  mesh.rotation.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
  mesh.bakeCurrentTransformIntoVertices();
  return mesh;
}

export interface BoxOpts extends Transform {
  w: number;
  h: number;
  d: number;
  color: string;
}

export function part_box(scene: Scene, o: BoxOpts): Mesh {
  const m = MeshBuilder.CreateBox("p", { width: o.w, height: o.h, depth: o.d }, scene);
  tint(m, o.color);
  return place(m, o);
}

export interface CylOpts extends Transform {
  dTop?: number;
  dBottom?: number;
  diameter?: number;
  h: number;
  tess?: number;
  color: string;
}

export function part_cyl(scene: Scene, o: CylOpts): Mesh {
  const m = MeshBuilder.CreateCylinder(
    "p",
    {
      height: o.h,
      diameterTop: o.dTop ?? o.diameter ?? 1,
      diameterBottom: o.dBottom ?? o.diameter ?? 1,
      tessellation: o.tess ?? 12,
    },
    scene,
  );
  tint(m, o.color);
  return place(m, o);
}

export interface SphereOpts extends Transform {
  diameter: number;
  segments?: number;
  color: string;
  scaleY?: number;
}

export function part_sphere(scene: Scene, o: SphereOpts): Mesh {
  const m = MeshBuilder.CreateSphere(
    "p",
    { diameter: o.diameter, segments: o.segments ?? 8 },
    scene,
  );
  tint(m, o.color);
  if (o.scaleY !== undefined) {
    m.scaling.y = o.scaleY;
    m.bakeCurrentTransformIntoVertices();
  }
  return place(m, o);
}

/** Flat, upward-facing slab — used for roads, sidewalks and lane markings. */
export function part_slab(
  scene: Scene,
  o: { w: number; d: number; y: number; x: number; z: number; color: string },
): Mesh {
  const m = MeshBuilder.CreateGround("p", { width: o.w, height: o.d }, scene);
  tint(m, o.color);
  return place(m, { x: o.x, y: o.y, z: o.z });
}

/**
 * Merges tinted parts into one mesh with the shared vertex-colour material.
 * Source meshes are disposed.
 */
export function combine(name: string, parts: Mesh[], scene: Scene): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!merged) throw new Error(`Failed to merge mesh "${name}"`);
  merged.name = name;
  merged.material = vertexColorMaterial(scene);
  return merged;
}
