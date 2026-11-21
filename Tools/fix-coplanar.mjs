// Some of the city kit's models have faces laid exactly over other faces (the green panels on the towers, for one): two surfaces at one depth, which no depth buffer can tell apart, so
// they flicker as the view changes. For every triangle whose centre lies inside a larger (or earlier) triangle in the same plane, lift it a few centimetres off the wall, on its own vertices.
// Safe to run twice: after the first run no pair is at the same depth.
//   node fix-coplanar.mjs [files...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "Assets", "Models", "City");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const LIFT = 0.004, SAME = 0.0008;
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith(".glb"));
for (const f of files) {
	const doc = await io.read(path.join(dir, f));
	let lifted = 0, total = 0;
	for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
		const P = prim.getAttribute("POSITION").getArray(), I = prim.getIndices() ? prim.getIndices().getArray() : null;
		const N = prim.getAttribute("NORMAL") ? prim.getAttribute("NORMAL").getArray() : null, UV = prim.getAttribute("TEXCOORD_0") ? prim.getAttribute("TEXCOORD_0").getArray() : null;
		if (!I) continue;
		const T = [];
		for (let t = 0; t < I.length; t += 3) {
			const v = [I[t], I[t + 1], I[t + 2]], pt = v.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
			const u = pt[1].map((x, k) => x - pt[0][k]), w = pt[2].map((x, k) => x - pt[0][k]);
			let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n);
			if (l < 1e-10) { T.push(null); continue; }
			n = n.map(x => x / l);
			T.push({ v, pt, n, d: n[0] * pt[0][0] + n[1] * pt[0][1] + n[2] * pt[0][2], area: l / 2, c: pt[0].map((x, k) => (x + pt[1][k] + pt[2][k]) / 3), lift: false });
		}
		const inside = (p, a) => { // p in triangle a's plane
			const [A, B, C] = a.pt, v0 = C.map((x, k) => x - A[k]), v1 = B.map((x, k) => x - A[k]), v2 = p.map((x, k) => x - A[k]);
			const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2], d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2], d02 = v0[0] * v2[0] + v0[1] * v2[1] + v0[2] * v2[2], d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2], d12 = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
			const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-14) return false;
			const uu = (d11 * d02 - d01 * d12) / den, vv = (d00 * d12 - d01 * d02) / den; return uu >= -1e-4 && vv >= -1e-4 && uu + vv <= 1 + 1e-4;
		};
		for (let i = 0; i < T.length; i++) {
			const a = T[i]; if (!a) continue; total++;
			for (let j = 0; j < T.length; j++) {
				const b = T[j]; if (!b || i === j) continue;
				const dot = a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2];
				if (dot < 0.9999) continue;                                  // the same way round only: a back-to-back pair is a thin wall, not a clash
				if (Math.abs(b.n[0] * a.c[0] + b.n[1] * a.c[1] + b.n[2] * a.c[2] - b.d) > SAME) continue;
				if (!inside(a.c, b)) continue;
				if (a.area < b.area - 1e-9 || (Math.abs(a.area - b.area) <= 1e-9 && i > j)) { a.lift = true; break; }
			}
		}
		const lift = T.filter(t => t && t.lift);
		if (!lift.length) continue;
		lifted += lift.length;
		// rebuild unwelded: every triangle its own three vertices, the lifted ones moved along their normals
		const attrs = prim.listSemantics().map(s => ({ s, a: prim.getAttribute(s) }));
		const out = Object.fromEntries(attrs.map(({ s, a }) => [s, []]));
		for (let t = 0; t < T.length; t++) for (let k = 0; k < 3; k++) {
			const vi = I[t * 3 + k];
			for (const { s, a } of attrs) {
				const size = a.getElementSize(), src = a.getArray();
				const vals = Array.from(src.subarray(vi * size, vi * size + size));
				if (s === "POSITION" && T[t] && T[t].lift) for (let c = 0; c < 3; c++) vals[c] += T[t].n[c] * LIFT;
				out[s].push(...vals);
			}
		}
		for (const { s, a } of attrs) { const A = a.clone(); A.setArray(new Float32Array(out[s])); prim.setAttribute(s, A); }
		const idx = prim.getIndices().clone(); idx.setArray(new Uint32Array(T.length * 3).map((_, k) => k)); prim.setIndices(idx);
	}
	// The materials are double-sided, and many faces are laid back to back at one depth (the two sides of a panel on a tower): drawn from outside, both are seen, and they flicker.
	// The buildings are closed shells, so one side is enough.
	let flipped = 0;
	for (const m of doc.getRoot().listMaterials()) if (m.getDoubleSided()) { m.setDoubleSided(false); flipped++; }
	if (lifted || flipped) { await io.write(path.join(dir, f), doc); console.log(f, "lifted", lifted, "of", total, "triangles; single-sided:", flipped); }
}
