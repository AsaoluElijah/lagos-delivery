/**
 * Game lifecycle: owns the Babylon engine, scene and every gameplay system,
 * and drives them from a single delta-time render loop.
 *
 * React never reaches into this class except through a handful of imperative
 * methods; all shared state flows through the Zustand store.
 */

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { COLLISION, COUNTDOWN_SECONDS, DELIVERY } from "./config";
import { RIDER_SPAWN } from "./data/map";
import type { GameLocation } from "./data/locations";
import { CameraRig } from "./scene/CameraRig";
import { createCity, type CityHandles } from "./scene/City";
import { createEnvironment, type EnvironmentHandles } from "./scene/Environment";
import { Burst, DestinationMarker, DirectionArrow, MARKER_COLORS, Shockwave } from "./scene/Markers";
import { Rider } from "./scene/Rider";
import { Traffic } from "./scene/Traffic";
import { AudioSystem } from "./systems/AudioSystem";
import { CollisionSystem } from "./systems/CollisionSystem";
import { DeliverySystem } from "./systems/DeliverySystem";
import { InputSystem } from "./systems/InputSystem";
import { gameState, useGameStore, type GameStatus, type Order } from "../store/gameStore";

const CRASH_LINES = [
  "You hit a danfo!",
  "Conductor is shouting!",
  "Scratched the paint!",
  "Ah ah! Watch your front!",
];

