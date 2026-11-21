import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const f = process.argv[2];
const doc = await io.read(`../Assets/Models/City/${f}.glb`);
const pts = [];
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute("POSITION").getArray(); for (let i = 0; i < a.length; i += 3) pts.push([a[i], a[i + 1], a[i + 2]]); }
const xs = pts.map(p => p[0]), mn = Math.min(...xs), mx = Math.max(...xs), maxz = Math.max(...pts.map(p => p[2]));
console.log("x", mn.toFixed(2), mx.toFixed(2), "maxz", maxz.toFixed(3), "ymax", Math.max(...pts.map(p => p[1])).toFixed(2));
for (const [y0, y1] of [[0.0, 0.04], [0.04, 0.07], [0.07, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, 0.25]]) {
	const bins = {};
	for (const p of pts) if (p[1] >= y0 && p[1] < y1) { const b = Math.floor((p[0] - mn) / 0.05); bins[b] = Math.max(bins[b] ?? -9, p[2]); }
	console.log(`y ${y0}-${y1}:`, Object.keys(bins).sort((a, b) => a - b).map(b => (+b * 0.05 + mn).toFixed(2) + "=" + bins[b].toFixed(2)).join(" "));
}
