// The second island (a flat island of modern buildings, 20 km east of the first) and the floating one between them.
//   node generate-island2.mjs
// Writes Assets/Terrain/height2.png, splat2.png, forest2.png; Assets/Scatter/*2.bin; Assets/UI/map.png (the whole region) and Tools/world2.meta.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "Assets");
const mk = d => (fs.mkdirSync(d, { recursive: true }), d);
const terrainDir = mk(path.join(assets, "Terrain")), scatterDir = mk(path.join(assets, "Scatter")), uiDir = mk(path.join(assets, "UI"));

const SIZE = 4096, N = 1025, CELL = SIZE / (N - 1), SPLAT = 1024, ELEV = [-80, 1500];
const CX = 20480, CZ = 0;               // where the island is in the world (the map is centred there)
const Y0 = 14;                           // the town's ground
const FLOAT = { x: 10240, z: 0, top: 132 };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeSimplex(seed) {
	const r = rng(seed), perm = new Uint8Array(512), p = Array.from({ length: 256 }, (_, i) => i);
	for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
	for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
	const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]], F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
	const gi = (a, b) => perm[a + perm[b]] & 7;
	return (x, y) => {
		const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
		const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1, x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255;
		const c = (gx, gy, dx, dy) => { let t = 0.5 - dx * dx - dy * dy; if (t < 0) return 0; t *= t; return t * t * (G[gi(gx, gy)][0] * dx + G[gi(gx, gy)][1] * dy); };
		return 70 * (c(ii, jj, x0, y0) + c(ii + i1, jj + j1, x1, y1) + c(ii + 1, jj + 1, x2, y2));
	};
}
const nA = makeSimplex(901), nB = makeSimplex(902), nC = makeSimplex(903);
const fbm = (n, x, y, o) => { let a = 1, f = 1, s = 0, m = 0; for (let k = 0; k < o; k++) { s += a * n(x * f, y * f); m += a; a *= 0.5; f *= 2; } return s / m; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- height: a broad flat island, with the town's ground dead level
const heights = new Float32Array(N * N);
const hAt = (x, z) => {                              // x, z measured from the island's centre
	const d = Math.hypot(x, z) + 140 * fbm(nA, x * 0.0016 + 3, z * 0.0016 - 5, 3);
	const land = 1 - smooth(1250, 1900, d);
	const shore = mix(-72, 3.5, smooth(0.0, 0.32, land));
	const hills = (fbm(nB, x * 0.004 + 9, z * 0.004 + 2, 4) * 0.5 + 0.5) * 20 + fbm(nC, x * 0.02, z * 0.02, 3) * 2.0;
	const rise = smooth(0.3, 0.62, land) * (9 + hills);
	return mix(Y0 - 0.4, shore + rise, smooth(780, 1250, d) * smooth(0.0, 0.5, land) + (1 - smooth(0.0, 0.5, land)));
};
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
	const x = (i / (N - 1) - 0.5) * SIZE, z = (0.5 - j / (N - 1)) * SIZE;
	let e = hAt(x, z);
	const edge = Math.min(i, j, N - 1 - i, N - 1 - j);
	if (edge < 30) e = mix(-72, e, smooth(0, 30, edge));
	heights[j * N + i] = e;
}
// a gentle blur everywhere but the flat middle
{
	const tmp = new Float32Array(N * N);
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		let s = 0, c = 0;
		for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; s += heights[jj * N + ii]; c++; }
		tmp[j * N + i] = s / c;
	}
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		const x = (i / (N - 1) - 0.5) * SIZE, z = (0.5 - j / (N - 1)) * SIZE;
		if (Math.hypot(x, z) > 760) heights[j * N + i] = tmp[j * N + i]; else heights[j * N + i] = Y0 - 0.4;
	}
}
const at = (i, j) => heights[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
const hWorld = (x, z) => { const fi = (x / SIZE + 0.5) * (N - 1), fj = (0.5 - z / SIZE) * (N - 1), i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j; return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz; };
const slopeAt = (i, j) => Math.hypot((at(i + 1, j) - at(i - 1, j)) / (2 * CELL), (at(i, j + 1) - at(i, j - 1)) / (2 * CELL));
const slopeWorld = (x, z) => slopeAt(Math.round((x / SIZE + 0.5) * (N - 1)), Math.round((0.5 - z / SIZE) * (N - 1)));

{
	const buf = Buffer.alloc(N * N * 3);
	for (let k = 0; k < N * N; k++) { const q = Math.round(Math.min(1, Math.max(0, (heights[k] - ELEV[0]) / (ELEV[1] - ELEV[0]))) * 65535); buf[k * 3] = q >> 8; buf[k * 3 + 1] = q & 255; }
	await sharp(buf, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "height2.png"));
	console.log("height2.png");
}

