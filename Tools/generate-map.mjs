// The map of the whole region and everything drawn on it. Writes Assets/UI/map.jpg and the icons, the player's arrow, the frame, the tooltip and the compass.
// Run after generate-world.mjs and generate-island2.mjs (it reads their heights and world2.meta.json).
//   node generate-map.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "Assets"), uiDir = path.join(assets, "UI"), terrainDir = path.join(assets, "Terrain");
const metaA = JSON.parse(fs.readFileSync(path.join(here, "world.meta.json"), "utf8"));
const metaB = JSON.parse(fs.readFileSync(path.join(here, "world2.meta.json"), "utf8"));
const R = metaB.map;                                              // { x0, x1, z0, z1 }: the whole region, +z at the top
const MW = 5120, MH = Math.round(MW * (R.z1 - R.z0) / (R.x1 - R.x0));
const MPP = (R.x1 - R.x0) / MW;                                   // metres per pixel
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// ---------------------------------------------------------------- heights
async function load(file, size, [e0, e1], cx, cz) {
	const { data, info } = await sharp(path.join(terrainDir, file)).raw().toBuffer({ resolveWithObject: true });
	const N = info.width, h = new Float32Array(N * N);
	for (let k = 0; k < N * N; k++) { const o = k * info.channels; h[k] = e0 + ((data[o] * 256 + data[o + 1]) / 65535) * (e1 - e0); }
	return { N, h, size, cx, cz, at(x, z) {
		const fx = ((x - cx) / size + 0.5) * (N - 1), fz = (0.5 - (z - cz) / size) * (N - 1);
		if (fx < 0 || fz < 0 || fx > N - 1 || fz > N - 1) return null;
		const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
		return (h[j * N + i] * (1 - tx) + h[j * N + i + 1] * tx) * (1 - tz) + (h[(j + 1) * N + i] * (1 - tx) + h[(j + 1) * N + i + 1] * tx) * tz;
	} };
}
async function loadMask(file, size, cx, cz) {
	const { data, info } = await sharp(path.join(terrainDir, file)).raw().toBuffer({ resolveWithObject: true });
	const N = info.width, C = info.channels;
	return (x, z) => { const i = Math.round(((x - cx) / size + 0.5) * (N - 1)), j = Math.round((0.5 - (z - cz) / size) * (N - 1)); if (i < 0 || j < 0 || i >= N || j >= N) return 0; return data[(j * N + i) * C] / 255; };
}
const A = await load("height.png", metaA.size, metaA.elevation, 0, 0);
const B = await load("height2.png", metaB.size, metaB.elevation, metaB.center[0], metaB.center[1]);
const forestA = await loadMask("forest.png", metaA.size, 0, 0), forestB = await loadMask("forest2.png", metaB.size, metaB.center[0], metaB.center[1]);
const FL = metaB.floating;
const elev = (x, z) => { const a = A.at(x, z); if (a !== null) return a; const b = B.at(x, z); return b !== null ? b : -90; };
const forestAt = (x, z) => (Math.abs(x) < metaA.size / 2 && Math.abs(z) < metaA.size / 2) ? forestA(x, z) : forestB(x, z);

// ---------------------------------------------------------------- the picture
const px = Buffer.alloc(MW * MH * 3);
const wx = i => R.x0 + (i + 0.5) * MPP, wz = j => R.z1 - (j + 0.5) * MPP;
const STEP = MPP * 1.0;
const SAND = [228, 214, 168], GRASS1 = [156, 194, 112], GRASS2 = [104, 156, 86], FOREST = [58, 106, 62], TAN = [168, 160, 104], ROCK = [138, 124, 108], HIGH = [182, 176, 168], SNOW = [244, 247, 250];
const landColour = (e, f) => {
	let c;
	if (e < 4) c = mixc(SAND, GRASS1, smooth(1, 4, e) * 0.2);
	else if (e < 14) c = mixc(SAND, GRASS1, smooth(4, 14, e));
	else if (e < 120) c = mixc(GRASS1, GRASS2, smooth(14, 120, e));
	else if (e < 420) c = mixc(GRASS2, TAN, smooth(120, 420, e));
	else if (e < 800) c = mixc(TAN, ROCK, smooth(420, 800, e));
	else if (e < 1200) c = mixc(ROCK, HIGH, smooth(800, 1200, e));
	else c = mixc(HIGH, SNOW, smooth(1200, 1450, e));
	if (e > 8 && e < 900) c = mixc(c, FOREST, f * 0.55 * smooth(8, 40, e) * (1 - smooth(500, 900, e)));
	return c;
};
const OCEAN = [[0, [118, 208, 198]], [3, [82, 182, 190]], [14, [42, 138, 176]], [40, [24, 94, 146]], [90, [14, 56, 108]], [200, [10, 38, 84]]];
const oceanColour = d => { for (let k = 1; k < OCEAN.length; k++) if (d <= OCEAN[k][0]) return mixc(OCEAN[k - 1][1], OCEAN[k][1], (d - OCEAN[k - 1][0]) / (OCEAN[k][0] - OCEAN[k - 1][0])); return OCEAN[OCEAN.length - 1][1]; };
const LIGHT = (() => { const l = [-0.55, 0.65, 0.7]; const n = Math.hypot(...l); return l.map(v => v / n); })();

