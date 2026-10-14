/** Naira formatting helpers shared by the UI. */

const NUMBER = new Intl.NumberFormat("en-NG");

export function formatNaira(amount: number): string {
  return `₦${NUMBER.format(Math.round(amount))}`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return `${m}:${rest.toString().padStart(2, "0")}`;
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)}km` : `${Math.round(metres)}m`;
}
