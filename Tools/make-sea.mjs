// Builds the things that live under the sea: kelp, three kinds of coral and three kinds of fish. Plain vertex-coloured
// glTF made here from a few lines of geometry, small enough to be instanced by the thousand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "Assets", "Models", "Sea");
fs.mkdirSync(out, { recursive: true });

function rng(seed) {
	let s = seed >>> 0;
	return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

class Mesh {
	constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
	vert(p, n, c) { this.pos.push(...p); this.nrm.push(...n); this.col.push(c[0], c[1], c[2], 1); return this.pos.length / 3 - 1; }
	tri(a, b, c) { this.idx.push(a, b, c); }
	// a ring of vertices is stitched to the next; rings are lists of vertex indices
	stitch(r0, r1, closed = true) {
		const n = r0.length;
		for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; this.tri(r0[i], r1[i], r0[j]); this.tri(r0[j], r1[i], r1[j]); }
	}
}

// a tapered tube from a to b, with a colour at each end
function tube(m, a, b, ra, rb, ca, cb, sides = 6) {
	const axis = norm(sub(b, a));
	const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
	const u = norm(cross(axis, helper)), v = cross(axis, u);
	const ring = (p, r, c) => Array.from({ length: sides }, (_, k) => {
		const t = (k / sides) * Math.PI * 2, n = add(mul(u, Math.cos(t)), mul(v, Math.sin(t)));
		return m.vert(add(p, mul(n, r)), n, c);
	});
	const r0 = ring(a, ra, ca), r1 = ring(b, rb, cb);
	m.stitch(r1, r0);        // outward-facing winding
	const cap = m.vert(b, axis, cb);
	for (let k = 0; k < sides; k++) m.tri(r1[k], r1[(k + 1) % sides], cap);
}

async function save(name, parts, { double = false, rough = 0.85 } = {}) {
	const doc = new Document(), buffer = doc.createBuffer();
	const scene = doc.createScene(name), node = doc.createNode(name), mesh = doc.createMesh(name);
	scene.addChild(node); node.setMesh(mesh);
	const mat = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(rough).setMetallicFactor(0).setDoubleSided(double);
	const prim = doc.createPrimitive();
	prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(parts.pos)).setBuffer(buffer));
	prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(parts.nrm)).setBuffer(buffer));
	prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(parts.col)).setBuffer(buffer));
	prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(parts.idx)).setBuffer(buffer));
	prim.setMaterial(mat);
	mesh.addPrimitive(prim);
	fs.writeFileSync(path.join(out, name + ".glb"), await new NodeIO().writeBinary(doc));
	console.log(name, parts.idx.length / 3, "tris");
}

// ---------------------------------------------------------------- kelp: long ribbons that sway as they rise

function kelp(lod) {
	const r = rng(51 + lod), m = new Mesh();
	const strands = lod === 0 ? 7 : 3, segs = lod === 0 ? 12 : 5;
	for (let s = 0; s < strands; s++) {
		const base = [(r() - 0.5) * 1.1, 0, (r() - 0.5) * 1.1], yaw = r() * Math.PI, h = 4.5 + r() * 4.5, lean = 0.5 + r() * 0.9;
		const phase = r() * 6.28, lx = Math.cos(yaw), lz = Math.sin(yaw), side = [-lz, 0, lx];
		const width = 0.32 + r() * 0.2;
		let left = [], right = [];
		const dark = [0.16, 0.3, 0.07], light = [0.62, 0.74, 0.18];
		for (let i = 0; i <= segs; i++) {
			const t = i / segs, y = h * t;
			const sway = Math.sin(t * 2.6 + phase) * 0.55 * t + lean * t * t;
			const c = add(base, [lx * sway, y, lz * sway]);
			const w = width * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) ) * (1 - t * 0.35);
			const col = lerp(dark, light, Math.pow(t, 0.8));
			const tw = Math.sin(t * 7 + phase) * 0.35;   // the ribbon twists a little
			const sd = [side[0] * Math.cos(tw), Math.sin(tw) * 0.5, side[2] * Math.cos(tw)];
			const n = norm(cross(sd, [lx * 0.2, 1, lz * 0.2]));
			left.push(m.vert(sub(c, mul(sd, w)), n, col));
			right.push(m.vert(add(c, mul(sd, w)), n, col));
		}
		for (let i = 0; i < segs; i++) { m.tri(left[i], right[i], left[i + 1]); m.tri(right[i], right[i + 1], left[i + 1]); }
		// a few floats near the top
		if (lod === 0 && r() < 0.6) {
			const t = 0.82, y = h * t, sway = Math.sin(t * 2.6 + phase) * 0.55 * t + lean * t * t;
			const c = add(base, [lx * sway, y, lz * sway]);
			for (let k = 0; k < 3; k++) {
				const a = k * 2.09, p = add(c, [Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18]);
				tube(m, add(p, [0, -0.08, 0]), add(p, [0, 0.16, 0]), 0.07, 0.04, [0.3, 0.3, 0.06], [0.52, 0.5, 0.14], 5);
			}
		}
	}
	return m;
}

