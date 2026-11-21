// Builds the people of the game from Quaternius's CC0 Universal Base Characters and Universal Animation Library:
// the character's mesh and skeleton, with the library's clips written onto that skeleton by bone name (the two share the
// Unreal mannequin's 65 bones and rest pose, so quaternions copy straight across; the library's pelvis is a little lower, so
// its travel is scaled to match).
//   node process-people.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, textureCompress } from "@gltf-transform/functions";

const here = path.dirname(fileURLToPath(import.meta.url));
const dl = path.join(here, "..", "..", "Scratch", "dl");
const pack = path.join(dl, "Universal Base Characters[Standard]");
const bodies = path.join(pack, "Base Characters", "Godot - UE");
const hairDir = path.join(pack, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)");
const out = path.join(here, "..", "Assets", "Characters");
fs.mkdirSync(out, { recursive: true });

// ---- the clips, from the FBX that shares the character's bone names
const fbxPath = path.join(dl, "ual", "Animation Library[Standard]", "Unreal Engine", "AL_Standard.fbx");
const fb = fs.readFileSync(fbxPath);
const lib = new FBXLoader().parse(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength), "");
const KEEP = new Set(["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Swim_Fwd_Loop", "Swim_Idle_Loop",
	"Spell_Simple_Enter", "Spell_Simple_Idle_Loop", "Spell_Simple_Shoot", "Spell_Simple_Exit", "Hit_Chest", "Hit_Head", "Death01", "Interact", "PickUp_Table", "Sword_Idle", "Sword_Attack",
	"Crouch_Idle_Loop", "Crouch_Fwd_Loop", "Roll", "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Dance_Loop", "Idle_Torch_Loop", "Punch_Jab", "Walk_Formal_Loop"]);
const clips = lib.animations.map(a => ({ name: a.name.replace(/^.*\|/, ""), a })).filter(c => KEEP.has(c.name));
console.log("clips", clips.length);

// the library's pelvis stands 0.877 m up and the character's 0.95 m
const PELVIS = 0.95 / 0.877;


// ---- clothing: a skinned shell raised off the parts of the body that a garment covers, and hair copied across from the pack
const GARMENTS = {
	shirt: { joints: ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "upperarm_twist_01_l", "upperarm_twist_01_r", "lowerarm_twist_01_l", "lowerarm_twist_01_r"], lift: 0.011 },
	pants: { joints: ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r", "thigh_twist_01_l", "thigh_twist_01_r", "calf_twist_01_l", "calf_twist_01_r"], lift: 0.014 },
	boots: { joints: ["foot_l", "foot_r", "ball_l", "ball_r"], lift: 0.016 }
};

async function weave(size, tone) {
	const buf = Buffer.alloc(size * size * 3);
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
		const over = ((x >> 2) + (y >> 2)) & 1;
		const v = Math.round(tone * (over ? 0.93 : 1.0) * (0.94 + 0.06 * Math.sin(x * 1.7) * Math.sin(y * 1.9)) * 255);
		buf.set([v, v, v], (y * size + x) * 3);
	}
	return sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}
const clothTex = await weave(256, 0.92);

function copyPrimitive(doc, buffer, src, material, { lift = 0, uvScale = 1, keep = null } = {}) {
	const pos = src.getAttribute("POSITION").getArray(), nrm = src.getAttribute("NORMAL").getArray(), uv = src.getAttribute("TEXCOORD_0").getArray();
	const jn = src.getAttribute("JOINTS_0").getArray(), wt = src.getAttribute("WEIGHTS_0").getArray(), idx = src.getIndices().getArray();
	const n = pos.length / 3, remap = new Int32Array(n).fill(-1), order = [];
	const tris = [];
	for (let t = 0; t < idx.length; t += 3) {
		const a = idx[t], b = idx[t + 1], c = idx[t + 2];
		if (keep && !(keep(a) && keep(b) && keep(c))) continue;
		tris.push(a, b, c);
		for (const v of [a, b, c]) if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
	}
	const m = order.length;
	const P = new Float32Array(m * 3), N = new Float32Array(m * 3), U = new Float32Array(m * 2), J = new jn.constructor(m * 4), W = new Float32Array(m * 4);
	order.forEach((v, k) => {
		for (let c = 0; c < 3; c++) { P[k * 3 + c] = pos[v * 3 + c] + nrm[v * 3 + c] * lift; N[k * 3 + c] = nrm[v * 3 + c]; }
		U[k * 2] = uv[v * 2] * uvScale; U[k * 2 + 1] = uv[v * 2 + 1] * uvScale;
		for (let c = 0; c < 4; c++) { J[k * 4 + c] = jn[v * 4 + c]; W[k * 4 + c] = wt[v * 4 + c]; }
	});
	const I = new Uint32Array(tris.length); for (let k = 0; k < tris.length; k++) I[k] = remap[tris[k]];
	const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
	return doc.createPrimitive().setAttribute("POSITION", acc("VEC3", P)).setAttribute("NORMAL", acc("VEC3", N)).setAttribute("TEXCOORD_0", acc("VEC2", U))
		.setAttribute("JOINTS_0", acc("VEC4", J)).setAttribute("WEIGHTS_0", acc("VEC4", W)).setIndices(acc("SCALAR", I)).setMaterial(material);
}

