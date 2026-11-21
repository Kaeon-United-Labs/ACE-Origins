// Diving, swimming, walking into the sea, the fish.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 }); await page.waitForTimeout(800);
const st = () => page.evaluate(() => { const p = window.origins.data.packages; const d = p.player.properties.meta.data, g = p.game.properties.meta.data; return { pos: d.position.map(v => +v.toFixed(1)), eye: +(d.position[1] + d.eye).toFixed(2), fly: d.flying, swim: d.swim, speed: +d.speed.toFixed(1), uw: g.uw }; });
const put = (x, y, z, yaw, pitch, fly) => page.evaluate(([x, y, z, yaw, pitch, fly]) => { const d = window.origins.data.packages.player.properties.meta.data; d.position = [x, y, z]; d.vel = [0, 0, 0]; d.vy = 0; d.flying = fly; d.yaw = yaw; d.pitch = pitch; d.tele = 5; }, [x, y, z, yaw, pitch, fly]);
const down = c => page.keyboard.down(c), up = c => page.keyboard.up(c);

// 1. flying straight down through the surface, then on to the bed
await put(-3300, 30, -1124, 0, -1.2, 1); await page.waitForTimeout(600);
await down("KeyW");
const track = [];
for (let i = 0; i < 24; i++) { await page.waitForTimeout(250); const s = await st(); track.push(`${s.eye}/${s.speed}/${s.uw}`); }
await up("KeyW");
console.log("flying dive (eye y / speed / underwater factor):", track.join("  "));
console.log("   still flying at the end:", await st());
await page.screenshot({ path: path.join(out, "sea-dive.png") });

// 2. F: stop flying under water, swim at walking pace, try to breach
await page.keyboard.down("KeyF"); await page.waitForTimeout(100); await page.keyboard.up("KeyF"); await page.waitForTimeout(400);
await put(-3300, -12, -1124, 1.57, 0.0, 0); await page.waitForTimeout(800);
await down("KeyW"); await page.waitForTimeout(1500);
console.log("swimming on (W):", await st());
await up("KeyW");
await page.evaluate(() => { window.origins.data.packages.player.properties.meta.data.pitch = 1.3; });
await down("KeyW"); await page.waitForTimeout(4500);
const top = await st(); await up("KeyW");
console.log("swimming straight up for 4.5 s (eye must stay under -0.35):", top);
await down("ShiftLeft"); await down("KeyW"); await page.waitForTimeout(1500); console.log("with shift:", (await st()).speed); await up("KeyW"); await up("ShiftLeft");
await page.screenshot({ path: path.join(out, "sea-surface-below.png") });

// 3. wading in from the beach
await put(-3040, 80, -1124, 1.57, 0.0, 0); await page.waitForTimeout(1500);
const walk = [];
await down("KeyW");
for (let i = 0; i < 16; i++) { await page.waitForTimeout(500); const s = await st(); walk.push(`${s.pos[0]}:${s.pos[1]}${s.swim ? "S" : ""}/${s.speed}`); }
await up("KeyW");
console.log("walking west into the sea (x:y, S = swimming / speed):", walk.join(" "));

// 4. fish
await page.evaluate(() => { const d = window.origins.data.packages; const s = d.fish.properties.meta.data.schools[0]; const p = d.player.properties.meta.data; p.position = [s.x + 25, s.floor + 12, s.z]; p.flying = 1; p.yaw = 1.57; p.pitch = 0; p.vel = [0, 0, 0]; p.tele = 5; });
await page.waitForTimeout(2500);
console.log("fish drawn near school 0:", await page.evaluate(() => Object.values(window.origins.data.packages.fish.packages).filter(e => e.properties.meta.data.enabled).length));
await page.screenshot({ path: path.join(out, "sea-fish.png") });
console.log("errors", errors);
await browser.close(); server.close();
