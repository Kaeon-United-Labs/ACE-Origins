// Plays the three demo quests start to finish in a real browser, then saves, reloads the page and continues.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
const url = `http://127.0.0.1:${server.address().port}/Build/index.html`;
const boot = async () => {
	await page.goto(url);
	await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
	await page.waitForTimeout(8000);
	await page.mouse.click(640, 360);
};
const snap = () => page.evaluate(() => {
	const p = window.origins.data.packages, g = p.game.properties.meta.data, r = p.rpg.properties.meta.data, pl = p.player.properties.meta.data;
	return { mode: g.mode, note: g.note, inv: r.inv, bind: r.bind, q: Object.fromEntries(Object.entries(r.q).map(([k, v]) => [k, v.s])), flags: Object.keys(r.flags), found: Object.keys(r.found), kills: Object.fromEntries(Object.entries(r.kills).map(([k, v]) => [k, v.n])), hp: Math.round(pl.health), maxHp: pl.maxHealth, pos: pl.position.map(Math.round), interact: g.interact };
});
const say = async label => console.log(label.padEnd(26), JSON.stringify(await snap()));
const press = async (code, wait = 300) => { await page.keyboard.down(code); await page.waitForTimeout(110); await page.keyboard.up(code); await page.waitForTimeout(wait); };
const goTo = async (thing, dz = 1.5) => {
	await page.evaluate(([name, dz]) => {
		const t = window.origins.data.packages.things.packages[name].properties.meta.data.position;
		const d = window.origins.data.packages.player.properties.meta.data;
		d.position = [t[0], t[1] + 1, t[2] + dz]; d.vel = [0, 0, 0]; d.vy = 0; d.flying = 0;
	}, [thing, dz]);
	await page.evaluate(() => { window.origins.data.packages.player.properties.meta.data.tele = 5; });
	await page.waitForTimeout(2200);
};
const talk = async (thing) => {
	await goTo(thing, 2.5);
	await press("KeyR", 400);
	for (let i = 0; i < 8; i++) { if ((await snap()).mode !== "talk") break; await press("KeyR", 350); }
};

await boot();
await press("Enter", 1500);
await say("new game");
await talk("npc_maren"); await say("Maren: first talk");
for (const n of ["apple0", "apple1", "apple2"]) { await goTo(n, 1); await say("  at " + n); await press("KeyR", 400); await say("  after R"); }
await say("apples taken");
await talk("npc_maren"); await say("Maren: apples handed in");
await goTo("moonstone", 9); await page.screenshot({ path: path.join(out, "flow-stone-far.png") }); await press("KeyR", 500); await say("Moon Stone touched");
await page.screenshot({ path: path.join(out, "flow-stone.png") });
await talk("npc_maren"); await say("Maren: stones handed in");
await talk("npc_hale"); await say("Hale: wings begun"); await page.screenshot({ path: path.join(out, "flow-hale.png") });
await page.evaluate(() => { const g = window.origins.data.packages.game.properties.meta.data; g.kill_bat = 3; g.kill_dragon = 1; });
await page.waitForTimeout(500); await say("kills reported");
await talk("npc_hale"); await say("Hale: wings handed in");

// the burst goes to the right mouse button
await press("KeyI", 500);
await page.keyboard.down("KeyS"); await page.waitForTimeout(90); await page.keyboard.up("KeyS");
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, "flow-inventory.png") });
for (let i = 0; i < 3; i++) { await press("ArrowDown", 250); }
await page.screenshot({ path: path.join(out, "flow-inventory2.png") });
await say("inventory open");
await press("KeyL", 400); await page.screenshot({ path: path.join(out, "flow-quests.png") });
await press("KeyE", 300); await press("KeyE", 300);   // system tab
await press("ArrowDown", 250); await press("ArrowDown", 250);
await press("Enter", 500); await say("saved slot 2");
await press("Escape", 800);

await page.reload();
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.screenshot({ path: path.join(out, "flow-title2.png") });
await say("after reload (title)");
await press("Enter", 1500); await say("Continue pressed");
console.log("page errors:", errors.length ? errors : "none");
await browser.close(); server.close();
