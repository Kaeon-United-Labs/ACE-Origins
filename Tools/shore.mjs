// Finds a stretch of shore, then looks at it from camera positions a few centimetres apart; steady water gives near-identical frames.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const meta = JSON.parse(fs.readFileSync(path.join(here, "world.meta.json"), "utf8"));
const { data, info } = await sharp(path.join(here, "..", "Assets", "Terrain", "height.png")).raw().toBuffer({ resolveWithObject: true });
const elev = (i, j) => { const o = (j * info.width + i) * info.channels; const t = (data[o] * 256 + data[o + 1]) / 65535; return meta.elevation[0] + t * (meta.elevation[1] - meta.elevation[0]); };
// a point on a gently sloping shore with land behind it: walk east from the middle row until the ground first rises above the sea
let spot = null;
for (let j = Math.floor(info.height * 0.62); j < info.height * 0.9 && !spot; j += 7)
	for (let i = 5; i < info.width - 40; i++)
		if (elev(i, j) < -2 && elev(i + 6, j) > 0.3 && elev(i + 40, j) > 0 && elev(i + 40, j) < 40) { spot = { x: (i / (info.width - 1) - 0.5) * meta.size, z: (0.5 - j / (info.height - 1)) * meta.size }; break; }
console.log("shore at", spot);
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForTimeout(1500);
const frames = [];
for (let k = 0; k < 4; k++) {
	await page.evaluate(([x, z, k]) => { const d = window.origins.data.packages.player.properties.meta.data; d.position = [x - 40 + k * 0.04, 9, z]; d.vel = [0, 0, 0]; d.vy = 0; d.flying = 1; d.yaw = -Math.PI / 2; d.pitch = -0.06; d.tele = 5; }, [spot.x, spot.z, k]);
	await page.waitForTimeout(2500);
	const file = path.join(out, `shore-${k}.png`);
	await page.screenshot({ path: file });
	frames.push((await sharp(file).raw().toBuffer({ resolveWithObject: true })));
}
for (let k = 1; k < 4; k++) {
	const a = frames[0].data, b = frames[k].data; let big = 0, n = 0;
	for (let o = 0; o < a.length; o += 3) { const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]); if (d > 90) big++; n++; }
	console.log(`frame 0 vs ${k} (camera ${k * 0.04} m apart): ${(big / n * 100).toFixed(3)}% of pixels differ strongly`);
}
await browser.close(); server.close();
