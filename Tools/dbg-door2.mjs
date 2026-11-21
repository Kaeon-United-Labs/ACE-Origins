import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
const io = new NodeIO();
const [f, x0, x1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const doc = await io.read(`../Assets/Models/City/${f}.glb`);
const tex = doc.getRoot().listTextures()[0];
const img = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (u, v) => { const x = Math.min(img.info.width - 1, Math.max(0, Math.floor(u * img.info.width))), y = Math.min(img.info.height - 1, Math.max(0, Math.floor(v * img.info.height))); const o = (y * img.info.width + x) * 3; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
	const P = p.getAttribute("POSITION").getArray(), UV = p.getAttribute("TEXCOORD_0").getArray(), I = p.getIndices().getArray();
	const rows = [];
	for (let t = 0; t < I.length; t += 3) {
		const v = [I[t], I[t + 1], I[t + 2]], pt = v.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
		const u = pt[1].map((x, k) => x - pt[0][k]), w = pt[2].map((x, k) => x - pt[0][k]);
		const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n);
		if (l < 1e-9 || n[2] / l < 0.9) continue;
		const c = pt[0].map((x, k) => (x + pt[1][k] + pt[2][k]) / 3);
		if (c[1] > 0.22 || c[0] < x0 || c[0] > x1) continue;
		rows.push(`x ${c[0].toFixed(2)} y ${c[1].toFixed(2)} z ${c[2].toFixed(2)} area ${(l / 2).toFixed(4)} col ${px(UV[v[0] * 2], UV[v[0] * 2 + 1]).join(",")}`);
	}
	console.log(rows.join("\n"));
}