// ---------------------------------------------------------------- splat (rock, sand, snow, dirt) and where woods may be
const forest = new Float32Array(SPLAT * SPLAT);
{
	const buf = Buffer.alloc(SPLAT * SPLAT * 4);
	for (let j = 0; j < SPLAT; j++) for (let i = 0; i < SPLAT; i++) {
		const hi = Math.round(i / (SPLAT - 1) * (N - 1)), hj = Math.round(j / (SPLAT - 1) * (N - 1));
		const e = at(hi, hj), s = slopeAt(hi, hj), x = (i / (SPLAT - 1) - 0.5) * SIZE, z = (0.5 - j / (SPLAT - 1)) * SIZE;
		const n2 = fbm(nB, x * 0.012, z * 0.012, 3);
		const sand = smooth(5 + n2 * 2, 0.5, e) * (1 - smooth(0.3, 0.55, s));
		const dirt = Math.min(1, smooth(0.6, 0.9, n2 * 0.5 + 0.5) * 0.3 + smooth(0.2, 0.4, s) * 0.4) * (1 - sand);
		buf.set([Math.round(Math.min(1, smooth(0.5, 0.8, s)) * 255), Math.round(sand * 255), 0, Math.round(dirt * 255)], (j * SPLAT + i) * 4);
		forest[j * SPLAT + i] = (1 - smooth(0.25, 0.5, s)) * smooth(9, 14, e) * smooth(640, 900, Math.hypot(x, z)) * smooth(-0.4, 0.1, fbm(nC, x * 0.003 + 4, z * 0.003, 3));
	}
	await sharp(buf, { raw: { width: SPLAT, height: SPLAT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "splat2.png"));
	const f = Buffer.alloc(SPLAT * SPLAT); for (let k = 0; k < f.length; k++) f[k] = Math.round(Math.min(1, forest[k] * 1.6) * 255);
	await sharp(f, { raw: { width: SPLAT, height: SPLAT, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "forest2.png"));
	console.log("splat2.png forest2.png");
}
const forestAt = (x, z) => forest[Math.min(SPLAT - 1, Math.max(0, Math.round((0.5 - z / SIZE) * (SPLAT - 1)))) * SPLAT + Math.min(SPLAT - 1, Math.max(0, Math.round((x / SIZE + 0.5) * (SPLAT - 1))))];

// ---------------------------------------------------------------- the town
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const info = {};
async function measure(file) {
	if (info[file]) return info[file];
	const doc = await io.read(path.join(assets, "Models", "City", file));
	let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const pts = [];
	const tris = [];
	for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
		const a = prim.getAttribute("POSITION").getArray();
		const ix = prim.getIndices() ? prim.getIndices().getArray() : null;
		if (ix) for (let t = 0; t < ix.length; t += 3) tris.push([ix[t], ix[t + 1], ix[t + 2]].map(i => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]));
		for (let i = 0; i < a.length; i += 3) { for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], a[i + c]); mx[c] = Math.max(mx[c], a[i + c]); } pts.push(a[i], a[i + 1], a[i + 2]); }
	}
	// the front is +Z; the doorstep is the furthest forward the ground floor goes near the middle
	const w = mx[0] - mn[0]; let front = -1e9;
	for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < 0.18 && Math.abs(pts[i] - (mn[0] + mx[0]) / 2) < w * 0.18) front = Math.max(front, pts[i + 2]);
	if (front < -1e8) front = mx[2];
	// Where the model has a door of its own, put ours on it. The door leaf is a pair of large faces looking forward, set a little behind the wall (a few centimetres), that reach the floor:
	// windows are set back too, but start higher. Find the wall's depth, then the recessed faces that touch the floor, group them by x, and take the group about a door wide.
	let cx = (mn[0] + mx[0]) / 2, found = false, dw = 0.2, dh = 0.2;
	{
		const info2 = tris.map(t => { const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]]; const nz = u[0] * v[1] - u[1] * v[0], l = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz); return { t, nz: l > 1e-9 ? nz / l : 0, area: l / 2, z: (t[0][2] + t[1][2] + t[2][2]) / 3, x0: Math.min(t[0][0], t[1][0], t[2][0]), x1: Math.max(t[0][0], t[1][0], t[2][0]), y0: Math.min(t[0][1], t[1][1], t[2][1]), y1: Math.max(t[0][1], t[1][1], t[2][1]) }; }).filter(o => o.nz > 0.95);
		const D = mx[2] - mn[2];
		const walls = info2.filter(o => o.area > 0.002 && o.z > mx[2] - 0.2 * D && o.y1 < 0.5).map(o => o.z).sort((a, b) => a - b);
		const wall = walls.length ? walls[Math.floor(walls.length * 0.75)] : mx[2];
		const seeds = info2.filter(o => o.area > 0.003 && o.y0 < 0.03 && o.z < wall - 0.008 && o.z > wall - 0.08 && o.x1 - o.x0 < 0.4).sort((a, b) => a.x0 - b.x0);
		const groups = []; let g = null;
		for (const o of seeds) { if (g && o.x0 - g.x1 < 0.05) { g.x1 = Math.max(g.x1, o.x1); g.y1 = Math.max(g.y1, o.y1); } else { g = { x0: o.x0, x1: o.x1, y1: o.y1 }; groups.push(g); } }
		const doors = groups.filter(q => q.x1 - q.x0 > 0.1 && q.x1 - q.x0 < 0.34 && q.y1 > 0.14);
		if (doors.length) { const q = doors.sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx))[0]; cx = (q.x0 + q.x1) / 2; dw = q.x1 - q.x0; dh = q.y1; found = true; }
	}
	return info[file] = { min: mn, max: mx, front, cx, ownDoor: found, dw, dh };
}

