import { useGameStore } from "../store/gameStore";
import { formatNaira } from "../utils/format";

const DESKTOP_KEYS = [
  { keys: ["W", "↑"], label: "Accelerate" },
  { keys: ["S", "↓"], label: "Brake / reverse" },
  { keys: ["A", "←"], label: "Steer left" },
  { keys: ["D", "→"], label: "Steer right" },
  { keys: ["Esc", "P"], label: "Pause" },
];

export function MainMenu() {
  const startGame = useGameStore((s) => s.startGame);
  const best = useGameStore((s) => s.best);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);

  return (
    <div className="screen screen--menu">
      <div className="menu">
        <header className="menu__head">
          <p className="menu__eyebrow">Yaba · Lagos</p>
          <h1 className="menu__title">
            <span>Lagos</span>
            <span className="menu__title-accent">Delivery</span>
          </h1>
          <p className="menu__tagline">Beat the traffic. Deliver the package. Secure the bag.</p>
        </header>

        <button className="btn btn--primary btn--xl" onClick={startGame} autoFocus>
          Play Game
        </button>

        {best > 0 && (
          <p className="menu__best">
            Best run <strong>{formatNaira(best)}</strong>
          </p>
        )}

        <div className="menu__panels">
          <section className="panel">
            <h2 className="panel__title">How it works</h2>
            <ol className="rules">
              <li>
                Ride to the <em className="tone-food">glowing pickup</em> beacon to collect the
                order.
              </li>
              <li>
                Deliver it to the <em className="tone-drop">green beacon</em> before the clock
                runs out.
              </li>
              <li>
                <strong>The timer starts the moment an order is assigned</strong> — the ride to
                the pickup counts.
              </li>
              <li>Three expired orders and your shift is over.</li>
            </ol>
          </section>

          <section className="panel">
            <h2 className="panel__title">Controls</h2>
            <ul className="keys">
              {DESKTOP_KEYS.map((row) => (
                <li key={row.label}>
                  <span className="keys__caps">
                    {row.keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                  <span className="keys__label">{row.label}</span>
                </li>
              ))}
            </ul>
            <p className="panel__note">On a phone? Use the on-screen steering and throttle.</p>
          </section>
        </div>

        <button className="btn btn--ghost btn--sm menu__mute" onClick={toggleMute}>
          {muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
      </div>
    </div>
  );
}
