// Assembles "Build/ACE Origins.json", the page that runs it, and a copy of the engine.
//   node build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { defs } from "./defs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.resolve(here, "..");
const source = path.join(build, "Source");
const assets = path.join(build, "Assets");
const engineSrc = path.resolve(build, "..", "Docs", "Resource", "ACE", "Code", "Engine", "Core", "Babylon");

const meta = JSON.parse(fs.readFileSync(path.join(here, "world.meta.json"), "utf8"));
const EYE = JSON.parse(fs.readFileSync(path.join(assets, "Characters", "avatar.json"), "utf8")).eye;
const skyInfo = JSON.parse(fs.readFileSync(path.join(assets, "Sky", "sky.json"), "utf8"));

// ------------------------------------------------------------------ colours taken from the sky itself

async function faceMean(face, y0, y1) {
	const { data, info } = await sharp(path.join(assets, "Sky", `sky_${face}.jpg`)).raw().toBuffer({ resolveWithObject: true });
	let r = 0, g = 0, b = 0, n = 0;
	for (let y = Math.floor(info.height * y0); y < Math.floor(info.height * y1); y++)
		for (let x = 0; x < info.width; x++) { const o = (y * info.width + x) * info.channels; r += data[o]; g += data[o + 1]; b += data[o + 2]; n++; }
	return [r / n / 255, g / n / 255, b / n / 255];
}
const avg = list => list[0].map((_, i) => list.reduce((s, c) => s + c[i], 0) / list.length);
const lin = c => c.map(v => Math.pow(v, 2.2));
const horizon = avg(await Promise.all(["px", "nx", "pz", "nz"].map(f => faceMean(f, 0.5, 0.56))));
const zenith = await faceMean("py", 0.3, 0.7);
const fogColor = horizon.map(v => +v.toFixed(4));   // PBR materials fog in display space
const skyAmbient = lin(zenith).map(v => +v.toFixed(4));
console.log("horizon", horizon.map(v => v.toFixed(3)), "fog (linear)", fogColor);

// ------------------------------------------------------------------ helpers

const TAG = "telos-ace";
const comp = (type, data, extra = {}) => ({ ...extra, properties: { tags: [type, TAG], data } });
const entity = (data, utilities, packages, tags) => {
	const e = { properties: { meta: { data } } };
	if (tags) e.properties.meta.tags = tags;
	if (utilities) e.utilities = utilities;
	if (packages) e.packages = packages;
	return e;
};
const round = (v, n = 3) => +v.toFixed(n);

const read = file => fs.readFileSync(path.join(source, file), "utf8");
const NL = "\n";
const script = (file, order, extra = {}) => comp("script", { language: "js", mode: "blunt", output: "patch", order, ...extra },
	{ content: (file === "cursor.js" ? "" : read("prelude.js") + NL) + read(file) });

// Several sections as one script. Every script is handed the whole document as a string each frame, and the engine
// re-resolves the document after each one, so the frame's logic is written as sections and run as a single script;
// each section sees what the ones before it decided.
const sections = (files, order) => {
	const body = files.map(file =>
		"// ---- " + file + NL + "{" + NL + read(file).replace(/return done\(\);\s*$/, "") + NL + "}" + NL + "mergeInto(S, patch);" + NL
	).join(NL);
	return comp("script", { language: "js", mode: "blunt", output: "patch", order },
		{ content: read("prelude.js") + NL + body + NL + "return done();" + NL });
};

const sunDir = skyInfo.toSun;
const lightForward = sunDir.map(v => -v);
const sunYaw = Math.atan2(-lightForward[0], -lightForward[2]);
const sunPitch = Math.asin(lightForward[1]);

const spawn = [meta.spawn.x, meta.spawn.y, meta.spawn.z];
const toward = meta.lairs.reduce((best, l) => (!best || Math.hypot(l[0] - spawn[0], l[2] - spawn[2]) < Math.hypot(best[0] - spawn[0], best[2] - spawn[2])) ? l : best, null);
const spawnYaw = 0;
const pois = meta.pois;
const footSpawn = [round(pois.camp.x), round(pois.camp.y + 1.5), round(pois.camp.z + 7)];

// ------------------------------------------------------------------ world

const doc = { packages: {} };
const P = doc.packages;

P.world = entity({}, {
	settings: comp("world", {
		gravity: null,
		background: { texture: "sky.cubemap" },
		horizon: 1000,
		ambient: [0, 0, 0],
		fog: { color: fogColor, density: 0.00016 },
		post: {
			exposure: 1.0, contrast: 1.0,
			// the finish: glow round the very bright, smoothed edges, then a filmic curve with cool shadows and warm highlights
			finish: { bloom: { threshold: 0.84, weight: 0.34, kernel: 64, scale: 0.5 }, fxaa: true, grade: { exposure: 0.86, saturation: 0.9, contrast: 1.1, shadows: [0.94, 1.0, 1.05], highlights: [1.04, 1.0, 0.95], vignette: 0.24, sharpen: 0.3 } }
		},
		requires: []
	})
});

P.sky = entity({}, {
	cubemap: comp("texture", { cube: true, faces: ["_px.jpg", "_py.jpg", "_pz.jpg", "_nx.jpg", "_ny.jpg", "_nz.jpg"] },
		{ source: ["Assets/Sky/sky"] })
});

P.sun = entity({ rotation: [round(sunPitch, 4), round(sunYaw, 4), 0] }, {
	light: comp("light", { type: "directional", color: [1.0, 0.94, 0.82], intensity: 3.0 })
});

P.skyfill = entity({}, {
	light: comp("light", { type: "ambient", color: skyAmbient.map(v => round(Math.min(1, v * 2.2 + 0.25), 3)), ground: [0.3, 0.27, 0.2], intensity: 0.9 })
});

P.terrain = entity({ position: [0, 0, 0] }, {
	ground: comp("terrain", {
		size: [meta.size, meta.size],
		elevation: meta.elevation,
		encoding: "rg16",
		chunk: 128,
		tile: 5,
		rockTile: 8,
		grassTint: [0.78, 1.0, 0.62],
		blend: 340,
		lods: [{ range: 560, step: 1 }, { range: 1300, step: 2 }, { range: 3000, step: 4 }, { range: 6500, step: 8 }, { range: 1e9, step: 16 }],
		layers: { splat: "Assets/Terrain/splat.png" }
	}, { source: ["Assets/Terrain/height.png"] })
}, null, ["ground"]);

// The sea is a component of its own (see aceWorld.js): depth-coloured from the terrain's own height image, foamed at the shore,
// rippled by layers that drift, and seen from both sides. Under it the floor goes down to a plain of sand.
const SEA_LEVEL = -0.35, SEA_FLOOR = -72;
const W2m = JSON.parse(fs.readFileSync(path.join(here, "world2.meta.json"), "utf8"));
P.water = entity({ position: [10240, SEA_LEVEL, 0] }, {
	surface: comp("water", {
		size: [40000, 40000], segments: 400,
		shallow: [0.16, 0.64, 0.62], deep: [0.015, 0.16, 0.3], under: [0.05, 0.34, 0.48],
		terrain: { size: meta.size, elevation: meta.elevation, resolution: meta.resolution, floor: SEA_FLOOR, center: [0, 0] },
		terrain2: { height: "Assets/Terrain/height2.png", size: W2m.size, elevation: W2m.elevation, resolution: W2m.resolution, center: W2m.center }
	})
});
// The sea floor beyond the maps' edges, level with the flat borders the maps settle to. It is made of rectangles that meet the maps and never
// overlap them: two surfaces a few centimetres apart fight over which is in front.
{
	const seabed = {};
	const maps = [[-meta.size / 2, meta.size / 2, -meta.size / 2, meta.size / 2], [W2m.center[0] - W2m.size / 2, W2m.center[0] + W2m.size / 2, W2m.center[1] - W2m.size / 2, W2m.center[1] + W2m.size / 2]];
	const X0 = -10500, X1 = 31000, Z0 = -10500, Z1 = 10500;
	const xs = [...new Set([X0, X1, ...maps.flatMap(m => [m[0], m[1]])])].sort((a, b) => a - b);
	let n = 0;
	for (let i = 0; i < xs.length - 1; i++) {
		const xa = xs[i], xb = xs[i + 1], mid = (xa + xb) / 2;
		const holes = maps.filter(m => mid > m[0] && mid < m[1]).sort((a, b) => a[2] - b[2]);
		let z = Z0;
		const cuts = [];
		for (const h of holes) { if (h[2] > z) cuts.push([z, h[2]]); z = Math.max(z, h[3]); }
		if (z < Z1) cuts.push([z, Z1]);
		for (const [za, zb] of cuts) {
			const w = xb - xa, d = zb - za;
			seabed["s" + n++] = entity({ position: [(xa + xb) / 2, SEA_FLOOR, (za + zb) / 2] }, {
				mesh: comp("mesh", { shape: "ground", size: [w, 1, d], segments: 1, shadow: { cast: false, receive: false } }),
				sand: comp("material", { color: [0.78, 0.8, 0.78, 1], metallic: 0, roughness: 1, maps: { base: "Assets/Textures/sand_diff.jpg", normal: "Assets/Textures/sand_nor.jpg" }, tiling: [w / 16, d / 16] })
			}, null, ["ground"]);
		}
	}
	P.seabed = entity({}, null, seabed);
}

