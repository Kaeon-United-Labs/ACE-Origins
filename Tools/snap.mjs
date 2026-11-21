// Starts a new game, puts the player somewhere and takes a screenshot: node snap.mjs <out> <x> <y> <z> <yaw> <pitch> [flying] [query]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const [name, x, y, z, yaw, pitch, flying = "1", query = ""] = process.argv.slice(2);
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html${query}`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById("loading"), null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter");
await page.waitForFunction(() => window.origins.data.packages.game.properties.meta.data.mode === "play", null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.evaluate(([x, y, z, yaw, pitch, f]) => { const d = window.origins.data.packages.player.properties.meta.data; d.position = [x, y, z]; d.vel = [0, 0, 0]; d.vy = 0; d.flying = f; d.yaw = yaw; d.pitch = pitch; d.tele = 5; window.origins.data.packages.hud.properties.meta.data.enabled = false; }, [+x, +y, +z, +yaw, +pitch, +flying]);
await page.waitForTimeout(+(process.env.SETTLE || 6000));
await page.screenshot({ path: path.join(here, "..", "..", "Scratch", "thumbs", name + ".png") });
await browser.close(); server.close();
