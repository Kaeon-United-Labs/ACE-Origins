// The ground under the fort was levelled after the trees were planted, so trees round it were buried or hung in the air. Put every plant within reach of the plateau back on the ground
// it now has, at the same height above it that the same plant has everywhere else on the island.
import fs from "node:fs";
import sharp from "sharp";
const meta = JSON.parse(fs.readFileSync("world.meta.json", "utf8"));
const { data, info } = await sharp("../Assets/Terrain/height.png").raw().toBuffer({ resolveWithObject: true });
const N = info.width, S = meta.size, [e0, e1] = meta.elevation;
const g = (a, b) => { const o = (Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))) * info.channels; return e0 + ((data[o] * 256 + data[o + 1]) / 65535) * (e1 - e0); };
const h = (x, z) => { const fx = (x / S + 0.5) * (N - 1), fz = (0.5 - z / S) * (N - 1), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz; };
const f = meta.pois.fort, R = 215;
const names = fs.readdirSync("../Assets/Scatter").filter(n => n.endsWith(".bin") && !/2\.bin$/.test(n)).map(n => n.slice(0, -4));
for (const name of names) {
	const file = `../Assets/Scatter/${name}.bin`, raw = fs.readFileSync(file), all = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
	const far = []; for (let i = 0; i < all.length; i += 5) { const d = Math.hypot(all[i] - f.x, all[i + 2] - f.z); if (d > 450 && d < 1200) far.push(all[i + 1] - h(all[i], all[i + 2])); }
	if (far.length < 10) continue;
	far.sort((a, b) => a - b); const off = far[Math.floor(far.length / 2)];
	let moved = 0, worst = 0;
	for (let i = 0; i < all.length; i += 5) { if (Math.hypot(all[i] - f.x, all[i + 2] - f.z) > R) continue; const y = h(all[i], all[i + 2]) + off; worst = Math.max(worst, Math.abs(all[i + 1] - y)); if (Math.abs(all[i + 1] - y) > 0.05) { all[i + 1] = y; moved++; } }
	if (moved) { fs.writeFileSync(file, Buffer.from(all.buffer)); console.log(name, "moved", moved, "worst correction", worst.toFixed(2), "m (usual height above ground", off.toFixed(2) + ")"); }
}