// clouds: heaps of puffs, in three dimensions, that drift with the wind
P.clouds = entity({}, {
	field: comp("clouds", { altitude: 1400, thickness: 560, cover: 0.5, cell: 1500, range: 9500, wind: [6, 2.5], seed: 7 })
});

// ------------------------------------------------------------------ vegetation and rocks

const forestLods = (name, near, far) => ([
	{ source: [`Assets/Models/${name}_lod0.glb`], range: near },
	{ source: [`Assets/Models/${name}_lod1.glb`], range: far }
]);
// near, middle and far models: the far one is a handful of triangles, so a forest is never absent, only coarser
const treeLods = name => ([
	{ source: [`Assets/Models/Trees/${name}_lod0.glb`], range: 170 },
	{ source: [`Assets/Models/Trees/${name}_lod1.glb`], range: 800 },
	{ source: [`Assets/Models/Trees/${name}_lod2.glb`], range: 3000 }
]);
// trees are solid: a trunk to the ground and a crown above it; boulders are low cylinders
const scatter = (table, lods, collide) => entity({ position: [0, 0, 0] },
	{ scatter: comp("scatter", { table: `Assets/Scatter/${table}.bin`, chunk: 256, lods, collide }) }, null, ["solid"]);

P.forest = entity({}, null, {
	spruce: scatter("spruce", treeLods("spruce"), { radius: 0.6, height: 24, crown: { radius: 3.4, base: 9, height: 15 } }),
	fir: scatter("fir", treeLods("fir"), { radius: 0.55, height: 17, crown: { radius: 3.6, base: 6, height: 11 } }),
	pine: scatter("pine", treeLods("pine"), { radius: 0.5, height: 22, crown: { radius: 3.2, base: 13, height: 9 } }),
	boulder_b: scatter("boulder_b", forestLods("boulder_b", 500, 2600), { radius: 1.25, height: 0.95 }),
	boulder_c: scatter("boulder_c", forestLods("boulder_c", 500, 2600), { radius: 1.5, height: 1.4 })
});

// ------------------------------------------------------------------ ground cover and broadleaf trees: scanned plants from Poly Haven

const flora = (name, lods) => lods.map(([model, range]) => ({ source: [`Assets/Models/Flora/${model}.glb`], range }));
const cover = (table, lods, collide) => entity({ position: [0, 0, 0] }, { scatter: comp("scatter", { table: `Assets/Scatter/${table}.bin`, chunk: 256, lods: flora(table, lods), ...(collide ? { collide } : {}) }) }, null, collide ? ["solid"] : null);
P.flora = entity({}, null, {
	fern: cover("fern", [["fern", 55]]),
	flower_a: cover("flower_a", [["flower_a", 60]]),
	flower_b: cover("flower_b", [["flower_b", 45]]),
	flower_c: cover("flower_c", [["flower_c", 55]]),
	shrub: cover("shrub", [["shrub2", 90]]),
	bush: cover("bush", [["bush_lod0", 70], ["bush_lod1", 260]]),
	mossrock: cover("mossrock", [["mossrock_a_lod0", 110], ["mossrock_a_lod1", 700]], { radius: 1.6, height: 1.0 }),
	broad_a: cover("broad_a", [["island2_lod0", 90], ["island2_lod1", 420], ["island2_lod2", 2200]], { radius: 0.5, height: 12, crown: { radius: 3, base: 4, height: 8 } }),
	broad_b: cover("broad_b", [["island1_lod0", 90], ["island1_lod1", 420], ["island1_lod2", 2200]], { radius: 0.5, height: 12, crown: { radius: 3, base: 4, height: 8 } })
});

// ------------------------------------------------------------------ landmarks placed by hand on generated ground

const model = (source, data = {}) => comp("mesh", { shadow: { cast: false, receive: true }, ...data }, { source: [source] });
const lm = {};
const L = meta.landmarks;
// The fort's model is not centred on its origin (its walls span x 10..53, z -34..37), so a child carries it back to the middle, and its lowest point sits on the level plateau
// the generator made for it. It is both solid and ground: a body is stopped by its walls and stands on its floors and roofs, in the open and under them.
if (L.fort) lm.fort = entity({ position: [round(L.fort.x), round(L.fort.y), round(L.fort.z)], rotation: [0, 0.6, 0], scale: 1.6 }, null, {
	model: entity({ position: [-31.33, 0.17, -1.69] }, { mesh: model("Assets/Models/fort.glb") }, null, ["solid", "ground"])
});
if (L.circle) {
	const stones = {};
	for (let k = 0; k < 9; k++) {
		const a = k / 9 * Math.PI * 2, r = 24;
		stones["stone" + k] = entity({ position: [round(L.circle.x + Math.cos(a) * r), round(L.circle.y - 1.5), round(L.circle.z + Math.sin(a) * r)], rotation: [0, a * 3.1, 0], scale: 6.5 + (k % 3) * 1.3 },
			{ mesh: model("Assets/Models/boulder_c_lod0.glb") }, null, ["solid"]);
	}
	lm.circle = entity({}, null, stones);
}
P.landmarks = entity({}, null, lm);

// ------------------------------------------------------------------ under the sea

const plant = (table, lods) => entity({ position: [0, 0, 0] }, { scatter: comp("scatter", { table: `Assets/Scatter/${table}.bin`, chunk: 256, lods }) });
const seaLods = (name, a, b) => ([{ source: [`Assets/Models/Sea/${name}_lod0.glb`], range: a }, { source: [`Assets/Models/Sea/${name}_lod1.glb`], range: b }]);
P.reef = entity({}, null, {
	kelp: plant("kelp", seaLods("kelp", 80, 240)),
	coral_a: plant("coral_a", seaLods("coral_a", 60, 220)),
	coral_b: plant("coral_b", seaLods("coral_b", 70, 220)),
	coral_c: plant("coral_c", seaLods("coral_c", 60, 220))
});

// Wildlife, peaceable, and all of it ready-made: a file of eight tropical fish that swim together, and a shark, both rigged and animated by their
// author (Babylon.js Meshes Library, CC BY 4.0). There are ninety shoals' worth of places and only twelve shoals' worth of fish, dealt out each
// frame to the places nearest the player; two sharks glide in long circles over deep water.
const SHOALS_DRAWN = 12;
const schools = meta.pois.schools.map((s, i) => ({ x: s.x, z: s.z, floor: s.floor, r: 24 + (i * 13) % 26, w: (i % 2 ? 1 : -1) * (2.4 + (i % 4) * 0.5) / (24 + (i * 13) % 26), phase: round(i * 1.9, 2) }));
const wildlife = {};
for (let p = 0; p < SHOALS_DRAWN; p++) wildlife["p" + p] = entity({ enabled: false, position: [0, -30, 0], rotation: [0, 0, 0], scale: 0.42, kind: "shoal", yawOff: -Math.PI / 2, speedScale: round(0.85 + (p % 5) * 0.08, 2) }, {
	mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Models/Sea/shoal.glb"] }),
	anim: comp("animation", { clip: "swimming", loop: true, autoplay: true, speed: 0.85 + (p % 5) * 0.08 })
});
// Forty-eight places in deep water far from any coast, and five sharks dealt out among the ones nearest the player (only within 1,000 m): the rest cost nothing.
const SHARKS_DRAWN = 5;
const sharkHomes = meta.pois.sharks.map((h, i) => ({ x: h.x, z: h.z, floor: h.floor, radius: 90 + (i * 37) % 90, w: (i % 2 ? -1 : 1) * (0.03 + (i % 5) * 0.006), phase: round(i * 2.399, 2) }));
for (let k = 0; k < SHARKS_DRAWN; k++) wildlife["shark" + k] = entity({ enabled: false, position: [0, -20, 0], rotation: [0, 0, 0], scale: 1.1, kind: "shark", yawOff: -Math.PI, spin: round(0.9 + (k % 3) * 0.1, 2) }, {
	mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Models/Sea/shark.glb"] }),
	anim: comp("animation", { clip: "swimming", loop: true, autoplay: true })
});
P.fish = entity({ schools, drawn: SHOALS_DRAWN, sharks: sharkHomes, sharksDrawn: SHARKS_DRAWN }, null, wildlife);

// ------------------------------------------------------------------ the player

P.player = entity({
	position: footSpawn, rotation: [0, 0, 0],
	yaw: 0, pitch: 0, roll: 0, vel: [0, 0, 0], vy: 0, flying: 0, boost: 1, boosting: 0, cool: 0, fire: 0, alt: 0,
	speed: 0, aim: [0, 0, -1], side: [1, 0, 0], lift: [0, 1, 0], onGround: 0, grounded: 0, ground: 0, eye: EYE, radius: 0.5, bp: -Math.PI / 2, stepT: 0, evStep: 0, evLand: 0, evJump: 0,
	health: 100, maxHealth: 100, hurt: 0, lastHit: -99, dead: 0, tele: 0, lastStep: 0, nshots: 1, spread: 0, bdmg: 1
}, {
	// from just above the head, straight down: the first thing below that is ground, so that under a roof the floor is found and not the roof
	ground: comp("query", { type: "ray", offset: [0, 2.4, 0], direction: [0, -1, 0], distance: 4600, continuous: true, limit: 1, tags: ["ground"], surfaces: "all" }),
	sweep: comp("query", { type: "ray", offset: [0, EYE, 0], direction: [0, 0, -1], distance: 12, continuous: true, limit: 1, tags: ["solid"] }),
	bump: comp("query", { type: "overlap", offset: [0, 0.95, 0], shape: { shape: "sphere", size: 0.5 }, tags: ["solid"], limit: 0, continuous: true })
}, {
	head: entity({ position: [0, EYE, 0], rotation: [0, 0, 0] }, {
		camera: comp("camera", { projection: "perspective", fov: 1.12, near: 0.28, far: 16000, control: "none", xr: { mode: "vr", space: "local-floor", features: [] } })
	})
});   // (the player has no body: the camera is all there is of them)