// The shade of the sea comes from the distance to the nearest land, not from the sea floor: the floor is only known inside each island's own map, and its edge would show as a square.
const CELL = 4, CW = Math.ceil(MW / CELL), CH = Math.ceil(MH / CELL), dist = new Float32Array(CW * CH);
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) dist[j * CW + i] = elev(wx(i * CELL), wz(j * CELL)) > 0 ? 0 : 1e9;
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) { let d = dist[j * CW + i]; if (i) d = Math.min(d, dist[j * CW + i - 1] + 1); if (j) d = Math.min(d, dist[(j - 1) * CW + i] + 1); if (i && j) d = Math.min(d, dist[(j - 1) * CW + i - 1] + 1.414); if (j && i < CW - 1) d = Math.min(d, dist[(j - 1) * CW + i + 1] + 1.414); dist[j * CW + i] = d; }
for (let j = CH - 1; j >= 0; j--) for (let i = CW - 1; i >= 0; i--) { let d = dist[j * CW + i]; if (i < CW - 1) d = Math.min(d, dist[j * CW + i + 1] + 1); if (j < CH - 1) d = Math.min(d, dist[(j + 1) * CW + i] + 1); if (i < CW - 1 && j < CH - 1) d = Math.min(d, dist[(j + 1) * CW + i + 1] + 1.414); if (j < CH - 1 && i) d = Math.min(d, dist[(j + 1) * CW + i - 1] + 1.414); dist[j * CW + i] = d; }
const landDist = (i, j) => { const fx = i / CELL, fy = j / CELL, a = Math.min(CW - 2, Math.floor(fx)), b = Math.min(CH - 2, Math.floor(fy)), tx = fx - a, ty = fy - b; return ((dist[b * CW + a] * (1 - tx) + dist[b * CW + a + 1] * tx) * (1 - ty) + (dist[(b + 1) * CW + a] * (1 - tx) + dist[(b + 1) * CW + a + 1] * tx) * ty) * CELL * MPP; };
for (let j = 0; j < MH; j++) {
	const z = wz(j);
	for (let i = 0; i < MW; i++) {
		const x = wx(i), e = elev(x, z), o = (j * MW + i) * 3;
		const ex1 = elev(x + STEP, z), ex0 = elev(x - STEP, z), ez1 = elev(x, z + STEP), ez0 = elev(x, z - STEP);
		const gx = (ex1 - ex0) / (2 * STEP), gz = (ez1 - ez0) / (2 * STEP), g = Math.hypot(gx, gz) + 1e-6;          // metres of height per metre of ground
		let c;
		if (e > 0) {
			c = landColour(e, forestAt(x, z));
			// hillshade: the surface normal against a light from the north-west and above
			const k = 3.2, nx = -gx * k, nz = -gz * k, nl = Math.hypot(nx, 1, nz);
			const lit = (nx * LIGHT[0] + 1 * LIGHT[1] + nz * LIGHT[2]) / nl;
			const sh = 0.72 + 0.62 * Math.max(0, Math.min(1, lit)) - 0.08;
			c = c.map(v => v * sh);
			// contour lines: thin, every 100 m, heavier every 500
			const m100 = e / 100, dist = Math.abs(m100 - Math.round(m100)) * 100 / g / MPP;           // pixels from a contour
			if (e > 30) { const a = (1 - smooth(0.35, 0.95, dist)) * (Math.round(m100) % 5 === 0 ? 0.3 : 0.13); c = mixc(c, [70, 52, 30], a); }
		} else {
			const dl = landDist(i, j), d = Math.min(200, Math.pow(dl / 260, 0.8) * 60);   // metres of 'depth' for the colour ramp: shallow close in, deep far out
			c = oceanColour(d);
			// faint rings round the shore, every 120 m for the first 480
			const rd = Math.abs(dl / 120 - Math.round(dl / 120)) * 120 / MPP;
			if (dl > 40 && dl < 520) c = mixc(c, [200, 236, 240], (1 - smooth(0.4, 1.4, rd)) * 0.13);
		}
		// the coast
		const cd = Math.abs(e) / g / MPP;
		const ca = 1 - smooth(0.55, 1.5, cd);
		if (ca > 0 && g > 0.0005) c = mixc(c, [34, 70, 76], Math.min(0.6, ca * 0.6));
		// a graticule, every two kilometres
		const gxl = Math.abs(((x - R.x0) % 2000 + 2000) % 2000), gzl = Math.abs(((z - R.z0) % 2000 + 2000) % 2000);
		const gd = Math.min(gxl, 2000 - gxl, gzl, 2000 - gzl) / MPP;
		if (gd < 0.8) c = mixc(c, [255, 255, 255], (0.8 - gd) / 0.8 * 0.11);
		px[o] = Math.max(0, Math.min(255, c[0])); px[o + 1] = Math.max(0, Math.min(255, c[1])); px[o + 2] = Math.max(0, Math.min(255, c[2]));
	}
}