const roads = [   // [centre x, centre z, length along x, length along z], measured from the island's centre
	[0, 0, 1000, 16], [0, 0, 16, 700], [0, 230, 760, 14], [-330, 0, 16, 500], [330, 0, 16, 500], [0, -120, 760, 14], [0, 120, 760, 14]
];
const buildings = [];
const used = new Set();
const COMM = ["c_building-a", "c_building-b", "c_building-c", "c_building-d", "c_building-e", "c_building-f", "c_building-g", "c_building-h", "c_building-i", "c_building-j", "c_building-k", "c_building-l", "c_building-m", "c_building-n"];
const TALL = ["c_building-skyscraper-a", "c_building-skyscraper-b", "c_building-skyscraper-c", "c_building-skyscraper-d", "c_building-skyscraper-e"];
const HOUSE = "abcdefghijklmnopqrstu".split("").map(c => "s_building-type-" + c);
const rr = rng(4242);
const pickFrom = list => list[Math.floor(rr() * list.length)];
const MAXSLOT = 6;

async function place(file, x, z, facing, scale, door) {
	const m = await measure(file + ".glb");
	buildings.push({ file, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: facing, scale, front: m.front, cx: m.cx, dw: m.dw, dh: m.dh, depth: (m.max[2] - m.min[2]) * scale, width: (m.max[0] - m.min[0]) * scale, height: (m.max[1] - m.min[1]) * scale, door: m.ownDoor ? (door || null) : null });
}
// A row of buildings beside a road. `side` is -1 (north of it, facing south) or 1; each takes the room its model needs.
async function row(roadZ, from, to, side, kind, scaleOf, doors, skip = 0.1) {
	let x = from, k = 0;
	while (x < to) {
		const file = kind === "house" ? pickFrom(HOUSE) : (rr() < 0.18 ? pickFrom(TALL) : pickFrom(COMM));
		const m = await measure(file + ".glb"), sc = scaleOf(file);
		const w = (m.max[0] - m.min[0]) * sc, d = (m.max[2] - m.min[2]) * sc;
		if (rr() < skip) { x += 14; continue; }
		const hitRoad = [-330, 0, 330].find(c => x + w > c - 18 && x < c + 18 && Math.abs(roadZ) < 340);
		if (hitRoad !== undefined) { x = hitRoad + 18; continue; }
		const gap = 10 + (rr() < 0.3 ? 12 : 0);
		const cx = x + w / 2, z = roadZ + side * (10 + (kind === "house" ? 12 : 5) + d / 2);
		// facing: a building's front is its local +Z, so on the north side (side = -1) it faces +Z (yaw 0), on the south it is turned round
		const yaw = side < 0 ? 0 : Math.PI;
		await place(file, CX + cx, CZ + z, yaw, sc, (doors && doors(k, file)) || null);
		x += w + gap; k++;
	}
}
const commScale = f => /skyscraper/.test(f) ? 11 : 12;
// enterable ones: every third along the main street, alternating how you get in
const mainDoors = (k, file) => (k % 3 === 1 ? { type: k % 2 ? "door" : "portal", room: ["shop", "office", "home"][k % 3 === 1 ? Math.floor(k / 3) % 3 : 0] } : null);
await row(0, -480, 470, -1, "comm", commScale, mainDoors);
await row(0, -480, 470, 1, "comm", commScale, (k, f) => (k % 4 === 2 ? { type: k % 2 ? "portal" : "door", room: ["home", "shop", "office"][k % 3] } : null));
await row(230, -330, 330, -1, "house", () => 9, (k) => (k % 3 === 0 ? { type: k % 2 ? "portal" : "door", room: "home" } : null));
await row(230, -330, 330, 1, "house", () => 9, (k) => (k % 3 === 1 ? { type: k % 2 ? "door" : "portal", room: "home" } : null));
await row(-120, -320, 320, -1, "comm", commScale, (k) => (k % 4 === 1 ? { type: k % 2 ? "door" : "portal", room: ["office", "home", "shop"][k % 3] } : null), 0.3);
await row(-120, -320, 320, 1, "comm", commScale, (k) => (k % 4 === 3 ? { type: k % 2 ? "portal" : "door", room: ["shop", "office", "home"][k % 3] } : null), 0.3);
await row(120, -320, 320, -1, "comm", commScale, null, 0.3);
await row(120, -320, 320, 1, "house", () => 9, (k) => (k % 4 === 0 ? { type: k % 2 ? "door" : "portal", room: "home" } : null), 0.25);
// keep every building off each other
const overlaps = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < (a.width + b.width) / 2 * 0.9 + 4 && Math.hypot(a.x - b.x, a.z - b.z) < (a.depth + b.depth) / 2 + 22 && Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 3 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + 3;
const cross = [-330, 0, 330].map(x => CX + x);
const kept = [];
for (const b of buildings) {
	if (kept.some(k => overlaps(b, k))) continue;
	kept.push(b);
}
console.log("buildings", kept.length, "enterable", kept.filter(b => b.door).length);

