/**
 * Shared gameplay state.
 *
 * Only *low frequency* state lives here. The rider's transform, camera and
 * traffic simulation stay inside the Babylon systems and never touch React.
 * The timer and target distance are pushed in at a throttled rate (see
 * Game.ts) so the HUD updates without a re-render every frame.
 */

import { create } from "zustand";

import { MAX_FAILURES, STORAGE_KEY, MUTE_KEY } from "../game/config";

export type GameStatus = "menu" | "countdown" | "playing" | "paused" | "gameover";
export type OrderStage = "pickup" | "delivery";
export type OrderType = "food" | "parcel";

export interface Order {
  id: number;
  type: OrderType;
  item: string;
  customer: string;
  pickupId: string;
  pickupLabel: string;
  pickupArea: string;
  dropId: string;
  dropLabel: string;
  dropArea: string;
  reward: number;
  timeLimit: number;
}

export type NoticeKind = "order" | "pickup" | "delivered" | "failed" | "crash";

export interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  detail?: string;
  amount?: number;
}

export interface PayoutPop {
  id: number;
  amount: number;
}

interface GameState {
  status: GameStatus;
  countdown: number;

  order: Order | null;
  stage: OrderStage;
  timeLeft: number;
  /** Straight-line distance to the active objective, in metres. */
  distance: number;

  earnings: number;
  completed: number;
  failed: number;
  best: number;
  /** Set when a payout lands, drives the floating "+₦" animation. */
  payout: PayoutPop | null;

  notices: Notice[];
  muted: boolean;

  startGame: () => void;
  setCountdown: (n: number) => void;
  beginPlay: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  returnToMenu: () => void;

  assignOrder: (order: Order) => void;
  advanceToDelivery: () => void;
  tickTime: (seconds: number) => void;
  setDistance: (metres: number) => void;
  completeOrder: (reward: number) => void;
  failOrder: () => void;

  notify: (notice: Omit<Notice, "id">) => void;
  dismissNotice: (id: number) => void;
  toggleMute: () => void;
}

function loadBest(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* storage unavailable (private mode) — scores just won't persist */
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

let noticeSeq = 1;
let payoutSeq = 1;
const noticeTimers = new Set<ReturnType<typeof setTimeout>>();

function clearNoticeTimers() {
  for (const t of noticeTimers) clearTimeout(t);
  noticeTimers.clear();
}

const freshSession = () => ({
  order: null,
  stage: "pickup" as OrderStage,
  timeLeft: 0,
  distance: 0,
  earnings: 0,
  completed: 0,
  failed: 0,
  payout: null,
  notices: [],
});

export const useGameStore = create<GameState>()((set, get) => ({
  status: "menu",
  countdown: 0,
  ...freshSession(),
  best: loadBest(),
  muted: loadMuted(),

  startGame: () => {
    clearNoticeTimers();
    set({ ...freshSession(), status: "countdown", countdown: 3 });
  },

  setCountdown: (n) => set({ countdown: n }),

  beginPlay: () => set({ status: "playing", countdown: 0 }),

  pauseGame: () => {
    if (get().status === "playing") set({ status: "paused" });
  },

  resumeGame: () => {
    if (get().status === "paused") set({ status: "playing" });
  },

  returnToMenu: () => {
    clearNoticeTimers();
    set({ ...freshSession(), status: "menu", countdown: 0 });
  },

  assignOrder: (order) =>
    set({ order, stage: "pickup", timeLeft: order.timeLimit }),

  advanceToDelivery: () => set({ stage: "delivery" }),

  tickTime: (seconds) => set({ timeLeft: Math.max(0, seconds) }),

  setDistance: (metres) => set({ distance: metres }),

  completeOrder: (reward) => {
    const { earnings, completed, best } = get();
    const nextEarnings = earnings + reward;
    const nextBest = Math.max(best, nextEarnings);
    if (nextBest > best) saveBest(nextBest);
    set({
      earnings: nextEarnings,
      completed: completed + 1,
      best: nextBest,
      order: null,
      stage: "pickup",
      timeLeft: 0,
      payout: { id: payoutSeq++, amount: reward },
    });
  },

  failOrder: () => {
    const { failed, earnings, best } = get();
    const nextFailed = failed + 1;
    const over = nextFailed >= MAX_FAILURES;
    const nextBest = Math.max(best, earnings);
    if (over && nextBest > best) saveBest(nextBest);
    set({
      failed: nextFailed,
      order: null,
      stage: "pickup",
      timeLeft: 0,
      best: nextBest,
      ...(over ? { status: "gameover" as GameStatus } : {}),
    });
  },

  notify: (notice) => {
    const id = noticeSeq++;
    set((s) => ({ notices: [...s.notices, { ...notice, id }].slice(-4) }));
    const timer = setTimeout(() => {
      noticeTimers.delete(timer);
      get().dismissNotice(id);
    }, 3200);
    noticeTimers.add(timer);
  },

  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

  toggleMute: () => {
    const muted = !get().muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ muted });
  },
}));

/** Non-reactive accessor for the Babylon systems. */
export const gameState = () => useGameStore.getState();
