// Downloads the third-party (CC0 / open licensed) source assets into Tools/cache.
// Nothing in cache is shipped; process-assets.mjs / generate-world.mjs turn it into Build/Assets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, "..", "..", "Scratch", "cache");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

export async function download(url, dest) {
	if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
	return dest;
}

const json = async url => (await fetch(url, { headers: { "User-Agent": UA } })).json();

// ------------------------------------------------------------------ Poly Haven

const TEXTURES = {
	grass: "forrest_ground_01",
	dirt: "forest_ground_04",
	rock: "aerial_rocks_02",
	sand: "aerial_beach_01",
	snow: "snow_02"
};

const MODELS = [
	"pine_tree_01", "fir_tree_01", "island_tree_01", "island_tree_02", "jacaranda_tree",
	"shrub_01", "shrub_02", "boulder_01", "rock_07", "rock_09", "namaqualand_boulder_02",
	"namaqualand_boulder_03", "stone_01", "rock_face_01", "modular_fort_01", "dead_tree_trunk", "food_apple_01", "stone_fire_pit"
];

const SKY = "kloofendal_48d_partly_cloudy_puresky";

async function polyTexture(name, id, res = "1k") {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	await download(files.Diffuse[res].jpg.url, path.join(cache, "textures", `${name}_diff.jpg`));
	await download(files.nor_gl[res].jpg.url, path.join(cache, "textures", `${name}_nor.jpg`));
	if (files.Rough) await download(files.Rough[res].jpg.url, path.join(cache, "textures", `${name}_rough.jpg`));
	console.log("texture", name, "<-", id);
}

async function polyModel(id, res = "1k") {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	const entry = files.gltf[res].gltf;
	const dir = path.join(cache, "models", id);
	await download(entry.url, path.join(dir, `${id}.gltf`));
	for (const [rel, info] of Object.entries(entry.include || {}))
		await download(info.url, path.join(dir, rel));
	console.log("model", id);
}

async function polySky(id) {
	const files = await json(`https://api.polyhaven.com/files/${id}`);
	await download(files.tonemapped.url, path.join(cache, "sky", `${id}.jpg`));
	console.log("sky", id);
}

// ------------------------------------------------------------------ audio

async function kenneyPack(slug) {
	const html = await (await fetch(`https://kenney.nl/assets/${slug}`, { headers: { "User-Agent": UA } })).text();
	const match = html.match(/href="([^"]+\.zip)"/i);
	if (!match) throw new Error("no zip link for " + slug);
	const url = new URL(match[1], "https://kenney.nl").toString();
	const dest = path.join(cache, "audio", `${slug}.zip`);
	await download(url, dest);
	console.log("kenney", slug, url);
	return dest;
}

async function characters() {
	await download("https://opengameart.org/sites/default/files/ultimate_animated_character_pack_by_quaternius.zip", path.join(cache, "characters", "characters.zip"));
	console.log("characters");
}

const MUSIC = [
	// Kevin MacLeod (incompetech.com), CC BY 4.0
	["Heroic Age", "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heroic%20Age.mp3"],
	["Skye Cuillin", "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Skye%20Cuillin.mp3"],
	["Crusade", "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Crusade.mp3"],
	["Eternal Hope", "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Eternal%20Hope.mp3"]
];

async function monsters() {
	const dest = path.join(cache, "monsters", "monsters.zip");
	await download("https://opengameart.org/sites/default/files/Animated%20Monster%20Pack%20by%20%40Quaternius.zip", dest);
	console.log("monsters", dest);
}

const only = process.argv.slice(2);
const want = k => only.length === 0 || only.includes(k);

if (want("textures")) for (const [name, id] of Object.entries(TEXTURES)) await polyTexture(name, id);
if (want("models")) for (const id of MODELS) await polyModel(id);
if (want("sky")) await polySky(SKY);
if (want("monsters")) await monsters();
if (want("characters")) await characters();
if (want("audio")) {
	for (const slug of []) { // kenney.nl hides its zip links behind a script; sfx are synthesised instead
		try { await kenneyPack(slug); } catch (e) { console.warn("kenney", slug, e.message); }
	}
	for (const [name, url] of MUSIC) {
		try { await download(url, path.join(cache, "audio", `${name}.mp3`)); console.log("music", name); }
		catch (e) { console.warn("music", name, e.message); }
	}
}

// Foliage cards need the separate alpha channel Poly Haven ships beside the twig colour.
if (want("alpha")) {
	for (const id of ["pine_tree_01", "fir_tree_01"]) {
		const files = await json(`https://api.polyhaven.com/files/${id}`);
		await download(files.twig_alpha["1k"].jpg.url, path.join(cache, "models", id, "textures", `${id}_twig_alpha_1k.jpg`));
		console.log("alpha", id);
	}
}
