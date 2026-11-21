// Doors, doorways, rooms and the way back; the floating island; culling.
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
const press = async (c, w = 300) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
await press("Enter", 300);
const mode = () => page.evaluate(() => window.origins.data.packages.game.properties.meta.data.mode);
const until = async (m, ms = 20000) => { for (let t = 0; t < ms; t += 250) { if ((await mode()) === m) return true; await page.waitForTimeout(250); } return false; };
await until("play");
const st = () => page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: g.mode, area: g.area, pos: p.position.map(v => +v.toFixed(1)), interact: g.interact, vis: [g.visA, g.visB, g.visF].join("") }; });
const put = (x, y, z, yaw) => page.evaluate(([x, y, z, yaw]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y, z]; p.vel = [0,0,0]; p.vy = 0; p.flying = 0; p.yaw = yaw; p.pitch = 0; p.tele = 5; }, [x, y, z, yaw]);
console.log("start", JSON.stringify(await st()));
// culling: where each island is on
for (const [name, pos] of [["island A camp", [-37, 110, 848]], ["town", [20500, 20, 40]], ["floating", [10260, 140, 25]], ["open sea between", [5200, 30, 0]]]) {
	await put(pos[0], pos[1], pos[2], 0); await page.waitForTimeout(2500);
	const s = await st(); console.log("at", name.padEnd(18), "visible A/B/F:", s.vis);
}
// doors
const doors = await page.evaluate(() => Object.entries(window.origins.data.packages.things.packages).map(([id, e]) => [id, e.properties.meta.data]).filter(([id, d]) => d.kind === "door" || d.kind === "portal").map(([id, d]) => ({ id, kind: d.kind, room: d.room, exit: d.exit, isle: d.isle })));
console.log("doors", doors.length, "closed", doors.filter(d => d.kind === "door").length, "open", doors.filter(d => d.kind === "portal").length);
const closed = doors.find(d => d.kind === "door" && d.isle === "B"), open = doors.find(d => d.kind === "portal" && d.isle === "B");
const goTo = async d => { await put(d.exit.pos[0], d.exit.pos[1] + 1, d.exit.pos[2], d.exit.yaw - Math.PI); await page.waitForTimeout(3500); };
// a closed door: R
await goTo(closed);
console.log("at closed door", closed.room, JSON.stringify(await st()));
await page.screenshot({ path: path.join(out, "town-door.png") });
await press("KeyR", 400); console.log("pressed R ->", (await st()).mode);
await until("play", 15000); await page.waitForTimeout(2500);
console.log("inside", JSON.stringify(await st()));
await page.screenshot({ path: path.join(out, "room-" + closed.room + ".png") });
// walk to the doorway and out
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.yaw = Math.PI; });
await page.keyboard.down("KeyW"); await page.waitForTimeout(2500); await page.keyboard.up("KeyW");
await page.waitForTimeout(300); console.log("walked toward the doorway", JSON.stringify(await st()));
await until("play", 15000); await page.waitForTimeout(2500);
console.log("back outside", JSON.stringify(await st()));
await page.screenshot({ path: path.join(out, "town-after.png") });
// an open doorway: walk into it
await goTo(open);
await page.keyboard.down("KeyW"); await page.waitForTimeout(2500); await page.keyboard.up("KeyW");
await page.waitForTimeout(500);
console.log("walked into the open doorway ->", (await st()).mode, (await st()).area);
await until("play", 15000); await page.waitForTimeout(2000);
console.log("inside", JSON.stringify(await st()));
await page.screenshot({ path: path.join(out, "room-" + open.room + ".png") });
console.log("errors", errors);
await browser.close(); server.close();