// ---------------------------------------------------------------- the town and the floating island, drawn on top
const put = (i, j, c, a = 1) => { if (i < 0 || j < 0 || i >= MW || j >= MH) return; const o = (j * MW + i) * 3; px[o] = mix(px[o], c[0], a); px[o + 1] = mix(px[o + 1], c[1], a); px[o + 2] = mix(px[o + 2], c[2], a); };
const rect = (x, z, w, d, fill, edge) => {
	const i0 = Math.floor((x - w / 2 - R.x0) / MPP), i1 = Math.ceil((x + w / 2 - R.x0) / MPP), j0 = Math.floor((R.z1 - (z + d / 2)) / MPP), j1 = Math.ceil((R.z1 - (z - d / 2)) / MPP);
	for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
		const inner = i > i0 && i < i1 && j > j0 && j < j1;
		put(i, j, inner ? fill : (edge || fill), 1);
	}
};
for (const [cx, cz, lx, lz] of metaB.roads) rect(metaB.center[0] + cx, metaB.center[1] + cz, lx, lz, [196, 198, 204], [120, 124, 134]);
for (const b of metaB.buildings) {
	const sw = Math.abs(Math.cos(b.yaw)) > 0.5 ? b.width : b.depth, sd = Math.abs(Math.cos(b.yaw)) > 0.5 ? b.depth : b.width;
	rect(b.x, b.z, sw, sd, b.height > 40 ? [246, 244, 238] : [232, 224, 212], [96, 92, 90]);
}
// the floating island: its shadow on the sea below, and the island itself
{
	const r = FL.R / MPP, ci = (FL.x - R.x0) / MPP, cj = (R.z1 - FL.z) / MPP;
	for (let j = Math.floor(cj - r * 2); j <= cj + r * 2; j++) for (let i = Math.floor(ci - r * 2); i <= ci + r * 2; i++) {
		const sdx = (i - ci - r * 0.35) / (r * 1.1), sdz = (j - cj - r * 0.45) / (r * 0.9);
		const sh = 1 - smooth(0.7, 1.2, Math.hypot(sdx, sdz));
		if (sh > 0) put(i, j, [6, 30, 60], sh * 0.45);
	}
	for (let j = Math.floor(cj - r * 1.3); j <= cj + r * 1.3; j++) for (let i = Math.floor(ci - r * 1.3); i <= ci + r * 1.3; i++) {
		const d = Math.hypot(i - ci, j - cj) / r, a = 1 - smooth(0.92, 1.05, d);
		if (a <= 0) continue;
		const rim = smooth(0.72, 0.95, d);
		put(i, j, mixc([138, 196, 108], [90, 70, 52], rim), a);
		if (d > 0.9 && d < 1.0) put(i, j, [34, 28, 24], 0.55);
	}
}
await sharp(px, { raw: { width: MW, height: MH, channels: 3 } }).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toFile(path.join(uiDir, "map.jpg"));
console.log("map.jpg", MW, MH, (MPP).toFixed(2), "m per pixel");

