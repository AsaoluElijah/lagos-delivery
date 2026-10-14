import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", m => console.log(`[${m.type()}]`, m.text()));
page.on("pageerror", e => console.log("[pageerror]", e.message, "\n", e.stack?.split("\n").slice(0,8).join("\n")));
await page.goto(process.env.URL ?? "http://localhost:5174/", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
console.log("ROOT HTML:", (await page.evaluate(() => document.getElementById("root").innerHTML)).slice(0, 600));
await browser.close();
