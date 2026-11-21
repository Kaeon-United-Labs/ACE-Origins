// Turns the raw downloads in Scratch/cache into the shipped asset set in Build/Assets.
//   node process-assets.mjs [textures|sky|rocks|monsters]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, textureCompress, getBounds, flatten, join } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, "..", "..", "Scratch", "cache");
const assets = path.join(here, "..", "Assets");
const mk = d => (fs.mkdirSync(d, { recursive: true }), d);
const only = process.argv.slice(2);
const want = k => only.length === 0 || only.includes(k);

// --------------------------------------------------------------------------- terrain textures

async function textures() {
	const out = mk(path.join(assets, "Textures"));
	for (const name of ["grass", "dirt", "rock", "sand", "snow"]) {
		for (const kind of ["diff", "nor"]) {
			const src = path.join(cache, "textures", `${name}_${kind}.jpg`);
			await sharp(src).resize(1024, 1024).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(out, `${name}_${kind}.jpg`));
		}
	}
	console.log("textures done");
}

// --------------------------------------------------------------------------- sky cubemap

const faceDir = (face, a, b) => {
	// a,b in [-1,1], b is down the image. OpenGL cube map convention.
	switch (face) {
		case "px": return [1, -b, -a];
		case "nx": return [-1, -b, a];
		case "py": return [a, 1, b];
		case "ny": return [a, -1, -b];
		case "pz": return [a, -b, 1];
		case "nz": return [-a, -b, -1];
	}
};

async function sky() {
	const out = mk(path.join(assets, "Sky"));
	const id = "kloofendal_48d_partly_cloudy_puresky";
	const W = 8192, H = 4096;
	const { data } = await sharp(path.join(cache, "sky", `${id}.jpg`), { limitInputPixels: false }).resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	const size = 2048;
	const dirToEq = d => {
		const l = Math.hypot(...d);
		const x = d[0] / l, y = d[1] / l, z = d[2] / l;
		// below the horizon the sky is mirrored, so the sea meets haze rather than the HDRI's dark seam
		const lat = Math.asin(Math.abs(y)) * 0.97 + 0.012;
		return [(Math.atan2(x, -z) / (2 * Math.PI) + 0.5), (0.5 - lat / Math.PI)];
	};
	const sample = (u, v) => {
		const fx = Math.min(W - 1.001, Math.max(0, u * W - 0.5)), fy = Math.min(H - 1.001, Math.max(0, v * H - 0.5));
		const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
		const px = (x, y) => (y * W + (x % W)) * 3;
		const out = [0, 0, 0];
		for (let c = 0; c < 3; c++) {
			const a = data[px(x0, y0) + c] * (1 - tx) + data[px(x0 + 1, y0) + c] * tx;
			const b = data[px(x0, y0 + 1) + c] * (1 - tx) + data[px(x0 + 1, y0 + 1) + c] * tx;
			out[c] = a * (1 - ty) + b * ty;
		}
		return out;
	};
	for (const face of ["px", "py", "pz", "nx", "ny", "nz"]) {
		const buf = Buffer.alloc(size * size * 3);
		for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
			const a = ((i + 0.5) / size) * 2 - 1, b = ((j + 0.5) / size) * 2 - 1;
			const [u, v] = dirToEq(faceDir(face, a, b));
			const c = sample(u, v);
			const o = (j * size + i) * 3;
			buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
		}
		await sharp(buf, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(out, `sky_${face}.jpg`));
		console.log("sky face", face);
	}
	// sun: brightest blurred region of the equirect image
	let best = 0, bx = 0, by = 0;
	for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
		const o = (y * W + x) * 3;
		const l = data[o] + data[o + 1] + data[o + 2];
		if (l > best) { best = l; bx = x; by = y; }
	}
	const lon = ((bx / W) - 0.5) * 2 * Math.PI, lat = (0.5 - by / H) * Math.PI;
	const toSun = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)];
	fs.writeFileSync(path.join(out, "sky.json"), JSON.stringify({ toSun, brightness: best }, null, 1));
	console.log("sun direction (towards sun)", toSun.map(v => v.toFixed(3)).join(", "));
}

// --------------------------------------------------------------------------- rocks & landmarks

