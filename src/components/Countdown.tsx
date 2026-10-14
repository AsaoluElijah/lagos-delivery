import { useGameStore } from "../store/gameStore";

export function Countdown() {
  const n = useGameStore((s) => s.countdown);

  return (
    <div className="screen screen--countdown">
      <div className="countdown">
        <span key={n} className="countdown__number">
          {n > 0 ? n : "GO!"}
        </span>
        <p className="countdown__hint">Your first order lands right away</p>
      </div>
    </div>
  );
}
