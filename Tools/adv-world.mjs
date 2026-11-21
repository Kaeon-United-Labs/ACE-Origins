// Open sea is solid; monsters stay above hillsides and fade as they fall.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 }); await page.waitForTimeout(800);
const player = () => page.evaluate(() => { const d = window.origins.data.packages.player.properties.meta.data; return [Math.round(d.position[0]), +d.position[1].toFixed(1), Math.round(d.position[2]), d.flying, d.onGround]; });
// 1. far out to sea, flying low and falling
for (const [x, z] of [[5000, 0], [-4700, 3000], [0, -5200]]) {
	await page.evaluate(([x, z]) => { const d = window.origins.data.packages.player.properties.meta.data; d.position = [x, 40, z]; d.vel = [0, 0, 0]; d.vy = 0; d.flying = 0; d.tele = 5; }, [x, z]);
	await page.waitForTimeout(3500);
	console.log("sea at", x, z, "-> after falling:", await player());
	await page.evaluate(() => { const d = window.origins.data.packages.player.properties.meta.data; d.flying = 1; d.pitch = -1.4; d.vel = [0, -40, 0]; });
	await page.waitForTimeout(3000);
	console.log("   flying down into it:", await player());
}
// 2. monsters beside a mountain: lowest height above the ground under them
await page.evaluate(() => { const d = window.origins.data.packages; const p = d.player.properties.meta.data; const l = d.game.properties.meta.data.lairs[0]; p.position = [l[0] + 200, l[1] + 120, l[2] + 200]; p.vel = [0, 0, 0]; p.flying = 1; p.tele = 5; });
let lowest = 1e9, worst = "";
for (let i = 0; i < 40; i++) {
	await page.waitForTimeout(500);
	const r = await page.evaluate(() => { const c = window.origins; let low = 1e9, who = ""; for (const [id, e] of Object.entries(c.data.packages.enemies.packages)) { const m = e.properties.meta.data; if (!m.alive || m.state === "dying") continue; const rc = c.resolved.components.find(x => x.type === "query" && x.key.includes(id) && x.key.includes("probe") && x.key.includes("enemies")); const st = rc && c.state[ace.identity(rc)]; const h = st && st.hits && st.hits[0]; if (h) { const alt = m.position[1] - h.point[1]; if (alt < low) { low = alt; who = id; } } } return [low, who]; });
	if (r[0] < lowest) { lowest = r[0]; worst = r[1]; }
}
console.log("lowest a live monster got above the ground in 20 s:", lowest.toFixed(1), "m (" + worst + ")");
// 3. a fall that fades
await page.evaluate(() => { const d = window.origins.data.packages; const p = d.player.properties.meta.data; p.position = [-37, 106, 855]; p.flying = 0; p.yaw = 0; p.pitch = 0.33; p.tele = 5; const e = d.enemies.packages.b3.properties.meta.data; e.position = [-37, 117.6, 815]; e.anchor = e.position.slice(); e.aggro = 0; e.speed = 0; e.vcruise = 0; });
await page.waitForTimeout(1500);
await page.mouse.down({ button: "left" });
const seen = [];
for (let i = 0; i < 60; i++) {
	await page.waitForTimeout(100);
	await page.evaluate(() => { const d = window.origins.data.packages; const p = d.player.properties.meta.data, e = d.enemies.packages.b3.properties.meta.data; if (e.state === "dying") return; const v = [e.position[0] - p.position[0], e.position[1] + 3.4 - (p.position[1] + p.eye), e.position[2] - p.position[2]]; p.yaw = Math.atan2(-v[0], -v[2]); p.pitch = Math.atan2(v[1], Math.hypot(v[0], v[2])); });
	const v = await page.evaluate(() => { const sc = window.origins.meta.scene; const root = sc.getTransformNodeByName("enemies.b3.model"); const ms = root ? root.getChildMeshes() : []; const m = ms.find(x => x.getTotalVertices() > 0); const e = window.origins.data.packages.enemies.packages.b3.properties.meta.data; return [e.state, m ? +m.visibility.toFixed(2) : null, Math.round(e.position[1])]; });
	if (v[0] === "dying" && v[1] !== 1) seen.push(v[1] + "@" + v[2]);
}
await page.mouse.up({ button: "left" });
console.log("visibility while dying (and height):", seen.join(" "));
console.log("errors", errors);
await browser.close(); server.close();