async function decimate(srcId, outName, ratio, error, texSize) {
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	const doc = await io.read(path.join(cache, "models", srcId, `${srcId}.gltf`));
	await MeshoptSimplifier.ready;
	await doc.transform(
		flatten(), weld(),
		simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
		prune(), dedup(),
		textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [texSize, texSize] })
	);
	const bytes = await io.writeBinary(doc);
	fs.writeFileSync(path.join(assets, "Models", `${outName}.glb`), bytes);
	let tris = 0;
	for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
	console.log(outName, Math.round(tris), "tris", Math.round(bytes.length / 1024), "KB");
}

async function rocks() {
	mk(path.join(assets, "Models"));
	const jobs = [
		["namaqualand_boulder_02", "boulder_b_lod0", 0.02, 0.02, 512], ["namaqualand_boulder_02", "boulder_b_lod1", 0.004, 0.05, 256],
		["namaqualand_boulder_03", "boulder_c_lod0", 0.03, 0.02, 512], ["namaqualand_boulder_03", "boulder_c_lod1", 0.006, 0.05, 256],
		["rock_face_01", "cliff_a", 0.25, 0.02, 1024],
		["modular_fort_01", "fort", 1, 0, 1024],
		["food_apple_01", "apple", 0.15, 0.02, 512],
		["stone_fire_pit", "firepit", 0.12, 0.03, 512],
		["stone_01", "shard", 0.02, 0.05, 512]
	];
	for (const j of jobs) await decimate(...j);
}

// --------------------------------------------------------------------------- monsters (FBX -> GLB)

globalThis.FileReader = class {
	readAsArrayBuffer(blob) { blob.arrayBuffer().then(buf => { this.result = buf; this.onloadend && this.onloadend(); }); }
	readAsDataURL(blob) { blob.arrayBuffer().then(buf => { this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + Buffer.from(buf).toString("base64"); this.onloadend && this.onloadend(); }); }
};

const PALETTES = {
	Dragon: { Main: ["#8a2d35", 0.55], Wings: ["#34283f", 0.7], Belly: ["#e0b030", 0.6], Claws: ["#1a1a1a", 0.5], Eyes: ["#ffb020", 0.2, "#ff7a00"] },
	Bat: { Main: ["#4b3a96", 0.6], Black: ["#15151c", 0.8], Belly: ["#e6a52a", 0.6], Nose: ["#c9607f", 0.5], Eyes: ["#101010", 0.2] },
	Skeleton: { Skeleton: ["#e8dec2", 0.8] },
	Slime: { Body: ["#6fe03f", 0.25], Eyes: ["#0a0a0a", 0.2] }
};

async function monsters() {
	const zip = path.join(cache, "monsters", "monsters.zip");
	const dir = path.join(cache, "monsters", "x");
	if (!fs.existsSync(dir)) {
		const { execFileSync } = await import("node:child_process");
		execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dir}'`]);
	}
	const base = fs.readdirSync(dir)[0];
	const out = mk(path.join(assets, "Monsters"));
	for (const name of Object.keys(PALETTES)) {
		const buf = fs.readFileSync(path.join(dir, base, "FBX", `${name}.fbx`));
		const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
		root.traverse(o => {
			if (!(o.isMesh || o.isSkinnedMesh)) return;
			const mats = [].concat(o.material).map(m => {
				const spec = PALETTES[name][m.name];
				const mat = new THREE.MeshStandardMaterial({ name: m.name, color: new THREE.Color(spec ? spec[0] : "#888888"), roughness: spec ? spec[1] : 0.8, metalness: 0 });
				if (spec && spec[2]) { mat.emissive = new THREE.Color(spec[2]); mat.emissiveIntensity = 1.2; }
				return mat;
			});
			o.material = Array.isArray(o.material) ? mats : mats[0];
		});
		root.scale.multiplyScalar(0.01); // FBX is in centimetres
		root.updateMatrixWorld(true);
		await new Promise((resolve, reject) => new GLTFExporter().parse(root, r => { fs.writeFileSync(path.join(out, `${name}.glb`), Buffer.from(r)); resolve(); }, reject, { binary: true, animations: root.animations, onlyVisible: false }));
		console.log("monster", name, root.animations.map(a => a.name.split("|").pop()).join(", "));
	}
	fs.copyFileSync(path.join(dir, base, "License.txt"), path.join(out, "License.txt"));
}

if (want("textures")) await textures();
if (want("sky")) await sky();
if (want("rocks")) await rocks();
if (want("monsters")) await monsters();

// --------------------------------------------------------------------------- the player's body

