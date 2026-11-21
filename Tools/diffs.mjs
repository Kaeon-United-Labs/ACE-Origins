import fs from "node:fs";
import sharp from "sharp";
const prefix = process.argv[2];
const dir = "../../Scratch/cast";
const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix + "-")).sort();
const bufs = [];
for (const f of files) bufs.push(await sharp(`${dir}/${f}`).resize(200, 112).greyscale().raw().toBuffer());
const d = [];
for (let i = 1; i < bufs.length; i++) { let s = 0; for (let k = 0; k < bufs[i].length; k++) s += Math.abs(bufs[i][k] - bufs[i - 1][k]); d.push([i, s / bufs[i].length]); }
const vals = d.map(x => x[1]).sort((a, b) => a - b);
const med = vals[Math.floor(vals.length / 2)];
const spikes = d.filter(x => x[1] > med * 2.2);
console.log(prefix, "frames", files.length, "median", med.toFixed(2), "spikes>2.2x:", spikes.length, spikes.slice(0, 12).map(x => x[0] + ":" + x[1].toFixed(1)).join(" "));