// ------------------------------------------------------------------ monsters

const lairs = meta.lairs, roosts = meta.roosts;
const enemies = {};
const enemy = (id, kind, home, n) => {
	const dragon = kind === "dragon", drone = kind === "drone";
	const pos = [round(home[0] + (dragon ? 0 : (n % 3) * 40)), round(home[1] + (dragon ? 70 : 0)), round(home[2] + (dragon ? 0 : (n % 4) * 35))];
	enemies[id] = entity({
		position: pos, rotation: [0, 0, 0], scale: dragon ? 3.0 : drone ? 7 : 2.4, enabled: true,
		kind, hp: dragon ? 14 : drone ? 3 : 1, maxHp: dragon ? 14 : drone ? 3 : 1, alive: 1, state: "patrol", timer: 0, cool: 2 + n % 3, atk: 0,
		yaw: round(n * 1.3, 3), pitch: 0, speed: dragon ? 38 : 50, vel: [0, 0, 0], vy: 0, anchor: pos, phase: round(n * 2.1, 3), dir: n % 2 ? 1 : -1,
		orbit: dragon ? 320 : 170, aggro: dragon ? 1100 : 750, vcruise: dragon ? 38 : 50, vchase: dragon ? 62 : 78, turn: dragon ? 1.1 : 2.3,
		minAlt: dragon ? 45 : 18, keep: dragon ? 200 : 20, r: dragon ? 8 : drone ? 4.2 : 4.6, cy: dragon ? 5.5 : drone ? 1.5 : 3.4, yawOff: Math.PI, score: dragon ? 100 : drone ? 30 : 10, respawn: 0
	}, {
		model: comp("mesh", { shadow: { cast: false, receive: false } }, { source: [dragon ? "Assets/Monsters/Dragon.glb" : drone ? "Assets/Monsters/Drone.glb" : "Assets/Monsters/Bat.glb"] }),
		anim: comp("animation", { clip: dragon ? "DragonArmature|Dragon_Flying" : drone ? "flight" : "BatArmature|Bat_Flying", loop: true, autoplay: true }),
		probe: comp("query", { type: "ray", offset: [0, 300, 0], direction: [0, -1, 0], distance: 3000, continuous: true, limit: 1, tags: ["ground"] }),
		// the ground a second or so ahead (the script moves it), so that a hillside is seen before it is reached
		ahead: comp("query", { type: "ray", offset: [0, 300, 0], direction: [0, -1, 0], distance: 3000, continuous: true, limit: 1, tags: ["ground"] })
	}, null, ["enemy", kind]);
};
for (let i = 0; i < 6; i++) enemy("d" + i, "dragon", lairs[i % lairs.length], i);
for (let i = 0; i < 12; i++) enemy("b" + i, "bat", roosts[i % roosts.length], i);
for (let i = 0; i < 5; i++) enemy("u" + i, "drone", roosts[(i * 2 + 1) % roosts.length], i);
P.enemies = entity({}, null, enemies);

// ------------------------------------------------------------------ projectiles and explosions

const unlitMat = color => comp("material", { color, unlit: true, side: "double", blend: color[3] < 1 ? "blend" : "opaque" });
const hidden = [0, -2000, 0];

const shots = {};
for (let i = 0; i < 40; i++) shots["s" + i] = entity({ position: hidden, rotation: [0, 0, 0], enabled: false, vel: [0, 0, 0], life: 0, dmg: 1 }, {
	mesh: comp("mesh", { shape: "box", size: [0.4, 0.4, 11], shadow: { cast: false, receive: false } }),
	mat: unlitMat([0.55, 1.0, 1.0, 1])
});
P.shots = entity({}, null, shots);

const balls = {};
for (let i = 0; i < 16; i++) balls["f" + i] = entity({ position: hidden, enabled: false, vel: [0, 0, 0], life: 0, dmg: 14, spin: 0 }, {
	mesh: comp("mesh", { shape: "sphere", size: 5, segments: 14, shadow: { cast: false, receive: false } }),
	mat: unlitMat([1.0, 0.55, 0.12, 1]),
	trail: comp("particles", { capacity: 260, emitting: false, rate: 140, size: [1.5, 4.5], life: [0.4, 0.9], speed: [0.5, 2], radius: 1.2, spread: 0.4, gravity: [0, 3, 0], color: [1, 0.7, 0.25, 0.9], color2: [1, 0.35, 0.08, 0.7], fade: [0.2, 0.05, 0.02, 0], blend: "add", timeScale: 0.016 },
		{ source: ["Assets/Textures/flare.png"] })
}, null, ["fireball"]);
P.fire = entity({}, null, balls);

const fx = {};
for (let i = 0; i < 10; i++) fx["x" + i] = entity({ position: hidden, enabled: false, scale: 1, life: 0, size: 1 }, {
	flash: comp("particles", { capacity: 24, emitting: false, rate: 0, size: [10, 24], life: [0.18, 0.34], speed: [0, 0.5], radius: 0.5, spread: 0.1, gravity: [0, 0, 0], color: [1, 0.92, 0.7, 1], color2: [1, 0.6, 0.25, 0.9], fade: [1, 0.3, 0.05, 0], blend: "add", timeScale: 0.016 },
		{ source: ["Assets/Textures/flare.png"] }),
	fire: comp("particles", { capacity: 500, emitting: false, rate: 0, size: [1, 4], life: [0.35, 1.0], speed: [4, 20], radius: 1, spread: 1.4, gravity: [0, 2, 0], color: [1, 0.8, 0.35, 1], color2: [1, 0.35, 0.08, 1], fade: [0.25, 0.05, 0.02, 0], blend: "add", timeScale: 0.016 },
		{ source: ["Assets/Textures/flare.png"] }),
	smoke: comp("particles", { capacity: 300, emitting: false, rate: 0, size: [3, 9], life: [1.2, 2.6], speed: [2, 9], radius: 2, spread: 1.0, gravity: [0, 4, 0], color: [0.55, 0.5, 0.45, 0.26], color2: [0.34, 0.32, 0.3, 0.2], fade: [0.25, 0.25, 0.25, 0], blend: "standard", timeScale: 0.016 },
		{ source: ["Assets/Textures/smoke.png"] }),
	boom: comp("audio", { spatial: true, volume: 0.9, distance: [40, 3500], loop: false, autoplay: false }, { source: ["Assets/Audio/boom.wav"] })
});
P.fx = entity({}, null, fx);

// ------------------------------------------------------------------ the heads-up display

// Two faces: Cinzel (engraved capitals) for names and titles, Lato for everything that is read. They are files in Assets/Fonts, loaded by the
// page before the world is made, because text is drawn once, in whatever font is there when it is drawn.
const fontOf = (face, weight, resolution) => `${weight} ${Math.round(resolution * 0.56)}px ${face}, sans-serif`;
const text = (content, size, color, extra = {}) => comp("text", {
	size, color, width: size * 1.2 * 8, align: "center", billboard: "none", font: fontOf("Lato", 700, extra.resolution || 128), ...extra
}, { content });
const picture = (file, w, h, order) => ({
	mesh: comp("mesh", { shape: "plane", size: [w, h], order, shadow: { cast: false, receive: false } }),
	mat: comp("material", { color: [1, 1, 1, 1], unlit: true, side: "double", blend: "blend", alpha: "texture", maps: { base: "Assets/UI/" + file } })
});
const plane = (name, w, h, color, pos, extra = {}) => entity({ position: pos, ...extra }, {
	mesh: comp("mesh", { shape: "plane", size: [w, h], order: 30, shadow: { cast: false, receive: false } }),
	mat: unlitMat(color)
});

const htext = (c, size, col, ex = {}) => text(c, size, col, { order: 32, resolution: 96, font: fontOf("Lato", 700, 96), ...ex });
const title = (c, size, col, ex = {}) => text(c, size, col, { order: 32, resolution: 96, font: fontOf("Cinzel", 700, 96), ...ex });
const tinted = (w, h, color, order) => ({
	mesh: comp("mesh", { shape: "plane", size: [w, h], order, shadow: { cast: false, receive: false } }),
	mat: comp("material", { color, unlit: true, side: "double", blend: "blend", alpha: "texture", maps: { base: "Assets/UI/bar_fill.png" } })
});
// a bar that is filled from its left edge by scaling a child that hangs to the right of its parent
const gauge = (x, y, w, h, color) => entity({ position: [x, y, 0.001], scale: [1, 1, 1] }, null, { bar: entity({ position: [w / 2, 0, 0] }, tinted(w, h, color, 31)) });
const slot = (x, key) => ({
	["slot" + key]: entity({ position: [x, -0.555, 0] }, picture("slot.png", 0.36, 0.064, 30)),
	["cd" + key]: entity({ position: [x - 0.18, -0.555, 0.001], scale: [0.001, 1, 1] }, null, {
		bar: entity({ position: [0.18, 0, 0] }, { mesh: comp("mesh", { shape: "plane", size: [0.36, 0.064], order: 31, shadow: { cast: false, receive: false } }), mat: unlitMat([0, 0, 0, 0.5]) })
	}),
	["act" + key]: entity({ position: [x - 0.16, -0.555, 0.002] }, { label: htext("", 0.03, [1, 0.92, 0.7, 1], { align: "left", anchor: "left", width: 0.34 }) })
});

