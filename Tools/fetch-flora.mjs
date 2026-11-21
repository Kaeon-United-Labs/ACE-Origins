// Poly Haven plants and rocks (CC0) for the ground cover and the groves: node fetch-flora.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, "..", "..", "Scratch", "cache", "models");
const IDS = ["fern_02", "flower_empodium", "flower_gazania", "flower_ursinia", "wild_rooibos_bush", "quiver_tree_02", "rock_moss_set_01", "rock_moss_set_02", "periwinkle_plant", "shrub_01", "shrub_02", "jacaranda_tree", "island_tree_02", "island_tree_01"];
const json = async url => (await fetch(url)).json();
const download = async (url, dest) => {
	if (fs.existsSync(dest)) return;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()));
};
for (const id of IDS) {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	const entry = files.gltf["1k"].gltf, dir = path.join(cache, id);
	await download(entry.url, path.join(dir, `${id}.gltf`));
	for (const [rel, info] of Object.entries(entry.include || {})) await download(info.url, path.join(dir, rel));
	console.log("model", id);
}
