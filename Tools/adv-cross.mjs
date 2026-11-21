// Frame times while crossing the surface, down and up.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForTimeout(1500);
await page.evaluate(() => {
	const d = window.origins.data.packages.player.properties.meta.data;
	d.position = [-3300, 40, -1124]; d.vel = [0, 0, 0]; d.flying = 1; d.yaw = 0; d.pitch = -0.9; d.tele = 5;
	window.__f = []; let last = performance.now();
	const tick = () => { const n = performance.now(); window.__f.push([n - last, d.position[1] + d.eye]); last = n; requestAnimationFrame(tick); };
	requestAnimationFrame(tick);
});
await page.waitForTimeout(2500);
await page.keyboard.down("KeyW"); await page.waitForTimeout(2500); await page.keyboard.up("KeyW");
await page.evaluate(() => { const d = window.origins.data.packages.player.properties.meta.data; d.pitch = 0.9; });
await page.keyboard.down("KeyW"); await page.waitForTimeout(3000); await page.keyboard.up("KeyW");
const r = await page.evaluate(() => { const f = window.__f; const sorted = f.map(x => x[0]).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)]; let down = f.filter(x => Math.abs(x[1] + 0.35) < 12); return { frames: f.length, median: +med.toFixed(1), worst: +sorted[sorted.length - 1].toFixed(1), p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(1), nearSurfaceWorst: +Math.max(...down.map(x => x[0])).toFixed(1), nearSurface: down.length }; });
console.log(JSON.stringify(r));
console.log("errors", errors);
await browser.close(); server.close();
