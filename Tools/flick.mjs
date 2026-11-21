// Flicker meter: the same view from positions a few centimetres apart; how much of the picture changes strongly? A steady scene changes only along true edges.
//   node flick.mjs <name> <x> <y> <z> <yaw> <pitch> <fly 0|1> [shift metres] [area]
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const [name, x, y, z, yaw, pitch, fly = "1", shift = "0.03"] = process.argv.slice(2);
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html${process.env.QUERY || ""}`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
if (process.env.ROOM) {   // go in through the first door to that room
	const d = await page.evaluate(r => Object.values(window.origins.data.packages.things.packages).map(e => e.properties.meta.data).find(t => t.kind === "door" && t.room === r), process.env.ROOM);
	await page.evaluate(d => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [d.exit.pos[0], d.exit.pos[1] + 1, d.exit.pos[2]]; p.tele = 5; p.flying = 0; p.yaw = d.exit.yaw - Math.PI; }, d);
	await page.waitForTimeout(3500);
	await page.keyboard.down("KeyR"); await page.waitForTimeout(110); await page.keyboard.up("KeyR");
	await page.waitForFunction(() => { const g = window.origins.data.packages.game.properties.meta.data; return g.mode === "play" && g.area !== "overworld"; }, null, { timeout: 40000 });
	await page.waitForTimeout(2000);
}
const put = (dx) => page.evaluate(([x, y, z, yaw, pitch, fly, dx]) => { const p = window.origins.data.packages.player.properties.meta.data; if (x !== "") { p.position = [+x + dx, +y, +z]; p.flying = +fly; p.tele = 5; } else { p.position = [p.position[0] + dx, p.position[1], p.position[2]]; } p.vel = [0,0,0]; p.vy = 0; p.yaw = +yaw; p.pitch = +pitch; }, [x === "-" ? "" : x, y, z, yaw, pitch, fly, dx]);
const base = await page.evaluate(() => window.origins.data.packages.player.properties.meta.data.position.slice());
const shots = [];
for (let k = 0; k < 3; k++) {
	await put(k === 0 ? 0 : (k === 1 ? +shift : 0));
	await page.waitForTimeout(1800);
	const f = path.join(here, "..", "..", "Scratch", "thumbs", `flick-${name}-${k}.png`);
	await page.screenshot({ path: f });
	const crop = (process.env.CROP || '0,0,1280,720').split(',').map(Number);
	shots.push(await sharp(f).extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
}
await browser.close(); server.close();
const diff = (a, b) => { let n = 0, m = 0; for (let o = 0; o < a.data.length; o += 3) { m++; if (Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]) > 120) n++; } return n / m * 100; };
console.log(name, "strongly changed pixels:", diff(shots[0], shots[1]).toFixed(3) + "%", diff(shots[1], shots[2]).toFixed(3) + "%");
