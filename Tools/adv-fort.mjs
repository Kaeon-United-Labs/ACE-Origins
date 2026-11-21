// Walls stop you, tops and floors hold you, gaps let you through, and the fort sits on the land.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(12000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 }); await page.waitForTimeout(800);
const info = await page.evaluate(() => {
	const sc = window.origins.meta.scene; const out = [];
	for (const m of sc.meshes) if ((m.metadata && /fort/.test(m.metadata.aceEntity || "")) && m.getTotalVertices() > 0) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; out.push([m.name, b.minimumWorld.asArray().map(Math.round), b.maximumWorld.asArray().map(Math.round), m.isPickable]); }
	return out;
});
console.log("fort meshes", JSON.stringify(info).slice(0, 700));
// a ray down through the tower and through open floor: what is hit
const fort = await page.evaluate(() => { const l = window.origins.data.packages.landmarks.packages.fort.properties.meta.data; return l.position; });
console.log("fort at", fort);
// find the highest and a typical point by casting a grid of rays from above
const grid = await page.evaluate(([fx, fz]) => {
	const sc = window.origins.meta.scene; const pts = [];
	for (let dx = -60; dx <= 60; dx += 6) for (let dz = -60; dz <= 60; dz += 6) {
		const ray = new BABYLON.Ray(new BABYLON.Vector3(fx + dx, 600, fz + dz), new BABYLON.Vector3(0, -1, 0), 1200);
		const h = sc.pickWithRay(ray, m => (m.metadata && /fort/.test(m.metadata.aceEntity || "")));
		if (h && h.hit) pts.push([fx + dx, h.pickedPoint.y, fz + dz]);
	}
	return pts;
}, [fort[0], fort[2]]);
grid.sort((a, b) => b[1] - a[1]);
console.log("fort surface samples", grid.length, "top", grid[0] && grid[0].map(Math.round), "lowest", grid[grid.length - 1] && grid[grid.length - 1].map(Math.round));
const top = grid[0];
// 1. drop onto the highest point
await page.evaluate(([x, y, z]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y + 15, z]; p.flying = 0; p.vel = [0,0,0]; p.vy = 0; p.tele = 5; }, top);
await page.waitForTimeout(3500);
console.log("dropped above the top ->", await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; return p.position.map(v => +v.toFixed(1)).join(",") + " grounded " + p.grounded; }), " (top y", top[1].toFixed(1) + ")");
// 2. walk into a wall: from open ground toward the nearest high point, and see whether we are stopped by it
const lowest = grid[grid.length - 1];
const wall = grid.find(g => g[1] > lowest[1] + 3);
await page.evaluate(([x, z, wx, wz]) => { const p = window.origins.data.packages.player.properties.meta.data; const dx = wx - x, dz = wz - z, l = Math.hypot(dx, dz); p.position = [x - dx / l * 30, 400, z - dz / l * 30]; p.flying = 0; p.vel = [0,0,0]; p.vy = 0; p.tele = 5; p.yaw = Math.atan2(-dx, -dz); p.pitch = 0; window.__target = [wx, wz]; }, [lowest[0], lowest[2], wall[0], wall[2]]);
await page.waitForTimeout(4000);
await page.keyboard.down("KeyW"); await page.waitForTimeout(6000); await page.keyboard.up("KeyW");
console.log("walked at a wall; ended", await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; return p.position.map(v => +v.toFixed(1)).join(","); }), " heading to", wall.map(Math.round));
await page.screenshot({ path: "../../Scratch/thumbs/fort-walk.png" });
console.log("errors", errors);
await browser.close(); server.close();