// ---------------------------------------------------------------- coral

function staghorn(lod) {
	const r = rng(81 + lod), m = new Mesh();
	const base = [0.86, 0.34, 0.14], tip = [1.0, 0.64, 0.38];
	const grow = (p, d, len, rad, depth) => {
		const e = add(p, mul(d, len));
		tube(m, p, e, rad, rad * 0.62, lerp(base, tip, 1 - depth / 4 - 0.1), lerp(base, tip, 1.05 - depth / 4), lod === 0 ? 6 : 4);
		if (depth <= 0) return;
		const kids = depth > 2 ? 3 : 2;
		for (let k = 0; k < kids; k++) {
			const nd = norm(add(d, [(r() - 0.5) * 1.1, 0.35 + r() * 0.25, (r() - 0.5) * 1.1]));
			grow(e, nd, len * (0.72 + r() * 0.1), rad * 0.68, depth - 1);
		}
	};
	const stems = lod === 0 ? 5 : 3;
	for (let s = 0; s < stems; s++) {
		const a = (s / stems) * 6.28 + r(), tilt = 0.35 + r() * 0.35;
		grow([Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], norm([Math.cos(a) * tilt, 1, Math.sin(a) * tilt]), 0.42, 0.07, lod === 0 ? 3 : 2);
	}
	return m;
}

function dome(lod) {
	const r = rng(91 + lod), m = new Mesh();
	const rows = lod === 0 ? 14 : 7, cols = lod === 0 ? 20 : 10, R = 0.8, flat = 0.62;
	const rings = [];
	for (let i = 0; i <= rows; i++) {
		const phi = (i / rows) * Math.PI * 0.5, ring = [];
		for (let k = 0; k < cols; k++) {
			const th = (k / cols) * Math.PI * 2;
			// ridges and furrows wander over the surface, like the folds of a brain coral
			const ridge = Math.sin(th * 7 + Math.sin(phi * 9) * 2.2) * Math.sin(phi * 14 + th * 3) * 0.035;
			const rad = R * (1 + ridge) * (i === rows ? 0.9 : 1);
			const p = [Math.cos(th) * Math.sin(phi) * rad, Math.cos(phi) * rad * flat, Math.sin(th) * Math.sin(phi) * rad];
			const n = norm([p[0], p[1] / (flat * flat), p[2]]);
			const furrow = 0.5 + 0.5 * Math.sin(th * 7 + Math.sin(phi * 9) * 2.2);
			const col = lerp([0.62, 0.36, 0.44], [0.9, 0.62, 0.66], furrow * 0.85 + r() * 0.05);
			ring.push(m.vert(p, n, col));
		}
		rings.push(ring);
	}
	for (let i = 0; i < rows; i++) m.stitch(rings[i + 1], rings[i]);
	return m;
}

