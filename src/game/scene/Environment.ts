/** Lighting, sky, fog and the base ground plane. */

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

import { PALETTE } from "../config";
import { WORLD } from "../data/map";
import { tint } from "./meshkit";

export interface EnvironmentHandles {
  sun: DirectionalLight;
  shadows: ShadowGenerator;
  dispose(): void;
}

function buildSkyDome(scene: Scene): Mesh {
  const dome = MeshBuilder.CreateSphere("sky", { diameter: 900, segments: 16 }, scene);
  dome.isPickable = false;
  dome.infiniteDistance = true;

  // Vertical gradient: deep sky at the top, hazy warm haze at the horizon.
  const positions = dome.getVerticesData(VertexBuffer.PositionKind);
  const top = Color3.FromHexString("#3aa8e0");
  const mid = Color3.FromHexString(PALETTE.sky);
  const horizon = Color3.FromHexString("#ffe3b0");
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4);
    for (let i = 0; i < positions.length / 3; i++) {
      const t = Math.max(0, Math.min(1, positions[i * 3 + 1] / 450 + 0.08));
      const c = t < 0.35 ? Color3.Lerp(horizon, mid, t / 0.35) : Color3.Lerp(mid, top, (t - 0.35) / 0.65);
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1;
    }
    dome.setVerticesData(VertexBuffer.ColorKind, colors, false);
  }

  const mat = new StandardMaterial("mat_sky", scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.backFaceCulling = false;
  mat.freeze();
  dome.material = mat;
  dome.freezeWorldMatrix();
  return dome;
}

export function createEnvironment(scene: Scene, shadowMapSize: number): EnvironmentHandles {
  scene.clearColor = Color4.FromHexString(PALETTE.sky + "ff");
  scene.ambientColor = new Color3(0.32, 0.3, 0.26);

  // Warm haze so distant outskirts fade instead of popping.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString("#d8e6ec");
  scene.fogStart = 180;
  scene.fogEnd = 360;

  const sky = buildSkyDome(scene);

  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.72;
  hemi.diffuse = Color3.FromHexString("#fff3dd");
  hemi.groundColor = Color3.FromHexString("#8c7f63");
  hemi.specular = new Color3(0.1, 0.1, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-0.52, -1, 0.42), scene);
  sun.position = new Vector3(70, 110, -60);
  sun.intensity = 1.15;
  sun.diffuse = Color3.FromHexString("#fff0cf");
  sun.specular = new Color3(0.18, 0.18, 0.16);

  // A fixed ortho frustum that we keep centred on the rider (see Game.ts) so a
  // modest shadow map still yields crisp local shadows over a large city.
  sun.autoUpdateExtends = false;
  sun.orthoLeft = -80;
  sun.orthoRight = 80;
  sun.orthoBottom = -80;
  sun.orthoTop = 80;
  // Tight depth range around the city keeps the limited depth precision useful.
  sun.shadowMinZ = 40;
  sun.shadowMaxZ = 260;

  const shadows = new ShadowGenerator(shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.darkness = 0.36;
  shadows.bias = 0.0012;
  shadows.normalBias = 0.02;

  // Base terrain: warm laterite dust, tinted a little greener at the edges.
  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: WORLD.width, height: WORLD.depth, subdivisions: 1 },
    scene,
  );
  tint(ground, PALETTE.ground);
  const groundMat = new StandardMaterial("mat_ground", scene);
  groundMat.diffuseColor = Color3.FromHexString(PALETTE.ground);
  groundMat.specularColor = new Color3(0, 0, 0);
  groundMat.freeze();
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.isPickable = false;
  ground.freezeWorldMatrix();

  return {
    sun,
    shadows,
    dispose() {
      shadows.dispose();
      sun.dispose();
      hemi.dispose();
      ground.dispose();
      sky.dispose();
    },
  };
}
