// Generates the procedural parts of the world from a seed: height map, splat map, scatter tables, landmarks.
//   node generate-world.mjs [seed]
// Output goes to Build/Assets/Terrain, Build/Assets/Scatter and Build/Tools/world.meta.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "Assets");
const mk = d => (fs.mkdirSync(d, { recursive: true }), d);
const terrainDir = mk(path.join(assets, "Terrain"));
const scatterDir = mk(path.join(assets, "Scatter"));
const textureDir = mk(path.join(assets, "Textures"));

const SEED = +(process.argv[2] ?? 7);
const SIZE = 8192;             // metres across
const N = 2049;                // height samples per side (2048 cells of 4 m)
const SPLAT = 2048;
const ELEV = [-80, 1500];      // metres: what 0 and 1 mean in the height image
const CELL = SIZE / (N - 1);

// ------------------------------------------------------------------ noise

function rng(seed) {
	let s = seed >>> 0;
	return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function makeSimplex(seed) {
	const r = rng(seed);
	const perm = new Uint8Array(512);
	const p = Array.from({ length: 256 }, (_, i) => i);
	for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
	for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
	const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
	const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
	return (x, y) => {
		const s = (x + y) * F2;
		const i = Math.floor(x + s), j = Math.floor(y + s);
		const t = (i + j) * G2;
		const x0 = x - (i - t), y0 = y - (j - t);
		const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
		const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
		const ii = i & 255, jj = j & 255;
		const contrib = (gx, gy, dx, dy) => { let t = 0.5 - dx * dx - dy * dy; if (t < 0) return 0; t *= t; return t * t * (G[gi(gx, gy)][0] * dx + G[gi(gx, gy)][1] * dy); };
		const gi = (a, b) => perm[a + perm[b]] & 7;
		return 70 * (contrib(ii, jj, x0, y0) + contrib(ii + i1, jj + j1, x1, y1) + contrib(ii + 1, jj + 1, x2, y2));
	};
}

const noiseA = makeSimplex(SEED), noiseB = makeSimplex(SEED * 31 + 5), noiseC = makeSimplex(SEED * 131 + 11), noiseD = makeSimplex(SEED * 977 + 3);

const fbm = (n, x, y, oct, lac = 2, gain = 0.5) => {
	let a = 1, f = 1, sum = 0, norm = 0;
	for (let o = 0; o < oct; o++) { sum += a * n(x * f, y * f); norm += a; a *= gain; f *= lac; }
	return sum / norm;
};
const ridged = (n, x, y, oct) => {
	let a = 0.5, f = 1, sum = 0, w = 1;
	for (let o = 0; o < oct; o++) {
		let s = 1 - Math.sqrt(n(x * f, y * f) ** 2 + 0.02);   // rounded crests: no needles
		s *= s; s *= w; w = Math.min(1, Math.max(0, s * 1.6));
		sum += s * a; a *= 0.5; f *= 2.02;
	}
	return sum;
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ height

function heightAt(u, v) {
	// u, v in [-1, 1] across the map
	const wu = u + 0.14 * fbm(noiseB, u * 1.3 + 9, v * 1.3 - 4, 3);
	const wv = v + 0.14 * fbm(noiseB, u * 1.3 - 5, v * 1.3 + 11, 3);
	const radial = Math.hypot(wu, wv) + 0.22 * fbm(noiseA, u * 2.1 + 3, v * 2.1 + 17, 4);
	const land = 1 - smooth(0.34, 0.94, radial);                    // 1 inland, 0 open sea

	const shore = mix(-72, 3, smooth(0.0, 0.30, land));              // sea floor up to the beach
	const hills = Math.pow(fbm(noiseA, u * 3.1 + 1, v * 3.1 + 2, 5) * 0.5 + 0.5, 1.25) * 150 + fbm(noiseC, u * 9, v * 9, 4) * 18;
	const zone = smooth(0.46, 0.78, fbm(noiseD, u * 1.15 + 5, v * 1.15 - 3, 3) * 0.5 + 0.5) * smooth(0.3, 0.7, land);
	const peaks = Math.pow(ridged(noiseC, u * 1.35 + 9, v * 1.35 + 1, 5), 1.7) * 1900;
	const inland = smooth(0.22, 0.6, land);

	return shore + inland * (hills + zone * peaks);
}

console.log("sampling heights", N, "x", N);
const heights = new Float32Array(N * N);
let hMin = 1e9, hMax = -1e9;
for (let j = 0; j < N; j++) {
	for (let i = 0; i < N; i++) {
		const u = (i / (N - 1)) * 2 - 1;
		const v = 1 - (j / (N - 1)) * 2;   // row 0 is +Z, the top of the image; v here is the map's z
		const e = heightAt(u, v);
		heights[j * N + i] = e;
		if (e < hMin) hMin = e; if (e > hMax) hMax = e;
	}
}
console.log("elevation range", hMin.toFixed(1), hMax.toFixed(1));
if (hMin < ELEV[0] || hMax > ELEV[1]) console.warn("WARNING: elevation outside encoded range");

// the outer 128 m settle to a flat sea floor, which the open-sea floor beyond the map continues at the same depth
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
	const edge = Math.min(i, j, N - 1 - i, N - 1 - j);
	if (edge < 40) { const t = smooth(0, 40, edge); heights[j * N + i] = mix(-72, heights[j * N + i], t); }
}

// two passes of a 5x5 box blur take the last of the roughness off
for (let pass = 0; pass < 2; pass++) {
	const tmp = new Float32Array(N * N);
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		let sum = 0, n = 0;
		for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
			const ii = i + di, jj = j + dj;
			if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
			sum += heights[jj * N + ii]; n++;
		}
		tmp[j * N + i] = sum / n;
	}
	heights.set(tmp);
}

