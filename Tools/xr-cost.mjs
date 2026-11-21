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
const fps = async (ms = 4000) => page.evaluate(async ms => { const f0 = window.origins.frame, t0 = performance.now(); await new Promise(r => setTimeout(r, ms)); return +((window.origins.frame - f0) / ((performance.now() - t0) / 1000)).toFixed(1); }, ms);
const setP = (o) => page.evaluate(o => { const p = window.origins.data.packages.player.properties.meta.data; Object.assign(p, o, { vel: [0, 0, 0], tele: 5 }); }, o);
await setP({ position: [-37, 106, 855], flying: 0 }); await page.waitForTimeout(4000);
console.log("baseline", await fps());
const off = async (label, pkg) => { await page.evaluate(p => { window.origins.data.packages[p].properties.meta.data.enabled = false; const m = window.origins.meta.scene; }, pkg); await page.waitForTimeout(1500); console.log("without", label, await fps()); };
// disable by hiding meshes directly (a document write would be overwritten by the game's own frame)
const hide = async (label, test) => { const n = await page.evaluate(src => { const f = eval(src); let n = 0; window.origins.meta.scene.meshes.forEach(m => { if (f(m.name || "")) { m.setEnabled(false); n++; } }); return n; }, test); await page.waitForTimeout(1200); console.log("without", label, "(" + n + " meshes)", await fps()); };
await hide("water", "n => /^water/.test(n)");
await hide("clouds", "n => /^clouds|cloud/.test(n)");
await hide("terrain", "n => /^terrain/.test(n)");
await hide("trees/scatter", "n => /scatter/.test(n)");
await hide("everything but sky", "n => !/sky/i.test(n)");
console.log("engine", JSON.stringify(await page.evaluate(() => { const e = window.origins.meta.engine, sc = window.origins.meta.scene; return { w: e.getRenderWidth(), h: e.getRenderHeight(), meshes: sc.meshes.length, enabled: sc.meshes.filter(m => m.isEnabled()).length, mats: sc.materials.length, lights: sc.lights.map(l => l.name + ":" + l.isEnabled()).slice(0, 12) }; })));
await browser.close(); server.close();
