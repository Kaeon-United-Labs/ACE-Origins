// A town building is solid like the fort: its walls stop you, its roof holds you.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
const d = await page.evaluate(() => Object.values(window.origins.data.packages.things.packages).map(e => e.properties.meta.data).filter(x => x.kind === "door" && x.isle === "B")[3]);
const yaw = d.rotation[1], out = [Math.sin(yaw), Math.cos(yaw)], side = [Math.cos(yaw), -Math.sin(yaw)];
const dist = () => page.evaluate(([d, out]) => { const p = window.origins.data.packages.player.properties.meta.data.position; return +((p[0] - d.position[0]) * out[0] + (p[2] - d.position[2]) * out[1]).toFixed(2); }, [d, out]);
// 5 m to the side of the door, 5 m out, facing the wall
const px = d.position[0] + out[0] * 5 + side[0] * 5, pz = d.position[2] + out[1] * 5 + side[1] * 5;
await page.evaluate(([x, y, z, yaw]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y, z]; p.vel = [0,0,0]; p.flying = 0; p.yaw = yaw; p.pitch = 0; p.tele = 5; }, [px, d.position[1] + 1, pz, yaw]);
await page.waitForTimeout(3500);
console.log("distance out from the facade before:", await dist());
await page.keyboard.down("KeyW"); await page.keyboard.down("ShiftLeft"); await page.waitForTimeout(3500); await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW");
console.log("after running at the wall for 3.5 s:", await dist(), "(positive: still outside)");
// the roof: a downward ray grid over the building (scene picks the building's meshes)
const roof = await page.evaluate(([x, z]) => {
	const sc = window.origins.meta.scene; let best = null;
	for (let dx = -8; dx <= 8; dx += 2) for (let dz = -8; dz <= 8; dz += 2) {
		const h = sc.pickWithRay(new BABYLON.Ray(new BABYLON.Vector3(x + dx, 300, z + dz), new BABYLON.Vector3(0, -1, 0), 600), m => m.metadata && /isleB/.test(m.metadata.aceEntity || "") && /"b\d+"/.test(m.metadata.aceEntity));
		if (h && h.hit && (!best || h.pickedPoint.y > best[1])) best = [x + dx, h.pickedPoint.y, z + dz];
	}
	return best;
}, [d.position[0] - out[0] * 8, d.position[2] - out[1] * 8]);
console.log("a roof at", roof && roof.map(v => +v.toFixed(1)));
await page.evaluate(([x, y, z]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y + 20, z]; p.vel = [0,0,0]; p.vy = 0; p.flying = 0; p.tele = 5; }, roof);
await page.waitForTimeout(4000);
console.log("dropped onto it ->", await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; return p.position.map(v => +v.toFixed(1)).join(",") + " grounded " + p.grounded; }));
console.log("errors", errors);
await browser.close(); server.close();
