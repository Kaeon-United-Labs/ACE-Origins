// Fly toward the town and watch a strip of road in the middle of the screen for grass showing through it.
import { serve, launch } from "./shot.mjs";
import sharp from "sharp";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
const y0 = +(process.env.Y || 22);
await page.evaluate(([y0, z0]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [20480, y0, z0]; p.vel = [0,0,0]; p.flying = 1; p.yaw = Math.PI; p.pitch = -0.02; p.tele = 5; }, [y0, +(process.env.Z0 || -2600)]);
await page.waitForTimeout(3000);
await page.keyboard.down("KeyW");
const rows = [];
for (let i = 0; i < 40; i++) {
	await page.waitForTimeout(120);
	const buf = await page.screenshot({ clip: { x: 560, y: 380, width: 160, height: 300 } });
	const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	let grass = 0, road = 0;
	for (let o = 0; o < data.length; o += 3) { const r = data[o], g = data[o + 1], b = data[o + 2]; if (g > r + 18 && g > b + 25) grass++; else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r < 140) road++; }
	const z = await page.evaluate(() => window.origins.data.packages.player.properties.meta.data.position[2]);
	rows.push(`${Math.round(z)}:${(grass / (data.length / 3) * 100).toFixed(0)}%`);
	if (i === 5 || i === 14) await page.screenshot({ path: `../../Scratch/thumbs/approach-${i}.png` });
}
await page.keyboard.up("KeyW");
console.log("z : % of the central strip that is grass\n" + rows.join("  "));
await browser.close(); server.close();
