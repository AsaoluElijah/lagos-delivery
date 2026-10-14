import { useGameStore, type NoticeKind } from "../store/gameStore";
import { formatNaira } from "../utils/format";

const ICONS: Record<NoticeKind, string> = {
  order: "📱",
  pickup: "✅",
  delivered: "🎉",
  failed: "⏱",
  crash: "💥",
};

export function Notifications() {
  const notices = useGameStore((s) => s.notices);
  if (notices.length === 0) return null;

  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice--${n.kind}`}>
          <span className="notice__icon">{ICONS[n.kind]}</span>
          <span className="notice__body">
            <strong className="notice__title">{n.title}</strong>
            {n.detail && <span className="notice__detail">{n.detail}</span>}
          </span>
          {n.amount !== undefined && (
            <span className="notice__amount">{formatNaira(n.amount)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
