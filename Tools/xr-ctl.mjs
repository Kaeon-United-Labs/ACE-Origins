// (controls test) Screenshots inside the emulated headset session: at the camp, over the town, and by the floating island; reverse depth on and off.
import fs from "node:fs"; import path from "node:path"; import https from "node:https"; import { fileURLToPath } from "node:url";
import { launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..", "..");
const out = path.join(root, "Scratch", "thumbs");
const iwer = fs.readFileSync(path.join(here, "node_modules/iwer/build/iwer.min.js"), "utf8");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2" };
const server = await new Promise(r => { const s = https.createServer({ key: fs.readFileSync(path.join(root, "Scratch/cert/k.pem")), cert: fs.readFileSync(path.join(root, "Scratch/cert/c.pem")) }, (req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "Content-Length": fs.statSync(f).size }); fs.createReadStream(f).pipe(res); }); s.listen(0, "127.0.0.1", () => r(s)); });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 300)));
await page.addInitScript(iwer + "\n;(()=>{ const d = new IWER.XRDevice(IWER.metaQuest3); d.installRuntime({ forceInstall: true }); window.__dev = d; })();");
await page.goto(`https://127.0.0.1:${server.address().port}/Build/index.html${process.env.Q || ""}`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => { const x = window.origins.meta.xr; await x.baseExperience.enterXRAsync("immersive-vr", "local-floor", x.renderTarget); });
await page.waitForTimeout(1500);
const press = async (c, w = 300) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
await press("Enter", 500);
for (let t = 0; t < 60000; t += 500) { if (await page.evaluate(() => window.origins.data.packages.game.properties.meta.data.mode) === "play") break; await page.waitForTimeout(500); }
await page.waitForTimeout(2500);
const pl = () => page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; return { pos: p.position.slice(), flying: p.flying, yaw: p.yaw }; });
const setP = (o) => page.evaluate(o => { const p = window.origins.data.packages.player.properties.meta.data; Object.assign(p, o, { vel: [0, 0, 0], tele: 5 }); }, o);
const quat = (x, y, z) => { const [a, b, c] = [x, y, z].map(v => v / 2), cx = Math.cos(a), sx = Math.sin(a), cy = Math.cos(b), sy = Math.sin(b), cz = Math.cos(c), sz = Math.sin(c); return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz]; };
const pose = (hand, pos, eul) => page.evaluate(([h, p, q]) => { const c = window.__dev.controllers[h]; c.position.set(...p); c.quaternion.set(...q); }, [hand, pos, quat(...eul)]);
const ray = hand => page.evaluate(h => window.origins.data.packages.engine.packages.controllers.utilities["xr-controller-" + h].properties.state.ray, hand);
const stick = (hand, x, y) => page.evaluate(([h, x, y]) => window.__dev.controllers[h].updateAxes("thumbstick", x, y), [hand, x, y]);
const ok = (label, c, extra) => console.log((c ? "PASS " : "FAIL ") + label, extra === undefined ? "" : JSON.stringify(extra));
const dotH = (a, b) => { const la = Math.hypot(a[0], a[2]), lb = Math.hypot(b[0], b[2]); return (a[0] * b[0] + a[2] * b[2]) / (la * lb || 1); };