const at = (i, j) => heights[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
const slopeAt = (i, j) => {
	const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL);
	return Math.hypot(dx, dz);   // rise over run
};
const heightWorld = (x, z) => {
	const fi = (x / SIZE + 0.5) * (N - 1), fj = (0.5 - z / SIZE) * (N - 1);
	const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
	return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz;
};

// ------------------------------------------------------------------ height image (16 bit across R and G)

async function writeHeight() {
	const buf = Buffer.alloc(N * N * 3);
	for (let k = 0; k < N * N; k++) {
		const t = Math.min(1, Math.max(0, (heights[k] - ELEV[0]) / (ELEV[1] - ELEV[0])));
		const q = Math.round(t * 65535);
		buf[k * 3] = q >> 8; buf[k * 3 + 1] = q & 255; buf[k * 3 + 2] = 0;
	}
	await sharp(buf, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "height.png"));
	console.log("height.png");
}
await writeHeight();

// ------------------------------------------------------------------ splat + forest mask

const forest = new Float32Array(SPLAT * SPLAT);
{
	const buf = Buffer.alloc(SPLAT * SPLAT * 4);
	for (let j = 0; j < SPLAT; j++) {
		for (let i = 0; i < SPLAT; i++) {
			const hi = Math.round(i / (SPLAT - 1) * (N - 1)), hj = Math.round(j / (SPLAT - 1) * (N - 1));
			const e = at(hi, hj), s = slopeAt(hi, hj);
			const x = (i / (SPLAT - 1) - 0.5) * SIZE, z = (0.5 - j / (SPLAT - 1)) * SIZE;
			const n1 = fbm(noiseA, x * 0.0021, z * 0.0021, 4), n2 = fbm(noiseB, x * 0.011, z * 0.011, 3), n3 = fbm(noiseC, x * 0.0006 + 40, z * 0.0006, 3);

			const rock = Math.min(1, smooth(0.45, 0.8, s) + smooth(430 + n1 * 100, 640 + n1 * 100, e) * 0.9);
			const sand = smooth(5 + n2 * 2.5, 0.5, e) * (1 - smooth(0.3, 0.55, s)) + smooth(-3, 3, e) * 0.0;
			const snow = smooth(540 + n1 * 80, 740 + n1 * 60, e) * (1 - smooth(1.0, 1.5, s));
			const dirt = Math.min(1, smooth(0.62, 0.9, n2 * 0.5 + 0.5) * 0.35 + smooth(0.3, 0.5, s) * 0.5 + smooth(0.68, 0.9, n3) * 0.3) * (1 - snow) * (1 - sand);

			buf[(j * SPLAT + i) * 4] = Math.round(Math.min(1, rock) * 255);
			buf[(j * SPLAT + i) * 4 + 1] = Math.round(Math.min(1, sand) * 255);
			buf[(j * SPLAT + i) * 4 + 2] = Math.round(Math.min(1, snow) * 255);
			buf[(j * SPLAT + i) * 4 + 3] = Math.round(Math.min(1, dirt) * 255);

			// where trees may stand
			const grassy = (1 - smooth(0.28, 0.6, s)) * smooth(10, 24, e) * (1 - smooth(480, 640, e)) * (1 - Math.min(1, dirt * 0.5));
			const patch = smooth(-0.55, -0.02, fbm(noiseD, x * 0.0016 + 7, z * 0.0016 - 9, 4));
			forest[j * SPLAT + i] = grassy * patch;
		}
	}
	await sharp(buf, { raw: { width: SPLAT, height: SPLAT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "splat.png"));
	console.log("splat.png");
}
{
	const buf = Buffer.alloc(SPLAT * SPLAT);
	for (let k = 0; k < SPLAT * SPLAT; k++) buf[k] = Math.round(Math.min(1, forest[k] * 1.6) * 255);
	await sharp(buf, { raw: { width: SPLAT, height: SPLAT, channels: 1 } }).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(path.join(terrainDir, "forest.png"));
	console.log("forest.png");
}
const forestAt = (x, z) => forest[Math.min(SPLAT - 1, Math.max(0, Math.round((0.5 - z / SIZE) * (SPLAT - 1)))) * SPLAT + Math.min(SPLAT - 1, Math.max(0, Math.round((x / SIZE + 0.5) * (SPLAT - 1))))];
const slopeWorld = (x, z) => slopeAt(Math.round((x / SIZE + 0.5) * (N - 1)), Math.round((0.5 - z / SIZE) * (N - 1)));

// ------------------------------------------------------------------ scatter tables

function writeTable(name, records) {
	const arr = new Float32Array(records.length * 5);
	records.forEach((r, i) => arr.set(r, i * 5));
	fs.writeFileSync(path.join(scatterDir, name + ".bin"), Buffer.from(arr.buffer));
	console.log("scatter", name, records.length);
}

{
	const r = rng(SEED + 99);
	const spruce = [], fir = [], pine = [];
	const spacing = 15;
	for (let gz = -SIZE / 2; gz < SIZE / 2; gz += spacing) {
		for (let gx = -SIZE / 2; gx < SIZE / 2; gx += spacing) {
			const x = gx + r() * spacing, z = gz + r() * spacing;
			const f = forestAt(x, z);
			if (r() > f * 2.1) continue;
			const y = heightWorld(x, z);
			if (y < 8) continue;
			const sc = 0.75 + r() * 0.6;
			const rec = [x, y - 0.3, z, r() * Math.PI * 2, sc];
			const pick = r() + fbm(noiseB, x * 0.002, z * 0.002, 2) * 0.5;
			(pick < 0.42 ? spruce : pick < 0.78 ? fir : pine).push(rec);
		}
	}
	writeTable("spruce", spruce); writeTable("fir", fir); writeTable("pine", pine);

	// boulders on slopes, shores and mountainsides
	const boulderB = [], boulderC = [];
	const sp2 = 55;
	for (let gz = -SIZE / 2; gz < SIZE / 2; gz += sp2) {
		for (let gx = -SIZE / 2; gx < SIZE / 2; gx += sp2) {
			const x = gx + r() * sp2, z = gz + r() * sp2;
			const y = heightWorld(x, z);
			if (y < 1) continue;
			const s = slopeWorld(x, z);
			const p = smooth(0.18, 0.7, s) * 0.55 + (y > 480 ? 0.2 : 0.02) + (y < 14 ? 0.1 : 0);
			if (r() > p) continue;
			const sc = 1.2 + r() * 3.2;
			(r() < 0.5 ? boulderB : boulderC).push([x, y - 0.2 * sc, z, r() * Math.PI * 2, sc]);
		}
	}
	writeTable("boulder_b", boulderB); writeTable("boulder_c", boulderC);
}

// ------------------------------------------------------------------ landmarks, spawn, enemy anchors

const meta = { seed: SEED, size: SIZE, elevation: ELEV, resolution: N };

{
	// spawn: flattest dry ground near the middle with trees nearby
	let best = null;
	for (let r2 = 0; r2 < 4000; r2++) {
		const rr = rng(r2 + 5);
		const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * 1800;
		const x = Math.cos(a) * d, z = Math.sin(a) * d;
		const y = heightWorld(x, z);
		if (y < 25 || y > 150) continue;
		const s = slopeWorld(x, z);
		const f = forestAt(x + 60, z) + forestAt(x - 60, z);
		const score = -s * 40 + f + (y > 40 ? 0.3 : 0);
		if (!best || score > best.score) best = { x, y, z, score };
	}
	meta.spawn = { x: best.x, y: best.y, z: best.z };
	console.log("spawn", meta.spawn);

	// landmarks: ruins on high ground not too far away, stone circle near the spawn, cliff spires in the mountains
	const pick = (filter, tries, seed) => {
		const rr = rng(seed); let found = null;
		for (let i = 0; i < tries; i++) {
			const x = (rr() - 0.5) * SIZE * 0.8, z = (rr() - 0.5) * SIZE * 0.8, y = heightWorld(x, z), s = slopeWorld(x, z);
			if (filter(x, z, y, s)) { found = { x, y, z }; break; }
		}
		return found;
	};
	const near = (a, d) => (x, z) => Math.hypot(x - a.x, z - a.z) < d;
	meta.landmarks = {
		fort: pick((x, z, y, s) => y > 60 && y < 260 && s < 0.12 && near(meta.spawn, 2600)(x, z) && Math.hypot(x - meta.spawn.x, z - meta.spawn.z) > 900, 100000, 3),
		circle: pick((x, z, y, s) => y > 30 && y < 200 && s < 0.07 && Math.hypot(x - meta.spawn.x, z - meta.spawn.z) > 250 && near(meta.spawn, 700)(x, z), 100000, 4),
		spires: [], peaks: []
	};
	// the fort is a large building on a flat floor: the ground under it is levelled to a plateau, easing back into the hillside, so that it sits on the land and does not hang over it
	if (meta.landmarks.fort) {
		const f = meta.landmarks.fort, base = heightWorld(f.x, f.z), R0 = 85, R1 = 175;
		for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
			const x = (i / (N - 1) - 0.5) * SIZE, z = (0.5 - j / (N - 1)) * SIZE, d = Math.hypot(x - f.x, z - f.z);
			if (d >= R1) continue;
			heights[j * N + i] = mix(heights[j * N + i], base, smooth(R1, R0, d));
		}
		f.y = base;
		await writeHeight();
	}
	for (let k = 0; k < 7; k++) {
		const p = pick((x, z, y, s) => y > 520 && s > 0.35, 200000, 20 + k);
		if (p) meta.landmarks.spires.push(p);
	}
	// highest points, for dragons' lairs
	const peaks = [];
	for (let j = 8; j < N - 8; j += 8) for (let i = 8; i < N - 8; i += 8) {
		const e = at(i, j);
		if (e > 600) peaks.push({ x: (i / (N - 1) - 0.5) * SIZE, y: e, z: (0.5 - j / (N - 1)) * SIZE });
	}
	peaks.sort((a, b) => b.y - a.y);
	const lairs = [];
	for (const p of peaks) { if (lairs.every(l => Math.hypot(l.x - p.x, l.z - p.z) > 800)) lairs.push(p); if (lairs.length >= 5) break; }
	meta.lairs = lairs.map(l => [l.x, l.y + 40, l.z]);
	// roosts: where bats come from, a few within sight of the spawn
	const roosts = [], rr = rng(777);
	for (let k = 0; roosts.length < 18 && k < 20000; k++) {
		const x = (rr() - 0.5) * SIZE * 0.72, z = (rr() - 0.5) * SIZE * 0.72, y = heightWorld(x, z);
		if (y < 15) continue;
		const d = Math.hypot(x - meta.spawn.x, z - meta.spawn.z);
		if (roosts.length < 6 && (d < 900 || d > 2400)) continue;
		roosts.push([x, y + 90, z]);
	}
	meta.roosts = roosts;
	console.log("landmarks", JSON.stringify(meta.landmarks).slice(0, 200), "lairs", lairs.length, "roosts", meta.roosts.length);
}

