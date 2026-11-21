import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:${server.address().port}/Build/index.html`);
await page.waitForFunction(() => window.origins && window.origins.frame > 5, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.keyboard.down("Enter"); await page.waitForTimeout(110); await page.keyboard.up("Enter"); await page.waitForTimeout(1500);
for (const [name, pos, yaw, pitch] of [["camp", [-37, 110, 848], 0.5, 0.1], ["forest", [900, 330, 300], 1.9, -0.08], ["coast", [-3128, 9, -1124], -1.57, -0.08], ["under", [-3300, -20, -1124], 1.57, 0]]) {
  await page.evaluate(([p, yaw, pitch]) => { const d = window.origins.data.packages.player.properties.meta.data; d.position = p; d.vel = [0,0,0]; d.flying = 1; d.yaw = yaw; d.pitch = pitch; d.tele = 5; }, [pos, yaw, pitch]);
  await page.waitForTimeout(3000);
  const f0 = await page.evaluate(() => window.origins.frame); await page.waitForTimeout(4000); const f1 = await page.evaluate(() => window.origins.frame);
  console.log(name, "fps", ((f1 - f0) / 4).toFixed(1));
}
await browser.close(); server.close();
