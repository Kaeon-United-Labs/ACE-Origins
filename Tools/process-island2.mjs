// Assets for the second island: Kenney's City Kits (CC0, from OpenGameArt), Poly Haven textures and furniture (CC0). Run after downloading the kits into Scratch/dl.
//   node process-island2.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplify, prune, dedup, flatten, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
const here = path.dirname(fileURLToPath(import.meta.url));
const dl = path.join(here, "..", "..", "Scratch", "dl", "city");
const cache = path.join(here, "..", "..", "Scratch", "cache");
const assets = path.join(here, "..", "Assets");
const mk = d => (fs.mkdirSync(d, { recursive: true }), d);
const json = async u => (await fetch(u)).json();
const grab = async (u, d) => { if (fs.existsSync(d)) return; mk(path.dirname(d)); fs.writeFileSync(d, Buffer.from(await (await fetch(u)).arrayBuffer())); };
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---- buildings, as shipped: colour comes from one small palette image shared by every model
const out = mk(path.join(assets, "Models", "City"));
let n = 0;
for (const kit of ["c", "s"]) for (const f of fs.readdirSync(path.join(dl, kit)).filter(x => /^building/.test(x) && x.endsWith(".glb"))) {
	const doc = await io.read(path.join(dl, kit, f));
	await doc.transform(prune(), dedup());
	fs.writeFileSync(path.join(out, kit + "_" + f), await io.writeBinary(doc)); n++;
}
console.log("buildings", n);

// ---- textures
const TEX = { road: "asphalt_02", floor: "laminate_floor_02", wall: "plastered_wall_04", paving: "concrete_tiles", tile: "terrazzo_tiles" };
for (const [name, id] of Object.entries(TEX)) {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	await grab(files.Diffuse["1k"].jpg.url, path.join(cache, "textures", `${name}_diff.jpg`));
	await grab(files.nor_gl["1k"].jpg.url, path.join(cache, "textures", `${name}_nor.jpg`));
	for (const k of ["diff", "nor"]) await sharp(path.join(cache, "textures", `${name}_${k}.jpg`)).resize(512, 512).jpeg({ quality: 85 }).toFile(path.join(mk(path.join(assets, "Textures")), `${name}_${k}.jpg`));
	console.log("texture", name, "<-", id);
}

// ---- furniture
const FURN = [["modern_wooden_cabinet", "cabinet", 0.1], ["drawer_cabinet", "drawers", 0.08], ["Rockingchair_01", "rocker", 0.2], ["potted_plant_04", "plant", 0.6], ["wall_clock", "clock", 0.8], ["painted_wooden_cabinet", "dresser", 0.8], ["Lantern_01", "lantern", 0.08]];
await MeshoptSimplifier.ready;
for (const [id, name, ratio] of FURN) {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	const entry = files.gltf["1k"].gltf, dir = path.join(cache, "models", id);
	await grab(entry.url, path.join(dir, `${id}.gltf`));
	for (const [rel, info] of Object.entries(entry.include || {})) await grab(info.url, path.join(dir, rel));
	const doc = await io.read(path.join(dir, `${id}.gltf`));
	await doc.transform(flatten(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }), prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512] }));
	const bytes = await io.writeBinary(doc);
	fs.writeFileSync(path.join(mk(path.join(assets, "Models", "Furniture")), name + ".glb"), bytes);
	let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
	console.log("furniture", name, Math.round(t), "tris", Math.round(bytes.length / 1024), "KB");
}
