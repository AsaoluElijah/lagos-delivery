import { MAX_FAILURES } from "../game/config";
import { useGameStore } from "../store/gameStore";
import { formatNaira } from "../utils/format";

export function GameOver() {
  const earnings = useGameStore((s) => s.earnings);
  const completed = useGameStore((s) => s.completed);
  const failed = useGameStore((s) => s.failed);
  const best = useGameStore((s) => s.best);
  const startGame = useGameStore((s) => s.startGame);
  const returnToMenu = useGameStore((s) => s.returnToMenu);

  const isRecord = earnings > 0 && earnings >= best;

  return (
    <div className="screen screen--overlay">
      <div className="dialog dialog--results">
        <p className="dialog__eyebrow">Shift over</p>
        <h2 className="dialog__title">
          {completed === 0 ? "No deliveries today" : isRecord ? "New personal best!" : "Oya, well done"}
        </h2>

        <div className="results__hero">
          <span className="results__hero-label">Total earned</span>
          <span className="results__hero-value">{formatNaira(earnings)}</span>
        </div>

        <dl className="results__grid">
          <div className="results__cell">
            <dt>Delivered</dt>
            <dd>{completed}</dd>
          </div>
          <div className="results__cell">
            <dt>Expired</dt>
            <dd>
              {failed}
              <small> / {MAX_FAILURES}</small>
            </dd>
          </div>
          <div className="results__cell">
            <dt>Avg. per drop</dt>
            <dd>{completed > 0 ? formatNaira(earnings / completed) : "—"}</dd>
          </div>
          <div className={`results__cell${isRecord ? " results__cell--highlight" : ""}`}>
            <dt>Best run</dt>
            <dd>{formatNaira(best)}</dd>
          </div>
        </dl>

        <div className="dialog__actions">
          <button className="btn btn--primary btn--lg" onClick={startGame} autoFocus>
            Play Again
          </button>
          <button className="btn btn--quiet" onClick={returnToMenu}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
