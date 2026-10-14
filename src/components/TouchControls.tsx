import { useCallback, useEffect, useRef } from "react";

import { resetTouchInput, touchInput } from "../game/systems/InputSystem";
import { clamp } from "../game/mathx";

/**
 * On-screen controls for touch devices.
 *
 * These write straight into the shared `touchInput` object and move the knob
 * with direct DOM writes, so dragging a thumb never triggers a React render.
 */
export function TouchControls() {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => resetTouchInput, []);

  const applySteer = useCallback((clientX: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const half = rect.width / 2;
    const value = clamp((clientX - (rect.left + half)) / (half * 0.78), -1, 1);
    touchInput.steer = value;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${value * half * 0.62}px, -50%)`;
    }
  }, []);

  const releaseSteer = useCallback(() => {
    activePointer.current = null;
    touchInput.steer = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, -50%)";
  }, []);

  const onPadDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      activePointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      applySteer(e.clientX);
    },
    [applySteer],
  );

  const onPadMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointer.current !== e.pointerId) return;
      applySteer(e.clientX);
    },
    [applySteer],
  );

  const onPadUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activePointer.current !== e.pointerId) return;
      releaseSteer();
    },
    [releaseSteer],
  );

  const pedal = (key: "throttle" | "brake") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add("pedal--active");
      touchInput[key] = 1;
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("pedal--active");
      touchInput[key] = 0;
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove("pedal--active");
      touchInput[key] = 0;
    },
  });

  return (
    <div className="touch">
      <div
        ref={padRef}
        className="touch__steer"
        onPointerDown={onPadDown}
        onPointerMove={onPadMove}
        onPointerUp={onPadUp}
        onPointerCancel={onPadUp}
        role="slider"
        aria-label="Steering"
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={0}
      >
        <span className="touch__steer-track" />
        <span className="touch__steer-hint touch__steer-hint--l">◀</span>
        <span className="touch__steer-hint touch__steer-hint--r">▶</span>
        <div ref={knobRef} className="touch__knob" />
      </div>

      <div className="touch__pedals">
        <button className="pedal pedal--brake" {...pedal("brake")} aria-label="Brake">
          ▼
        </button>
        <button className="pedal pedal--gas" {...pedal("throttle")} aria-label="Accelerate">
          ▲
        </button>
      </div>
    </div>
  );
}

/** True on devices whose primary pointer is a finger. */
export function hasCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
