import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
page.on("pageerror", e => console.log("[pageerror]", e.message));
await page.goto("http://localhost:5174/", { waitUntil: "domcontentloaded" });
const out = await page.evaluate(async () => {
  const map = await import("/src/game/data/map.ts");
  const loc = await import("/src/game/data/locations.ts");
  const reserved = loc.LOCATIONS.map(l => l.facadeRect);
  const b = map.generateBuildings(reserved);
  const o = map.generateOutskirts();
  const p = map.generateProps([...b.map(x=>x.rect), ...reserved]);
  return {
    blocks: map.BLOCKS.map(bl => ({id: bl.id, flavour: bl.flavour, buildable: bl.buildable})),
    buildings: b.length,
    outskirts: o.length,
    props: p.length,
    reservedSample: reserved.slice(0,3),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
