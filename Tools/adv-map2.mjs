// The map window: open it, hover an icon, zoom with the wheel, pan by dragging, click an icon to travel.
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
const gm = () => page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: g.mode, area: g.area, tab: g.tab, W: Math.round(g.mapW), cx: Math.round(g.mapCx), cz: Math.round(g.mapCz), pos: p.position.map(v => Math.round(v)) }; });
const until = async (f, ms = 30000) => { for (let t = 0; t < ms; t += 250) { if (f(await gm())) return true; await page.waitForTimeout(250); } return false; };
await until(s => s.mode === "play");
await page.evaluate(() => { const r = window.origins.data.packages.rpg.properties.meta.data; r.found.town = 1; r.found.sky = 1; r.found.fort = 1; r.found.stones = 1; });
await press("KeyM", 900);
console.log("opened", JSON.stringify(await gm()));
await page.screenshot({ path: path.join(out, "map2-open.png") });
// zoom out to the whole region with the wheel
for (let i = 0; i < 6; i++) { await page.mouse.move(640, 330); await page.mouse.wheel(0, 120); await page.waitForTimeout(160); }
await page.waitForTimeout(500);
console.log("zoomed out", JSON.stringify(await gm()));
await page.screenshot({ path: path.join(out, "map2-wide.png") });
// find where the town's icon is on screen: ask the document where it put it
const iconAt = async k => page.evaluate((k) => { const m = window.origins.meta.scene.getMeshByName("ui.menu.mapview.icons." + k + ".mesh"); if (!m || !m.isEnabled()) return null; const sc = window.origins.meta.scene, cam = sc.activeCamera, e = window.origins.meta.engine; const p = BABYLON.Vector3.Project(m.getAbsolutePosition(), BABYLON.Matrix.Identity(), sc.getTransformMatrix(), cam.viewport.toGlobal(e.getRenderWidth(), e.getRenderHeight())); return [Math.round(p.x), Math.round(p.y)]; }, k);
const town = await iconAt("town"); console.log("town icon at", JSON.stringify(town));
if (town) { await page.mouse.move(town[0], town[1]); await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, "map2-hover.png") }); }
// drag the map
await page.mouse.move(400, 360); await page.mouse.down(); await page.waitForTimeout(100);
for (let i = 1; i <= 8; i++) { await page.mouse.move(400 + i * 30, 360 + i * 6); await page.waitForTimeout(60); }
await page.mouse.up(); await page.waitForTimeout(300);
console.log("after a drag", JSON.stringify(await gm()));
// a click on the town icon travels
const t2 = await iconAt("town");
if (t2) { await page.mouse.move(t2[0], t2[1]); await page.waitForTimeout(250); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); }
await until(s => s.mode === "play" && s.pos[0] > 15000, 20000);
console.log("after the click", JSON.stringify(await gm()));
console.log("errors", JSON.stringify(errors));
await browser.close(); server.close();