const AVATAR_COLORS = { Skin: ["#e6b290", 0.7], Clothes: ["#2d44a8", 0.8], Belt: ["#4a2e18", 0.8], Gold: ["#e3b13d", 0.4, null, 0.6], Hat: null, Hair: null, Face: null };

async function player() {
	const zip = path.join(cache, "characters", "characters.zip");
	const dir = path.join(cache, "characters", "x");
	if (!fs.existsSync(dir)) {
		const { execFileSync } = await import("node:child_process");
		execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${dir}'`]);
	}
	const base = fs.readdirSync(dir)[0];
	const buf = fs.readFileSync(path.join(dir, base, "FBX", "Wizard.fbx"));
	const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
	root.updateMatrixWorld(true);

	const bone = n => { let f = null; root.traverse(o => { if (o.name === n && o.isBone) f = o; }); return f; };
	const wpos = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
	const wquat = o => { const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(); o.matrixWorld.decompose(p, q, sc); return q; };   // the armature carries a scale of 100

	// Which way is forward? Toes are ahead of heels.
	const toe = wpos(bone("FootL_end")), heel = wpos(bone("FootL"));
	const forward = new THREE.Vector3(toe.x - heel.x, 0, toe.z - heel.z).normalize();
	const head = wpos(bone("Head"));
	const headTop = wpos(bone("Head_end"));
	const scale = 1.82 / headTop.y;
	const eye = (head.y + (headTop.y - head.y) * 0.55) * scale;
	console.log("player: forward", forward.toArray().map(v => v.toFixed(2)), "head", head.y.toFixed(1), "top", headTop.y.toFixed(1), "-> scale", scale.toFixed(5), "eye", eye.toFixed(3));

	// A flying pose: both arms overhead and a little apart, built on top of the rest pose.
	const tracks = [];
	for (const side of ["L", "R"]) {
		const sign = side === "L" ? 1 : -1;
		const side3 = new THREE.Vector3(1, 0, 0);
		const bones = [bone("UpperArm" + side), bone("LowerArm" + side)];
		const tip = bone("Fist" + side);
		const sideDir = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize().multiplyScalar(sign);
		const want = new THREE.Vector3(0, 1, 0).add(sideDir.multiplyScalar(-0.14)).add(forward.clone().multiplyScalar(0.12)).normalize();   // overhead: once the body lies flat, that is straight ahead
		bones.forEach((b, i) => {
			const next = i === 0 ? bones[1] : tip;
			b.updateMatrixWorld(true);
			const dir = wpos(next).sub(wpos(b)).normalize();
			const R = new THREE.Quaternion().setFromUnitVectors(dir, want);
			const parentQ = wquat(b.parent);
			const newLocal = parentQ.clone().invert().multiply(R).multiply(parentQ).multiply(b.quaternion);
			b.quaternion.copy(newLocal);
			root.updateMatrixWorld(true);
		});
		for (const b of bones) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + ".quaternion", [0, 1.5], [...b.quaternion.toArray(), ...b.quaternion.toArray()]));
	}
	// Every bone gets a track. A clip that animates only the arms leaves the rest of the body as the last clip left it,
	// which is how the body drifted from the camera after walking and taking off again.
	root.updateMatrixWorld(true);
	root.traverse(o => {
		if (!o.isBone) return;
		const mine = tracks.some(t => t.name === o.name + ".quaternion");
		if (!mine) tracks.push(new THREE.QuaternionKeyframeTrack(o.name + ".quaternion", [0, 1.5], [...o.quaternion.toArray(), ...o.quaternion.toArray()]));
		tracks.push(new THREE.VectorKeyframeTrack(o.name + ".position", [0, 1.5], [...o.position.toArray(), ...o.position.toArray()]));
		tracks.push(new THREE.VectorKeyframeTrack(o.name + ".scale", [0, 1.5], [...o.scale.toArray(), ...o.scale.toArray()]));
	});
	const fly = new THREE.AnimationClip("CharacterArmature|Fly", 1.5, tracks);
	// the skeleton goes back to its rest pose for export; the clips carry the poses
	const idle = root.animations.find(a => /Idle/.test(a.name));
	root.traverse(o => { if (o.isBone && o.userData) { /* poses restored below */ } });

	// The head is cut away: seen from inside it is only in the way. Triangles whose vertices all follow the head bone go.
	root.traverse(o => {
		if (!o.isSkinnedMesh) return;
		const g = o.geometry;
		if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
		const idx = g.index.array, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
		const headIndex = o.skeleton.bones.findIndex(b => b.name === "Head");
		const dominant = v => { let best = 0, w = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(v, k) > w) { w = sw.getComponent(v, k); best = si.getComponent(v, k); } return best; };
		const names = [].concat(o.material).map(m => m.name);
		const byMaterial = new Map();
		let removed = 0;
		if (g.groups.length === 0) g.addGroup(0, idx.length, 0);
		for (const grp of g.groups) {
			if (AVATAR_COLORS[names[grp.materialIndex]] === null) { removed += grp.count / 3; continue; }   // hat, hair, face
			if (!byMaterial.has(grp.materialIndex)) byMaterial.set(grp.materialIndex, []);
			const list = byMaterial.get(grp.materialIndex);
			for (let i = grp.start; i < grp.start + grp.count; i += 3) {
				const a = idx[i], b = idx[i + 1], c = idx[i + 2];
				if (dominant(a) === headIndex && dominant(b) === headIndex && dominant(c) === headIndex) { removed++; continue; }
				list.push(a, b, c);
			}
		}
		const out = [], groups = [];
		for (const [materialIndex, list] of byMaterial) { groups.push({ start: out.length, count: list.length, materialIndex }); for (const v of list) out.push(v); }
		g.setIndex(out);
		g.clearGroups();
		groups.forEach(grp => g.addGroup(grp.start, grp.count, grp.materialIndex));
		console.log("player: triangles removed", removed, "kept", out.length / 3, "groups", groups.length);
	});

	root.traverse(o => {
		if (!(o.isMesh || o.isSkinnedMesh)) return;
		o.material = [].concat(o.material).map(m => {
			const spec = AVATAR_COLORS[m.name];
			if (spec === null) return new THREE.MeshStandardMaterial({ name: m.name, transparent: true, opacity: 0, color: 0x000000 });   // the head is hidden: seen from inside it is only in the way
			const mat = new THREE.MeshStandardMaterial({ name: m.name, color: new THREE.Color(spec ? spec[0] : "#888888"), roughness: spec ? spec[1] : 0.8, metalness: spec && spec[3] ? spec[3] : 0 });
			return mat;
		});
		if (o.material.length === 1) o.material = o.material[0];
	});

	const keep = ["Idle", "Walk", "Shoot_OneHanded", "Victory", "RecieveHit"];
	root.animations = root.animations.filter(a => keep.some(k => a.name.endsWith("|" + k))).concat([fly]);
	root.scale.multiplyScalar(scale);
	root.updateMatrixWorld(true);

	const out = mk(path.join(assets, "Characters"));
	await new Promise((resolve, reject) => new GLTFExporter().parse(root, r => { fs.writeFileSync(path.join(out, "Wizard.glb"), Buffer.from(r)); resolve(); }, reject, { binary: true, animations: root.animations, onlyVisible: false }));
	fs.writeFileSync(path.join(out, "avatar.json"), JSON.stringify({ eye: +eye.toFixed(3), height: 1.82 }));
	console.log("player written", root.animations.map(a => a.name.split("|").pop()).join(", "));
}

