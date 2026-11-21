// Boot: the cover holds until the world is made; the title has its own music and nothing else; loading screens bracket entering play and travel.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
const cover = () => page.evaluate(() => { const o = document.getElementById("loading"); return o ? +getComputedStyle(o).opacity : 0; });
const audio = () => page.evaluate(() => { const c = window.origins; const a = c.data.packages.audio.packages; const st = n => { const r = c.resolved.components.find(x => x.type === "audio" && x.key.includes('"' + n + '"')); const s = r && c.state[ace.identity(r)]; return s ? (s.playing ? "on@" + (a[n].utilities.clip.properties.data.volume).toFixed(2) : "off") : "?"; }; return ["menu", "musicA", "wind", "battle"].map(n => n + "=" + st(n)).join(" "); });
const mode = () => page.evaluate(() => window.origins.data.packages.game.properties.meta.data.mode);
let shot = false;
for (let t = 0; t < 40; t++) {
	const o = await cover(), m = await mode();
	if (t % 4 === 0 || o < 1) console.log("t=" + (t * 0.5).toFixed(1) + "s cover opacity " + o.toFixed(2) + " mode " + m);
	if (!shot && t === 2) { await page.screenshot({ path: path.join(out, "load-cover.png") }); shot = true; }
	if (o < 0.5) break;
	await page.waitForTimeout(500);
}
await page.waitForTimeout(2500);
await page.keyboard.down("ArrowDown"); await page.waitForTimeout(80); await page.keyboard.up("ArrowDown"); await page.keyboard.down("ArrowUp"); await page.waitForTimeout(80); await page.keyboard.up("ArrowUp");
await page.waitForTimeout(3000);
console.log("title:", await audio());
await page.screenshot({ path: path.join(out, "load-title.png") });
await page.keyboard.down("Enter"); await page.waitForTimeout(100); await page.keyboard.up("Enter");
await page.waitForTimeout(600);
console.log("pressed Enter ->", await mode()); await page.screenshot({ path: path.join(out, "load-screen.png") });
for (let i = 0; i < 12; i++) { await page.waitForTimeout(500); const m = await mode(); if (m === "play") { console.log("play began after", ((i + 1) * 0.5 + 0.6).toFixed(1), "s"); break; } }
await page.waitForTimeout(3500);
console.log("playing:", await mode(), await audio());
// fast travel
await page.evaluate(() => { const r = window.origins.data.packages.rpg.properties.meta.data; r.found.fort = 1; });
await page.keyboard.down("KeyM"); await page.waitForTimeout(80); await page.keyboard.up("KeyM"); await page.waitForTimeout(700);
console.log("map open:", await mode(), await audio());
await page.keyboard.down("ArrowDown"); await page.waitForTimeout(80); await page.keyboard.up("ArrowDown"); await page.waitForTimeout(300);
await page.keyboard.down("Enter"); await page.waitForTimeout(80); await page.keyboard.up("Enter"); await page.waitForTimeout(500);
console.log("travel ->", await mode()); 
for (let i = 0; i < 14; i++) { await page.waitForTimeout(500); if ((await mode()) === "play") { console.log("travel done after", ((i + 1) * 0.5 + 0.5).toFixed(1), "s"); break; } }
console.log("errors", errors);
await browser.close(); server.close();