// ------------------------------------------------------------------ points of interest for the adventure

{
	const gy = (x, z) => heightWorld(x, z);
	const spot = (cx, cz, minR, maxR, seed, maxSlope = 0.2) => {
		const rr = rng(seed);
		for (let k = 0; k < 4000; k++) {
			const a = rr() * Math.PI * 2, d = minR + rr() * (maxR - minR);
			const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = gy(x, z);
			if (y > 8 && slopeWorld(x, z) < maxSlope) return { x, y, z };
		}
		return { x: cx + minR, y: gy(cx + minR, cz), z: cz };
	};
	const camp = { x: meta.spawn.x, y: gy(meta.spawn.x, meta.spawn.z), z: meta.spawn.z };
	const pois = { camp, apples: [], names: {} };
	for (let k = 0; k < 3; k++) {
		let p, tries = 0;
		do { p = spot(camp.x, camp.z, 70, 230, 900 + k * 17 + tries, 0.18); tries++; } while (pois.apples.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 60) && tries < 40);
		pois.apples.push(p);
	}
	const f = meta.landmarks.fort || camp;
	pois.fort = { x: f.x, y: gy(f.x, f.z), z: f.z };
	pois.hale = spot(f.x, f.z, 30, 70, 321, 0.16);
	const c = meta.landmarks.circle || camp;
	pois.stone = { x: c.x, y: gy(c.x, c.z), z: c.z };
	pois.pip = spot(c.x, c.z, 34, 55, 654, 0.14);
	meta.pois = pois;
	console.log("pois: camp", Math.round(camp.x), Math.round(camp.z), "fort", Math.round(f.x), Math.round(f.z), "stones", Math.round(c.x), Math.round(c.z));
}


