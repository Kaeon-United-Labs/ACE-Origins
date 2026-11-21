// Save inside a building, reload the page, Continue: you are inside, and the way out still leads to the same door.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
const url = `http://127.0.0.1:${server.address().port}/Build/index.html`;
const boot = async () => {
	await page.goto(url);
	await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
	await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
	await page.waitForTimeout(1500); await page.mouse.click(640, 360);
};
const press = async (c, w = 350) => { await page.keyboard.down(c); await page.waitForTimeout(110); await page.keyboard.up(c); await page.waitForTimeout(w); };
const g = () => page.evaluate(() => { const gm = window.origins.data.packages.game.properties.meta.data, p = window.origins.data.packages.player.properties.meta.data; return { mode: gm.mode, area: gm.area, pos: p.position.map(v => Math.round(v)), ret: gm.ret.pos.map(Math.round) }; });
const until = async (f, ms = 30000) => { for (let t = 0; t < ms; t += 250) { if (await f(await g())) return true; await page.waitForTimeout(250); } return false; };
await boot();
await page.evaluate(() => { localStorage.clear(); });
await press("Enter", 300); await until(s => s.mode === "play");
const d = await page.evaluate(() => window.origins.data.packages.things.packages.skydoor.properties.meta.data.exit);
await page.evaluate((d) => { const p = window.origins.data.packages.player.properties.meta.data; p.position = [d.pos[0], d.pos[1] + 1, d.pos[2]]; p.tele = 5; p.flying = 0; p.yaw = d.yaw - Math.PI; }, d);
await page.waitForTimeout(4000); await press("KeyR", 500);
await until(s => s.mode === "play" && s.area === "sage"); await page.waitForTimeout(1500);
console.log("inside", JSON.stringify(await g()));
await press("KeyI", 700);
await page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data; g.tab = 3; g.sel = 1; });
await page.waitForTimeout(400); await press("Enter", 600);
const saved = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("ace-origins-save-1")); return { area: s.area, pos: s.pos.map(Math.round), ret: s.ret && s.ret.pos.map(Math.round) }; });
console.log("saved", JSON.stringify(saved));
await boot();
console.log("reloaded", JSON.stringify(await g()));
await press("Enter", 300);                       // Continue
await until(s => s.mode === "play"); await page.waitForTimeout(2500);
console.log("continued", JSON.stringify(await g()));
await page.evaluate(() => { const p = window.origins.data.packages.player.properties.meta.data; p.yaw = Math.PI; });
await page.keyboard.down("KeyW"); await page.waitForTimeout(3500); await page.keyboard.up("KeyW");
await until(s => s.mode === "play" && s.area === "overworld"); await page.waitForTimeout(2000);
console.log("walked out", JSON.stringify(await g()));
console.log("errors", errors);
await browser.close(); server.close();