const hud = {
	hpback: entity({ position: [-0.78, -0.545, 0] }, picture("bar_frame.png", 0.52, 0.056, 30)),
	hpfill: gauge(-1.02, -0.545, 0.48, 0.03, [0.35, 0.85, 0.4, 1]),
	bsback: entity({ position: [-0.82, -0.592, 0] }, picture("bar_frame.png", 0.44, 0.026, 30)),
	bsfill: gauge(-1.02, -0.592, 0.4, 0.012, [0.4, 0.75, 1, 1]),
	health: entity({ position: [-1.04, -0.498, 0.002] }, { label: htext("", 0.03, [0.86, 0.91, 1, 0.95], { align: "left", anchor: "left", width: 0.5 }) }),
	...slot(-0.18, "L"), ...slot(0.22, "R"),
	info: entity({ position: [1.06, -0.6, 0] }, { label: htext("", 0.03, [0.86, 0.91, 1, 0.85], { align: "right", anchor: "right", width: 1.0 }) }),
	near: entity({ position: [0, 0.57, 0] }, { label: htext("", 0.03, [1, 0.66, 0.3, 1]) }),
	notebg: entity({ position: [0, 0.47, 0], enabled: false }, picture("pill.png", 1.15, 0.082, 30)),
	note: entity({ position: [0, 0.47, 0.002] }, { label: htext("", 0.034, [0.95, 1, 0.92, 1], { width: 1.0 }) }),
	msg: entity({ position: [0, 0.3, 0] }, { label: title("", 0.095, [1, 0.86, 0.45, 1], { width: 1.8 }) }),
	interactbg: entity({ position: [0, -0.2, 0], enabled: false }, picture("pill.png", 0.9, 0.082, 30)),
	interact: entity({ position: [0, -0.2, 0.002] }, { label: htext("", 0.04, [1, 0.95, 0.75, 1], { width: 0.8 }) }),
	flash: plane("flash", 3.2, 2.2, [0.8, 0.02, 0.02, 0], [0, 0, 0.5]),
	reticle: entity({ position: [0, 0, 0] }, picture("reticle.png", 0.058, 0.058, 31))
};
const OVERLAY = 10;   // the display is ten times as far and ten times as large: far from the origin a position is good to a few millimetres, which at a metre shivers and at ten metres does not
P.hud = entity({ space: "camera", position: [0, 0, -OVERLAY], scale: [OVERLAY, OVERLAY, OVERLAY], rotation: [0, 0, 0], enabled: true }, null, hud);

// ------------------------------------------------------------------ audio

const sound = (source, data) => entity({}, { clip: comp("audio", { spatial: false, loop: false, autoplay: false, ...data }, { source }) });
P.audio = entity({ started: false }, null, {
	menu: sound(["Assets/Audio/music_menu.mp3"], { loop: true, volume: 0 }),
	musicA: sound(["Assets/Audio/music_heroic_age.mp3"], { volume: 0.5 }),
	musicB: sound(["Assets/Audio/music_skye_cuillin.mp3"], { volume: 0.5 }),
	battle: sound(["Assets/Audio/music_crusade.mp3"], { loop: true, volume: 0 }),
	wind: sound(["Assets/Audio/wind.wav"], { loop: true, volume: 0.15 }),
	shot: sound(["Assets/Audio/bolt.wav"], { volume: 0.42 }),
	hurt: sound(["Assets/Audio/hurt.wav"], { volume: 0.9 }),
	roar: sound(["Assets/Audio/roar.wav"], { volume: 0.8 }),
	hit: sound(["Assets/Audio/hit.wav"], { volume: 0.5 }),
	step: sound(["Assets/Audio/step.wav"], { volume: 0.3 }),
	land: sound(["Assets/Audio/land.wav"], { volume: 0.7 }),
	whoosh: sound(["Assets/Audio/whoosh.wav"], { volume: 0.6 }),
	click: sound(["Assets/Audio/ui_click.wav"], { volume: 0.5 }),
	pickup: sound(["Assets/Audio/pickup.wav"], { volume: 0.55 }),
	quest: sound(["Assets/Audio/quest.wav"], { volume: 0.6 }),
	stone: sound(["Assets/Audio/stone.wav"], { volume: 0.7 })
});

const poiPos = { camp: pois.camp, fort: pois.fort, stones: pois.stone, town: { x: W2m.center[0] + 20, z: W2m.center[1] }, sky: { x: W2m.floating.x, z: W2m.floating.z } };
// ------------------------------------------------------------------ the adventure: data, people, things, menus

P.defs = entity(defs);

P.rpg = entity({ inv: { bolt: 1 }, bind: { l: "bolt", r: "" }, cd: {}, q: {}, flags: {}, found: { camp: 1 }, kills: {} });

// four places a game can be kept (0 is the autosave); each is a value the host holds on to between visits
const slots = {};
for (let n = 0; n < 4; n++) slots["slot" + n] = entity({}, { disk: comp("storage", { key: "ace-origins-save-" + n, revision: 0, value: "" }) });
P.saves = entity({}, null, slots);

P.voice = entity({}, { say: comp("speech", { text: "", revision: 0, lang: "en", pitch: 1, rate: 1 }) });

// things the player can walk up to and press E on
const glow = (size, rate, color, rise) => comp("particles", {
	capacity: 40, emitting: true, rate, size, life: [1.4, 2.6], speed: [rise * 0.5, rise], radius: 0.4, spread: 0.12, gravity: [0, 0, 0],
	color, color2: [color[0], color[1], color[2], color[3] * 0.6], fade: [0.0, 0.0, 0.0, 0], blend: "add", timeScale: 0.016
}, { source: ["Assets/Textures/flare.png"] });

const things = {};
const npc = (key, def, glb, where, yaw) => {
	things["npc_" + key] = entity({
		kind: "npc", ref: key, name: def.name, radius: 4.6, taken: 0, enabled: true, isle: "A", area: "overworld",
		position: [round(where.x), round(where.y), round(where.z)], rotation: [0, round(yaw, 3), 0]
	}, null, {
		model: entity({ position: [0, 0, 0], rotation: [0, Math.PI, 0] }, {
			mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Characters/" + glb + ".glb"] }),
			anim: comp("animation", { clip: "Idle_Loop", loop: true, autoplay: true })
		}),
		tag: entity({ position: [0, 2.35, 0] }, { label: text(def.name, 0.3, [1, 0.94, 0.78, 1], { width: 3.2, billboard: "all", resolution: 96, font: fontOf("Cinzel", 700, 96) }) })
	}, ["solid"]);
};
npc("maren", defs.npcs.maren, "Maren", { x: pois.camp.x, y: pois.camp.y, z: pois.camp.z }, Math.PI);
npc("hale", defs.npcs.hale, "Hale", pois.hale, 1.9);
npc("pip", defs.npcs.pip, "Pip", pois.pip, 0.6);

pois.apples.forEach((a, i) => {
	things["apple" + i] = entity({ kind: "item", ref: "apple", name: defs.items.apple.name, radius: 3.4, taken: 0, enabled: true, isle: "A", area: "overworld", position: [round(a.x), round(a.y + 0.25), round(a.z)], rotation: [0, i * 2.1, 0], scale: 3.6 }, {
		mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Models/apple.glb"] }),
		glow: glow([1.2, 2.6], 7, [1.0, 0.86, 0.45, 0.5], 3.5)
	});
});

things.moonstone = entity({ kind: "stone", ref: "moonstone", name: "Moon Stone", radius: 7.5, taken: 0, enabled: true, isle: "A", area: "overworld", position: [round(pois.stone.x), round(pois.stone.y - 0.2), round(pois.stone.z)], rotation: [0.1, 0.4, 0.15], scale: 24 }, {
	mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Models/shard.glb"] }),
	glow: glow([3, 7], 12, [0.55, 0.8, 1.0, 0.5], 9)
});
// ------------------------------------------------------------------ the second island, the floating one, and the rooms behind the doors

const W2 = JSON.parse(fs.readFileSync(path.join(here, "world2.meta.json"), "utf8"));
const [BX, BZ] = W2.center, Y0 = W2.y0;
const wpos = (b, lx, lz) => [round(b.x + lx * Math.cos(b.yaw) + lz * Math.sin(b.yaw), 2), round(b.z - lx * Math.sin(b.yaw) + lz * Math.cos(b.yaw), 2)];   // a point in a building's own frame, in the world
const solidMat = (color, rough = 0.85, extra = {}) => comp("material", { color: [...color, 1], metallic: 0, roughness: rough, ...extra });
const texMat = (name, w, h, tint = [1, 1, 1], scale = 3) => comp("material", { color: [...tint, 1], metallic: 0, roughness: 0.9, maps: { base: `Assets/Textures/${name}_diff.jpg`, normal: `Assets/Textures/${name}_nor.jpg` }, tiling: [w / scale, h / scale] });
const box = (pos, size, material, tags, extra = {}) => entity({ position: pos, ...extra }, { mesh: comp("mesh", { shape: "box", size, shadow: { cast: false, receive: true } }), mat: material }, null, tags || null);

