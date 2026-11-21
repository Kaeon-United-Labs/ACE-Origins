// Serves the Build folder on http://localhost:8080 so the game can fetch its JSON and assets.
//   node serve.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = +(process.argv[2] || 8080);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".bin": "application/octet-stream", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

http.createServer((req, res) => {
	const file = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
	if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
	res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": fs.statSync(file).size });
	fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`ACE Origins: http://localhost:${port}/`));
