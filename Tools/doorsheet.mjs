// A contact sheet: each kind of door, seen from seven metres in front of it.
import { serve, launch } from "./shot.mjs";
import sharp from "sharp";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
const doors = await page.evaluate(() => { const ts = window.origins.data.packages.things.packages, seen = new Set(), out = []; for (const [id, e] of Object.entries(ts)) { const d = e.properties.meta.data; if ((d.kind !== "door" && d.kind !== "portal") || d.isle !== "B") continue; out.push({ id, p: d.position, yaw: d.rotation[1], kind: d.kind }); } return out; });
const picks = doors.slice(0, +(process.env.N || 12));
const tiles = [];
for (const d of picks) {
	await page.evaluate(([d]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [d.p[0] + 7 * Math.sin(d.yaw), d.p[1] + 1.7, d.p[2] + 7 * Math.cos(d.yaw)]; p.vel = [0, 0, 0]; p.flying = 0; p.yaw = d.yaw; p.pitch = -0.08; p.tele = 5; window.origins.data.packages.hud.properties.meta.data.enabled = false; }, [d]);
	await page.waitForTimeout(1600);
	tiles.push(await sharp(await page.screenshot()).extract({ left: 340, top: 160, width: 600, height: 340 }).toBuffer());
}
const cols = 3, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: 600 * cols, height: 340 * rows, channels: 3, background: "#000" } }).composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 600, top: Math.floor(i / cols) * 340 }))).png().toFile("../../Scratch/thumbs/doorsheet.png");
console.log(picks.map(d => d.id + ":" + d.kind).join(" "));
await browser.close(); server.close();
