import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-elijah-Desktop-TMP/a58aa3b4-e99f-426f-904e-cc216c63a5b4/scratchpad";
const headed = process.env.HEADED === "1";
const browser = await chromium.launch({ channel: "chrome", headless: !headed,
  args: headed ? [] : ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/s-menu.png` });
await page.getByRole("button", { name: "Play Game" }).click();
await page.waitForFunction(() => window.lagosStore.getState().status === "playing", { timeout: 20000 });
await page.waitForTimeout(2500);
// drive forward a bit so we see motion + the marker
await page.keyboard.down("KeyW"); await page.waitForTimeout(2200); await page.keyboard.up("KeyW");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/s-play.png` });
// park near a location pad for a close look
await page.evaluate(() => window.lagosDebug.teleport(-40, -33.5));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/s-loc.png` });
console.log("fps:", await page.evaluate(async () => { await new Promise(r=>setTimeout(r,1500)); return Math.round(window.lagosDebug.fps()); }),
            "activeMeshes:", await page.evaluate(() => window.lagosDebug.drawCalls()));
await browser.close();