// ------------------------------------------------------------------ under the sea: kelp, coral, and where the fish go

{
	const r = rng(SEED + 4242);
	const kelp = [], coralA = [], coralB = [], coralC = [];
	const spacing = 11;
	for (let gz = -SIZE / 2 + 150; gz < SIZE / 2 - 150; gz += spacing) {
		for (let gx = -SIZE / 2 + 150; gx < SIZE / 2 - 150; gx += spacing) {
			const x = gx + r() * spacing, z = gz + r() * spacing;
			const y = heightWorld(x, z);
			if (y > -3.5 || y < -64) continue;
			if (slopeWorld(x, z) > 0.45) continue;
			const patch = fbm(noiseD, x * 0.0042 + 3, z * 0.0042 - 8, 3) * 0.5 + 0.5;     // meadows of kelp
			const reef = fbm(noiseB, x * 0.0035 - 6, z * 0.0035 + 2, 3) * 0.5 + 0.5;       // reefs
			const depthKelp = smooth(-62, -24, y) * (1 - smooth(-20, -15, y));   // tall: not where it would break the surface
			if (r() < smooth(0.5, 0.72, patch) * depthKelp * 0.55) kelp.push([x, y - 0.1, z, r() * 6.28, 0.7 + r() * 0.5]);
			const reefy = smooth(0.55, 0.75, reef) * (1 - smooth(-34, -14, y));
			if (r() < reefy * 0.5) {
				const rec = [x, y - 0.15, z, r() * 6.28, 0.7 + r() * 0.9];
				const pick = r();
				(pick < 0.4 ? coralA : pick < 0.72 ? coralB : coralC).push(rec);
			} else if (r() < 0.012 && y > -40) coralB.push([x, y - 0.1, z, r() * 6.28, 0.5 + r() * 0.5]);
		}
	}
	writeTable("kelp", kelp); writeTable("coral_a", coralA); writeTable("coral_b", coralB); writeTable("coral_c", coralC);

	// Schools of fish hold a patch of water each. A shoal swims a circle up to 50 m across and is itself about 8 m wide, and nothing of it may
	// break the surface or touch the shore, so a place is only taken where the water is deep all round it: at least 16 m under everything
	// within 90 m, and at least 8 m under everything within 260 m.
	const deepAround = (x, z, radius, depth, steps = 12) => { for (let k = 0; k < steps; k++) { const a = k / steps * Math.PI * 2; if (heightWorld(x + Math.cos(a) * radius, z + Math.sin(a) * radius) > -depth) return false; } return true; };
	const schools = [];
	const rr = rng(SEED + 777);
	for (let k = 0; k < 200000 && schools.length < 90; k++) {
		const x = (rr() - 0.5) * SIZE * 0.84, z = (rr() - 0.5) * SIZE * 0.84, y = heightWorld(x, z);
		if (y > -20 || y < -58 || slopeWorld(x, z) > 0.14) continue;
		if (!deepAround(x, z, 90, 16) || !deepAround(x, z, 260, 8)) continue;
		if (schools.some(s => Math.hypot(s.x - x, s.z - z) < 150)) continue;
		schools.push({ x: Math.round(x), z: Math.round(z), floor: +y.toFixed(1) });
	}
	// Sharks keep to deep water well away from any coast: more than 55 m down, nothing shallower than 20 m within 700 m.
	const sharks = [];
	const rs = rng(SEED + 1313);
	for (let k = 0; k < 300000 && sharks.length < 48; k++) {
		const x = (rs() - 0.5) * SIZE * 0.96, z = (rs() - 0.5) * SIZE * 0.96, y = heightWorld(x, z);
		if (y > -52) continue;
		if (!deepAround(x, z, 700, 40, 16) || !deepAround(x, z, 300, 48, 12)) continue;
		if (sharks.some(s => Math.hypot(s.x - x, s.z - z) < 380)) continue;
		sharks.push({ x: Math.round(x), z: Math.round(z), floor: +y.toFixed(1) });
	}
	meta.pois.sharks = sharks;
	meta.pois.schools = schools;
	console.log("sea: kelp", kelp.length, "coral", coralA.length + coralB.length + coralC.length, "schools", schools.length, "sharks", sharks.length);
}

