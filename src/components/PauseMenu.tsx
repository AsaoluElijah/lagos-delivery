import { useGameStore } from "../store/gameStore";
import { formatNaira } from "../utils/format";

export function PauseMenu() {
  const resumeGame = useGameStore((s) => s.resumeGame);
  const returnToMenu = useGameStore((s) => s.returnToMenu);
  const startGame = useGameStore((s) => s.startGame);
  const earnings = useGameStore((s) => s.earnings);
  const completed = useGameStore((s) => s.completed);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);

  return (
    <div className="screen screen--overlay">
      <div className="dialog">
        <h2 className="dialog__title">Paused</h2>
        <p className="dialog__sub">
          {formatNaira(earnings)} earned · {completed} delivered
        </p>
        <p className="dialog__note">The delivery clock is stopped.</p>

        <div className="dialog__actions">
          <button className="btn btn--primary btn--lg" onClick={resumeGame} autoFocus>
            Resume
          </button>
          <button className="btn btn--ghost" onClick={toggleMute}>
            {muted ? "🔇 Sound off" : "🔊 Sound on"}
          </button>
          <button className="btn btn--ghost" onClick={startGame}>
            Restart shift
          </button>
          <button className="btn btn--quiet" onClick={returnToMenu}>
            Quit to menu
          </button>
        </div>
      </div>
    </div>
  );
}
