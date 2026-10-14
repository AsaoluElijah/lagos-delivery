import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:5174/";
const OUT = "/private/tmp/claude-501/-Users-elijah-Desktop-TMP/a58aa3b4-e99f-426f-904e-cc216c63a5b4/scratchpad";

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(4500);

const st = () =>
  page.evaluate(() => {
    const s = window.lagosStore.getState();
    return {
      status: s.status,
      stage: s.stage,
      earnings: s.earnings,
      completed: s.completed,
      failed: s.failed,
      best: s.best,
      timeLeft: Math.round(s.timeLeft * 10) / 10,
      distance: s.distance,
      order: s.order && { type: s.order.type, pickup: s.order.pickupLabel, drop: s.order.dropLabel, reward: s.order.reward, limit: s.order.timeLimit },
      notices: s.notices.map((n) => n.kind),
    };
  });

console.log("MENU:", JSON.stringify(await st()));
await page.screenshot({ path: `${OUT}/01-menu.png` });

await page.getByRole("button", { name: "Play Game" }).click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/02-countdown.png` });
await page.waitForFunction(() => window.lagosStore.getState().status === "playing", { timeout: 20000 });
await page.waitForTimeout(1600);
console.log("PLAYING:", JSON.stringify(await st()));
await page.screenshot({ path: `${OUT}/03-playing.png` });

console.log("perf:", await page.evaluate(() => ({ fps: Math.round(window.lagosDebug.fps()), activeMeshes: window.lagosDebug.drawCalls() })));

/* ---------------- grid autopilot: drive along streets to the target ------- */
const V = [-60, 0, 60];
const H = [-72, -24, 24, 72];
const nearest = (v, arr) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

let held = null;
const press = async (k) => {
  if (held === k) return;
  if (held) await page.keyboard.up(held);
  held = k;
  if (k) await page.keyboard.down(k);
};

async function autopilot(maxMs, stopWhen) {
  const start = Date.now();
  await page.keyboard.down("KeyW");
  let phase = "align"; // align onto a street axis, then run to the target
  while (Date.now() - start < maxMs) {
    if (await stopWhen()) break;
    const r = await page.evaluate(() => window.lagosDebug.rider());
    const t = await page.evaluate(() => window.lagosDebug.target());
    if (!r || !t) break;

    // Pick a waypoint: travel along the current street to the cross street
    // nearest the target, then turn.
    const onV = Math.abs(r.x - nearest(r.x, V)) < 9;
    const onH = Math.abs(r.z - nearest(r.z, H)) < 9;
    let want;
    const tgtV = nearest(t.x, V);
    const tgtH = nearest(t.z, H);

    if (onV && Math.abs(r.x - tgtV) < 9) {
      want = t.z > r.z ? 0 : Math.PI; // correct avenue: run to the target
    } else if (onH && Math.abs(r.z - tgtH) < 9) {
      want = t.x > r.x ? Math.PI / 2 : -Math.PI / 2;
    } else if (onV) {
      want = tgtH > r.z ? 0 : Math.PI;
    } else if (onH) {
      want = tgtV > r.x ? Math.PI / 2 : -Math.PI / 2;
    } else {
      want = Math.atan2(t.x - r.x, t.z - r.z);
    }
    void phase;

    const diff = ((want - r.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (diff > 0.1) await press("KeyD");
    else if (diff < -0.1) await press("KeyA");
    else await press(null);
    await page.waitForTimeout(80);
  }
  await press(null);
  await page.keyboard.up("KeyW");
}

// Leg 1: pickup
const before = await st();
await autopilot(70000, async () => (await st()).stage === "delivery");
let now = await st();
console.log("AFTER LEG 1 (expect stage=delivery):", JSON.stringify(now));
await page.screenshot({ path: `${OUT}/04-picked-up.png` });

// Leg 2: drop off
await autopilot(70000, async () => (await st()).completed > before.completed);
now = await st();
console.log("AFTER LEG 2 (expect completed=1, earnings>0):", JSON.stringify(now));
await page.screenshot({ path: `${OUT}/05-delivered.png` });

/* ---------------- pause / resume ---------------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
const paused = await st();
await page.screenshot({ path: `${OUT}/06-paused.png` });
await page.waitForTimeout(1500);
const stillPaused = await st();
console.log(
  "PAUSE: status=%s timerFrozen=%s",
  paused.status,
  Math.abs(paused.timeLeft - stillPaused.timeLeft) < 0.25,
);
await page.getByRole("button", { name: "Resume" }).click();
await page.waitForTimeout(500);
console.log("RESUMED:", (await st()).status);

/* ---------------- building collision check ---------------- */
// Drive hard into a building face and confirm we are pushed back onto the road.
await page.evaluate(() => window.lagosDebug.teleport(0, 0));
await page.waitForTimeout(400);
await page.keyboard.down("KeyW");
await page.keyboard.down("KeyD");
await page.waitForTimeout(2600);
await page.keyboard.up("KeyD");
await page.waitForTimeout(2200);
await page.keyboard.up("KeyW");
const after = await page.evaluate(() => window.lagosDebug.rider());
console.log("COLLISION TEST rider:", JSON.stringify(after));
await page.screenshot({ path: `${OUT}/07-wall.png` });

/* ---------------- fail three orders -> game over ---------------- */
await page.evaluate(() => {
  const s = window.lagosStore.getState();
  s.failOrder();
  s.failOrder();
  s.failOrder();
});
await page.waitForTimeout(900);
console.log("GAME OVER:", JSON.stringify(await st()));
await page.screenshot({ path: `${OUT}/08-gameover.png` });

/* ---------------- restart ---------------- */
await page.getByRole("button", { name: "Play Again" }).click();
await page.waitForFunction(() => window.lagosStore.getState().status === "playing", { timeout: 20000 });
await page.waitForTimeout(1800);
console.log("RESTARTED:", JSON.stringify(await st()));
await page.screenshot({ path: `${OUT}/09-restarted.png` });

/* ---------------- mobile viewport ---------------- */
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mob.goto(URL, { waitUntil: "networkidle" });
await mob.waitForTimeout(4000);
await mob.screenshot({ path: `${OUT}/10-mobile-menu.png` });
await mob.getByRole("button", { name: "Play Game" }).click();
await mob.waitForFunction(() => window.lagosStore.getState().status === "playing", { timeout: 20000 });
await mob.waitForTimeout(2500);
await mob.screenshot({ path: `${OUT}/11-mobile-playing.png` });
console.log("MOBILE touch controls visible:", await mob.locator(".touch__steer").isVisible());

await browser.close();
console.log("\n=== CONSOLE ERRORS/WARNINGS ===");
console.log(errors.length ? [...new Set(errors)].slice(0, 25).join("\n") : "(none)");