// ------------------------------------------------------------------ ground cover and broadleaf trees (Poly Haven scans)

{
	const r = rng(SEED + 5150);
	const fern = [], flowerA = [], flowerB = [], flowerC = [], shrub = [], bush = [], moss = [], broadA = [], broadB = [];
	const step = 3.4;
	for (let gz = -SIZE / 2 + 60; gz < SIZE / 2 - 60; gz += step) {
		for (let gx = -SIZE / 2 + 60; gx < SIZE / 2 - 60; gx += step) {
			const x = gx + r() * step, z = gz + r() * step;
			const y = heightWorld(x, z);
			if (y < 4 || y > 520) continue;
			const f = forestAt(x, z), sl = slopeWorld(x, z);
			if (sl > 0.5) continue;
			const sc = 0.7 + r() * 0.7, yaw = r() * Math.PI * 2;
			const patch = fbm(noiseC, x * 0.01, z * 0.01, 2) * 0.5 + 0.5;
			// ferns thicken under and at the edge of the woods; flowers drift through the open ground; shrubs are scattered between
			if (f > 0.15 && r() < f * 0.16 * (0.4 + patch)) fern.push([x, y - 0.05, z, yaw, sc]);
			if (f < 0.35 && sl < 0.3) {
				const open = (1 - f) * smooth(0.45, 0.7, patch);
				if (r() < open * 0.11) flowerA.push([x, y - 0.02, z, yaw, sc * 1.2]);
				else if (r() < open * 0.02) flowerB.push([x, y - 0.02, z, yaw, sc]);
				else if (r() < open * 0.045) flowerC.push([x, y - 0.02, z, yaw, sc * 1.1]);
			}
			if (r() < 0.0035 * (0.5 + f)) (r() < 0.5 ? shrub : bush).push([x, y - 0.05, z, yaw, 0.8 + r() * 0.9]);
			if (sl > 0.12 && r() < 0.003) moss.push([x, y - 0.25, z, yaw, 0.9 + r() * 1.6]);
		}
	}
	// broadleaf trees in the clearings of the woods
	for (let gz = -SIZE / 2 + 80; gz < SIZE / 2 - 80; gz += 22) {
		for (let gx = -SIZE / 2 + 80; gx < SIZE / 2 - 80; gx += 22) {
			const x = gx + r() * 22, z = gz + r() * 22, y = heightWorld(x, z);
			if (y < 5 || y > 380 || slopeWorld(x, z) > 0.3) continue;
			const f = forestAt(x, z);
			if (f > 0.4 || r() > 0.28) continue;
			(r() < 0.5 ? broadA : broadB).push([x, y - 0.2, z, r() * Math.PI * 2, 0.85 + r() * 0.5]);
		}
	}
	writeTable("fern", fern); writeTable("flower_a", flowerA); writeTable("flower_b", flowerB); writeTable("flower_c", flowerC);
	writeTable("shrub", shrub); writeTable("bush", bush); writeTable("mossrock", moss); writeTable("broad_a", broadA); writeTable("broad_b", broadB);
}

