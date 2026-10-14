import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.goto("http://localhost:5174/", { waitUntil: "domcontentloaded" });
const out = await page.evaluate(async () => {
  const map = await import("/src/game/data/map.ts");
  const mx = await import("/src/game/mathx.ts");
  const loc = await import("/src/game/data/locations.ts");
  const reserved = loc.LOCATIONS.map(l => l.facadeRect);
  const taken = reserved.map(r => mx.expandRect(r, 1.6));
  const rng = mx.makeRng(0x1a60513);
  const log = [];
  for (const block of map.BLOCKS) {
    if (block.flavour === "park") continue;
    const b = block.buildable;
    const spanX = b.maxX - b.minX, spanZ = b.maxZ - b.minZ;
    let placed = 0, rejSize = 0, rejOverlap = 0;
    const samples = [];
    for (let a = 0; a < 26 && placed < 4; a++) {
      const w = 11 + rng() * 13, d = 10 + rng() * 11;
      if (w > spanX || d > spanZ) { rejSize++; continue; }
      const cx = b.minX + w/2 + rng() * (spanX - w);
      const cz = b.minZ + d/2 + rng() * (spanZ - d);
      const rect = mx.rectFromCenter(cx, cz, w, d);
      const padded = mx.expandRect(rect, 2.2);
      const hit = taken.find(t => mx.rectsOverlap(padded, t));
      if (hit) { rejOverlap++; if (samples.length<2) samples.push({rect, hit}); continue; }
      taken.push(padded); placed++;
    }
    log.push({ id: block.id, spanX, spanZ, placed, rejSize, rejOverlap, samples });
  }
  return { log, reserved };
});
console.log(JSON.stringify(out.log, null, 1).slice(0, 3000));
console.log("RESERVED:", JSON.stringify(out.reserved));
await browser.close();
