// Drives the adventure systems through a real browser: title, new game, conversation, menus, saving.
//   node adv-test.mjs [step ...]   (no steps: the whole walk-through)
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", m => { if (m.type() === "error" && !/404/.test(m.text())) console.log("[page error]", m.text().slice(0, 300)); });
page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 300)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(9000);

const game = () => page.evaluate(() => {
	const p = window.origins.data.packages, g = p.game.properties.meta.data, r = p.rpg.properties.meta.data, pl = p.player.properties.meta.data;
	const e = window.origins.data.packages.engine.utilities;
	return { mode: g.mode, sel: g.sel, tab: g.tab, interact: g.interact, note: g.note, inv: r.inv, bind: r.bind, q: Object.fromEntries(Object.entries(r.q).map(([k, v]) => [k, v.s])), flags: r.flags, found: r.found, kills: r.kills,
		pos: pl.position.map(v => Math.round(v)), flying: pl.flying, hp: Math.round(pl.health), scale: e.time.properties.data.scale, cursor: e.display.properties.data.cursor, locked: e.display.properties.state && e.display.properties.state.locked,
		talk: g.talkNpc + ":" + g.talkEntry + ":" + g.talkLine };
});
const shot = async name => { await page.screenshot({ path: path.join(out, "adv-" + name + ".png") }); };
const press = async (code, wait = 350) => { await page.keyboard.down(code); await page.waitForTimeout(110); await page.keyboard.up(code); await page.waitForTimeout(wait); };
const say = async label => console.log(label.padEnd(28), JSON.stringify(await game()));

await page.mouse.click(640, 360);
await say("boot");
await shot("00-title");
await press("ArrowDown"); await shot("01-title-sel"); await say("title ArrowDown");
await press("ArrowUp");
await press("Enter", 1200); await say("after Enter (new game)");
await shot("02-camp");
await page.keyboard.down("KeyW"); await page.waitForTimeout(900); await page.keyboard.up("KeyW"); await page.waitForTimeout(300);
await say("walked toward Maren"); await shot("03-near-maren");
await press("KeyR", 600); await say("R (talk)"); await shot("04-talk");
for (let i = 0; i < 4; i++) { await press("KeyR", 500); await say("talk R " + i); }
await shot("05-after-talk");
await press("KeyI", 600); await say("I"); await shot("06-inventory");
await press("KeyE", 400); await shot("07-quests"); await say("tab");
await press("KeyE", 400); await shot("08-map"); await say("tab");
await press("KeyE", 400); await shot("09-system"); await say("tab");
await press("ArrowDown"); await press("Enter", 800); await say("save slot 1");
await press("Escape", 900); await say("Escape");
await browser.close(); server.close();