// ------------------------------------------------------------------ clearings: nobody talks to anyone through a spruce

{
	const clear = [[meta.pois.camp, 42], [meta.pois.hale, 20], [meta.pois.pip, 20], [meta.pois.stone, 46], [meta.pois.fort, 95], ...meta.pois.apples.map(a => [a, 7])];
	for (const name of ["spruce", "fir", "pine", "boulder_b", "boulder_c", "fern", "flower_a", "flower_b", "flower_c", "shrub", "bush", "mossrock", "broad_a", "broad_b"]) {
		const file = path.join(scatterDir, name + ".bin");
		const raw = fs.readFileSync(file);
		const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
		const keep = [];
		for (let i = 0; i < all.length; i += 5) {
			const x = all[i], z = all[i + 2];
			const small = ["fern", "flower_a", "flower_b", "flower_c", "shrub", "bush"].includes(name);
			if (clear.some(([c, r]) => Math.hypot(x - c.x, z - c.z) < (small ? r * 0.22 : r))) continue;
			keep.push(Array.from(all.slice(i, i + 5)));
		}
		writeTable(name, keep);
	}
}

fs.writeFileSync(path.join(here, "world.meta.json"), JSON.stringify(meta, null, 1));

// ------------------------------------------------------------------ small generated textures (particles, water)