// ---- the doors: a closed one is opened with R; an open one is walked through
const roomNames = { shop: "the shop", office: "the office", home: "the house", sage: "the house" };
const doorThing = (id, b, door, isle, extraData = {}) => {
	const open = door.type === "portal";
	const front = b.front * b.scale, cxl = (b.cx || 0) * b.scale;
	const at = wpos(b, cxl, front), out = wpos(b, cxl, front + 3.4);
	const ground = b.ground != null ? b.ground : Y0 - 0.3;      // the foot of the model, which is sunk a little into the plateau
	// There is no model for a door: the building's own door is the door, and this is a point on it (invisible) with a soft glow in front, to show which ones can be entered.
	const gw = Math.max(1.6, (b.dw || 0.2) * b.scale * 1.25), gh = Math.max(2.4, (b.dh || 0.2) * b.scale * 1.15);
	const parts = {
		glow: entity({ position: [0, round(gh / 2, 2), 0.25] }, { mesh: comp("mesh", { shape: "plane", size: [round(gw, 2), round(gh, 2)], shadow: { cast: false, receive: false } }), mat: comp("material", { color: open ? [0.7, 0.85, 1, 1] : [1, 0.82, 0.5, 1], unlit: true, side: "double", blend: "blend", alpha: "texture", maps: { base: "Assets/UI/glow.png" } }) })
	};
	things[id] = entity({
		kind: open ? "portal" : "door", room: door.room, name: roomNames[door.room], radius: open ? 2.3 : 4.2, taken: 0, enabled: true, isle, area: "overworld",
		position: [at[0], round(ground, 2), at[1]], rotation: [0, round(b.yaw, 4), 0],
		exit: { pos: [out[0], round(ground + 0.6, 2), out[1]], yaw: round(b.yaw + Math.PI, 4) }, ...extraData
	}, null, parts);
};
const doorBuildings = W2.buildings.filter(b => b.door);
doorBuildings.forEach((b, i) => doorThing("door" + i, b, b.door, "B"));

// ---- the second island: terrain, roads, buildings, planting
const isleB = {};
isleB.terrain = entity({ position: [BX, 0, BZ] }, {
	ground: comp("terrain", {
		size: [W2.size, W2.size], elevation: W2.elevation, encoding: "rg16", chunk: 128, tile: 5, rockTile: 8, grassTint: [0.78, 1.0, 0.62], blend: 340,
		lods: [{ range: 560, step: 1 }, { range: 1300, step: 2 }, { range: 3000, step: 4 }, { range: 6500, step: 8 }, { range: 1e9, step: 16 }],
		layers: { splat: "Assets/Terrain/splat2.png", forest: "Assets/Terrain/forest2.png" }
	}, { source: ["Assets/Terrain/height2.png"] })
}, null, ["ground"]);
W2.roads.forEach(([cx, cz, lx, lz], i) => {
	isleB["road" + i] = box([BX + cx, Y0 + 0.03 + i * 0.02, BZ + cz], [lx, 0.06, lz], texMat("road", lx, lz, [1, 1, 1], 8), ["ground"]);
});
W2.buildings.forEach((b, i) => {
	isleB["b" + i] = entity({ position: [b.x, Y0 - 0.3, b.z], rotation: [0, round(b.yaw, 4), 0], scale: b.scale }, { mesh: model(`Assets/Models/City/${b.file}.glb`) }, null, ["solid", "ground"]);
});
const broadSpecs = { radius: 0.5, height: 12, crown: { radius: 3, base: 4, height: 8 } };
Object.assign(isleB, {
	broad_a: cover("broad_a2", [["island2_lod0", 90], ["island2_lod1", 420], ["island2_lod2", 2200]], broadSpecs),
	broad_b: cover("broad_b2", [["island1_lod0", 90], ["island1_lod1", 420], ["island1_lod2", 2200]], broadSpecs),
	shrub: cover("shrub2", [["shrub2", 90]]), bush: cover("bush2", [["bush_lod0", 70], ["bush_lod1", 260]]), fern: cover("fern2", [["fern", 55]]),
	flower_a: cover("flower_a2", [["flower_a", 60]]), flower_b: cover("flower_b2", [["flower_b", 45]])
});
P.isleB = entity({}, null, isleB);

// ---- the floating island: a flat top and a hanging underside, both solid, the top also ground; one house on it
const FL = W2.floating, isleF = {};
const geometry = g => ({ positions: g.positions, indices: g.indices, uvs: g.uvs });
isleF.top = entity({ position: [FL.x, FL.top, FL.z] }, {
	mesh: comp("mesh", { shadow: { cast: false, receive: true } }, { content: JSON.stringify(geometry(FL.geometry.top)) }),
	mat: comp("material", { color: [0.85, 1, 0.75, 1], metallic: 0, roughness: 1, side: "double", maps: { base: "Assets/Textures/grass_diff.jpg", normal: "Assets/Textures/grass_nor.jpg" } })
}, null, ["solid", "ground"]);
isleF.under = entity({ position: [FL.x, FL.top, FL.z] }, {
	mesh: comp("mesh", { shadow: { cast: false, receive: true } }, { content: JSON.stringify(geometry(FL.geometry.under)) }),
	mat: comp("material", { color: [0.7, 0.66, 0.62, 1], metallic: 0, roughness: 1, side: "double", maps: { base: "Assets/Textures/rock_diff.jpg", normal: "Assets/Textures/rock_nor.jpg" } })
}, null, ["solid", "ground"]);
const fhouse = { ...FL.house, x: FL.x, z: FL.z, yaw: 0, ground: FL.top - 0.05, scale: FL.house.scale };
isleF.house = entity({ position: [FL.x, FL.top - 0.05, FL.z], rotation: [0, 0, 0], scale: FL.house.scale }, { mesh: model(`Assets/Models/City/${FL.house.file}.glb`) }, null, ["solid", "ground"]);
P.isleF = entity({}, null, isleF);
doorThing("skydoor", fhouse, { type: "door", room: "sage" }, "F");