// a few cars of trees along the streets would be nice; trees go in the open ground instead
const writeTable = (name, recs) => { const a = new Float32Array(recs.length * 5); recs.forEach((r, i) => a.set(r, i * 5)); fs.writeFileSync(path.join(scatterDir, name + ".bin"), Buffer.from(a.buffer)); console.log("scatter", name, recs.length); };
{
	const r = rng(777);
	const broadA = [], broadB = [], shrub = [], bush = [], fern = [], flowerA = [], flowerB = [];
	const inTown = (x, z) => Math.hypot(x, z) < 640 && (kept.some(b => Math.abs(b.x - CX - x) < b.width / 2 + 8 && Math.abs(b.z - CZ - z) < b.depth / 2 + 8) || roads.some(([cx, cz, lx, lz]) => Math.abs(x - cx) < lx / 2 + 6 && Math.abs(z - cz) < lz / 2 + 6));
	for (let gz = -SIZE / 2 + 40; gz < SIZE / 2 - 40; gz += 5) for (let gx = -SIZE / 2 + 40; gx < SIZE / 2 - 40; gx += 5) {
		const x = gx + r() * 5, z = gz + r() * 5, y = hWorld(x, z);
		if (y < 5 || slopeWorld(x, z) > 0.35 || inTown(x, z)) continue;
		const f = forestAt(x, z), inside = Math.hypot(x, z) < 640, sc = 0.8 + r() * 0.6, yaw = r() * 6.28;
		const w = CX + x;
		if (r() < f * 0.035) (r() < 0.5 ? broadA : broadB).push([w, y - 0.2, CZ + z, yaw, 0.85 + r() * 0.5]);
		else if (inside && r() < 0.0012) (r() < 0.5 ? broadA : broadB).push([w, y - 0.2, CZ + z, yaw, 0.8 + r() * 0.3]);   // a tree in the town's green gaps
		if (r() < 0.004 * (0.3 + f)) (r() < 0.5 ? shrub : bush).push([w, y - 0.05, CZ + z, yaw, sc]);
		if (f > 0.15 && r() < f * 0.05) fern.push([w, y - 0.05, CZ + z, yaw, sc]);
		if (!inside || r() < 0.3) { if (r() < 0.02) flowerA.push([w, y - 0.02, CZ + z, yaw, sc * 1.2]); else if (r() < 0.006) flowerB.push([w, y - 0.02, CZ + z, yaw, sc]); }
	}
	writeTable("broad_a2", broadA); writeTable("broad_b2", broadB); writeTable("shrub2", shrub); writeTable("bush2", bush); writeTable("fern2", fern); writeTable("flower_a2", flowerA); writeTable("flower_b2", flowerB);
}

