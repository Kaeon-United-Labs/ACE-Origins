// Mean colour of the same patch of forest drawn with each tree model (the page's ?detail= scales their ranges).
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const thumbs = path.join(here, "..", "..", "Scratch", "thumbs");
const [x, y, z, yaw, pitch] = process.argv.slice(2).length ? process.argv.slice(2) : [900, 420, 300, 1.9, -0.75];
const mean = async f => {
	const { data, info } = await sharp(path.join(thumbs, f + ".png")).extract({ left: 440, top: 220, width: 400, height: 220 }).raw().toBuffer({ resolveWithObject: true });
	const m = [0, 0, 0]; const n = data.length / info.channels;
	for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) m[c] += Math.pow(data[i + c] / 255, 2.2);
	return m.map(v => v / n);
};
const out = {};
for (const [name, q] of [["lod0", "?detail=6"], ["lod1", "?detail=1"], ["lod2", "?detail=0.35"]]) {
	spawnSync("node", ["snap.mjs", "cal-" + name, x, y, z, yaw, pitch, "1", q], { cwd: here, stdio: "ignore" });
	out[name] = await mean("cal-" + name);
	console.log(name, "linear mean", out[name].map(v => v.toFixed(4)).join(" "), "ratio to lod0", out[name].map((v, i) => (v / out.lod0[i]).toFixed(2)).join(" "));
}
