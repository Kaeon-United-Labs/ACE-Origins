// Takes already rigged and animated models from the Babylon.js Meshes Library (CC BY 4.0) and shrinks their textures. Nothing is animated here.
//   node process-library.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, dedup, textureCompress } from "@gltf-transform/functions";
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, "..", "..", "Scratch", "dl", "MeshesLibrary");
const assets = path.join(here, "..", "Assets");
const jobs = [["fish.glb", "Models/Sea/shoal.glb", 512], ["shark.glb", "Models/Sea/shark.glb", 1024], ["ufo.glb", "Monsters/Drone.glb", 1024]];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [src, dst, tex] of jobs) {
	const doc = await io.read(path.join(lib, src));
	await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [tex, tex] }));
	const bytes = await io.writeBinary(doc);
	fs.mkdirSync(path.dirname(path.join(assets, dst)), { recursive: true });
	fs.writeFileSync(path.join(assets, dst), bytes);
	console.log(dst, Math.round(bytes.length / 1024), "KB, clips", doc.getRoot().listAnimations().map(a => a.getName()).join("/"));
}
