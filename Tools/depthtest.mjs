// How finely does this machine's depth buffer resolve two surfaces a little apart, a kilometre away?
import { serve, launch } from "./shot.mjs";
import sharp from "sharp";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html${process.env.QUERY || ""}`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
console.log(await page.evaluate(() => { const e = window.origins.meta.engine, gl = e._gl; const ext = gl.getExtension("WEBGL_debug_renderer_info"); return JSON.stringify({ renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "?", depthBits: gl.getParameter(gl.DEPTH_BITS), reverse: e.useReverseDepthBuffer, webgl2: e.webGLVersion }); }));
const dist = +(process.env.DIST || 1400);
for (const offset of [0.5, 0.2, 0.08, 0.03]) {
	await page.evaluate(([offset, dist]) => {
		const sc = window.origins.meta.scene;
		(window.__t || []).forEach(m => m.dispose()); window.__t = [];
		const mk = (name, y, r, g, b) => { const m = BABYLON.MeshBuilder.CreateGround(name, { width: 300, height: 300 }, sc); m.position.set(20480, y, -dist); const mat = new BABYLON.StandardMaterial(name, sc); mat.emissiveColor = new BABYLON.Color3(r, g, b); mat.disableLighting = true; mat.fogEnabled = false; m.material = mat; m.isPickable = false; window.__t.push(m); return m; };
		mk("lo", 60, 1, 0, 0); mk("hi", 60 + offset, 0, 1, 0);
		const p = window.origins.data.packages.player.properties.meta.data;
		p.position = [20480, 80, 0]; p.vel = [0, 0, 0]; p.flying = 1; p.yaw = 0; p.pitch = -0.012; p.tele = 5;
	}, [offset, dist]);
	await page.waitForTimeout(2500);
	await page.screenshot({ path: "../../Scratch/thumbs/depth.png" });
	const { data, info } = await sharp("../../Scratch/thumbs/depth.png").extract({ left: 340, top: 300, width: 600, height: 120 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	let red = 0, green = 0;
	for (let o = 0; o < data.length; o += 3) { if (data[o] > 200 && data[o + 1] < 60) red++; else if (data[o + 1] > 200 && data[o] < 60) green++; }
	console.log("distance", dist, "m, upper surface", offset, "m above: green", green, "red", red, red > 0 && green > 0 ? "<- the surfaces fight" : "");
}
await browser.close(); server.close();
