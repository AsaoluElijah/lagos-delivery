import { memo } from "react";

import { DELIVERY, MAX_FAILURES } from "../game/config";
import { useGameStore } from "../store/gameStore";
import { formatDistance, formatNaira } from "../utils/format";

/* Each block below subscribes to the narrowest possible slice of state so the
   10Hz timer updates don't reconcile the whole HUD. */

const Earnings = memo(function Earnings() {
  const earnings = useGameStore((s) => s.earnings);
  const payout = useGameStore((s) => s.payout);
  return (
    <div className="hud-card hud-card--earnings">
      <span className="hud-card__label">Earnings</span>
      <span className="hud-card__value">{formatNaira(earnings)}</span>
      {payout && (
        <span key={payout.id} className="payout-pop">
          +{formatNaira(payout.amount)}
        </span>
      )}
    </div>
  );
});

const Timer = memo(function Timer() {
  const timeLeft = useGameStore((s) => s.timeLeft);
  const limit = useGameStore((s) => s.order?.timeLimit ?? 0);
  const hasOrder = useGameStore((s) => s.order !== null);

  const pct = limit > 0 ? Math.max(0, Math.min(1, timeLeft / limit)) : 0;
  const urgent = hasOrder && timeLeft <= DELIVERY.lowTimeWarning;
  const critical = hasOrder && timeLeft <= 5;

  return (
    <div className={`timer${urgent ? " timer--urgent" : ""}${critical ? " timer--critical" : ""}`}>
      <div className="timer__readout">
        <span className="timer__seconds">{hasOrder ? Math.ceil(timeLeft) : "--"}</span>
        <span className="timer__unit">sec</span>
      </div>
      <div className="timer__track">
        <div className="timer__fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
    </div>
  );
});

const Score = memo(function Score() {
  const completed = useGameStore((s) => s.completed);
  const failed = useGameStore((s) => s.failed);
  return (
    <div className="hud-stats">
      <div className="hud-card hud-card--tight">
        <span className="hud-card__label">Delivered</span>
        <span className="hud-card__value hud-card__value--sm">{completed}</span>
      </div>
      <div className="hud-card hud-card--tight">
        <span className="hud-card__label">Strikes</span>
        <span className="strikes">
          {Array.from({ length: MAX_FAILURES }, (_, i) => (
            <i key={i} className={i < failed ? "strike strike--on" : "strike"} />
          ))}
        </span>
      </div>
    </div>
  );
});

const OrderCard = memo(function OrderCard() {
  const order = useGameStore((s) => s.order);
  const stage = useGameStore((s) => s.stage);
  const distance = useGameStore((s) => s.distance);

  if (!order) {
    return (
      <div className="order-card order-card--idle">
        <span className="order-card__waiting">Waiting for the next order…</span>
      </div>
    );
  }

  const picking = stage === "pickup";
  const target = picking ? order.pickupLabel : order.dropLabel;
  const area = picking ? order.pickupArea : order.dropArea;

  return (
    <div className={`order-card order-card--${order.type} order-card--${stage}`}>
      <div className="order-card__top">
        <span className={`badge badge--${order.type}`}>
          {order.type === "food" ? "🍲 Food" : "📦 Parcel"}
        </span>
        <span className={`badge badge--stage badge--stage-${stage}`}>
          {picking ? "Pick up" : "Deliver"}
        </span>
        <span className="order-card__reward">{formatNaira(order.reward)}</span>
      </div>

      <p className="order-card__target">{target}</p>
      <p className="order-card__detail">
        {picking ? (
          <>
            {order.item} · for {order.customer} in {order.dropArea}
          </>
        ) : (
          <>
            {order.customer} is waiting in {area}
          </>
        )}
      </p>

      <div className="order-card__foot">
        <span className="chip">{formatDistance(distance)} away</span>
        <span className="chip chip--muted">Follow the beacon</span>
      </div>
    </div>
  );
});

export function GameHUD() {
  const pauseGame = useGameStore((s) => s.pauseGame);
  const muted = useGameStore((s) => s.muted);
  const toggleMute = useGameStore((s) => s.toggleMute);

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__left">
          <Earnings />
          <Score />
        </div>

        <div className="hud__center">
          <Timer />
        </div>

        <div className="hud__right">
          <button
            className="icon-btn"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button className="icon-btn" onClick={pauseGame} aria-label="Pause" title="Pause (Esc)">
            ⏸
          </button>
        </div>
      </div>

      <div className="hud__order">
        <OrderCard />
      </div>
    </div>
  );
}
