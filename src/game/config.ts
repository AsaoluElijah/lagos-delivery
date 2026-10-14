/**
 * Central tuning values for Lagos Delivery.
 * Keep gameplay numbers here so the feel can be tweaked in one place.
 */

export const ROAD = {
  /** Half-width of the drivable asphalt. */
  halfWidth: 7.5,
  /** Extra forgiving band (sidewalk) the rider can mount, but slowly. */
  sidewalk: 3.5,
  /** Distance from road centre-line to a lane centre. */
  laneOffset: 3.75,
} as const;

/** Distance from a road centre-line out to a pickup/dropoff marker. */
export const MARKER_OFFSET = 9.5;

/** How far buildings are set back from the edge of a block (sidewalk space). */
export const BLOCK_INSET = 4.5;

/** Street props (trees, stalls, signs) live in this band from the road centre. */
export const PROP_BAND = { min: 12.0, max: 13.6 } as const;

export const RIDER = {
  maxSpeed: 26,
  maxReverseSpeed: 8,
  accel: 30,
  brakeAccel: 46,
  /** Passive slowdown when no input. */
  coastDrag: 11,
  /** Peak turn rate in radians/sec. */
  turnRate: 2.45,
  /** Steering is reduced at very low speed so the bike cannot pirouette. */
  turnSpeedFloor: 3.5,
  /** Above this fraction of max speed, steering tightens less (high-speed stability). */
  highSpeedSteerDamp: 0.42,
  maxLean: 0.46,
  leanLerp: 7,
  wheelRadius: 0.52,
  /** Collision radius against traffic. */
  radius: 1.5,
  /** Speed multiplier while riding the sidewalk. */
  sidewalkSpeedFactor: 0.55,
} as const;

export const CAMERA = {
  /** Fixed world-space offset from the rider — keeps a constant isometric angle. */
  offset: { x: 0, y: 56, z: -42 },
  /** Exponential smoothing rate for the follow target. */
  followLerp: 4.2,
  /** How far ahead of the bike the camera biases, scaled by speed. */
  lookAhead: 0.52,
  fov: 0.82,
} as const;

export const TRAFFIC = {
  baseCount: 9,
  maxCount: 16,
  /** Extra vehicles unlocked per completed delivery. */
  perDelivery: 0.55,
  baseSpeed: 11,
  speedVariance: 3.5,
  /** Speed bonus multiplier at max difficulty. */
  maxSpeedScale: 1.4,
  /** Deliveries needed to reach max difficulty. */
  rampDeliveries: 10,
  /** Look-ahead distance used to brake behind another vehicle. */
  followDistance: 9,
} as const;

export const COLLISION = {
  /** Seconds of invulnerability + visual feedback after a hit. */
  cooldown: 0.9,
  /** Speed retained after smacking into a danfo. */
  speedRetain: -0.12,
  shakeDuration: 0.42,
  shakeMagnitude: 1.1,
} as const;

export const DELIVERY = {
  /** How close the rider must get to trigger pickup / dropoff. */
  triggerRadius: 11,
  /** Assumed average speed (units/sec) used to budget order time. */
  pacing: 13,
  timeBonus: 14,
  minTime: 30,
  maxTime: 65,
  minReward: 500,
  maxReward: 2000,
  /** Delay before the next order arrives. */
  nextOrderDelay: 2.2,
  lowTimeWarning: 10,
} as const;

export const MAX_FAILURES = 3;

export const COUNTDOWN_SECONDS = 3;

export const STORAGE_KEY = "lagos-delivery:best";
export const MUTE_KEY = "lagos-delivery:muted";

/** Warm Lagos palette. */
export const PALETTE = {
  sky: "#8fd3f0",
  ground: "#c9b78c",
  grass: "#7fb961",
  asphalt: "#4a4d55",
  asphaltDark: "#3e4149",
  laneMark: "#f2e9c9",
  sidewalk: "#cfc6b4",
  kerb: "#b6ab96",
  danfo: "#f7c520",
  buildings: [
    "#e8724c",
    "#f2a93b",
    "#5fbfa5",
    "#4f9dd4",
    "#e4557c",
    "#8d6fc4",
    "#f0d35f",
    "#d9643f",
    "#5bb6c9",
    "#eb8f5c",
  ],
  roofs: ["#8c4a36", "#9b6b2f", "#3d7f6c", "#36688f", "#9b3a56", "#5c4a85"],
  cars: ["#e5533d", "#3f7fd0", "#f0f2f3", "#3aa066", "#8e52c0", "#2f3844", "#e39b2f"],
  tree: "#4f9b45",
  treeDark: "#3b7a36",
  trunk: "#6b4a2f",
  stall: ["#e45a4f", "#36a07a", "#3f88c5", "#e8b23c"],
} as const;
