/**
 * Keyboard + touch input.
 *
 * Touch state lives in an exported mutable object that the React
 * `TouchControls` component writes to directly. That keeps thumb-stick updates
 * completely out of React's render cycle.
 */

import type { RiderInput } from "../scene/Rider";
import { clamp } from "../mathx";

/** Written by TouchControls, read by the game loop. No React re-renders. */
export const touchInput = {
  throttle: 0,
  brake: 0,
  /** -1 .. 1 */
  steer: 0,
};

export function resetTouchInput() {
  touchInput.throttle = 0;
  touchInput.brake = 0;
  touchInput.steer = 0;
}

const ACCEL_KEYS = new Set(["KeyW", "ArrowUp"]);
const BRAKE_KEYS = new Set(["KeyS", "ArrowDown"]);
const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const PAUSE_KEYS = new Set(["Escape", "KeyP"]);
const BLOCK_SCROLL = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

export class InputSystem {
  private readonly held = new Set<string>();
  private readonly out: RiderInput = { throttle: 0, brake: 0, steer: 0 };
  /** Smoothed steering so keyboard input is not a hard square wave. */
  private steerSmooth = 0;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  private readonly onTogglePause: () => void;

  constructor(onTogglePause: () => void) {
    this.onTogglePause = onTogglePause;
    this.onKeyDown = (e) => {
      if (BLOCK_SCROLL.has(e.code)) e.preventDefault();
      if (PAUSE_KEYS.has(e.code)) {
        if (!e.repeat) this.onTogglePause();
        return;
      }
      this.held.add(e.code);
    };
    this.onKeyUp = (e) => {
      this.held.delete(e.code);
    };
    // Releasing keys on blur avoids a stuck throttle when tabbing away.
    this.onBlur = () => this.held.clear();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  clear() {
    this.held.clear();
    this.steerSmooth = 0;
    resetTouchInput();
  }

  sample(dt: number): RiderInput {
    let throttle = 0;
    let brake = 0;
    let steer = 0;

    for (const code of this.held) {
      if (ACCEL_KEYS.has(code)) throttle = 1;
      else if (BRAKE_KEYS.has(code)) brake = 1;
      if (LEFT_KEYS.has(code)) steer -= 1;
      if (RIGHT_KEYS.has(code)) steer += 1;
    }

    throttle = Math.max(throttle, touchInput.throttle);
    brake = Math.max(brake, touchInput.brake);
    if (Math.abs(touchInput.steer) > Math.abs(steer)) steer = touchInput.steer;

    steer = clamp(steer, -1, 1);
    // ~110ms to full lock: responsive, but smooth enough to avoid twitchiness.
    const rate = dt * 9;
    this.steerSmooth += clamp(steer - this.steerSmooth, -rate, rate);

    this.out.throttle = throttle;
    this.out.brake = brake;
    this.out.steer = this.steerSmooth;
    return this.out;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.held.clear();
  }
}
