import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.mouse.click(640, 360); await page.keyboard.press("Enter");
await page.waitForTimeout(8000);
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start");
await page.waitForTimeout(6000);
const { profile } = await cdp.send("Profiler.stop");
const nodes = new Map(profile.nodes.map(n => [n.id, n])); const self = new Map();
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + dt[i]));
const agg = {}; for (const [id, t] of self) { const n = nodes.get(id), f = n.callFrame, k = (f.functionName || "(anon)") + " " + f.url.split("/").pop() + ":" + f.lineNumber; agg[k] = (agg[k] || 0) + t; }
const total = Object.values(agg).reduce((a, b) => a + b, 0);
console.log("total ms", Math.round(total / 1000));
Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, t]) => console.log((t / 1000).toFixed(0).padStart(6), "ms", (100 * t / total).toFixed(1).padStart(5) + "%", k));
await browser.close(); server.close();
