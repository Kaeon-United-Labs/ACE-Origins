// Screenshots inside the emulated headset session: at the camp, over the town, and by the floating island; reverse depth on and off.
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
const tp = (x, y, z, yaw = 0) => page.evaluate(([x, y, z, yaw]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y, z]; p.yaw = yaw; p.flying = 1; p.vel = [0, 0, 0]; p.tele = 5; }, [x, y, z, yaw]);
const rev = v => page.evaluate(v => { window.origins.meta.engine.useReverseDepthBuffer = v; return window.origins.meta.engine.useReverseDepthBuffer; }, v);
console.log("reverse depth in session (should be false)", await page.evaluate(() => window.origins.meta.engine.useReverseDepthBuffer)); console.log("reverse depth initially", await page.evaluate(() => window.origins.meta.engine.useReverseDepthBuffer));
const spots = { camp: [-37, 140, 855, 0], town: [20480, 60, 600, 0], perch: [10242, 150, 80, 0] };
for (const [name, p] of Object.entries(spots)) {
	await tp(...p); await page.waitForTimeout(4500);
	for (const v of [null]) { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(out, `xr-${name}-now.png`) }); }
}
console.log("errors", JSON.stringify(errors));
await browser.close(); server.close();
