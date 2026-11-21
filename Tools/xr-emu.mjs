// Runs the game inside a software WebXR device (Meta's IWER, a Quest 3 profile): a real immersive session with a head pose and two controllers.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import https from "node:https";
import { launch } from "./shot.mjs";
const root = path.resolve(here0(), "..", "..");
function here0() { return path.dirname(fileURLToPath(import.meta.url)); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };
// Babylon only offers a headset on https, so the page is served over a self-signed certificate
const serve = () => new Promise(r => { const s = https.createServer({ key: fs.readFileSync(path.join(root, "Scratch/cert/k.pem")), cert: fs.readFileSync(path.join(root, "Scratch/cert/c.pem")) }, (req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "Content-Length": fs.statSync(f).size }); fs.createReadStream(f).pipe(res); }); s.listen(0, "127.0.0.1", () => r(s)); });
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const iwer = fs.readFileSync(path.join(here, "node_modules/iwer/build/iwer.min.js"), "utf8");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 300))); page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push("console: " + m.text().slice(0, 200)); });
await page.addInitScript(iwer + "\n;(()=>{ const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__dev = d; })();");
await page.goto(`https://127.0.0.1:${server.address().port}/Build/index.html${process.env.Q || ""}`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
console.log("secure", await page.evaluate(() => [isSecureContext, location.protocol])); console.log("xr support:", await page.evaluate(async () => ({ api: !!navigator.xr, vr: await navigator.xr.isSessionSupported("immersive-vr"), exp: !!window.origins.meta.xr, err: JSON.stringify(window.origins.errors || []).slice(0, 300) })));
await page.evaluate(() => { const O = window.XRWebGLLayer; window.__layerInit = []; window.XRWebGLLayer = function (session, gl, init) { window.__layerInit.push(JSON.stringify(init || null)); return new O(session, gl, init); }; window.XRWebGLLayer.getNativeFramebufferScaleFactor = O.getNativeFramebufferScaleFactor; });
const res = await page.evaluate(async () => { try { const x = window.origins.meta.xr; await x.baseExperience.enterXRAsync("immersive-vr", "local-floor", x.renderTarget); return "entered " + x.baseExperience.state; } catch (e) { return "failed " + e.message; } });
console.log(res);
await page.waitForTimeout(3000);
const st = () => page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data, h = window.origins.data.packages.player.packages.head.utilities.camera.properties.state, c = window.origins.data.packages.engine.packages.controllers.utilities; return { mode: g.mode, vrErr: g.vrErr, presenting: h.presenting, rigged: h.rigged, pads: Object.keys(c), frame: window.origins.frame, err: g.mapErr }; });
console.log(JSON.stringify(await st()));
// frames per second inside the session
const fps = async (ms = 4000) => page.evaluate(async ms => { const f0 = window.origins.frame, t0 = performance.now(); await new Promise(r => setTimeout(r, ms)); return +((window.origins.frame - f0) / ((performance.now() - t0) / 1000)).toFixed(1); }, ms);
const press = async (c, w = 300) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
await press("Enter", 500);
for (let t = 0; t < 60000; t += 500) { if ((await st()).mode === "play") break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
const stats = () => page.evaluate(() => { const sc = window.origins.meta.scene, e = window.origins.meta.engine; return { drawCalls: e._drawCalls ? e._drawCalls.current : null, activeMeshes: sc.getActiveMeshes().length, activeIndices: sc.getActiveIndices ? sc.getActiveIndices() : null, w: e.getRenderWidth(), h: e.getRenderHeight(), scaling: e.getHardwareScalingLevel(), lights: sc.lights.length, shadowGens: sc.lights.filter(l => l.getShadowGenerator && l.getShadowGenerator()).length, pipelines: sc.postProcesses.length + (sc.postProcessRenderPipelineManager ? Object.keys(sc.postProcessRenderPipelineManager.supportedPipelines || {}).length : 0) }; });
const top = () => page.evaluate(() => { const sc = window.origins.meta.scene, by = {}; sc.getActiveMeshes().forEach(m => { const k = (m.name || "?").replace(/\d+/g, "#").slice(0, 46); const b = by[k] = by[k] || { n: 0, idx: 0 }; b.n++; b.idx += (m.getTotalIndices ? m.getTotalIndices() : 0); }); return Object.entries(by).sort((a, b) => b[1].idx - a[1].idx).slice(0, 7).map(([k, v]) => k + " x" + v.n + " " + Math.round(v.idx / 1000) + "k"); });
console.log("top in session", JSON.stringify(await top()));
console.log("play", JSON.stringify(await st()));
console.log("stats", JSON.stringify(await stats()));
console.log("cams", JSON.stringify(await page.evaluate(() => { const sc = window.origins.meta.scene, a = sc.activeCamera; const f = c => ({ name: c.name, minZ: c.minZ, maxZ: c.maxZ, fov: +(c.fov||0).toFixed(2), rig: (c.rigCameras||[]).map(r => [r.minZ, r.maxZ]) }); return { active: f(a), game: sc.cameras.map(f) }; })));
console.log("XRWebGLLayer init", await page.evaluate(() => window.__layerInit));
console.log("fb", JSON.stringify(await page.evaluate(() => { const s = window.origins.meta.xr.baseExperience.sessionManager.session; const l = s.renderState.baseLayer; return l ? [l.framebufferWidth, l.framebufferHeight] : "no baseLayer"; })));
console.log("fps in play (session)", await fps());

// ---- the controllers: the emulator's own, not stand-ins
const btn = (hand, name, v) => page.evaluate(([h, n, v]) => window.__dev.controllers[h].updateButtonValue(n, v), [hand, name, v]);
const tapb = async (hand, name) => { await btn(hand, name, 1); await page.waitForTimeout(250); await btn(hand, name, 0); await page.waitForTimeout(250); };
console.log("controller inputs", await page.evaluate(() => Object.keys(window.__dev.controllers)), await page.evaluate(() => Object.keys(window.__dev.controllers.right.gamepadConfig ? { b: 1 } : {})));
await tapb("left", "x-button");
let g = await st(); console.log("after X:", g.mode);
// aim the right controller at where a menu row should be, and see where the ring lands
// the ring should sit on the controller's own ray, for several poses
const probe = async (pos, euler) => {
	await page.evaluate(([p, e]) => { const c = window.__dev.controllers.right; c.position.set(...p); const q = new (window.IWER.Quaternion || Object)(); }, [pos, euler]).catch(() => { });
	await page.evaluate(([p, e]) => { const c = window.__dev.controllers.right; c.position.set(...p); const [x, y, z] = e.map(v => v / 2), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z); c.quaternion.set(sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz); }, [pos, euler]);
	await page.waitForTimeout(500);
	return page.evaluate(() => {
		const st = window.origins.data.packages.engine.packages.controllers.utilities["xr-controller-right"].properties.state, ray = st.ray;
		const ring = window.origins.meta.scene.getMeshByName("ui.cursor.ring.mesh");
		if (!ray || !ring || !ring.isEnabled()) return { ray: !!ray, ring: ring ? ring.isEnabled() : null, local: st.local && st.local.direction };
		const p = ring.getAbsolutePosition(), o = ray.origin, d = ray.direction, v = [p.x - o[0], p.y - o[1], p.z - o[2]], t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
		const off = Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]);
		return { ringOffRayMetres: +off.toFixed(3), alongRay: +t.toFixed(2), local: st.local.direction.map(x => +x.toFixed(2)) };
	});
};
for (const [pos, eul] of [[[0.25, 1.1, -0.3], [0, 0, 0]], [[0.25, 1.1, -0.3], [0.15, 0.2, 0]], [[0.1, 1.3, -0.2], [-0.1, -0.25, 0]]]) console.log("aim", JSON.stringify(eul), JSON.stringify(await probe(pos, eul)));
await page.screenshot({ path: path.join(out, "xr-aim.png") });
await tapb("right", "b-button");
console.log("after B:", (await st()).mode);
const me = () => page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; return { pos: p.position.map(v => +v.toFixed(1)), yaw: +p.yaw.toFixed(2), flying: p.flying }; });
await page.waitForTimeout(1500);
const a0 = await me();
await page.evaluate(() => window.__dev.controllers.left.updateAxes("thumbstick", 0, -1)); await page.waitForTimeout(1500);
const a1 = await me(); await page.evaluate(() => window.__dev.controllers.left.updateAxes("thumbstick", 0, 0));
console.log("left stick forward moved", JSON.stringify(a0.pos), "->", JSON.stringify(a1.pos));
await page.evaluate(() => window.__dev.controllers.right.updateAxes("thumbstick", 1, 0)); await page.waitForTimeout(1000);
const a2 = await me(); await page.evaluate(() => window.__dev.controllers.right.updateAxes("thumbstick", 0, 0));
console.log("right stick right turned yaw", a1.yaw, "->", a2.yaw);
let hi = a2.pos[1]; await btn("right", "b-button", 1); for (let i = 0; i < 12; i++) { await page.waitForTimeout(80); hi = Math.max(hi, (await me()).pos[1]); } await btn("right", "b-button", 0);
const a3 = { pos: [0, hi] }; console.log("B pressed, y", a2.pos[1], "->", a3.pos[1]);
await tapb("left", "trigger");
await page.waitForTimeout(500);
console.log("left trigger flying:", (await me()).flying);

await page.screenshot({ path: path.join(out, "xr-emu.png") });
// the same place with the session left, for comparison
await page.evaluate(async () => { await window.origins.meta.xr.baseExperience.exitXRAsync(); });
await page.waitForTimeout(2500);
console.log("top flat", JSON.stringify(await top()));
console.log("fps in play (flat)", await fps(), JSON.stringify(await stats()));
console.log("errors", JSON.stringify([...new Set(errors)].slice(0, 5)));
await browser.close(); server.close();