if (want("player")) await player();

// --------------------------------------------------------------------------- the people of the overworld

const NPCS = {
	Witch: { out: "Maren", Skin: ["#e0ac88", 0.7], Clothes: ["#5b2f86", 0.8], Belt: ["#4a2e18", 0.8], Gold: ["#e3b13d", 0.4, 0.6], Hat: ["#3b2158", 0.8], Hair: ["#d4d4d8", 0.9], Face: ["#e0ac88", 0.7] },
	Knight_Male: { out: "Hale", Skin: ["#d9a67e", 0.7], Armor: ["#9ba4ae", 0.35, 0.8], Armor_Dark: ["#4d545d", 0.5, 0.6], Detail: ["#b8913f", 0.4, 0.7], Red: ["#8c2222", 0.8], Face: ["#d9a67e", 0.7] },
	Elf: { out: "Pip", Skin: ["#e9bf9c", 0.7], Clothes: ["#2f7a3a", 0.8], Belt: ["#4a2e18", 0.8], Gold: ["#e3b13d", 0.4, 0.6], Hat: ["#1f5a35", 0.8], Face: ["#e9bf9c", 0.7] }
};

async function npcs() {
	const dir = path.join(cache, "characters", "x");
	const base = fs.readdirSync(dir)[0];
	const out = mk(path.join(assets, "Characters"));
	for (const [name, spec] of Object.entries(NPCS)) {
		const buf = fs.readFileSync(path.join(dir, base, "FBX", name + ".fbx"));
		const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
		root.updateMatrixWorld(true);
		let top = 0;
		root.traverse(o => { if (o.isBone && o.name === "Head_end") top = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y; });
		root.traverse(o => {
			if (!(o.isMesh || o.isSkinnedMesh)) return;
			o.material = [].concat(o.material).map(m => {
				const c = spec[m.name] || ["#888888", 0.8];
				return new THREE.MeshStandardMaterial({ name: m.name, color: new THREE.Color(c[0]), roughness: c[1], metalness: c[2] || 0 });
			});
			if (o.material.length === 1) o.material = o.material[0];
		});
		const keep = ["Idle", "Walk", "Victory"];
		root.animations = root.animations.filter(a => keep.some(k => a.name.endsWith("|" + k)));
		root.scale.multiplyScalar(1.78 / top);
		root.updateMatrixWorld(true);
		await new Promise((resolve, reject) => new GLTFExporter().parse(root, r => { fs.writeFileSync(path.join(out, spec.out + ".glb"), Buffer.from(r)); resolve(); }, reject, { binary: true, animations: root.animations, onlyVisible: false }));
		console.log("npc", spec.out);
	}
}
if (want("npcs")) await npcs();