export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly env: EnvironmentHandles;
  private readonly city: CityHandles;
  private readonly traffic: Traffic;
  private readonly rider: Rider;
  private readonly camera: CameraRig;
  private readonly marker: DestinationMarker;
  private readonly arrow: DirectionArrow;
  private readonly burst: Burst;
  private readonly shockwave: Shockwave;
  private readonly collision = new CollisionSystem();
  private readonly delivery: DeliverySystem;
  private readonly input: InputSystem;
  private readonly audio = new AudioSystem();

  private readonly unsubscribe: () => void;
  private readonly onResize: () => void;
  private readonly onVisibility: () => void;
  private resizeHandle = 0;

  private collisionCooldown = 0;
  private crashNoticeCooldown = 0;
  private countdownRemaining = 0;
  private lastBeepSecond = -1;
  private lastUrgencyBeep = -1;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    const coarse =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 820);

    this.engine = new Engine(canvas, true, {
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    // Cap pixel density: full DPR on a 3x phone is a pointless amount of work.
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.engine.setHardwareScalingLevel(1 / Math.min(dpr, coarse ? 1.5 : 2));

    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.skipFrustumClipping = false;

    this.env = createEnvironment(this.scene, coarse ? 1024 : 2048);
    this.city = createCity(this.scene);
    this.traffic = new Traffic(this.scene);
    this.rider = new Rider(this.scene, this.collision.constrain);
    this.camera = new CameraRig(this.scene);
    this.marker = new DestinationMarker(this.scene);
    this.arrow = new DirectionArrow(this.scene);
    this.burst = new Burst(this.scene, coarse ? 22 : 34);
    this.shockwave = new Shockwave(this.scene);

    for (const mesh of [
      ...this.city.shadowCasters,
      ...this.traffic.shadowCasters,
      ...this.rider.meshes,
    ]) {
      this.env.shadows.addShadowCaster(mesh, false);
    }

    this.delivery = new DeliverySystem({
      onOrderAssigned: (order, pickup) => this.handleOrderAssigned(order, pickup),
      onPickedUp: (order, pickup) => this.handlePickedUp(order, pickup),
      onDelivered: (order, drop) => this.handleDelivered(order, drop),
      onFailed: (order) => this.handleFailed(order),
    });

    this.input = new InputSystem(() => this.togglePause());

    this.audio.setMuted(gameState().muted);
    this.camera.setViewport(canvas.clientWidth, canvas.clientHeight);
    this.camera.snapTo(RIDER_SPAWN.x, RIDER_SPAWN.z);
    this.camera.setMode("menu");

    // Materials are all set up by now; stop re-evaluating them every frame.
    this.scene.blockMaterialDirtyMechanism = true;

    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (state.status !== prev.status) this.handleStatusChange(state.status, prev.status);
      if (state.muted !== prev.muted) this.audio.setMuted(state.muted);
    });

    this.onResize = () => {
      if (this.resizeHandle) return;
      this.resizeHandle = requestAnimationFrame(() => {
        this.resizeHandle = 0;
        if (this.disposed) return;
        this.engine.resize();
        this.camera.setViewport(canvas.clientWidth, canvas.clientHeight);
      });
    };
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);

    this.onVisibility = () => {
      if (document.hidden) gameState().pauseGame();
    };
    document.addEventListener("visibilitychange", this.onVisibility);

    if (import.meta.env.DEV) this.exposeDebugHooks();

    this.engine.runRenderLoop(this.frame);
  }

  /** Dev-only console/automation hook: `window.lagosDebug`. */
  private exposeDebugHooks() {
    (window as unknown as { lagosDebug?: unknown }).lagosDebug = {
      rider: () => ({
        x: this.rider.x,
        z: this.rider.z,
        yaw: this.rider.yaw,
        speed: this.rider.speed,
        onSidewalk: this.rider.onSidewalk,
      }),
      target: () => {
        const t = this.delivery.activeTarget();
        return t ? { id: t.id, label: t.label, x: t.x, z: t.z } : null;
      },
      fps: () => this.engine.getFps(),
      drawCalls: () => this.scene.getActiveMeshes().length,
      teleport: (x: number, z: number) => {
        this.rider.x = x;
        this.rider.z = z;
        this.rider.speed = 0;
        this.camera.snapTo(x, z);
      },
    };
  }

  /* ----------------------------------------------------------- lifecycle */

  private handleStatusChange(next: GameStatus, prev: GameStatus) {
    if (next === "countdown") {
      this.resetSession();
      this.countdownRemaining = COUNTDOWN_SECONDS + 0.999;
      this.lastBeepSecond = -1;
      this.camera.setMode("follow");
      this.camera.snapTo(RIDER_SPAWN.x, RIDER_SPAWN.z);
      return;
    }

    if (next === "playing") {
      if (prev === "countdown") this.delivery.queueFirstOrder();
      this.camera.setMode("follow");
      return;
    }

    if (next === "menu") {
      this.resetSession();
      this.camera.setMode("menu");
      return;
    }

    if (next === "gameover") {
      this.input.clear();
      this.marker.hide();
      this.arrow.hide();
      this.rider.setCargo(null);
      this.audio.play("gameover");
    }

    if (next === "paused") this.input.clear();
  }

  private resetSession() {
    this.rider.reset();
    this.traffic.reset();
    this.delivery.reset();
    this.burst.clear();
    this.marker.hide();
    this.arrow.hide();
    this.input.clear();
    this.collisionCooldown = 0;
    this.crashNoticeCooldown = 0;
    this.lastUrgencyBeep = -1;
  }

  private togglePause() {
    const s = gameState();
    if (s.status === "playing") {
      s.pauseGame();
      this.audio.play("ui");
    } else if (s.status === "paused") {
      s.resumeGame();
      this.audio.play("ui");
    }
  }

  /* ------------------------------------------------------ delivery events */

  private handleOrderAssigned(order: Order, pickup: GameLocation) {
    const tone = order.type === "food" ? "food" : "parcel";
    this.marker.show(
      pickup.x,
      pickup.z,
      tone,
      pickup.label,
      order.type === "food" ? "Pick up food" : "Pick up parcel",
    );
    this.arrow.setTone(tone);
    this.audio.play("order");
    gameState().notify({
      kind: "order",
      title: order.type === "food" ? "New food order" : "New parcel order",
      detail: `${pickup.label} → ${order.dropLabel}`,
      amount: order.reward,
    });
  }

  private handlePickedUp(order: Order, pickup: GameLocation) {
    this.rider.setCargo(order.type);
    const drop = this.delivery.activeTarget();
    if (drop) {
      this.marker.show(drop.x, drop.z, "dropoff", drop.label, `Deliver to ${order.customer}`);
      this.arrow.setTone("dropoff");
    }
    this.shockwave.fire(pickup.x, pickup.z, MARKER_COLORS[order.type === "food" ? "food" : "parcel"]);
    this.burst.fire(pickup.x, 1.6, pickup.z, 0.7, 10);
    this.audio.play("pickup");
    gameState().notify({
      kind: "pickup",
      title: "Order collected",
      detail: `${order.item} for ${order.customer}`,
    });
  }

  private handleDelivered(order: Order, drop: GameLocation) {
    this.rider.setCargo(null);
    this.marker.hide();
    this.arrow.hide();
    this.shockwave.fire(drop.x, drop.z, MARKER_COLORS.dropoff);
    this.burst.fire(drop.x, 2.0, drop.z, 1.25, 20);
    this.burst.fire(this.rider.x, 2.2, this.rider.z, 1.0, 10);
    this.audio.play("deliver");
    this.traffic.setDifficulty(gameState().completed);
    gameState().notify({
      kind: "delivered",
      title: "Delivered!",
      detail: `${order.customer} dey happy`,
      amount: order.reward,
    });
  }

  private handleFailed(order: Order) {
    this.rider.setCargo(null);
    this.marker.hide();
    this.arrow.hide();
    this.camera.addShake(0.5);
    this.audio.play("fail");
    gameState().notify({
      kind: "failed",
      title: "Order expired",
      detail: `${order.dropLabel} cancelled`,
    });
  }

  /* ----------------------------------------------------------- main loop */

  private readonly frame = () => {
    if (this.disposed) return;

    // Clamping delta time keeps a long stall (or a backgrounded tab) from
    // teleporting the rider or eating the delivery timer.
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
    const s = gameState();

    switch (s.status) {
      case "menu":
        this.traffic.update(dt);
        this.camera.update(dt, this.rider);
        break;

      case "countdown":
        this.traffic.update(dt);
        this.camera.update(dt, this.rider);
        this.stepCountdown(dt);
        break;

      case "playing":
        this.stepPlaying(dt);
        break;

      case "gameover":
        // Keep the city alive behind the results screen.
        this.traffic.update(dt);
        this.camera.update(dt, this.rider);
        this.burst.update(dt);
        break;

      case "paused":
        break;
    }

    if (s.status !== "paused") {
      this.marker.update(dt);
      this.shockwave.update(dt);
    }

    this.scene.render();
  };

  private stepCountdown(dt: number) {
    this.countdownRemaining -= dt;
    const shown = Math.max(0, Math.ceil(this.countdownRemaining));
    const s = gameState();
    if (shown !== s.countdown) s.setCountdown(shown);
    if (shown !== this.lastBeepSecond) {
      this.lastBeepSecond = shown;
      if (shown > 0) this.audio.play("beep");
    }
    if (this.countdownRemaining <= 0) {
      this.audio.play("go");
      s.beginPlay();
    }
  }

  private stepPlaying(dt: number) {
    const input = this.input.sample(dt);

    const surfaceCap = this.collision.surfaceSpeedCap(this.rider.onSidewalk);
    const hitCap = this.collisionCooldown > 0 ? 0.62 : 1;
    this.rider.update(dt, input, surfaceCap * hitCap);

    this.traffic.update(dt);

    if (this.collisionCooldown > 0) {
      this.collisionCooldown -= dt;
    } else {
      const hit = this.collision.checkTraffic(this.rider.x, this.rider.z, this.traffic.vehicles);
      if (hit) this.handleCrash(hit.nx, hit.nz, hit.vehicle.kind);
    }
    if (this.crashNoticeCooldown > 0) this.crashNoticeCooldown -= dt;

    this.delivery.update(dt, this.rider.x, this.rider.z);

    // Urgency beeps in the final seconds.
    const left = gameState().timeLeft;
    if (left > 0 && left <= 5) {
      const sec = Math.ceil(left);
      if (sec !== this.lastUrgencyBeep) {
        this.lastUrgencyBeep = sec;
        this.audio.play("beep");
      }
    } else if (left > DELIVERY.lowTimeWarning) {
      this.lastUrgencyBeep = -1;
    }

    const target = this.delivery.activeTarget();
    if (target) {
      this.arrow.update(dt, this.rider.x, this.rider.z, target.x, target.z);
    } else {
      this.arrow.hide();
    }

    this.burst.update(dt);
    this.camera.update(dt, this.rider);

    // Keep the shadow frustum centred on the rider.
    this.env.sun.position.set(this.rider.x + 70, 110, this.rider.z - 58);
  }

  private handleCrash(nx: number, nz: number, kind: string) {
    this.rider.bump(nx, nz);
    this.collisionCooldown = COLLISION.cooldown;
    this.camera.addShake(COLLISION.shakeMagnitude);
    this.burst.fire(this.rider.x, 1.4, this.rider.z, 0.75, 8);
    this.audio.play("crash");

    if (this.crashNoticeCooldown <= 0) {
      this.crashNoticeCooldown = 2.4;
      gameState().notify({
        kind: "crash",
        title: "Collision!",
        detail:
          kind === "danfo"
            ? CRASH_LINES[Math.floor(Math.random() * CRASH_LINES.length)]
            : kind === "keke"
              ? "Keke napep cut you off!"
              : "You clipped a car!",
      });
    }
  }

  /* ------------------------------------------------------------- disposal */

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this.resizeHandle) cancelAnimationFrame(this.resizeHandle);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);

    this.unsubscribe();
    this.engine.stopRenderLoop();
    if (import.meta.env.DEV) {
      delete (window as unknown as { lagosDebug?: unknown }).lagosDebug;
    }

    this.input.dispose();
    this.audio.dispose();
    this.shockwave.dispose();
    this.burst.dispose();
    this.arrow.dispose();
    this.marker.dispose();
    this.camera.dispose();
    this.rider.dispose();
    this.traffic.dispose();
    this.city.dispose();
    this.env.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
