// Builds lightweight conifer GLBs (two LODs per species) from real Poly Haven foliage + bark textures.
// The photoscanned originals are 7-17 million triangles each; these are a few hundred to a few thousand
// and are meant to be instanced in their thousands.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, "..", "..", "Scratch", "cache", "models");
const out = path.join(here, "..", "Assets", "Models", "Trees");
fs.mkdirSync(out, { recursive: true });

// deterministic rng
function rng(seed) {
	let s = seed >>> 0;
	return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function rgba(id, kind, size, blur = 2.2, gain = 2.4) {
	const dir = path.join(cache, id, "textures");
	const diff = await sharp(path.join(dir, `${id}_${kind}_diff_1k.jpg`)).resize(size, size).removeAlpha().raw().toBuffer();
	// The alpha is thickened a little. A cut-out whose coverage shrinks as it is minified falls under the cutoff and the
	// leaves vanish at a distance, then reappear as you approach: foliage that flickers in and out.
	const alphaRaw = await sharp(path.join(dir, `${id}_${kind}_alpha_1k.jpg`)).resize(size, size).greyscale().raw().toBuffer();
	const blurred = await sharp(alphaRaw, { raw: { width: size, height: size, channels: 1 } }).blur(blur).raw().toBuffer();
	const alpha = Buffer.alloc(size * size);
	for (let i = 0; i < alpha.length; i++) alpha[i] = Math.min(255, Math.max(alphaRaw[i], blurred[i] * gain));
	const buf = Buffer.alloc(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		buf[i * 4] = diff[i * 3]; buf[i * 4 + 1] = diff[i * 3 + 1]; buf[i * 4 + 2] = diff[i * 3 + 2]; buf[i * 4 + 3] = alpha[i];
	}
	return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

const bark = async (id, size) => sharp(path.join(cache, id, "textures", `${id}_bark_diff_1k.jpg`)).resize(size, size).jpeg({ quality: 85 }).toBuffer();


function builder() {
	return { pos: [], nrm: [], uv: [], col: [], idx: [] };
}

function pushQuad(b, p0, p1, p2, p3, n, uvr, shade0, shade1, tint, flip) {
	// p0,p1 = hinge (inner) corners; p2,p3 = outer corners. uvr = [u0,v0,u1,v1] in image space
	const base = b.pos.length / 3;
	for (const p of [p0, p1, p2, p3]) b.pos.push(p[0], p[1], p[2]);
	for (let i = 0; i < 4; i++) b.nrm.push(n[0], n[1], n[2]);
	const [u0, v0, u1, v1] = uvr;
	// glTF uv origin is top-left, same as image space
	b.uv.push(flip ? u1 : u0, v1, flip ? u0 : u1, v1, flip ? u0 : u1, v0, flip ? u1 : u0, v0);
	for (const s of [shade0, shade0, shade1, shade1]) b.col.push(tint[0] * s, tint[1] * s, tint[2] * s, 1);
	b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function trunk(b, height, r0, sides, rings, topFrac) {
	const topH = height * topFrac;
	for (let r = 0; r <= rings; r++) {
		const t = r / rings;
		const y = topH * t;
		const rad = Math.max(0.025, r0 * Math.pow(1 - t, 0.85));
		for (let s = 0; s <= sides; s++) {
			const a = (s / sides) * Math.PI * 2;
			const x = Math.cos(a), z = Math.sin(a);
			b.pos.push(x * rad, y, z * rad);
			b.nrm.push(x, 0.15, z);
			b.uv.push((s / sides) * 2, y * 0.25);
			b.col.push(1, 1, 1, 1);
		}
	}
	for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
		const a = r * (sides + 1) + s, c = a + sides + 1;
		b.idx.push(a, c, a + 1, a + 1, c, c + 1);   // wound so that the outside faces out
	}
}

function conifer(spec, lod) {
	const rand = rng(spec.seed + lod * 101);
	const foliage = builder(), trunkB = builder();
	const { height: H, radius, whorls, branches, sprigs, lengthMax, droop, tint, topFrac } = spec;
	const nW = lod === 0 ? whorls : Math.ceil(whorls * 0.4);
	const nB = lod === 0 ? branches : Math.max(4, Math.ceil(branches * 0.6));
	trunk(trunkB, H, radius, lod === 0 ? 10 : 6, lod === 0 ? 8 : 3, topFrac);
	for (let i = 0; i < nW; i++) {
		const t = i / (nW - 1);
		const y = H * (spec.start + (topFrac - spec.start) * t);
		const len = lengthMax * Math.pow(1 - t * 0.93, spec.taper) * (lod === 0 ? 1 : 1.2);
		const count = Math.max(4, Math.round(nB * (1 - t * 0.45)));
		const yaw0 = rand() * Math.PI * 2;
		for (let k = 0; k < count; k++) {
			const yaw = yaw0 + (k / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
			const l = len * (0.85 + rand() * 0.35);
			const w = l * spec.width * 0.8;
			const d = [Math.cos(yaw), 0, Math.sin(yaw)];
			const side = [-d[2], 0, d[0]];
			const drop = droop + (rand() - 0.5) * 0.15 - t * 0.12;
			const tip = [d[0] * l, y - l * drop, d[2] * l];
			const base = [d[0] * 0.05, y, d[2] * 0.05];
			const rolls = lod === 0 ? [-0.9, 0, 0.9] : [-0.6, 0.6];
			for (const roll of rolls) {
				const r = roll + (rand() - 0.5) * 0.3;
				const lateral = add(scale(side, Math.cos(r)), [0, Math.sin(r), 0]);
				const nrm = norm(add(scale(lateral, 0), [d[0] * 0.5, 0.9, d[2] * 0.5]));
				const uvr = sprigs[Math.floor(rand() * sprigs.length)];
				const flip = rand() < 0.5;
				const shadeIn = 0.62 + rand() * 0.1, shadeOut = 1.0 + rand() * 0.15;
				const hw = w * 0.5;
				pushQuad(foliage,
					add(base, scale(lateral, -hw)), add(base, scale(lateral, hw)),
					add(tip, scale(lateral, w * 0.5)), add(tip, scale(lateral, -w * 0.5)),
					nrm, uvr, shadeIn, shadeOut, tint, flip);
			}
		}
	}
	// leader / top spike
	const topY = H * topFrac;
	const topCard = (yaw) => {
		const d = [Math.cos(yaw), 0, Math.sin(yaw)]; const side = [-d[2], 0, d[0]];
		const h = H * (1 - topFrac) + lengthMax * 0.25;
		pushQuad(foliage, [0, topY - h * 0.55, 0], [0, topY - h * 0.55, 0], add([0, topY + h * 0.45, 0], scale(side, lengthMax * 0.18)), add([0, topY + h * 0.45, 0], scale(side, -lengthMax * 0.18)),
			[0, 1, 0], sprigs[0], 0.9, 1.1, tint, false);
	};
	topCard(0.2); if (lod === 0) topCard(1.7);
	return { foliage, trunk: trunkB };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const firBark = await bark("fir_tree_01", 512);
const pineBark = await bark("pine_tree_01", 512);
// A conifer frond, drawn: a spine with rows of tapering needle clusters on either side. The photographed twig atlas
// made hairline needles that an alpha test turns into hatching, and cards with ragged rectangular edges. This has solid,
// rounded shapes that survive being cut out, and a silhouette that reads as a branch from a metre away.
async function frond(size, fat, seed) {
	const r = rng(seed), W = size, parts = [];
	const pairs = 17;
	for (let side of [-1, 1]) {
		for (let i = 0; i < pairs; i++) {
			const t = (i + 0.4 + r() * 0.3) / pairs;
			const sx = W / 2, sy = W * (0.97 - t * 0.9);
			const len = W * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.55)) * (0.55 + 0.45 * (1 - t)) * (0.9 + r() * 0.2) + W * 0.05;
			const ang = (0.95 - t * 0.35 + (r() - 0.5) * 0.18);                  // away from the spine, swept toward the tip
			const ex = sx + side * Math.sin(ang) * len, ey = sy - Math.cos(ang) * len * 0.55;
			const nx = -(ey - sy), ny = ex - sx, nl = Math.hypot(nx, ny) || 1;
			const half = (W * (0.026 + 0.012 * fat)) * (1 - t * 0.45);
			const mx = (sx + ex) / 2 + (nx / nl) * half * 0.6 * -side, my = (sy + ey) / 2 + (ny / nl) * half * 0.6 * -side;
			const g = 78 + Math.round(r() * 38), light = 60 + Math.round(t * 46);
			parts.push(`<path d="M${sx - 2} ${sy + 2} Q${mx - (nx / nl) * half} ${my - (ny / nl) * half} ${ex} ${ey} Q${mx + (nx / nl) * half} ${my + (ny / nl) * half} ${sx + 2} ${sy - 2} Z" fill="rgb(${light - 12},${g + 28},${34 + Math.round(t * 16)})" stroke="rgb(${light - 36},${g - 8},28)" stroke-width="${1.5 + fat}"/>`);
			// a smaller twig off the leaflet's outer half
			for (const f of [0.55, 0.8]) {
				const bx = sx + (ex - sx) * f, by = sy + (ey - sy) * f, l2 = len * 0.34 * (1 - f * 0.4);
				const a2 = ang + side * -0.55, tx = bx + side * Math.sin(ang + 0.5) * l2, ty = by - Math.cos(ang + 0.5) * l2 * 0.45;
				parts.push(`<path d="M${bx} ${by + 2} L${tx} ${ty} L${bx} ${by - 2} Z" fill="rgb(${light},${g + 36},${40 + Math.round(t * 14)})" stroke="rgb(${light - 40},${g},30)" stroke-width="${1 + fat}"/>`);
			}
		}
	}
	const spine = `<path d="M${W / 2 - 3} ${W} L${W / 2 - 1} ${W * 0.06} L${W / 2 + 1} ${W * 0.06} L${W / 2 + 3} ${W} Z" fill="rgb(70,52,34)"/>`;
	const tip = `<path d="M${W / 2} ${W * 0.0} L${W / 2 - W * 0.05} ${W * 0.2} L${W / 2 + W * 0.05} ${W * 0.2} Z" fill="rgb(70,130,52)"/>`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${spine}${parts.join("")}${tip}</svg>`;
	return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
const firFoliageNear = await frond(512, 0, 5);
const firFoliage = await frond(512, 1.6, 5);      // fatter, for the middle distance
const pineFoliageNear = firFoliageNear, pineFoliage = firFoliage;
fs.writeFileSync(path.join(here, "..", "..", "Scratch", "frond_preview.png"), firFoliageNear);

// the whole picture is one frond, stem at the bottom centre
const FIR_SPRIGS = [[0, 0, 1, 1]];
const PINE_SPRIGS = FIR_SPRIGS;

const SPECIES = {
	spruce: { seed: 11, height: 26, radius: 0.55, whorls: 34, branches: 10, lengthMax: 5.4, taper: 0.95, width: 1.0, droop: 0.38, start: 0.12, topFrac: 0.93, tint: [0.8, 0.95, 0.85], sprigs: FIR_SPRIGS, tex: "fir" },
	fir: { seed: 23, height: 19, radius: 0.5, whorls: 26, branches: 9, lengthMax: 5.8, taper: 0.8, width: 1.05, droop: 0.28, start: 0.08, topFrac: 0.92, tint: [1.0, 1.05, 0.8], sprigs: FIR_SPRIGS, tex: "fir" },
	pine: { seed: 37, height: 24, radius: 0.5, whorls: 12, branches: 8, lengthMax: 4.8, taper: 0.5, width: 1.0, droop: 0.12, start: 0.55, topFrac: 0.97, tint: [1.12, 1.05, 0.72], sprigs: FIR_SPRIGS, tex: "fir", shape: "pine" }
};

// What the near trees average out to on screen: the foliage texture's opaque pixels times the vertex tint, in linear light.
// The far impostor is painted with it, so that a tree does not change colour as it changes model.
const toLinear = v => Math.pow(v / 255, 2.2);
async function meanOpaque(buffer) {
	const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	let r = 0, g = 0, b = 0, n = 0;
	for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) { r += toLinear(data[i]); g += toLinear(data[i + 1]); b += toLinear(data[i + 2]); n++; }
	return [r / n, g / n, b / n];
}
const SHADE_GAIN = +(process.env.GAIN || 5);
const MEANS = { fir: await meanOpaque(firFoliage), pine: await meanOpaque(pineFoliage) };
const tintMean = spec => {
	const parts = conifer(spec, 0), c = parts.foliage.col;
	let r = 0, g = 0, b = 0, n = 0;
	for (let i = 0; i < c.length; i += 4) { r += c[i]; g += c[i + 1]; b += c[i + 2]; n++; }
	return [r / n, g / n, b / n];
};

async function writeTreeWithImages(name, spec, lod, images) {
	const parts = conifer(spec, lod);
	if (lod === 1) for (let i = 0; i < parts.foliage.col.length; i += 4) for (let c = 0; c < 3; c++) parts.foliage.col[i + c] *= [1.075, 1.0, 1.0][c];   // the middle model measured darker in red
	const doc = new Document();
	const buffer = doc.createBuffer();
	const scene = doc.createScene(name);
	const node = doc.createNode(name);
	scene.addChild(node);
	const mesh = doc.createMesh(name);
	node.setMesh(mesh);
	const barkTex = doc.createTexture("bark").setImage(new Uint8Array(images.bark)).setMimeType("image/jpeg");
	const folTex = doc.createTexture("foliage").setImage(new Uint8Array(lod === 0 ? images.near : images.fol)).setMimeType("image/png");
	const foliageMat = doc.createMaterial("foliage").setBaseColorTexture(folTex).setAlphaMode("MASK").setAlphaCutoff(0.3).setDoubleSided(true).setRoughnessFactor(0.92).setMetallicFactor(0);
	const trunkMat = doc.createMaterial("trunk").setBaseColorTexture(barkTex).setRoughnessFactor(0.95).setMetallicFactor(0);
	for (const [part, mat] of [[parts.trunk, trunkMat], [parts.foliage, foliageMat]]) {
		const prim = doc.createPrimitive();
		prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.pos)).setBuffer(buffer));
		prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(part.nrm)).setBuffer(buffer));
		prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(part.uv)).setBuffer(buffer));
		prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(part.col)).setBuffer(buffer));
		prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(part.idx)).setBuffer(buffer));
		prim.setMaterial(mat);
		mesh.addPrimitive(prim);
	}
	const file = path.join(out, `${name}_lod${lod}.glb`);
	fs.writeFileSync(file, await new NodeIO().writeBinary(doc));
	const tris = (parts.trunk.idx.length + parts.foliage.idx.length) / 3;
	console.log(path.basename(file), Math.round(tris), "tris", Math.round(fs.statSync(file).size / 1024), "KB");
}

for (const [name, spec] of Object.entries(SPECIES))
	for (const lod of [0, 1])
		await writeTreeWithImages(name, spec, lod, spec.tex === "fir" ? { bark: firBark, fol: firFoliage, near: firFoliageNear } : { bark: pineBark, fol: pineFoliage, near: pineFoliageNear });

// The far impostor: three stacked cones in a flat dark green, a few dozen triangles. At a kilometre it is a few pixels,
// and it is what keeps a forest from appearing out of nothing as the viewer approaches.
async function writeImpostor(name, spec) {
	const doc = new Document();
	const buffer = doc.createBuffer();
	const scene = doc.createScene(name);
	const node = doc.createNode(name);
	scene.addChild(node);
	const mesh = doc.createMesh(name);
	node.setMesh(mesh);
	const pos = [], nrm = [], col = [], idx = [];
	const H = spec.height, sides = 7;
	const tiers = spec.shape === "pine" ? [[0.55, 0.0, 0.92, 0.22], [0.8, 0.0, 0.0, 0.0]] : [[0.1, 0.46, 0.5, 1.0], [0.34, 0.7, 0.42, 1.0], [0.58, 0.92, 0.3, 1.0]];
	const rings = spec.shape === "pine"
		? [[H * 0.55, spec.lengthMax * 0.7], [H * 0.75, spec.lengthMax * 0.55], [H * 0.98, 0.1]]
		: [[H * 0.1, spec.lengthMax * 0.95], [H * 0.34, spec.lengthMax * 0.75], [H * 0.58, spec.lengthMax * 0.52], [H * 0.97, 0.1]];
	const tex = MEANS[spec.tex], tint = tintMean(spec);
	// the cones' own vertex shading averages to about 0.8, and a dense crown is darker than its sprigs (gaps, self shadow)
	const shade = [0, 1, 2].map(i => Math.min(1, tex[i] * tint[i] * SHADE_GAIN * [1.7, 0.7, 2.4][i]));   // measured against the near trees by lodcal.mjs
	if (!globalThis.__printed) { globalThis.__printed = 1; console.log('impostor means', tex.map(v => v.toFixed(3)), tint.map(v => v.toFixed(2)), shade.map(v => v.toFixed(3))); }
	const addCone = (y0, r0, y1, r1, c) => {
		const base = pos.length / 3;
		for (let k = 0; k < sides; k++) {
			const a = (k / sides) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
			pos.push(x * r0, y0, z * r0, x * r1, y1, z * r1);
			const n = [x * 0.8, 0.6, z * 0.8];
			nrm.push(...n, ...n);
			col.push(c * 0.7, c * 0.7, c * 0.7, 1, c, c, c, 1);
		}
		for (let k = 0; k < sides; k++) {
			const a = base + k * 2, b = base + ((k + 1) % sides) * 2;
			idx.push(a, b, a + 1, b, b + 1, a + 1);
		}
	};
	for (let i = 0; i < rings.length - 1; i++) addCone(rings[i][0], rings[i][1], rings[i + 1][0] + (rings[i + 1][0] - rings[i][0]) * 0.6, i === rings.length - 2 ? 0.05 : rings[i + 1][1] * 0.35, 0.85 + i * 0.12);
	const mat = doc.createMaterial("far").setBaseColorFactor([shade[0], shade[1], shade[2], 1]).setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(true);
	const prim = doc.createPrimitive();
	prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer));
	prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nrm)).setBuffer(buffer));
	prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC4").setArray(new Float32Array(col)).setBuffer(buffer));
	prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(idx)).setBuffer(buffer));
	prim.setMaterial(mat);
	mesh.addPrimitive(prim);
	const file = path.join(out, `${name}_lod2.glb`);
	fs.writeFileSync(file, await new NodeIO().writeBinary(doc));
	console.log(path.basename(file), idx.length / 3, "tris");
}
for (const [name, spec] of Object.entries(SPECIES)) await writeImpostor(name, spec);
