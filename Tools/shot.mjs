// Usage: node shot.mjs <url-path> <out.png> [waitMs] [width] [height] [--eval "js"] [--log]
// Serves the project root over HTTP, opens the page in headless Chrome and saves a screenshot.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".css": "text/css" };

export function serve(port = 0) {
	const server = http.createServer((req, res) => {
		let p = decodeURIComponent(req.url.split("?")[0]);
		const file = path.join(root, p);
		if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
		const stat = fs.statSync(file);
		res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": stat.size, "Access-Control-Allow-Origin": "*" });
		fs.createReadStream(file).pipe(res);
	});
	return new Promise(r => server.listen(port, "127.0.0.1", () => r(server)));
}

export async function launch(extra = {}) {
	return chromium.launch({
		executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
		headless: true,
		args: [...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(" ") : []), "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-webgl", "--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"],
		...extra
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const flag = n => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
	const evalJs = flag("--eval");
	const log = args.includes("--log"); if (log) args.splice(args.indexOf("--log"), 1);
	const [urlPath, outFile, wait = "4000", w = "1280", h = "720"] = args;
	const server = await serve();
	const browser = await launch();
	const page = await browser.newPage({ viewport: { width: +w, height: +h } });
	page.on("console", m => { if (log || m.type() === "error") console.log("[page]", m.type(), m.text().slice(0, 400)); });
	page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 400)));
	await page.goto(`http://127.0.0.1:${server.address().port}${urlPath}`);
	await page.waitForTimeout(+wait);
	if (evalJs) console.log("eval:", JSON.stringify(await page.evaluate(evalJs)));
	await page.screenshot({ path: outFile });
	console.log("saved", outFile);
	await browser.close(); server.close();
}