// ---------------------------------------------------------------- the floating island: a flat top, a hanging rocky underside; a single JSON of geometry for each
const floating = (() => {
	const R = 78, rings = 22, segs = 56, depth = 70;
	const noise = makeSimplex(31);
	const rim = a => 1 + 0.12 * noise(Math.cos(a) * 1.3, Math.sin(a) * 1.3) + 0.06 * noise(Math.cos(a) * 4, Math.sin(a) * 4);
	const top = { positions: [], indices: [], uvs: [] }, under = { positions: [], indices: [], uvs: [] };
	// the top: level to 40 m from the middle, easing up to a low lip at the rim
	for (let r = 0; r <= rings; r++) {
		const t = r / rings;
		for (let s = 0; s <= segs; s++) {
			const a = s / segs * Math.PI * 2, rad = R * rim(a) * t;
			const lip = smooth(0.55, 1.0, t) * 1.2 + (t > 0.55 ? 0.35 * noise(Math.cos(a) * 3 + t, Math.sin(a) * 3) * smooth(0.55, 0.95, t) : 0);
			const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
			top.positions.push(+x.toFixed(2), +lip.toFixed(2), +z.toFixed(2)); top.uvs.push(+(x / 12).toFixed(3), +(z / 12).toFixed(3));
		}
	}
	for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1; top.indices.push(a, c, b, b, c, d); }
	// the underside: the rim turned down into a point, ragged
	for (let r = 0; r <= rings; r++) {
		const t = r / rings;
		for (let s = 0; s <= segs; s++) {
			const a = s / segs * Math.PI * 2, base = R * rim(a);
			// the first ring is exactly the top's last: the same radius and the same height, so the two meshes share their edge and there is no gap to slip through
			const k = Math.min(1, t * 3);
			const rad = base * (1 - Math.pow(t, 0.8)) * (1 + 0.1 * k * noise(Math.cos(a) * 3, Math.sin(a) * 3 + t * 2));
			const lipEdge = 1.2 + 0.35 * noise(Math.cos(a) * 3 + 1, Math.sin(a) * 3);
			const y = lipEdge * (1 - k) - depth * Math.pow(t, 0.9) * (1 + 0.2 * k * noise(Math.cos(a) * 2 + 9, Math.sin(a) * 2 + t));
			const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
			under.positions.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)); under.uvs.push(+(x / 14 + t).toFixed(3), +(z / 14).toFixed(3));
		}
	}
	for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1; under.indices.push(a, b, c, b, d, c); }
	return { top, under, R, depth };
})();

