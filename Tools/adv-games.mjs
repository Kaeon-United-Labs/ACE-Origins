// The page runs any ACE document: Pong boots at once with no cover, the platformer's character walks (physics loaded on demand), Origins keeps its own cover.
import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const base = `http://127.0.0.1:${server.address().port}/Build/index.html`;
const demo = "?game=../Docs/Resource/ACE/Code/Demo/Games/General/";
const ok = (label, c, extra) => console.log((c ? "PASS " : "FAIL ") + label, extra === undefined ? "" : JSON.stringify(extra));
const open = async (q) => { const page = await browser.newPage({ viewport: { width: 1000, height: 600 } }); const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 160))); const t0 = Date.now(); await page.goto(base + q); return { page, errors, t0 }; };

{ // pong
	const { page, errors, t0 } = await open(demo + "pong.json");
	await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 20000 });
	ok("pong runs at once", Date.now() - t0 < 8000, { ms: Date.now() - t0 });
	ok("pong has no cover", await page.evaluate(() => !document.getElementById("loading")));
	ok("pong has no cannon", await page.evaluate(() => typeof CANNON === "undefined"));
	await page.screenshot({ path: "../../Scratch/thumbs/g-pong.png" }); ok("no errors", errors.length === 0, errors); await page.close();
}
{ // platformer
	const { page, errors } = await open(demo + "platformer3D.json");
	await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 20000 });
	ok("platformer loads cannon", await page.evaluate(() => typeof CANNON !== "undefined"));
	await page.waitForTimeout(6000);
	const pos = () => page.evaluate(() => { const a = window.origins.data.packages.avatar; const s = a.properties.meta.state; return (s && s.position) || a.properties.meta.data.position; });
	await page.mouse.click(500, 300);
	const p0 = await pos();
	await page.keyboard.down("KeyW"); await page.waitForTimeout(2500); await page.keyboard.up("KeyW");
	const p1 = await pos(); ok("W moves the character", Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 2, { from: p0.map(v => +v.toFixed(1)), to: p1.map(v => +v.toFixed(1)) });
	await page.keyboard.down("Space"); await page.waitForTimeout(250); const p2 = await pos(); await page.keyboard.up("Space"); ok("Space jumps", p2[1] > p1[1] + 0.3, { y: [+p1[1].toFixed(2), +p2[1].toFixed(2)] });
	await page.screenshot({ path: "../../Scratch/thumbs/g-platformer.png" }); ok("no errors", errors.length === 0, errors); await page.close();
}
{ // origins
	const { page, errors } = await open("");
	await page.waitForFunction(() => window.origins && window.origins.frame > 2, null, { timeout: 60000 });
	const cover = await page.evaluate(() => { const o = document.getElementById("loading"); return o ? { text: o.firstChild.textContent, font: getComputedStyle(o).fontFamily.slice(0, 20), title: document.title, status: o.querySelector("small").textContent } : null; });
	ok("origins has its cover, from its own document", !!cover && cover.text === "ACE ORIGINS" && cover.title === "ACE Origins", cover);
	await page.screenshot({ path: "../../Scratch/thumbs/g-origins-cover.png" });
	await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 }); ok("cover goes when the world is made", true); ok("no errors", errors.length === 0, errors); await page.close();
}
await browser.close(); server.close();
