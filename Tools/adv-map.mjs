// The map of both islands, fast travel to each, saving inside a building and loading it back.
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
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.mouse.click(640, 360);
const press = async (c, w = 350) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
await press("Enter", 300);
const g = () => page.evaluate(() => { const gm = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: gm.mode, area: gm.area, pos: p.position.map(v => Math.round(v)), found: Object.keys(window.origins.data.packages.rpg.properties.meta.data.found).join(",") }; });
const until = async (f, ms = 30000) => { for (let t = 0; t < ms; t += 250) { if (await f(await g())) return true; await page.waitForTimeout(250); } return false; };
await until(s => s.mode === "play");
await page.evaluate(() => { const r = window.origins.data.packages.rpg.properties.meta.data; r.found.town = 1; r.found.sky = 1; r.found.fort = 1; });
await press("KeyM", 600); await page.screenshot({ path: path.join(out, "map-all.png") });
console.log("map open", JSON.stringify(await g()));
// (the map window itself is tested in adv-map2.mjs)
await press('KeyM', 500);
// into the sky house, save there, leave the building, load
const d = await page.evaluate(() => window.origins.data.packages.things.packages.skydoor.properties.meta.data.exit);
await page.evaluate((d) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [d.pos[0], d.pos[1] + 1, d.pos[2]]; p.tele = 5; p.flying = 0; p.yaw = d.yaw - Math.PI; }, d);
await page.waitForTimeout(3500); await press("KeyR", 500);
await until(s => s.mode === "play" && s.area === "sage"); await page.waitForTimeout(1500);
console.log("inside", JSON.stringify(await g()));
await press("Escape", 600);
await page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data; g.tab = 3; g.sel = 0; });
await page.waitForTimeout(300); await press("ArrowDown", 250); await press("Enter", 600);
await press("Escape", 500); await page.waitForTimeout(500);
// walk out of the building, then load slot 1
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.yaw = Math.PI; });
await page.keyboard.down("KeyW"); await page.waitForTimeout(3000); await page.keyboard.up("KeyW");
await until(s => s.mode === "play" && s.area === "overworld"); await page.waitForTimeout(1500);
console.log("walked out", JSON.stringify(await g()));
await press("Escape", 600);
await page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data; g.tab = 3; g.sel = 0; });
await page.waitForTimeout(300);
const rows = await page.evaluate(() => 1);
for (let i = 0; i < 4; i++) await press("ArrowDown", 200);   // Save 1,2,3 then Load slot (the first Load row is the highest-numbered saved slot)
await press("Enter", 800);
await until(s => s.mode === "play"); await page.waitForTimeout(2500);
console.log("after loading", JSON.stringify(await g()));
console.log("errors", errors);
await browser.close(); server.close();
