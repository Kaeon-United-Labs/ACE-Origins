import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.mouse.click(640, 360);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 }); await page.waitForTimeout(800);
await page.evaluate(() => { const d = window.origins.data.packages; const p = d.player.properties.meta.data; const e = d.enemies.packages.b0.properties.meta.data;
  e.position = [p.position[0] + 0, p.position[1] + 1.6, p.position[2] - 40]; e.anchor = e.position.slice(); e.state = "patrol"; e.aggro = 0; e.speed = 0; e.vcruise = 0; p.pitch = 0.33; });
await page.mouse.down({ button: "left" });
for (let i = 0; i < 20; i++) { await page.waitForTimeout(100); if (await page.evaluate(() => Object.keys(window.origins.data.packages.rpg.properties.meta.data.kills).length)) break; }
await page.mouse.up({ button: "left" });
await page.waitForTimeout(600);
console.log(await page.evaluate(() => { const d = window.origins.data.packages; const e = d.enemies.packages.b0.properties.meta.data; const p = d.player.properties.meta.data; return JSON.stringify({ e: [e.position, e.hp, e.state, e.alive, e.cy, e.r], p: [p.position, p.yaw, p.pitch, p.aim, p.fire, p.cool], mode: d.game.properties.meta.data.mode, bind: d.rpg.properties.meta.data.bind }); }));
console.log(await page.evaluate(() => JSON.stringify([window.origins.data.packages.rpg.properties.meta.data.kills, window.origins.data.packages.game.properties.meta.data.kills, window.origins.data.packages.game.properties.meta.data.note])));
console.log("errors", errors);
await browser.close(); server.close();