function tubes(lod) {
	const r = rng(101 + lod), m = new Mesh();
	const n = lod === 0 ? 11 : 6;
	for (let i = 0; i < n; i++) {
		const a = r() * 6.28, d = Math.sqrt(r()) * 0.55, h = 0.45 + r() * 0.9;
		const p = [Math.cos(a) * d, 0, Math.sin(a) * d], lean = [(r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25];
		const c0 = [0.34, 0.2, 0.52], c1 = [0.72, 0.45, 0.86];
		tube(m, p, add(p, mul(norm(lean), h)), 0.09 + r() * 0.04, 0.075 + r() * 0.03, c0, c1, lod === 0 ? 7 : 5);
	}
	return m;
}

// ---------------------------------------------------------------- fish: nose toward -Z, a metre long

function fish(variant) {
	const m = new Mesh(), sides = 10, rows = 12;
	const palette = {
		a: { back: [0.95, 0.42, 0.1], belly: [1.0, 0.82, 0.55], fin: [0.95, 0.3, 0.08], stripe: [1, 1, 1] },
		b: { back: [0.1, 0.32, 0.78], belly: [0.98, 0.86, 0.2], fin: [0.95, 0.8, 0.15], stripe: null },
		c: { back: [0.28, 0.34, 0.4], belly: [0.88, 0.92, 0.95], fin: [0.55, 0.62, 0.68], stripe: null }
	}[variant];
	const prof = t => ({ w: 0.2 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8) + 0.012, h: 0.3 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8) + 0.015 });
	const rings = [];
	for (let i = 0; i <= rows; i++) {
		const t = i / rows, z = -0.5 + t * 0.85, { w, h } = prof(t * 0.97 + 0.015), ring = [];
		for (let k = 0; k < sides; k++) {
			const a = (k / sides) * Math.PI * 2, up = Math.sin(a), side = Math.cos(a);
			const p = [side * w, up * h, z];
			const mixc = up > 0 ? 0.15 + 0.25 * (1 - up) : 0.5 + 0.5 * (-up);
			let col = lerp(palette.back, palette.belly, Math.min(1, Math.max(0, up > 0 ? (1 - up) * 0.55 : 0.55 + (-up) * 0.45)));
			if (palette.stripe && Math.abs(t - 0.42) < 0.05) col = palette.stripe;
			if (palette.stripe && Math.abs(t - 0.62) < 0.035) col = palette.stripe;
			ring.push(m.vert(p, norm([side / Math.max(w, 0.01), up / Math.max(h, 0.01), 0]), col));
		}
		rings.push(ring);
	}
	for (let i = 0; i < rows; i++) m.stitch(rings[i + 1], rings[i]);
	// caudal fin: a flared fan at the tail
	const f0 = [0, 0, 0.34], tail = [m.vert(f0, [1, 0, 0], palette.fin), m.vert([0, 0.26, 0.64], [1, 0, 0], palette.fin), m.vert([0, -0.26, 0.64], [1, 0, 0], palette.fin), m.vert([0, 0.0, 0.54], [1, 0, 0], palette.fin)];
	m.tri(tail[0], tail[1], tail[3]); m.tri(tail[0], tail[3], tail[2]); m.tri(tail[0], tail[3], tail[1]); m.tri(tail[0], tail[2], tail[3]);
	// dorsal and side fins
	const dz = [-0.18, 0.12], dorsal = [m.vert([0, 0.27, dz[0]], [1, 0, 0], palette.fin), m.vert([0, 0.27, dz[1]], [1, 0, 0], palette.fin), m.vert([0, 0.46, dz[1] + 0.04], [1, 0, 0], palette.fin)];
	m.tri(dorsal[0], dorsal[1], dorsal[2]); m.tri(dorsal[0], dorsal[2], dorsal[1]);
	for (const sd of [-1, 1]) {
		const q = [m.vert([sd * 0.15, -0.05, -0.12], [sd, 0, 0], palette.fin), m.vert([sd * 0.15, -0.05, 0.0], [sd, 0, 0], palette.fin), m.vert([sd * 0.3, -0.16, 0.04], [sd, 0, 0], palette.fin)];
		m.tri(q[0], q[1], q[2]); m.tri(q[0], q[2], q[1]);
	}
	return m;
}

await save("kelp_lod0", kelp(0), { double: true });
await save("kelp_lod1", kelp(1), { double: true });
await save("coral_a_lod0", staghorn(0)); await save("coral_a_lod1", staghorn(1));
await save("coral_b_lod0", dome(0)); await save("coral_b_lod1", dome(1));
await save("coral_c_lod0", tubes(0)); await save("coral_c_lod1", tubes(1));
for (const v of ["a", "b", "c"]) await save("fish_" + v, fish(v), { double: true, rough: 0.5 });
