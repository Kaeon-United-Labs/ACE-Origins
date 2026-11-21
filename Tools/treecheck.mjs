import fs from "node:fs";
import sharp from "sharp";
const meta = JSON.parse(fs.readFileSync("world.meta.json", "utf8"));
const { data, info } = await sharp("../Assets/Terrain/height.png").raw().toBuffer({ resolveWithObject: true });
const N = info.width, S = meta.size, [e0, e1] = meta.elevation;
const h = (x, z) => { // bilinear
	const fx = (x / S + 0.5) * (N - 1), fz = (0.5 - z / S) * (N - 1), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
	const g = (a, b) => { const o = (b * N + a) * info.channels; return e0 + ((data[o] * 256 + data[o + 1]) / 65535) * (e1 - e0); };
	return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
};
const f = meta.pois.fort;
for (const name of ["spruce", "fir", "pine", "broad_a", "boulder_b"]) {
	const raw = fs.readFileSync(`../Assets/Scatter/${name}.bin`); const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
	let n = 0, worst = 0, sum = 0, wx = 0;
	for (let i = 0; i < all.length; i += 5) { const x = all[i], y = all[i + 1], z = all[i + 2]; if (Math.hypot(x - f.x, z - f.z) > 220) continue; const d = y - h(x, z); n++; sum += d; if (Math.abs(d) > Math.abs(worst)) { worst = d; wx = Math.hypot(x - f.x, z - f.z); } }
	console.log(name, "within 220 m of the fort:", n, "mean (tree base - ground) m:", (sum / n).toFixed(2), "worst:", worst.toFixed(2), "at", wx.toFixed(0), "m");
}
