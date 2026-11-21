// The two mouse buttons do what the inventory says: bolts, a fan of bolts, healing.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 }); await page.waitForTimeout(800);
const live = () => page.evaluate(() => { const s = window.origins.data.packages.shots.packages; return Object.values(s).filter(e => e.properties.meta.data.enabled === true).length; });
const hp = () => page.evaluate(() => Math.round(window.origins.data.packages.player.properties.meta.data.health));
await page.evaluate(() => { const r = window.origins.data.packages.rpg.properties.meta.data; r.inv.burst = 1; r.inv.mending = 1; r.bind = { l: "bolt", r: "burst" }; });
await page.waitForTimeout(400);
let peak = 0;
await page.mouse.move(640, 360);
await page.mouse.down({ button: "right" });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(40); peak = Math.max(peak, await live()); }
await page.mouse.up({ button: "right" });
console.log("right button (burst): most bolts alive at once", peak);
await page.waitForTimeout(2500);
peak = 0;
await page.mouse.down({ button: "left" });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(40); peak = Math.max(peak, await live()); }
await page.mouse.up({ button: "left" });
console.log("left button (bolt): most bolts alive at once", peak);
await page.screenshot({ path: path.join(out, "combat-bolts.png") });
await page.evaluate(() => { const d = window.origins.data.packages; d.player.properties.meta.data.health = 40; d.rpg.properties.meta.data.bind = { l: "mending", r: "burst" }; });
await page.waitForTimeout(400);
const before = await hp();
await page.mouse.down({ button: "left" }); await page.waitForTimeout(150); await page.mouse.up({ button: "left" });
await page.waitForTimeout(500);
console.log("mending: hp", before, "->", await hp());
console.log("page errors:", errors.length ? errors : "none");
await browser.close(); server.close();
