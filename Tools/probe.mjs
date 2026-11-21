import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [9500, 150, 0]; p.flying = 1; p.tele = 5; });
await page.waitForTimeout(5000);
console.log(await page.evaluate(() => {
	const sc = window.origins.meta.scene;
	const out = { fog: [sc.fogMode, sc.fogDensity, sc.fogStart, sc.fogEnd], meshes: [] };
	for (const m of sc.meshes) { const c = m.getBoundingInfo().boundingSphere.centerWorld; if (Math.abs(c.x - 10240) < 100 && Math.abs(c.z) < 100 && c.y > 40 && c.y < 200) { const mt = m.material; out.meshes.push({ n: m.name, en: m.isEnabled(), vis: m.visibility, alpha: mt && mt.alpha, mode: mt && mt.transparencyMode, cls: mt && mt.getClassName(), nrm: !!m.isVerticesDataPresent("normal"), tan: !!m.isVerticesDataPresent("tangent"), fog: mt && mt.fogEnabled, ab: mt && mt.needAlphaBlending && mt.needAlphaBlending(), grp: m.renderingGroupId, y: Math.round(c.y), verts: m.getTotalVertices() }); } }
	return JSON.stringify(out, null, 1);
}));
await browser.close(); server.close();