{
	const S = 128, buf = Buffer.alloc(S * S * 4);
	for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
		const d = Math.hypot((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5) * 2;
		const a = Math.max(0, 1 - d); const g = Math.pow(a, 2.2);
		buf.set([255, 255, 255, Math.round(g * 255)], (j * S + i) * 4);
	}
	await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).png().toFile(path.join(textureDir, "flare.png"));

	const P = 128, sm = Buffer.alloc(P * P * 4);
	for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
		const x = (i + 0.5) / P, y = (j + 0.5) / P, d = Math.hypot(x - 0.5, y - 0.5) * 2;
		const n = fbm(noiseA, x * 5, y * 5, 4) * 0.5 + 0.5;
		const a = Math.max(0, 1 - d) * (0.5 + n * 0.7);
		sm.set([255, 255, 255, Math.round(Math.min(1, Math.pow(a, 1.4)) * 255)], (j * P + i) * 4);
	}
	await sharp(sm, { raw: { width: P, height: P, channels: 4 } }).png().toFile(path.join(textureDir, "smoke.png"));

	// tileable water normal maps: many waves of integer frequency (so they tile) from scattered directions, so that no
	// stripes show; the first is a long swell, the second a shorter chop
	const waterMap = async (file, seed, count, fmin, fmax, steep) => {
		const W = 512, wn = Buffer.alloc(W * W * 3), rr = rng(seed);
		const waves = Array.from({ length: count }, (_, k) => {
			const f = fmin + rr() * (fmax - fmin), a = rr() * Math.PI * 2;
			return { fx: Math.round(Math.cos(a) * f), fz: Math.round(Math.sin(a) * f), amp: steep / (1 + f * 0.35), p: rr() * 6.28 };
		}).filter(w => w.fx !== 0 || w.fz !== 0);
		for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
			let dx = 0, dz = 0;
			for (const w of waves) {
				const arg = (w.fx * i / W + w.fz * j / W) * 2 * Math.PI + w.p;
				const c = -Math.sin(arg) * w.amp * 2 * Math.PI;
				dx += c * w.fx / W * 8; dz += c * w.fz / W * 8;
			}
			const l = Math.hypot(dx, dz, 1);
			wn.set([Math.round((-dx / l * 0.5 + 0.5) * 255), Math.round((-dz / l * 0.5 + 0.5) * 255), Math.round((1 / l * 0.5 + 0.5) * 255)], (j * W + i) * 3);
		}
		await sharp(wn, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(textureDir, file));
	};
	await waterMap("water_nor.png", 1001, 26, 1, 9, 0.9);
	await waterMap("water_nor2.png", 2002, 34, 4, 22, 0.8);
	console.log("textures flare, smoke, water_nor, water_nor2");
}