// ---------------------------------------------------------------- the map of the whole region, drawn from the height data
{
	const A = await sharp(path.join(terrainDir, "height.png")).raw().toBuffer({ resolveWithObject: true });
	const elevA = (x, z) => {
		const i = Math.round((x / 8192 + 0.5) * (A.info.width - 1)), j = Math.round((0.5 - z / 8192) * (A.info.width - 1));
		if (i < 0 || j < 0 || i >= A.info.width || j >= A.info.width) return -100;
		const o = (j * A.info.width + i) * A.info.channels; return ELEV[0] + ((A.data[o] * 256 + A.data[o + 1]) / 65535) * (ELEV[1] - ELEV[0]);
	};
	const X0 = -4400, X1 = 22900, Z0 = -6500, Z1 = 6500, MW = 1536, MH = Math.round(MW * (Z1 - Z0) / (X1 - X0));
	const buf = Buffer.alloc(MW * MH * 3);
	for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
		const x = X0 + (i / (MW - 1)) * (X1 - X0), z = Z1 - (j / (MH - 1)) * (Z1 - Z0);
		let e = elevA(x, z);
		if (Math.abs(x - CX) < SIZE / 2 && Math.abs(z - CZ) < SIZE / 2) e = hWorld(x - CX, z - CZ);
		let c;
		if (e < 0) { const d = Math.min(1, -e / 60); c = [38 - 14 * d, 92 - 30 * d, 140 - 30 * d]; }
		else if (e < 5) c = [222, 205, 150];
		else if (e < 520) c = [104, 150, 78];
		else if (e < 760) c = [138, 130, 118];
		else c = [236, 238, 242];
		buf.set(c, (j * MW + i) * 3);
	}
	// the picture itself is drawn by generate-map.mjs; only its extent is decided here

	var map = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
}

const fh = await measure("s_building-type-k.glb");
const house = { file: "s_building-type-k", scale: 8, front: fh.front, cx: fh.cx, dw: fh.dw, dh: fh.dh, own: fh.ownDoor, width: (fh.max[0] - fh.min[0]) * 8, depth: (fh.max[2] - fh.min[2]) * 8 };
console.log("own doors:", Object.entries(info).map(([k, v]) => k.replace(".glb", "") + (v.ownDoor ? ":" + (v.cx - (v.min[0] + v.max[0]) / 2).toFixed(2) : ":-")).join(" "));
const meta2 = { size: SIZE, resolution: N, center: [CX, CZ], elevation: ELEV, y0: Y0, roads, buildings: kept, floating: { house, x: FLOAT.x, z: FLOAT.z, top: FLOAT.top, R: floating.R, depth: floating.depth, geometry: { top: floating.top, under: floating.under } }, map };
fs.writeFileSync(path.join(here, "world2.meta.json"), JSON.stringify(meta2));
console.log("world2.meta.json", Math.round(JSON.stringify(meta2).length / 1024), "KB");
