// The floating island: stand on it, under it, go in, and answer the sage's questions.
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
await page.waitForTimeout(1500);
await page.mouse.click(640, 360);
const press = async (c, w = 400) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
await press("Enter", 300);
const g = () => page.evaluate(() => { const gm = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: gm.mode, area: gm.area, phase: gm.talkPhase, idx: gm.askIdx, sel: gm.askSel, traits: gm.traits, pos: p.position.map(v => +v.toFixed(1)), grounded: p.grounded, flying: p.flying, note: gm.note }; });
const until = async (f, ms = 25000) => { for (let t = 0; t < ms; t += 250) { if (await f(await g())) return true; await page.waitForTimeout(250); } return false; };
await until(s => s.mode === "play");
const put = (x, y, z, yaw, fly = 0, pitch = 0) => page.evaluate(([x, y, z, yaw, fly, pitch]) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [x, y, z]; p.vel = [0,0,0]; p.vy = 0; p.flying = fly; p.yaw = yaw; p.pitch = pitch; p.tele = 5; }, [x, y, z, yaw, fly, pitch]);
const meta = await page.evaluate(() => { const t = window.origins.data.packages.things.packages.skydoor.properties.meta.data; return { exit: t.exit, pos: t.position }; });
// dropped from above onto the island, walking
await put(10240 + 20, 190, 15, 0);
await page.waitForTimeout(5000);
let s = await g(); console.log("dropped on top ->", JSON.stringify(s.pos), "grounded", s.grounded);
await page.screenshot({ path: path.join(out, "sky-top.png") });
// flying up into the underside from below
await put(10240 + 5, 20, 0, 0, 1, 1.4);
await page.keyboard.down("KeyW"); await page.waitForTimeout(5000); await page.keyboard.up("KeyW");
s = await g(); console.log("flew up at the underside from y=20; stopped at", JSON.stringify(s.pos));
await page.screenshot({ path: path.join(out, "sky-under.png") });
await put(10240 + 90, 80, 90, -2.5, 1, 0.1); await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(out, "sky-side.png") });
// to the door
await put(meta.exit.pos[0], meta.exit.pos[1] + 1, meta.exit.pos[2], meta.exit.yaw - Math.PI);
await page.waitForTimeout(3500);
await press("KeyR", 400);
await until(s => s.mode === "play" && s.area === "sage");
await page.waitForTimeout(1500);
console.log("inside", JSON.stringify(await g()));
await page.screenshot({ path: path.join(out, "sage-room.png") });
// walk toward her and speak
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.yaw = 0; });
await page.keyboard.down("KeyW"); await page.waitForTimeout(900); await page.keyboard.up("KeyW");
await page.waitForTimeout(500);
await press("KeyR", 500);
console.log("spoke:", JSON.stringify(await g()));
for (let i = 0; i < 2; i++) await press("KeyR", 400);    // her two opening lines
console.log("questions:", JSON.stringify(await g()));
await page.screenshot({ path: path.join(out, "sage-ask.png") });
await press("ArrowDown", 300); await press("ArrowDown", 300); console.log("selected", (await g()).sel);
await press("KeyR", 500); console.log("answered ->", JSON.stringify(await g()));
await page.screenshot({ path: path.join(out, "sage-reply.png") });
await press("KeyR", 500); await press("KeyS", 300); await press("KeyR", 500); await press("KeyR", 500); await press("KeyR", 500); await press("KeyR", 500);
console.log("after question 3 ->", JSON.stringify(await g()));
await page.screenshot({ path: path.join(out, "sage-end.png") });
await press("KeyR", 500); await press("KeyR", 600);
console.log("done ->", JSON.stringify(await g()), JSON.stringify(await page.evaluate(() => window.origins.data.packages.rpg.properties.meta.data.inv)));
console.log("errors", errors);
await browser.close(); server.close();