// ---------------------------------------------------------------- icons, the arrow, the frame, the tooltip, the compass: drawn as SVG
const GOLD = "#e8c36a", GOLD2 = "#b8923f", NAVY = "#111a2e", CREAM = "#f6e3a8";
const svg = (w, h, body, defs = "") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`);
const badge = glyph => svg(128, 128, `
	<circle cx="64" cy="70" r="52" fill="#000" opacity="0.5" filter="url(#b)"/>
	<circle cx="64" cy="64" r="52" fill="url(#g)" stroke="${GOLD}" stroke-width="5"/>
	<circle cx="64" cy="64" r="45" fill="none" stroke="${GOLD2}" stroke-width="1.5" opacity="0.8"/>
	${glyph}`, `<filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#24365a"/><stop offset="1" stop-color="${NAVY}"/></radialGradient>`);
const glyphs = {
	camp: `<polygon points="64,30 94,88 34,88" fill="${CREAM}"/><polygon points="64,56 77,88 51,88" fill="${NAVY}"/><line x1="64" y1="24" x2="64" y2="32" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/><rect x="28" y="88" width="72" height="5" rx="2.5" fill="${GOLD2}"/>`,
	fort: `<path d="M34 90 V50 h10 v8 h8 v-8 h10 v8 h8 v-8 h10 v8 h8 v-8 h10 V90 Z" fill="${CREAM}"/><path d="M54 90 V72 a10 10 0 0 1 20 0 V90 Z" fill="${NAVY}"/><rect x="30" y="90" width="68" height="5" rx="2.5" fill="${GOLD2}"/>`,
	stones: `<rect x="31" y="52" width="14" height="40" rx="3" fill="${CREAM}"/><rect x="83" y="52" width="14" height="40" rx="3" fill="${CREAM}"/><rect x="26" y="40" width="76" height="13" rx="4" fill="${CREAM}"/><rect x="57" y="68" width="14" height="24" rx="3" fill="${GOLD}"/><rect x="26" y="92" width="76" height="4" rx="2" fill="${GOLD2}"/>`,
	town: `<rect x="30" y="58" width="18" height="36" fill="${CREAM}"/><rect x="52" y="38" width="22" height="56" fill="${CREAM}"/><rect x="78" y="52" width="20" height="42" fill="${CREAM}"/>${[[36, 66], [36, 78], [58, 46], [58, 58], [58, 70], [58, 82], [64, 46], [64, 58], [64, 70], [64, 82], [84, 60], [84, 72], [90, 60], [90, 72]].map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="6" fill="${NAVY}"/>`).join("")}<rect x="26" y="94" width="76" height="4" rx="2" fill="${GOLD2}"/>`,
	sky: `<ellipse cx="64" cy="54" rx="30" ry="9" fill="${CREAM}"/><path d="M36 56 Q64 62 92 56 L72 92 Q64 98 56 92 Z" fill="${GOLD2}"/><path d="M44 60 L56 82 M64 62 V90 M84 60 L72 82" stroke="#7a5c26" stroke-width="2" fill="none"/><path d="M22 36 a8 8 0 0 1 14 -3 a9 9 0 0 1 16 2 a6 6 0 0 1 -2 11 H26 a7 7 0 0 1 -4 -10 Z" fill="${CREAM}" opacity="0.85" transform="translate(52 -14) scale(0.7)"/>`
};
for (const [k, gl] of Object.entries(glyphs)) await sharp(badge(gl)).png().toFile(path.join(uiDir, `icon_${k}.png`));
await sharp(svg(160, 160, `<circle cx="80" cy="80" r="62" fill="none" stroke="${GOLD}" stroke-width="7" opacity="0.95"/><circle cx="80" cy="80" r="70" fill="none" stroke="#ffe6a0" stroke-width="10" opacity="0.28" filter="url(#b)"/>`, `<filter id="b"><feGaussianBlur stdDeviation="5"/></filter>`)).png().toFile(path.join(uiDir, "icon_ring.png"));
await sharp(svg(128, 128, `
	<path d="M64 14 L100 112 L64 92 L28 112 Z" fill="#000" opacity="0.5" filter="url(#b)" transform="translate(0 5)"/>
	<path d="M64 12 L100 110 L64 90 L28 110 Z" fill="#ff5a3c" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/>
	<path d="M64 24 L64 90 L36 104 Z" fill="#c43a22" opacity="0.55"/>`, `<filter id="b"><feGaussianBlur stdDeviation="4"/></filter>`)).png().toFile(path.join(uiDir, "arrow.png"));
// the frame: 2060 x 1012 for a map window of 2.0 x 0.952 (1000 pixels to the unit): a gilt border, a soft shadow inside it, a flourish in each corner
{
  const W = 2060, H = 1012, b = 30;
  const corner = (x, y, sx, sy) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})"><path d="M0 0 H84 L72 12 H20 Q12 12 12 20 V72 L0 84 Z" fill="${GOLD}"/><path d="M26 26 H62 M26 26 V62" stroke="${GOLD2}" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="26" cy="26" r="8" fill="${CREAM}"/></g>`;
  await sharp(svg(W, H, `
	<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)" mask="url(#hole)"/>
	<rect x="${b / 2}" y="${b / 2}" width="${W - b}" height="${H - b}" rx="14" fill="none" stroke="#2a1d08" stroke-width="${b}"/>
	<rect x="${b / 2}" y="${b / 2}" width="${W - b}" height="${H - b}" rx="14" fill="none" stroke="${GOLD2}" stroke-width="${b - 8}"/>
	<rect x="${b / 2}" y="${b / 2}" width="${W - b}" height="${H - b}" rx="14" fill="none" stroke="${GOLD}" stroke-width="5"/>
	<rect x="${b}" y="${b}" width="${W - 2 * b}" height="${H - 2 * b}" rx="6" fill="none" stroke="#1a1204" stroke-width="3"/>
	${corner(2, 2, 1, 1)}${corner(W - 2, 2, -1, 1)}${corner(2, H - 2, 1, -1)}${corner(W - 2, H - 2, -1, -1)}`,
	`<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="0.72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient><mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/></mask>`)).png().toFile(path.join(uiDir, "map_frame.png"));
}
await sharp(svg(256, 96, `<rect x="3" y="3" width="250" height="90" rx="14" fill="#0b1020" fill-opacity="0.94" stroke="${GOLD}" stroke-width="3"/><rect x="9" y="9" width="238" height="78" rx="9" fill="none" stroke="${GOLD2}" stroke-width="1" opacity="0.7"/>`)).png().toFile(path.join(uiDir, "map_tip.png"));
await sharp(svg(256, 256, `
	<circle cx="128" cy="128" r="104" fill="#0b1020" fill-opacity="0.78" stroke="${GOLD}" stroke-width="4"/>
	<circle cx="128" cy="128" r="94" fill="none" stroke="${GOLD2}" stroke-width="1.5"/>
	<g stroke="${GOLD2}" stroke-width="2">${Array.from({ length: 16 }, (_, k) => { const a = k * Math.PI / 8, r0 = k % 2 ? 86 : 80; return `<line x1="${128 + Math.sin(a) * r0}" y1="${128 - Math.cos(a) * r0}" x2="${128 + Math.sin(a) * 94}" y2="${128 - Math.cos(a) * 94}"/>`; }).join("")}</g>
	<path d="M128 28 L146 128 L128 112 L110 128 Z" fill="${GOLD}"/><path d="M128 228 L146 128 L128 144 L110 128 Z" fill="#7d7a70"/>
	<path d="M28 128 L112 110 L128 128 L112 146 Z" fill="#7d7a70" opacity="0.8"/><path d="M228 128 L144 110 L128 128 L144 146 Z" fill="#7d7a70" opacity="0.8"/>
	<path d="M116 62 V86 M116 62 L140 86 M140 62 V86" transform="translate(0 -30) scale(1 1)" stroke="${CREAM}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`)).png().toFile(path.join(uiDir, "map_compass.png"));
console.log("icons written");
fs.writeFileSync(path.join(here, "map.meta.json"), JSON.stringify({ x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, width: MW, height: MH }, null, 1));
