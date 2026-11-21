// Flies at something and captures a rapid sequence of frames: node seq.mjs <out-prefix> <x> <y> <z> <yaw> <pitch> <count> <intervalMs> [boost]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve, launch } from "./shot.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const [prefix, x, y, z, yaw, pitch, count, gap, boost] = process.argv.slice(2);
const out = path.join(here, "..", "..", "Scratch", "thumbs");
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.angaia && window.angaia.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(12000);
await page.mouse.click(480, 270); await page.waitForTimeout(500);
await page.evaluate(([x, y, z, yaw, pitch]) => { const d = window.angaia.data.packages.player.properties.meta.data; d.position = [+x, +y, +z]; d.vel = [0, 0, 0]; d.yaw = +yaw; d.pitch = +pitch; d.flying = 1; }, [x, y, z, yaw, pitch]);
await page.waitForTimeout(2500);
await page.keyboard.down("KeyW"); if (boost) await page.keyboard.down("ShiftLeft");
for (let i = 0; i < +count; i++) { await page.screenshot({ path: path.join(out, `${prefix}-${String(i).padStart(2, "0")}.png`) }); await page.waitForTimeout(+gap); }
await browser.close(); server.close();
