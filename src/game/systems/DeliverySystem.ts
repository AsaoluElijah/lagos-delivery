/**
 * Order generation, the delivery timer and pickup/drop-off detection.
 *
 * The timer is driven by the game loop's delta time rather than a wall clock,
 * so pausing, a hidden tab or a dropped frame can never eat the player's time.
 */

import { DELIVERY } from "../config";
import {
  CUSTOMERS,
  DROPOFFS,
  FOOD_ITEMS,
  FOOD_PICKUPS,
  PARCEL_ITEMS,
  PARCEL_PICKUPS,
  getLocation,
  type GameLocation,
} from "../data/locations";
import { clamp, manhattan } from "../mathx";
import { gameState, type Order, type OrderType } from "../../store/gameStore";

export interface DeliveryEvents {
  onOrderAssigned(order: Order, pickup: GameLocation): void;
  onPickedUp(order: Order, pickup: GameLocation): void;
  onDelivered(order: Order, drop: GameLocation): void;
  onFailed(order: Order): void;
}

let orderSeq = 1;

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

export class DeliverySystem {
  /** Countdown until the next order is handed out. */
  private nextOrderIn = 0;
  private lastDropId: string | null = null;
  private distanceAccumulator = 0;

  private readonly events: DeliveryEvents;

  constructor(events: DeliveryEvents) {
    this.events = events;
  }

  reset() {
    this.nextOrderIn = 0;
    this.lastDropId = null;
    this.distanceAccumulator = 0;
  }

  /** Schedules the very first order of a session. */
  queueFirstOrder(delay = 0.35) {
    this.nextOrderIn = delay;
  }

  private buildOrder(riderX: number, riderZ: number): Order {
    const type: OrderType = Math.random() < 0.58 ? "food" : "parcel";
    const pool = type === "food" ? FOOD_PICKUPS : PARCEL_PICKUPS;
    const pickup = randomOf(pool);

    // Avoid repeating the previous customer address back-to-back.
    const candidates = DROPOFFS.filter((d) => d.id !== this.lastDropId);
    const drop = randomOf(candidates.length ? candidates : DROPOFFS);
    this.lastDropId = drop.id;

    const legToPickup = manhattan(riderX, riderZ, pickup.x, pickup.z);
    const legToDrop = manhattan(pickup.x, pickup.z, drop.x, drop.z);

    // Reward scales with the paid leg; the ride to the pickup is unpaid, as in
    // real life, but it is still budgeted into the time limit.
    const rawReward = 450 + legToDrop * 5.2;
    const reward = clamp(
      Math.round(rawReward / 50) * 50,
      DELIVERY.minReward,
      DELIVERY.maxReward,
    );

    const timeLimit = Math.round(
      clamp(
        (legToPickup + legToDrop) / DELIVERY.pacing + DELIVERY.timeBonus,
        DELIVERY.minTime,
        DELIVERY.maxTime,
      ),
    );

    return {
      id: orderSeq++,
      type,
      item: randomOf(type === "food" ? FOOD_ITEMS : PARCEL_ITEMS),
      customer: randomOf(CUSTOMERS),
      pickupId: pickup.id,
      pickupLabel: pickup.label,
      pickupArea: pickup.area,
      dropId: drop.id,
      dropLabel: drop.label,
      dropArea: drop.area,
      reward,
      timeLimit,
    };
  }

  /** The location the player should currently be heading to. */
  activeTarget(): GameLocation | null {
    const { order, stage } = gameState();
    if (!order) return null;
    return getLocation(stage === "pickup" ? order.pickupId : order.dropId);
  }

  update(dt: number, riderX: number, riderZ: number) {
    const s = gameState();

    if (!s.order) {
      this.nextOrderIn -= dt;
      if (this.nextOrderIn <= 0) {
        const order = this.buildOrder(riderX, riderZ);
        s.assignOrder(order);
        this.events.onOrderAssigned(order, getLocation(order.pickupId));
      }
      return;
    }

    // --- timer ---
    const remaining = s.timeLeft - dt;
    if (remaining <= 0) {
      s.tickTime(0);
      const failed = s.order;
      s.failOrder();
      this.events.onFailed(failed);
      this.nextOrderIn = DELIVERY.nextOrderDelay;
      return;
    }
    s.tickTime(remaining);

    // --- proximity ---
    const target = getLocation(s.stage === "pickup" ? s.order.pickupId : s.order.dropId);
    const dist = Math.hypot(target.x - riderX, target.z - riderZ);

    // Push the distance readout to the HUD ~8 times a second.
    this.distanceAccumulator += dt;
    if (this.distanceAccumulator >= 0.12) {
      this.distanceAccumulator = 0;
      s.setDistance(Math.round(dist));
    }

    if (dist > DELIVERY.triggerRadius) return;

    if (s.stage === "pickup") {
      s.advanceToDelivery();
      this.events.onPickedUp(s.order, target);
    } else {
      const done = s.order;
      s.completeOrder(done.reward);
      this.events.onDelivered(done, target);
      this.nextOrderIn = DELIVERY.nextOrderDelay;
    }
  }
}
