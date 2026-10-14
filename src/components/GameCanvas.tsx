import { useEffect, useRef } from "react";

import { Game } from "../game/Game";

/**
 * Owns the single Babylon `Game` instance for the app's lifetime.
 *
 * The component itself never re-renders from gameplay state, so the canvas is
 * never touched by React after mount.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Guard against a double mount creating two WebGL contexts.
    if (gameRef.current) return;
    const game = new Game(canvas);
    gameRef.current = game;

    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" touch-action="none" />;
}