// --------------------------------------------------------------------------- plants and rocks (Poly Haven scans, reduced)

async function reduce(srcId, outName, ratio, error, texSize) {
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	const doc = await io.read(path.join(cache, "models", srcId, `${srcId}.gltf`));
	await MeshoptSimplifier.ready;
	await doc.transform(
		flatten(), weld(),
		simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }),
		prune(), dedup(),
		textureCompress({ encoder: sharp, targetFormat: "webp", resize: [texSize, texSize] })   // webp keeps the leaves' transparency
	);
	const bytes = await io.writeBinary(doc);
	fs.writeFileSync(path.join(mk(path.join(assets, "Models", "Flora")), `${outName}.glb`), bytes);
	let tris = 0;
	for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
	console.log(outName, Math.round(tris), "tris", Math.round(bytes.length / 1024), "KB");
}

async function flora() {
	const jobs = [
		["jacaranda_tree", "jacaranda_lod0", 0.1, 0.1, 1024], ["jacaranda_tree", "jacaranda_lod1", 0.03, 0.3, 512], ["jacaranda_tree", "jacaranda_lod2", 0.006, 0.6, 256],
		["quiver_tree_02", "quiver_lod0", 0.12, 0.01, 1024], ["quiver_tree_02", "quiver_lod1", 0.02, 0.04, 512],
		["island_tree_02", "island2_lod0", 0.02, 0.01, 1024], ["island_tree_02", "island2_lod1", 0.003, 0.04, 512],
		["island_tree_01", "island1_lod0", 0.01, 0.01, 1024], ["island_tree_01", "island1_lod1", 0.0015, 0.04, 512],
		["island_tree_02", "island2_lod2", 0.0006, 0.2, 256], ["island_tree_01", "island1_lod2", 0.0003, 0.2, 256],
		["wild_rooibos_bush", "bush_lod0", 0.06, 0.03, 512], ["wild_rooibos_bush", "bush_lod1", 0.012, 0.06, 256],
		["shrub_01", "shrub1", 0.05, 0.03, 512], ["shrub_02", "shrub2", 0.12, 0.02, 512],
		["fern_02", "fern", 0.14, 0.02, 512], ["flower_empodium", "flower_a", 0.15, 0.02, 512],
		["flower_gazania", "flower_b", 0.05, 0.03, 512], ["flower_ursinia", "flower_c", 0.05, 0.03, 512],
		["periwinkle_plant", "periwinkle", 0.08, 0.01, 512],
		["rock_moss_set_01", "mossrock_a_lod0", 0.25, 0.01, 1024], ["rock_moss_set_01", "mossrock_a_lod1", 0.04, 0.05, 512],
		["rock_moss_set_02", "mossrock_b_lod0", 0.25, 0.01, 1024], ["rock_moss_set_02", "mossrock_b_lod1", 0.04, 0.05, 512]
	];
	for (const j of jobs) { try { await reduce(...j); } catch (e) { console.log("failed", j[1], e.message); } }
}
if (want("flora")) await flora();