const mean = (v) => v;
async function build(name, spec) {
	const file = spec.male ? "Superhero_Male_FullBody.gltf" : "Superhero_Female_FullBody.gltf";
	// the glTF names two normal maps that the pack stores elsewhere
	const json = JSON.parse(fs.readFileSync(path.join(bodies, file), "utf8"));
	for (const im of json.images) {
		if (!fs.existsSync(path.join(bodies, im.uri))) {
			const alt = im.uri.replace("_png.png", ".png");
			const found = [path.join(pack, "Base Characters", "Textures", "Normals Unity - Godot", alt), path.join(pack, "Base Characters", "Textures", alt)].find(fs.existsSync);
			if (found) fs.copyFileSync(found, path.join(bodies, im.uri));
		}
	}
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	const doc = await io.read(path.join(bodies, file));
	const root = doc.getRoot();
	const buffer = root.listBuffers()[0];
	const byName = {};
	root.listNodes().forEach(n => { byName[n.getName()] = n; });
	const skin = root.listSkins()[0];
	const joints = skin.listJoints().map(j => j.getName());
	const jointIndex = {}; joints.forEach((j, i) => { jointIndex[j] = i; });

	// the chosen skin texture
	const bodyMat = root.listMaterials().find(m => /Superhero/.test(m.getName()));
	bodyMat.setBaseColorTexture(doc.createTexture("skin").setImage(new Uint8Array(fs.readFileSync(spec.skin))).setMimeType("image/png"));

	// the mesh node that carries the body; garments and hair hang beside it
	const bodyNode = root.listNodes().find(n => n.getMesh() && n.getSkin());
	const parent = bodyNode.getParentNode() || null;
	const addMesh = (label, prims) => {
		const mesh = doc.createMesh(label);
		prims.forEach(p => mesh.addPrimitive(p));
		const node = doc.createNode(label).setMesh(mesh).setSkin(skin);
		if (parent) parent.addChild(node); else root.listScenes()[0].addChild(node);
		return node;
	};

	// find the body primitive (the one with the skin material) and its per-vertex weight on a set of joints
	const bodyMesh = root.listMeshes().find(m => m.listPrimitives().some(p => p.getMaterial() === bodyMat));
	const bodyPrim = bodyMesh.listPrimitives().find(p => p.getMaterial() === bodyMat);
	const J = bodyPrim.getAttribute("JOINTS_0").getArray(), W = bodyPrim.getAttribute("WEIGHTS_0").getArray();
	const share = set => v => { let t = 0; for (let c = 0; c < 4; c++) if (set.has(J[v * 4 + c])) t += W[v * 4 + c]; return t; };

	const originalMeshes = root.listNodes().filter(n => n.getMesh()).map(n => n.getMesh());
	const garmentsOf = spec.outfit || {};
	let bodyForShell = bodyPrim;
	for (const [kind, g] of Object.entries(GARMENTS)) {
		const colour = garmentsOf[kind];
		if (!colour) continue;
		const set = new Set(g.joints.filter(j => jointIndex[j] != null).map(j => jointIndex[j]));
		const f = share(set);
		const tex = doc.createTexture(kind).setImage(new Uint8Array(clothTex)).setMimeType("image/png");
		const mat = doc.createMaterial(kind + "_" + name).setBaseColorFactor([colour[0], colour[1], colour[2], 1]).setBaseColorTexture(tex).setRoughnessFactor(kind === "boots" ? 0.55 : 0.88).setMetallicFactor(kind === "boots" ? 0.05 : 0).setDoubleSided(true);
		const prim = copyPrimitive(doc, buffer, bodyForShell, mat, { lift: g.lift, uvScale: 14, keep: v => f(v) > 0.35 });
		addMesh(kind + "_" + name, [prim]);
	}

	// the head, for an avatar the camera sits inside
	if (spec.headless) {
		const head = new Set(["Head", "neck_01", "neck_02"].filter(j => jointIndex[j] != null).map(j => jointIndex[j]));
		const keepBody = copyPrimitive(doc, buffer, bodyPrim, bodyMat, { keep: v => share(head)(v) < 0.35 });
		bodyMesh.removePrimitive(bodyPrim); bodyPrim.dispose();
		bodyMesh.addPrimitive(keepBody);
		for (const m of root.listMeshes()) if (m !== bodyMesh && /Face|Sphere/i.test(m.getName()) === false) { /* hair and brows are added below, never here */ }
		// the eyes and face cards ride on their own meshes
		for (const n of root.listNodes()) if (n.getMesh() && n.getMesh() !== bodyMesh && originalMeshes.includes(n.getMesh())) { n.getMesh().listPrimitives().forEach(p => p.dispose()); n.getMesh().dispose(); n.setMesh(null); }
	}

	// hair, eyebrows, beard: from the pack, rigged to the same head bone
	if (!spec.headless) {
		for (const h of spec.hair || []) {
			const hdoc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(path.join(hairDir, h + ".gltf"));
			const prims = [];
			for (const m of hdoc.getRoot().listMeshes()) for (const sp of m.listPrimitives()) {
				const smat = sp.getMaterial();
				const mat = doc.createMaterial(h + "_" + name).setRoughnessFactor(0.6).setMetallicFactor(0).setDoubleSided(true).setAlphaMode("MASK").setAlphaCutoff(0.4);
				const tint = /Eyebrows/.test(h) ? spec.brow || spec.hairTint : spec.hairTint;
				mat.setBaseColorFactor([tint[0], tint[1], tint[2], 1]);
				const bt = smat.getBaseColorTexture();
				if (bt) mat.setBaseColorTexture(doc.createTexture(h).setImage(new Uint8Array(bt.getImage())).setMimeType(bt.getMimeType()));
				const nt = smat.getNormalTexture();
				if (nt) mat.setNormalTexture(doc.createTexture(h + "_n").setImage(new Uint8Array(nt.getImage())).setMimeType(nt.getMimeType()));
				prims.push(copyPrimitive(doc, buffer, sp, mat));
			}
			addMesh(h + "_" + name, prims);
		}
	}

	// ---- a flying pose: arms stretched ahead of a lying body (overhead on the standing rig), legs together and straight
	{
		const THREEQ = (q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]);
		const worldQ = n => { const m = new THREE.Matrix4().fromArray(n.getWorldMatrix()); const q = new THREE.Quaternion(); m.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q; };
		const worldP = n => { const m = new THREE.Matrix4().fromArray(n.getWorldMatrix()); return new THREE.Vector3().setFromMatrixPosition(m); };
		const pose = {};
		const aim = (bone, child, dir) => {
			const n = byName[bone], c = byName[child];
			const current = worldP(c).sub(worldP(n)).normalize();
			const delta = new THREE.Quaternion().setFromUnitVectors(current, dir);
			const wq = worldQ(n);
			const parentQ = worldQ(n.getParentNode());
			const target = delta.multiply(wq);
			const local = parentQ.clone().invert().multiply(target);
			pose[bone] = local;
			// later bones in the chain see this one's new world orientation: apply it so they are computed in place
			n.setRotation([local.x, local.y, local.z, local.w]);
		};
		const saved = {};
		for (const b of ["upperarm_l", "lowerarm_l", "hand_l", "upperarm_r", "lowerarm_r", "hand_r"]) saved[b] = byName[b].getRotation().slice();
		const up = new THREE.Vector3(0, 1, 0);
		for (const side of ["l", "r"]) {
			aim("upperarm_" + side, "lowerarm_" + side, up);
			aim("lowerarm_" + side, "hand_" + side, up);
			aim("hand_" + side, "middle_01_" + side, up);
		}
		const flyRot = {}; for (const b of Object.keys(saved)) flyRot[b] = byName[b].getRotation().slice();
		for (const b of Object.keys(saved)) byName[b].setRotation(saved[b]);
		const anim = doc.createAnimation("Fly");
		const rest = n => n.getRotation().slice();
		const bonesFly = Object.keys(flyRot).concat(["spine_02", "spine_03", "neck_01", "Head", "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r"]);
		const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0, 1, 2])).setBuffer(buffer);
		for (const b of bonesFly) {
			const node = byName[b]; if (!node) continue;
			const base = flyRot[b] || rest(node);
			const out = [];
			for (let k = 0; k < 3; k++) {
				const q = new THREE.Quaternion(...base);
				// a slow flutter in the hands and a little arch in the back
				const wob = (b.startsWith("hand") || b.startsWith("lowerarm")) && k === 1 ? 0.05 : 0;
				if (wob) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wob, 0, wob)));
				if (b === "spine_03" || b === "neck_01") q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12 * (k === 1 ? 1.3 : 1), 0, 0)));
				if (b.startsWith("thigh")) q.slerp(new THREE.Quaternion(...rest(node)), 0.0);
				out.push(q.x, q.y, q.z, q.w);
			}
			const output = doc.createAccessor().setType("VEC4").setArray(new Float32Array(out)).setBuffer(buffer);
			const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
			anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sampler));
		}
	}

	// ---- the library's clips, by bone name
	let n = 0;
	for (const { name: clipName, a } of clips) {
		const anim = doc.createAnimation(clipName);
		for (const t of a.tracks) {
			const dot = t.name.lastIndexOf(".");
			const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
			const node = byName[bone];
			if (!node || bone === "root") continue;
			if (prop === "scale") continue;
			if (prop === "position" && bone !== "pelvis") continue;
			const input = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(t.times)).setBuffer(buffer);
			let values = Float32Array.from(t.values);
			if (prop === "position") values = values.map(v => v * PELVIS);
			const output = doc.createAccessor().setType(prop === "quaternion" ? "VEC4" : "VEC3").setArray(values).setBuffer(buffer);
			const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
			anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(prop === "quaternion" ? "rotation" : "translation").setSampler(sampler));
			n++;
		}
	}
	await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }));
	const bytes = await io.writeBinary(doc);
	fs.writeFileSync(path.join(out, name + ".glb"), bytes);
	let tris = 0;
	for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
	const headY = byName["Head"] ? new THREE.Matrix4().fromArray(byName["Head"].getWorldMatrix()).elements[13] : 0;
	console.log(name, Math.round(tris), "tris,", root.listAnimations().length, "clips,", Math.round(bytes.length / 1024), "KB, head at", headY.toFixed(3));
	return headY;
}

