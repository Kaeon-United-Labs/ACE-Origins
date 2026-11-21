import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
const io = new NodeIO();
const f = process.argv[2];
const doc = await io.read(`../../Scratch/City-before/${f}.glb`);
const tex = doc.getRoot().listTextures()[0];
const img = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => { const x = Math.min(img.info.width - 1, Math.max(0, Math.floor(u * img.info.width))), y = Math.min(img.info.height - 1, Math.max(0, Math.floor(v * img.info.height))); const o = (y * img.info.width + x) * 3; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };
const planes = [];
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
	const P = p.getAttribute("POSITION").getArray(), UV = p.getAttribute("TEXCOORD_0").getArray(), I = p.getIndices().getArray();
	for (let t = 0; t < I.length; t += 3) {
		const a = I[t], b = I[t + 1], c = I[t + 2];
		const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], C = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
		const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
		let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n); if (l < 1e-9) continue; n = n.map(x => x / l);
		const col = px(UV[a * 2], UV[a * 2 + 1]);
		planes.push({ n, d: n[0] * A[0] + n[1] * A[1] + n[2] * A[2], col, c: [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], area: l / 2 });
	}
}
const green = planes.filter(p => p.col[1] > p.col[0] + 30 && p.col[1] > p.col[2] + 10);
console.log(f, "triangles", planes.length, "green", green.length);
let overlaps = 0, minGap = 1;
for (const g of green) for (const o of planes) { if (o === g) continue; const dot = g.n[0] * o.n[0] + g.n[1] * o.n[1] + g.n[2] * o.n[2]; if (Math.abs(dot) > 0.999) { const gap = Math.abs(o.n[0] * g.c[0] + o.n[1] * g.c[1] + o.n[2] * g.c[2] - o.d); if (gap < 0.001 && Math.hypot(o.c[0] - g.c[0], o.c[1] - g.c[1], o.c[2] - g.c[2]) < 0.3) { overlaps++; minGap = Math.min(minGap, gap); } } }
console.log("green triangles with another coplanar-ish triangle near (<0.02 units):", overlaps, "min gap", minGap.toFixed(5), "e.g. green colour", green[0] && green[0].col, "normal", green[0] && green[0].n.map(x => +x.toFixed(2)));
