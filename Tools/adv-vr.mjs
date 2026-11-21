// The headset's controls, without a headset: the controllers are faked (a pose, a ray in the view's frame, buttons and sticks)
// and the camera is made to say it is presenting, so that the game's own VR paths run. Title, menu tabs, pointing, the map, play buttons.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1000);

// the fake headset
await page.evaluate(() => {
	window.__pad = { left: { digital: [], analog: {}, aim: null }, right: { digital: [], analog: {}, aim: [0, 0] } };
	const ray = aim => aim ? { origin: [0, 0, 0], direction: (() => { const v = [aim[0] * 10, aim[1] * 10, -10], l = Math.hypot(...v); return v.map(x => x / l); })() } : undefined;
	aceBabylon.input.xr = context => {
		for (const hand of ["left", "right"]) {
			const p = window.__pad[hand], id = "xr-controller-" + hand;
			const c = aceBabylon.input.device("xr-controller", hand, hand);
			const prev = c.digital;
			c.digital = p.digital.slice(); c.analog = Object.assign({ "thumbstick-x": 0, "thumbstick-y": 0 }, p.analog);
			c.pressed = c.digital.filter(n => !prev.includes(n)); c.released = prev.filter(n => !c.digital.includes(n));
			c.local = ray(p.aim);
		}
		return true;
	};
	const cams = () => window.origins.resolved.components.filter(c => c.type === "camera");
	const prior = aceBabylon.input.xr;
	aceBabylon.input.xr = context => { const r = prior(context); cams().forEach(c => ace.setState(window.origins, c, { presenting: true })); return r; };
});
const pad = (hand, patch) => page.evaluate(([h, p]) => Object.assign(window.__pad[h], p), [hand, patch]);
const tap = async (hand, name, ms = 160) => { const d = await page.evaluate(([h]) => window.__pad[h].digital.slice(), [hand]); await pad(hand, { digital: d.concat(name) }); await page.waitForTimeout(ms); await pad(hand, { digital: d }); await page.waitForTimeout(ms); };
const point = (hand, u, v) => pad(hand, { aim: [u, v] });
const gm = () => page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: g.mode, tab: g.tab, sel: g.sel, hand: g.vrHand, err: g.vrErr, mapErr: g.mapErr, W: Math.round(g.mapW || 0), bind: JSON.stringify(window.origins.data.packages.rpg.properties.meta.data.bind), y: Math.round(p.position[1] * 10) / 10, vy: p.vy, pos: p.position.map(v => Math.round(v)) }; });
const until = async (f, ms = 30000) => { for (let t = 0; t < ms; t += 250) { if (f(await gm())) return true; await page.waitForTimeout(250); } return false; };
const ok = (label, cond, extra) => console.log((cond ? "PASS " : "FAIL ") + label, extra === undefined ? "" : JSON.stringify(extra));

await page.waitForTimeout(800);
let s = await gm(); ok("title shown", s.mode === "title", s);
// point at the second row (Controls on a fresh browser is row 1, New game row 0), then at row 0, and pull the trigger
await point("right", -0.7, 0.37 - 0.056); await page.waitForTimeout(300);
s = await gm(); ok("hover chooses row 1", s.sel === 1, s);
await point("right", -0.7, 0.37); await page.waitForTimeout(300);
s = await gm(); ok("hover chooses row 0", s.sel === 0, s);
await page.screenshot({ path: path.join(out, "vr-title.png") });
await tap("right", "trigger", 200);
ok("trigger on New game starts loading/play", await until(s => s.mode === "loading" || s.mode === "play", 8000));
await until(s => s.mode === "play", 40000);
await pad("right", { aim: null });
s = await gm(); ok("playing", s.mode === "play", s);

// jump: B on foot
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.flying = 0; });
await page.waitForTimeout(2500);
const y0 = (await gm()).y;
await tap("right", "b", 120);
let top = y0; for (let i = 0; i < 8; i++) { await page.waitForTimeout(90); top = Math.max(top, (await gm()).y); }
ok("B jumps", top > y0 + 0.3, { y0, top });

// X opens the inventory
await tap("left", "a", 200);
s = await gm(); ok("X opens the menu on the inventory", s.mode === "menu" && s.tab === 0, s);
// grips change tab
await tap("right", "squeeze", 200); s = await gm(); ok("right grip: next tab", s.tab === 1, s);
await tap("left", "squeeze", 200); s = await gm(); ok("left grip: previous tab", s.tab === 0, s);
// point at the MAP tab and pull the trigger
await point("right", 0.25, 0.525); await page.waitForTimeout(200);
await tap("right", "trigger", 200);
s = await gm(); ok("trigger on the MAP tab", s.tab === 2, s);
await page.screenshot({ path: path.join(out, "vr-map.png") });
// right stick up zooms in; left stick pans
const w0 = (await gm()).W;
await pad("right", { analog: { "thumbstick-y": 1 } }); await page.waitForTimeout(700); await pad("right", { analog: {} });
s = await gm(); ok("right stick zooms the map", s.W < w0, { w0, W: s.W, err: s.mapErr });
// B closes
await tap("left", "b", 200);                       // Y opens nothing in a menu (it binds), B closes
await tap("right", "b", 200);
s = await gm(); ok("B closes the menu", s.mode === "play", s);
// Y opens the map directly
await tap("left", "b", 200);
s = await gm(); ok("Y opens the map", s.mode === "menu" && s.tab === 2, s);
await tap("right", "b", 200);
// left stick click opens the log
await tap("left", "thumbstick", 200);
s = await gm(); ok("left stick click opens the log", s.mode === "menu" && s.tab === 1, s);
await tap("right", "b", 200);
// inventory binding: X puts the ability on the trigger
await tap("left", "a", 200);
await page.evaluate(() => { const r = window.origins.data.packages.rpg.properties.meta.data; r.inv.bolt = 1; });
await tap("right", "squeeze", 200); await tap("left", "squeeze", 200);   // out and back: select row 0 again
await tap("left", "b", 200);                         // Y: bind the right-hand action
s = await gm(); ok("Y binds the grip action", /"r":"bolt"/.test(s.bind), s);
await tap("right", "b", 200);
s = await gm(); ok("back in play", s.mode === "play", s);
ok("no script errors", !s.err && errors.length === 0, { err: s.err, errors });
await browser.close(); server.close();