// ------------------------------------------------------------------ the map the player sees

{
	const M = 768, buf = Buffer.alloc(M * M * 3);
	const shade = (hi, hj) => { const dx = at(hi + 3, hj) - at(hi - 3, hj), dz = at(hi, hj + 3) - at(hi, hj - 3); return Math.min(1.35, Math.max(0.55, 1 + (-dx * 0.7 - dz * 0.35) * 0.012)); };
	for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
		const hi = Math.round(i / (M - 1) * (N - 1)), hj = Math.round(j / (M - 1) * (N - 1));
		const e = at(hi, hj), fo = forest[Math.round(j / (M - 1) * (SPLAT - 1)) * SPLAT + Math.round(i / (M - 1) * (SPLAT - 1))];
		let c;
		if (e < 0) { const d = Math.min(1, -e / 60); c = [38 - 14 * d, 92 - 30 * d, 140 - 30 * d]; }
		else if (e < 5) c = [222, 205, 150];
		else if (e < 520) c = [104 - fo * 44, 150 - fo * 52, 78 - fo * 28];
		else if (e < 760) c = [138, 130, 118];
		else c = [236, 238, 242];
		const l = e < 0 ? 1 : shade(hi, hj);
		buf.set(c.map(v => Math.min(255, Math.max(0, v * l))), (j * M + i) * 3);
	}
	fs.mkdirSync(path.join(assets, "UI"), { recursive: true });
	await sharp(buf, { raw: { width: M, height: M, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(assets, "UI", "map.png"));
	console.log("map.png");
}

// ------------------------------------------------------------------ preview (not shipped)

{
	const P = 1024, buf = Buffer.alloc(P * P * 3);
	for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
		const hi = Math.round(i / (P - 1) * (N - 1)), hj = Math.round(j / (P - 1) * (N - 1));
		const e = at(hi, hj), sx = (at(hi + 2, hj) - at(hi - 2, hj)), light = Math.min(1.4, Math.max(0.5, 1 + sx * 0.012));
		let c;
		if (e < 0) c = [20 + e * -0.2, 60 + e * 0.2, 110];
		else if (e < 6) c = [215, 200, 150];
		else if (e < 480) c = [70 + forest[Math.round(j / (P - 1) * (SPLAT - 1)) * SPLAT + Math.round(i / (P - 1) * (SPLAT - 1))] * -40, 120 - forest[Math.round(j / (P - 1) * (SPLAT - 1)) * SPLAT + Math.round(i / (P - 1) * (SPLAT - 1))] * 50, 60];
		else if (e < 750) c = [120, 115, 110];
		else c = [240, 240, 245];
		buf.set(c.map(v => Math.min(255, Math.max(0, v * (e < 0 ? 1 : light)))), (j * P + i) * 3);
	}
	await sharp(buf, { raw: { width: P, height: P, channels: 3 } }).png().toFile(path.join(here, "..", "..", "Scratch", "thumbs", "world-preview.png"));
}
console.log("done");