const T = path.join(pack, "Base Characters", "Textures");
const C = (h) => h.match(/\w\w/g).map(x => Math.pow(parseInt(x, 16) / 255, 2.2));   // sRGB hex to the linear factor glTF wants
const people = {
	// (the player has no body: no Hero)
	Maren: { male: false, skin: path.join(T, "T_Superhero_Female_Light_BaseColor.png"), hair: ["Hair_Buns", "Eyebrows_Female"], hairTint: C("d9d9de"), outfit: { shirt: C("5b2f86"), pants: C("43276a"), boots: C("3a2a1d") } },
	Hale: { male: true, skin: path.join(T, "T_Superhero_Male_Dark.png"), hair: ["Hair_Buzzed", "Hair_Beard", "Eyebrows_Regular"], hairTint: C("2a1d16"), outfit: { shirt: C("8a929c"), pants: C("5b1f1f"), boots: C("201814") } },
	Ione: { male: false, skin: path.join(T, "T_Superhero_Female_Dark_BaseColor.png"), hair: ["Hair_Long", "Eyebrows_Female"], hairTint: C("1b1410"), outfit: { shirt: C("dfe6ea"), pants: C("2f5f73"), boots: C("2a2018") } },
	Pip: { male: true, skin: path.join(T, "T_Superhero_Male_Ligh.png"), hair: ["Hair_SimpleParted", "Eyebrows_Regular"], hairTint: C("b0602a"), outfit: { shirt: C("3c8a46"), pants: C("6b4a2c"), boots: C("3a2a1d") } }
};
let eye = 0;
for (const [name, spec] of Object.entries(people)) {
	const headY = await build(name, spec);
	if (name === "Hero") eye = headY + 0.09;
}
if (eye > 0) fs.writeFileSync(path.join(out, "avatar.json"), JSON.stringify({ eye: +eye.toFixed(3) }));   // (the player's eye height; kept from when there was a Hero)
console.log("eye height", eye.toFixed(3));
