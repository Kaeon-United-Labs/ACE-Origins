// While walking, how far does the health bar's edge wander on screen? (It is fixed to the view, so it should not move at all.)
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
for (const [name, x, y, z] of [["origin", 20, 14, 20], ["town", 20480, 16, -30], ["perch", 10240, 134, 40]]) {
	await page.evaluate(([x, y, z]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y, z]; p.vel = [0, 0, 0]; p.flying = 0; p.yaw = 0.3; p.pitch = 0; p.tele = 5; }, [x, y, z]);
	await page.waitForTimeout(3000);
	await page.keyboard.down("KeyD");
	const rel = await page.evaluate(async () => {
		const sc = window.origins.meta.scene, m = sc.meshes.find(m => /^hud\./.test(m.name) && m.isEnabled() && m.getTotalVertices() > 0);
		const out = [];
		for (let i = 0; i < 40; i++) { await new Promise(r => requestAnimationFrame(r)); const c = sc.activeCamera, cp = c.globalPosition, mp = m.getAbsolutePosition(); const inv = c.getViewMatrix(); const v = BABYLON.Vector3.TransformCoordinates(mp, inv); out.push([v.x, v.y, v.z, cp.x]); }
		return { name: m.name, out };
	});
	await page.keyboard.up("KeyD");
	const xs = rel.out.map(o => o[0]), zs = rel.out.map(o => o[2]);
	console.log(name, rel.name, "view-space x range (mm):", ((Math.max(...xs) - Math.min(...xs)) * 1000).toFixed(2), "z range (mm):", ((Math.max(...zs) - Math.min(...zs)) * 1000).toFixed(2), "camera x moved", (rel.out.at(-1)[3] - rel.out[0][3]).toFixed(2));
	continue;
	const edges = [];
	console.log(name, "bar edge x over 24 frames: min", Math.min(...edges), "max", Math.max(...edges), "distinct", new Set(edges).size);
}
await browser.close(); server.close();