// ---- the rooms: each a sealed box of floor, walls and ceiling far off in the sky of nowhere, with a doorway in its south wall and a bright world beyond it
const ROOM_ORIGIN = i => [0, 1800, i * 100];   // near the origin, high above everything: far from the origin a float cannot tell nearby points apart and the polygons of furniture shimmer
const furnishing = {};
for (const name of ["cabinet", "drawers", "rocker", "plant", "clock", "dresser", "lantern"]) {
	const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(path.join(assets, "Models", "Furniture", name + ".glb"));
	const bb = getBounds(doc.getRoot().listScenes()[0]);
	furnishing[name] = { min: bb.min, max: bb.max };
}
const SCALES = { cabinet: 1, drawers: 1, rocker: 1, plant: 3.5, clock: 2, dresser: 1.2, lantern: 2 };
// furniture stands on the floor (or hangs at `lift`), centred on x, z
const piece = (name, x, z, yaw = 0, lift = 0, solid = true) => {
	const f = furnishing[name], s = SCALES[name];
	return entity({ position: [x, lift, z], rotation: [0, yaw, 0] }, null, {
		m: entity({ position: [-(f.min[0] + f.max[0]) / 2 * s, -f.min[1] * s, -(f.min[2] + f.max[2]) / 2 * s], scale: s }, { mesh: comp("mesh", { shadow: { cast: false, receive: true } }, { source: [`Assets/Models/Furniture/${name}.glb`] }) }, null, solid ? ["solid"] : null)
	});
};
const wood = [0.42, 0.28, 0.17], cloth = [0.55, 0.2, 0.18];
const ROOMS = {
	shop: { w: 14, d: 11, h: 3.6, floor: "tile", build: (W, D) => ({
		counter: box([0, 0.55, -1.2], [5.2, 1.1, 1.0], solidMat(wood, 0.5), ["solid"]),
		till: box([1.8, 1.3, -1.2], [0.5, 0.3, 0.4], solidMat([0.1, 0.1, 0.12], 0.4)),
		shelfA: box([-4.4, 1.1, -D / 2 + 0.5], [3.4, 2.2, 0.6], solidMat(wood, 0.6), ["solid"]),
		shelfB: box([0, 1.1, -D / 2 + 0.5], [3.4, 2.2, 0.6], solidMat(wood, 0.6), ["solid"]),
		shelfC: box([4.4, 1.1, -D / 2 + 0.5], [3.4, 2.2, 0.6], solidMat(wood, 0.6), ["solid"]),
		table: box([-4.6, 0.4, 2.4], [1.6, 0.8, 1.6], solidMat([0.3, 0.3, 0.34], 0.5), ["solid"]),
		cabinet: piece("cabinet", 5.6, 1.2, -Math.PI / 2), drawers: piece("drawers", -6.4, -1.5, Math.PI / 2), plant: piece("plant", 5.7, D / 2 - 1.2), plant2: piece("plant", -5.9, D / 2 - 1.2),
		clock: piece("clock", 0, -D / 2 + 0.12, 0, 2.6, false)
	}) },
	office: { w: 16, d: 12, h: 3.6, floor: "floor", build: (W, D) => ({
		deskA: box([-4.5, 0.4, -2.4], [2.4, 0.8, 1.1], solidMat([0.28, 0.28, 0.3], 0.5), ["solid"]), deskB: box([0.5, 0.4, -2.4], [2.4, 0.8, 1.1], solidMat([0.28, 0.28, 0.3], 0.5), ["solid"]), deskC: box([5.4, 0.4, -2.4], [2.4, 0.8, 1.1], solidMat([0.28, 0.28, 0.3], 0.5), ["solid"]),
		chairA: box([-4.5, 0.3, -1.0], [0.6, 0.6, 0.6], solidMat([0.12, 0.2, 0.35], 0.8), ["solid"]), chairB: box([0.5, 0.3, -1.0], [0.6, 0.6, 0.6], solidMat([0.12, 0.2, 0.35], 0.8), ["solid"]), chairC: box([5.4, 0.3, -1.0], [0.6, 0.6, 0.6], solidMat([0.12, 0.2, 0.35], 0.8), ["solid"]),
		meeting: box([-4.8, 0.4, 3.0], [3.4, 0.8, 1.5], solidMat(wood, 0.5), ["solid"]),
		cabinetA: piece("cabinet", 0, -D / 2 + 0.45), drawersA: piece("drawers", -6.8, -4.5, Math.PI / 2), drawersB: piece("drawers", 6.8, 3, -Math.PI / 2), plant: piece("plant", 6.8, D / 2 - 1.2), plant2: piece("plant", -7, -1)
	}) },
	home: { w: 11, d: 9, h: 3.2, floor: "floor", build: (W, D) => ({
		bed: box([-3.6, 0.3, -D / 2 + 1.4], [2.0, 0.6, 2.8], solidMat([0.75, 0.75, 0.82], 0.9), ["solid"]), pillow: box([-3.6, 0.65, -D / 2 + 0.6], [1.4, 0.15, 0.5], solidMat([0.95, 0.95, 0.95], 0.9)),
		table: box([2.4, 0.38, 0.2], [1.8, 0.76, 1.0], solidMat(wood, 0.55), ["solid"]), stoolA: box([1.4, 0.22, 0.2], [0.45, 0.44, 0.45], solidMat(wood, 0.6), ["solid"]), stoolB: box([3.4, 0.22, 0.2], [0.45, 0.44, 0.45], solidMat(wood, 0.6), ["solid"]),
		sofa: box([3.8, 0.4, -D / 2 + 1.0], [2.4, 0.8, 1.0], solidMat(cloth, 0.9), ["solid"]), rug: box([0, 0.012, 0.6], [3.6, 0.024, 2.6], solidMat([0.4, 0.14, 0.12], 1)),
		rocker: piece("rocker", -3.6, 1.6, 0.6), dresser: piece("dresser", 5.0, 2.2, -Math.PI / 2), plant: piece("plant", -4.6, D / 2 - 1.1), clock: piece("clock", 0, -D / 2 + 0.12, 0, 2.3, false)
	}) },
	sage: { w: 12, d: 12, h: 4.2, floor: "floor", build: (W, D) => ({
		shelfA: box([-W / 2 + 0.5, 1.4, -2.5], [0.6, 2.8, 5.0], solidMat([0.3, 0.2, 0.12], 0.6), ["solid"]), shelfB: box([W / 2 - 0.5, 1.4, -2.5], [0.6, 2.8, 5.0], solidMat([0.3, 0.2, 0.12], 0.6), ["solid"]), shelfC: box([-3.4, 1.4, -D / 2 + 0.5], [4.4, 2.8, 0.6], solidMat([0.3, 0.2, 0.12], 0.6), ["solid"]), shelfD: box([3.4, 1.4, -D / 2 + 0.5], [4.4, 2.8, 0.6], solidMat([0.3, 0.2, 0.12], 0.6), ["solid"]),
		books: box([0, 0.5, -D / 2 + 0.5], [0.6, 1.0, 0.5], solidMat([0.1, 0.25, 0.32], 0.8), ["solid"]),
		rug: box([0, 0.012, -1.0], [5.0, 0.024, 4.0], solidMat([0.12, 0.2, 0.36], 1)), desk: box([-3.4, 0.45, 3.4], [2.4, 0.9, 1.2], solidMat(wood, 0.5), ["solid"]),
		drawers: piece("drawers", 4.8, 2.4, -Math.PI / 2), cabinet: piece("cabinet", -4.4, -5.2), rocker: piece("rocker", 2.6, -3.2, -0.5), plant: piece("plant", 4.9, -5.2), plant2: piece("plant", -5.1, D / 2 - 1.1),
		lampA: piece("lantern", -3.4, 3.4, 0, 0.9, false), lampB: piece("lantern", 4.8, 2.4, 0, 1.85, false)
	}) }
};
const roomEntities = {}, roomInfo = {};
Object.entries(ROOMS).forEach(([kind, r], i) => {
	const o = ROOM_ORIGIN(i), W = r.w, D = r.d, H = r.h, T = 0.3, gap = 2.2;
	const wall = (pos, size) => box(pos, size, texMat("wall", Math.max(size[0], size[2]), size[1], [1, 0.97, 0.92], 3), ["solid", "ground"]);
	const parts = {
		floor: box([0, -0.1, 0], [W, 0.2, D], texMat(r.floor, W, D, [1, 1, 1], 3), ["solid", "ground"]),
		ceiling: box([0, H + 0.1, 0], [W, 0.2, D], solidMat([0.93, 0.92, 0.9], 0.95), ["solid"]),
		north: wall([0, H / 2, -D / 2 - T / 2], [W + 2 * T, H, T]), west: wall([-W / 2 - T / 2, H / 2, 0], [T, H, D]), east: wall([W / 2 + T / 2, H / 2, 0], [T, H, D]),
		southL: wall([-(W / 2 + T + gap / 2) / 2, H / 2, D / 2 + T / 2], [W / 2 + T - gap / 2, H, T]),
		southR: wall([(W / 2 + T + gap / 2) / 2, H / 2, D / 2 + T / 2], [W / 2 + T - gap / 2, H, T]),
		lintel: wall([0, (H + 2.6) / 2, D / 2 + T / 2], [gap, H - 2.6, T]),
		daylight: box([0, 1.3, D / 2 + T + 0.1], [gap + 0.4, 2.6, 0.1], comp("material", { color: [1, 0.97, 0.88, 1], unlit: true })),
		...r.build(W, D),
		lightA: entity({ position: [-W / 4, H - 0.5, 0] }, { light: comp("light", { type: "point", color: [1, 0.86, 0.66], intensity: 34, range: 18, on: false }) }),
		lightB: entity({ position: [W / 4, H - 0.5, D / 6] }, { light: comp("light", { type: "point", color: [1, 0.9, 0.75], intensity: 30, range: 18, on: false }) })
	};
	roomEntities[kind] = entity({ position: o, enabled: false }, null, parts);
	roomInfo[kind] = { spawn: [round(o[0], 2), round(o[1] + 0.3, 2), round(o[2] + D / 2 - 3.6, 2)], yaw: 0, exit: [round(o[0], 2), round(o[1], 2), round(o[2] + D / 2 - 0.4, 2)], name: roomNames[kind] };
	things["exit_" + kind] = entity({ kind: "portal", room: "out", name: "the street", radius: 0.95, taken: 0, enabled: false, isle: "R", area: kind, position: roomInfo[kind].exit, rotation: [0, 0, 0] }, null, {});
});
P.rooms = entity({}, null, roomEntities);

// the sage who lives above the sea
things.ione = entity({
	kind: "npc", ref: "ione", name: "Sage Ione", radius: 4.2, taken: 0, enabled: false, isle: "R", area: "sage",
	position: [ROOM_ORIGIN(3)[0], ROOM_ORIGIN(3)[1], ROOM_ORIGIN(3)[2] - 1.6], rotation: [0, 0, 0]
}, null, {
	model: entity({ position: [0, 0, 0], rotation: [0, Math.PI, 0] }, {
		mesh: comp("mesh", { shadow: { cast: false, receive: false } }, { source: ["Assets/Characters/Ione.glb"] }),
		anim: comp("animation", { clip: "Idle_Loop", loop: true, autoplay: true })
	}),
	tag: entity({ position: [0, 2.2, 0] }, { label: text("Sage Ione", 0.3, [1, 0.94, 0.78, 1], { width: 3.2, billboard: "all", resolution: 96, font: fontOf("Cinzel", 700, 96) }) })
}, ["solid"]);

P.things = entity({}, null, things);

// the camp
P.camp = entity({}, null, {
	fire: entity({ position: [round(pois.camp.x + 3.2), round(pois.camp.y - 0.05), round(pois.camp.z + 0.4)], scale: 1.7 }, {
		mesh: comp("mesh", { shadow: { cast: false, receive: true } }, { source: ["Assets/Models/firepit.glb"] }),
		flames: comp("particles", { capacity: 120, emitting: true, rate: 55, size: [0.5, 1.1], life: [0.5, 1.0], speed: [0.8, 1.8], radius: 0.25, spread: 0.12, gravity: [0, 1.5, 0], color: [1, 0.75, 0.3, 0.9], color2: [1, 0.35, 0.08, 0.7], fade: [0.2, 0.05, 0.02, 0], blend: "add", timeScale: 0.016, offset: [0, 0.25, 0] },
			{ source: ["Assets/Textures/flare.png"] })
	})
});

