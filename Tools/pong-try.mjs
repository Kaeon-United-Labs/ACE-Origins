import path from "node:path"; import { serve, launch } from "./shot.mjs";
const server = await serve(); const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = []; page.on("pageerror", e => errors.push(e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/Scratch/pongtest/index.html`);
await page.waitForTimeout(70000);
console.log("origins:", await page.evaluate(() => !!window.origins), "overlay still there:", await page.evaluate(() => !!document.getElementById("loading")), "errors", JSON.stringify(errors));
await page.screenshot({ path: "../../Scratch/thumbs/pong-as-is.png" });
await browser.close(); server.close();