// walking: the left controller says where forward is
await setP({ position: [-37, 106, 855], flying: 0, yaw: 0 }); await page.waitForTimeout(2500);
for (const yaw of [0, 1.2, -1.9]) {
	await pose("left", [-0.2, 1.1, -0.3], [0, yaw, 0]); await page.waitForTimeout(400);
	const r = await ray("left"), p0 = (await pl()).pos;
	await stick("left", 0, -1); await page.waitForTimeout(900); await stick("left", 0, 0);
	const p1 = (await pl()).pos, mv = [p1[0] - p0[0], 0, p1[2] - p0[2]];
	ok("stick forward goes the way the left controller points (hand yaw " + yaw + ")", Math.hypot(...mv) > 1 && dotH(mv, r.direction) > 0.95, { moved: Math.round(Math.hypot(...mv) * 10) / 10, cos: +dotH(mv, r.direction).toFixed(3) });
	await setP({ position: [-37, 106, 855], flying: 0 }); await page.waitForTimeout(800);
}
// the left hand points one way and the right another: strafing is across the left hand's direction
// flying: up and down
await setP({ position: [-37, 160, 855], flying: 1 }); await page.waitForTimeout(800);
await pose("left", [-0.2, 1.1, -0.3], [0, 0, 0]); await pose("right", [0.2, 1.1, -0.3], [0, 0, 0]);
const y0 = (await pl()).pos[1];
await stick("right", 0, -1); await page.waitForTimeout(1200); await stick("right", 0, 0);
const y1 = (await pl()).pos[1]; ok("right stick up ascends", y1 > y0 + 3, { y0: Math.round(y0), y1: Math.round(y1) });
await stick("right", 0, 1); await page.waitForTimeout(1200); await stick("right", 0, 0);
const y2 = (await pl()).pos[1]; ok("right stick down descends", y2 < y1 - 3, { y1: Math.round(y1), y2: Math.round(y2) });
// flying forward follows the left hand, level or tilted
await setP({ position: [-37, 400, 855], flying: 1 }); await page.waitForTimeout(800);
await pose("left", [-0.2, 1.1, -0.3], [0.5, 0.8, 0]); await page.waitForTimeout(400);
const lr = await ray("left"), q0 = (await pl()).pos;
await stick("left", 0, -1); await page.waitForTimeout(1000); await stick("left", 0, 0);
const q1 = (await pl()).pos, mv3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]], ml = Math.hypot(...mv3);
ok("flying goes along the left controller, pitch and all", ml > 5 && (mv3[0] * lr.direction[0] + mv3[1] * lr.direction[1] + mv3[2] * lr.direction[2]) / ml > 0.9, { dir: lr.direction.map(v => +v.toFixed(2)), moved: mv3.map(v => Math.round(v)) });
// shooting: along the right controller, from it
await setP({ position: [-37, 400, 855], flying: 1, yaw: 0 }); await page.waitForTimeout(500);
await pose("right", [0.3, 1.2, -0.4], [0.3, -0.7, 0]); await page.waitForTimeout(400);
const rr = await ray("right");
await page.evaluate(() => window.__dev.controllers.right.updateButtonValue("trigger", 1)); await page.waitForTimeout(500);
const shot = await page.evaluate(() => { const d = window.origins.data.packages; for (let i = 0; i < 40; i++) { const s = d.shots.packages["s" + i].properties.meta.data; if (s.enabled === true) return { pos: s.position, vel: s.vel }; } return null; });
await page.evaluate(() => window.__dev.controllers.right.updateButtonValue("trigger", 0));
if (shot) { const l = Math.hypot(...shot.vel), cs = (shot.vel[0] * rr.direction[0] + shot.vel[1] * rr.direction[1] + shot.vel[2] * rr.direction[2]) / l; const fromHand = Math.hypot(shot.pos[0] - rr.origin[0], shot.pos[1] - rr.origin[1], shot.pos[2] - rr.origin[2]);
	ok("a bolt leaves along the right controller's ray", cs > 0.99, { cos: +cs.toFixed(4) }); ok("and starts at the controller (within the flight since the pull)", fromHand < 600 * 0.6, { metresFromHand: Math.round(fromHand * 10) / 10 }); }
else ok("a bolt was fired", false);
await page.screenshot({ path: path.join(out, "xr-ctl.png") });
// back out of the session: the flat view comes back whole
await page.evaluate(async () => { await window.origins.meta.xr.baseExperience.exitXRAsync(); });
await page.waitForTimeout(3000);
ok("reverse depth is back on the flat screen", await page.evaluate(() => window.origins.meta.engine.useReverseDepthBuffer) === true);
await page.screenshot({ path: path.join(out, "xr-flat-after.png") });
console.log("errors", JSON.stringify(errors));
await browser.close(); server.close();