// ---- the interface: title screen, pause menu with its tabs, map, conversation box. All camera-space entities.
const MAPM = JSON.parse(fs.readFileSync(path.join(here, "map.meta.json"), "utf8"));
// the map window: 2.0 x 0.952 units (the picture is 2.1 : 1), centred a little below the middle; its frame is 2.06 x 1.012
const MV = { w: 2.0, h: 0.952, cy: -0.04, x0: MAPM.x0, x1: MAPM.x1, z0: MAPM.z0, z1: MAPM.z1, minSpan: 2400, maxSpan: round(MAPM.x1 - MAPM.x0, 0) };
const UI = { rows: 14, top: 0.37, step: 0.056, hlx: -0.7, tabX: [-0.75, -0.25, 0.25, 0.75], mapv: MV };
const ltext = (content, size, color, x, y, z, extra = {}) => entity({ position: [x, y, z] }, { label: text(content, size, color, { resolution: 64, order: 20, font: fontOf("Lato", 700, 64), ...extra }) });
const rows = {};
for (let i = 0; i < UI.rows; i++) rows["r" + i] = ltext("", 0.04, [0.86, 0.89, 0.95, 1], -0.99, UI.top - i * UI.step, 0.002, { width: 0.62, align: "left", anchor: "left" });
const tabs = { bar: entity({ position: [0, 0.52, 0.0005] }, picture("panel_header.png", 2.0, 0.114, 11)), line: entity({ position: [UI.tabX[0], 0.47, 0.0015] }, picture("rule.png", 0.42, 0.028, 14)) };
["INVENTORY", "LOG", "MAP", "SYSTEM"].forEach((name, i) => { tabs["t" + i] = ltext(name, 0.046, [0.68, 0.72, 0.8, 0.85], UI.tabX[i], 0.525, 0.002, { width: 0.45, resolution: 96, font: fontOf("Cinzel", 700, 96) }); });
const iconPic = (file, size, order) => picture(file, size, size, order);
const mapParts = {
	img: entity({ position: [0, 0, 0.001] }, {
		mesh: comp("mesh", { shape: "plane", size: [MV.w, MV.h], order: 12, shadow: { cast: false, receive: false } }),
		mat: comp("material", { color: [1, 1, 1, 1], unlit: true, side: "double", maps: { base: "Assets/UI/map.jpg" }, region: [0, 0, 1, 1] })
	}),
	labels: entity({ position: [0, 0, 0.003] }, null, Object.fromEntries([["A", "ANGAIA"], ["B", "MERIDIAN QUAY"], ["F", "IONE'S PERCH"]].map(([k, n]) => [k, entity({ enabled: false }, { label: text(n, 0.05, [1, 0.96, 0.82, 0.95], { resolution: 96, order: 15, width: 0.8, font: fontOf("Cinzel", 700, 96) }) })]))),
	icons: entity({ position: [0, 0, 0.006] }, null, Object.fromEntries(Object.keys(defs.pois).map(k => [k, entity({ enabled: false }, iconPic(`icon_${k}.png`, 0.09, 15))]))),
	ring: entity({ position: [0, 0, 0.0075], enabled: false }, iconPic("icon_ring.png", 0.13, 16)),
	you: entity({ position: [0, 0, 0.009], rotation: [0, 0, 0] }, iconPic("arrow.png", 0.075, 17)),
	frame: entity({ position: [0, 0, 0.012] }, picture("map_frame.png", 2.06, 1.012, 18)),
	compass: entity({ position: [0.86, 0.34, 0.014] }, picture("map_compass.png", 0.17, 0.17, 19)),
	scale: entity({ position: [-0.86, -0.43, 0.014] }, null, {
		bar: entity({ position: [0, 0, 0] }, tinted(1, 0.012, [0.96, 0.9, 0.7, 0.95], 19)),
		cap0: entity({ position: [0, 0.012, 0] }, tinted(0.004, 0.034, [0.96, 0.9, 0.7, 0.95], 19)),
		cap1: entity({ position: [0, 0.012, 0] }, tinted(0.004, 0.034, [0.96, 0.9, 0.7, 0.95], 19)),
		label: entity({ position: [0, 0.05, 0] }, { label: text("", 0.034, [0.98, 0.94, 0.8, 1], { resolution: 64, order: 20, width: 0.5, align: "left", anchor: "left", font: fontOf("Lato", 700, 64) }) })
	}),
	tip: entity({ position: [0, 0, 0.02], enabled: false }, null, {
		bg: entity({ position: [0.15, 0, 0] }, picture("map_tip.png", 0.3, 0.1, 21)),
		name: entity({ position: [0.01, 0.022, 0.002] }, { label: text("", 0.04, [1, 0.9, 0.6, 1], { resolution: 96, order: 22, width: 0.5, align: "left", anchor: "left", font: fontOf("Cinzel", 700, 96) }) }),
		hint: entity({ position: [0.01, -0.026, 0.002] }, { label: text("", 0.03, [0.86, 0.9, 0.97, 1], { resolution: 64, order: 22, width: 0.5, align: "left", anchor: "left", font: fontOf("Lato", 400, 64) }) })
	})
};

P.ui = entity({ space: "camera", position: [0, 0, -OVERLAY], scale: [OVERLAY, OVERLAY, OVERLAY], rotation: [0, 0, 0], overlay: OVERLAY, ...UI, pois: Object.fromEntries(Object.keys(defs.pois).map(k => [k, 1])) }, null, {
	dim: entity({ position: [0, 0, 0.02], enabled: false }, picture("vignette.png", 3.7, 2.1, 10)),
	cursor: entity({ position: [0, 0, 0.07], enabled: false }, null, {
		ring: entity({}, iconPic("icon_ring.png", 0.06, 30)),
		dot: entity({ position: [0, 0, 0.001] }, tinted(0.012, 0.012, [1, 0.92, 0.6, 1], 31))
	}),
	title: entity({ position: [0, 0, 0.03], enabled: false }, null, {
		logo: ltext("ACE ORIGINS", 0.15, [1, 0.86, 0.45, 1], 0, 0.52, 0, { width: 1.6, resolution: 128, font: fontOf("Cinzel", 700, 128) }),
		rule: entity({ position: [0, 0.425, 0] }, picture("rule.png", 1.1, 0.02, 14))
	}),
	menu: entity({ position: [0, 0, 0.03], enabled: false }, null, {
		listpanel: entity({ position: [-0.7, -0.05, 0] }, picture("panel_list.png", 0.72, 0.93, 11)),
		detailpanel: entity({ position: [0.385, -0.05, 0] }, picture("panel_detail.png", 1.36, 0.93, 11)),
		tabs: entity({}, null, tabs),
		hl: entity({ position: [UI.hlx, UI.top, 0.001] }, picture("select.png", 0.66, 0.058, 14)),
		rows: entity({}, null, rows),
		detail: ltext("", 0.036, [0.9, 0.93, 1, 1], -0.26, UI.top + 0.025, 0.002, { width: 1.25, align: "left", anchor: "top left", wrap: true, leading: 1.38, font: fontOf("Lato", 400, 64) }),
		bind: ltext("", 0.04, [1, 0.86, 0.45, 1], -0.26, -0.46, 0.002, { width: 1.25, align: "left", anchor: "left" }),
		footer: ltext("", 0.034, [0.86, 0.9, 0.97, 1], 0, -0.585, 0.002, { width: 2.0, font: fontOf("Lato", 400, 64) }),
		mapview: entity({ position: [0, MV.cy, 0], enabled: false }, null, mapParts)
	}),
	loading: entity({ position: [0, 0, 0.05], enabled: false }, null, {
		cover: entity({ position: [0, 0, 0] }, { mesh: comp("mesh", { shape: "plane", size: [4, 2.4], order: 40, shadow: { cast: false, receive: false } }), mat: unlitMat([0.02, 0.03, 0.06, 1]) }),
		name: ltext("ACE ORIGINS", 0.1, [1, 0.86, 0.45, 1], 0, 0.1, 0.001, { width: 1.4, resolution: 128, font: fontOf("Cinzel", 700, 128), order: 41 }),
		rule: entity({ position: [0, 0.02, 0.001] }, picture("rule.png", 0.9, 0.018, 41)),
		note: ltext("Loading", 0.04, [0.82, 0.86, 0.95, 1], 0, -0.06, 0.001, { width: 1.2, order: 41 }),
		tip: ltext("", 0.034, [0.8, 0.84, 0.92, 1], 0, -0.4, 0.001, { width: 1.8, order: 41 })
	}),
	talk: entity({ position: [0, 0, 0.03], enabled: false }, null, {
		box: entity({ position: [0, -0.4, 0] }, picture("panel_talk.png", 1.7, 0.32, 10)),
		who: ltext("", 0.046, [1, 0.86, 0.45, 1], -0.8, -0.3, 0.001, { width: 1.5, align: "left", anchor: "left", resolution: 96, font: fontOf("Cinzel", 700, 96) }),
		body: ltext("", 0.04, [0.96, 0.96, 1, 1], -0.8, -0.345, 0.001, { width: 1.62, align: "left", anchor: "top left", wrap: true, leading: 1.3, font: fontOf("Lato", 400, 64) }),
		askbox: entity({ position: [0, -0.095, 0], enabled: false }, null, {
			panel: entity({}, picture("panel_talk.png", 1.7, 0.2, 10)),
			band: entity({ position: [0, 0.06, 0.001] }, picture("select.png", 1.5, 0.05, 14)),
			o0: ltext("", 0.036, [0.86, 0.89, 0.95, 1], -0.78, 0.06, 0.002, { width: 1.5, align: "left", anchor: "left" }),
			o1: ltext("", 0.036, [0.86, 0.89, 0.95, 1], -0.78, 0.0, 0.002, { width: 1.5, align: "left", anchor: "left" }),
			o2: ltext("", 0.036, [0.86, 0.89, 0.95, 1], -0.78, -0.06, 0.002, { width: 1.5, align: "left", anchor: "left" })
		}),
		hint: ltext("", 0.028, [0.7, 0.75, 0.85, 1], 0.78, -0.53, 0.001, { width: 0.7, align: "right", anchor: "right", font: fontOf("Lato", 400, 64) })
	})
});

// ------------------------------------------------------------------ game state and the scripts that run it

const travelTo = (p, dx, dz) => [round(p.x + dx), round(p.y + 2), round(p.z + dz)];
P.game = entity({
	mode: "title", area: "overworld", ret: { pos: [0, 0, 0], yaw: 0 }, pLock: 0, visA: 1, visB: 0, visF: 0, atmo: "", traits: {}, talkPhase: "say", askIdx: 0, askSel: 0, askText: "", loadFrom: 0, loadLabel: "", loadIdle: 0, loadTipN: 0, sel: 0, tab: 0, mapOpen: 0, mapCx: 0, mapCz: 0, mapW: 0, mapLX: 0, mapLY: 0, mapDown: 0, mapOX: 0, mapOY: 0, mapMoved: 0, playFrom: 0, lockSeen: 0, talkNpc: "", talkEntry: 0, talkLine: 0, voiceRev: 0, sfx: "", note: "", noteTimer: 0, interact: "",
	kill_bat: 0, kill_dragon: 0, kill_drone: 0,
	uw: 0, sea: { level: SEA_LEVEL, floor: SEA_FLOOR, air: { color: fogColor, density: 0.00016 }, under: { color: [0.05, 0.33, 0.46], density: 0.012 } },
	time: 0, started: 0, hitEvent: 0, hitMark: 0, kills: 0, score: 0, deaths: 0, msg: "", msgTimer: 0, roar: 0, hurtEvent: 0,
	rooms: roomInfo, isles: { A: [0, 0], B: [W2m.center[0], W2m.center[1]], F: [W2m.floating.x, W2m.floating.z] },
	spawn: footSpawn, spawnYaw: 0, lairs: lairs.map(l => l.map(v => round(v))), roosts: roosts.map(l => l.map(v => round(v))),
	pois: {
		camp: { name: defs.pois.camp.name, pos: [round(pois.camp.x), round(pois.camp.y), round(pois.camp.z)], travel: travelTo(pois.camp, 0, 7) },
		fort: { name: defs.pois.fort.name, pos: [round(pois.fort.x), round(pois.fort.y), round(pois.fort.z)], travel: travelTo(pois.hale, 5, 3) },
		stones: { name: defs.pois.stones.name, pos: [round(pois.stone.x), round(pois.stone.y), round(pois.stone.z)], travel: travelTo(pois.pip, 6, 4) },
		town: { name: defs.pois.town.name, pos: [W2m.center[0], Y0, W2m.center[1]], travel: [W2m.center[0] + 20, Y0 + 2, W2m.center[1] + 4] },
		sky: { name: defs.pois.sky.name, pos: [W2m.floating.x, W2m.floating.top, W2m.floating.z], travel: [W2m.floating.x + 26, W2m.floating.top + 2, W2m.floating.z + 24] }
	}
}, {
	frame: sections(["game.js", "player.js", "sea.js", "enemies.js", "fish.js", "combat.js", "director.js", "hud.js", "menu.js", "audio.js"], 0)
});

// ------------------------------------------------------------------ write

fs.writeFileSync(path.join(build, "ACE Origins.json"), JSON.stringify(doc));
console.log("document", Math.round(fs.statSync(path.join(build, "ACE Origins.json")).size / 1024), "KB");

fs.mkdirSync(path.join(build, "Engine"), { recursive: true });
for (const f of ["ace.js", "aceOperators.js", "aceWorld.js"]) fs.copyFileSync(path.join(engineSrc, f), path.join(build, "Engine", f));

fs.writeFileSync(path.join(build, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>ACE Origins</title>
	<link rel="icon" href="data:,">
	<style>
		@font-face { font-family: "Cinzel"; src: url("Assets/Fonts/Cinzel.woff2") format("woff2"); font-weight: 400 900; }
		@font-face { font-family: "Lato"; src: url("Assets/Fonts/Lato-Regular.woff2") format("woff2"); font-weight: 400; }
		@font-face { font-family: "Lato"; src: url("Assets/Fonts/Lato-Bold.woff2") format("woff2"); font-weight: 700; }
		html, body { margin: 0; height: 100%; background: #0b0f16; overflow: hidden; }
		#stage { position: absolute; inset: 0; }
		#loading { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; flex-direction: column;
			background: radial-gradient(ellipse at center, #121a2c 0%, #070a12 75%); color: #f0c868; font: 700 clamp(28px, 5vw, 64px)/1.1 "Cinzel", serif; letter-spacing: .1em; pointer-events: none; }
		#loading small { font: 400 15px/1.5 "Lato", system-ui, sans-serif; letter-spacing: .08em; color: #aeb8cc; margin-top: 1.4em; }
		#track { width: min(320px, 60vw); height: 3px; background: #1a2338; margin-top: 1em; border-radius: 2px; overflow: hidden; }
		#bar { height: 100%; width: 0; background: linear-gradient(90deg, #8a6a2c, #f6d27a); transition: width .3s; }
	</style>
</head>
<body>
	<div id="stage"></div>
	<div id="loading">ACE ORIGINS<div id="track"><div id="bar"></div></div><small id="status">loading the world…</small></div>

	<script src="https://cdn.babylonjs.com/v7.54.3/babylon.js"></script>
	<script src="https://cdn.babylonjs.com/v7.54.3/loaders/babylonjs.loaders.min.js"></script>
	<script src="Engine/ace.js"></script>
	<script src="Engine/aceOperators.js"></script>
	<script src="Engine/aceWorld.js"></script>
	<script>
		// the text in the world is drawn once, in whatever face is there at the time, so the faces are loaded first
		Promise.all([document.fonts.load('700 40px "Cinzel"'), document.fonts.load('400 40px "Lato"'), document.fonts.load('700 40px "Lato"')])
		.catch(() => { })
		.then(() => fetch("ACE Origins.json")).then(response => response.json()).then(scene => {
			// ?detail=0.6 pulls every tree and terrain range in to 60% for a slower machine; the trees are never removed
			if (new URLSearchParams(location.search).get("post") === "0") delete scene.packages.world.utilities.settings.properties.data.post.finish;
			const detail = parseFloat(new URLSearchParams(location.search).get("detail"));
			if (detail > 0 && detail !== 1) {
				const scale = lods => lods.forEach(l => { if (l.range < 1e8) l.range *= detail; });
				const walk = pkg => { Object.values(pkg.utilities || {}).forEach(u => { const d = u.properties && u.properties.data; if (d && Array.isArray(d.lods) && (u.properties.tags || []).some(t => t === "scatter" || t === "terrain")) scale(d.lods); }); Object.values(pkg.packages || {}).forEach(walk); };
				walk(scene);
			}
			const context = ace.run("#stage", scene);
			window.origins = window.angaia = context;
				window.addEventListener('contextmenu', event => event.preventDefault());
			const status = document.getElementById("status"), overlay = document.getElementById("loading");
			// The cover stays solid until the world is made: the terrain is there, every model and texture has arrived, nothing is waiting to be built,
			// and that has held for two seconds. Until then the player sees this and nothing of the world, not even a cloud.
			const bar = document.getElementById("bar"), started = performance.now();
			let quiet = 0;
			const timer = setInterval(() => {
				let total = 0, done = 0, waiting = 0;
				for (const id of Object.keys(context.state)) {
					const st = context.state[id];
					if (!st || typeof st !== "object") continue;
					if (st.loaded !== undefined) { total++; if (st.loaded === true) done++; else waiting++; }
					if (st.queued > 0) waiting++;
					if (st.error) status.textContent = "problem: " + st.error;
				}
				const terrain = context.resolved.components.find(c => c.type === "terrain");
				const tState = terrain && context.instances[ace.identity(terrain)] ? context.state[ace.identity(terrain)] : null;
				const ready = tState && tState.loaded && context.frame > 120 && waiting === 0;
				quiet = ready ? quiet + 1 : 0;
				if (total > 0) bar.style.width = Math.round(100 * done / total) + "%";
				status.textContent = ready ? "almost there" : "making the world  " + done + " of " + total;
				if ((quiet >= 8 && performance.now() - started > 3000) || performance.now() - started > 60000) {
					overlay.style.transition = "opacity 1.2s"; overlay.style.opacity = 0; clearInterval(timer);
					setTimeout(() => overlay.remove(), 1400);
				}
			}, 250);
		});
	</script>
</body>
</html>
`);
console.log("page written");
