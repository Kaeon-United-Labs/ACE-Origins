// Draws the interface's panels: rounded, softly lit, edged in gold. Stretched onto planes of the same shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "Assets", "UI");
fs.mkdirSync(out, { recursive: true });

const png = async (name, w, h, svg) => {
	await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svg}</svg>`)).png({ compressionLevel: 9 }).toFile(path.join(out, name));
	console.log(name, w + "x" + h);
};

const panel = (w, h, r, fill = 0.74) => `
	<defs>
		<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2338" stop-opacity="${fill}"/><stop offset="1" stop-color="#0a0f1c" stop-opacity="${Math.min(1, fill + 0.12)}"/></linearGradient>
		<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c868"/><stop offset="1" stop-color="#8a6a2c"/></linearGradient>
	</defs>
	<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="${r}" fill="url(#f)" stroke="url(#e)" stroke-width="3"/>
	<rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="${r - 5}" fill="none" stroke="#f0c868" stroke-opacity="0.18" stroke-width="1.5"/>`;

await png("panel_list.png", 592, 744, panel(592, 744, 22));
await png("panel_detail.png", 1120, 744, panel(1120, 744, 22));
await png("panel_talk.png", 1360, 256, panel(1360, 256, 24, 0.86));
await png("panel_header.png", 1680, 96, panel(1680, 96, 16, 0.6));

// the selected row: a band of gold that fades to the right
await png("select.png", 540, 44, `
	<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0c868" stop-opacity="0.55"/><stop offset="0.6" stop-color="#f0c868" stop-opacity="0.18"/><stop offset="1" stop-color="#f0c868" stop-opacity="0"/></linearGradient></defs>
	<rect x="0" y="0" width="540" height="44" rx="8" fill="url(#g)"/><rect x="0" y="6" width="5" height="32" rx="2" fill="#f6d27a"/>`);

// a gold rule that fades at both ends
await png("rule.png", 800, 12, `
	<defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0c868" stop-opacity="0"/><stop offset="0.5" stop-color="#f6d27a" stop-opacity="1"/><stop offset="1" stop-color="#f0c868" stop-opacity="0"/></linearGradient></defs>
	<rect x="0" y="4" width="800" height="3" fill="url(#r)"/><circle cx="400" cy="5.5" r="5" fill="#f6d27a"/>`);

// the backdrop: darker toward the edges so that the world shows through at the middle
await png("vignette.png", 640, 360, `
	<defs><radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0" stop-color="#0b1020" stop-opacity="0.62"/><stop offset="0.65" stop-color="#080c18" stop-opacity="0.84"/><stop offset="1" stop-color="#04060c" stop-opacity="0.96"/></radialGradient></defs>
	<rect width="640" height="360" fill="url(#v)"/>`);

// ---------------------------------------------------------------- heads-up display

// a bar's frame: dark glass in a pill, a gold hairline, a sheen along the top
await png("bar_frame.png", 520, 56, `
	<defs>
		<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2438" stop-opacity="0.82"/><stop offset="1" stop-color="#080c16" stop-opacity="0.9"/></linearGradient>
		<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c868"/><stop offset="1" stop-color="#8a6a2c"/></linearGradient>
	</defs>
	<rect x="2" y="2" width="516" height="52" rx="26" fill="url(#g)" stroke="url(#e)" stroke-width="2.5"/>
	<rect x="14" y="7" width="492" height="8" rx="4" fill="#ffffff" fill-opacity="0.06"/>`);

// the fill: white with a bright top and a dark bottom, tinted by the material's colour
await png("bar_fill.png", 480, 32, `
	<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#e6e6e6"/><stop offset="1" stop-color="#9a9a9a"/></linearGradient></defs>
	<rect x="0" y="0" width="480" height="32" rx="16" fill="url(#f)"/>
	<rect x="10" y="4" width="460" height="7" rx="3.5" fill="#ffffff" fill-opacity="0.45"/>`);

// a rounded dark plate with a gold hairline, behind a prompt or a notice
await png("pill.png", 640, 72, `
	<defs>
		<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0f1c" stop-opacity="0"/><stop offset="0.12" stop-color="#0a0f1c" stop-opacity="0.78"/><stop offset="0.88" stop-color="#0a0f1c" stop-opacity="0.78"/><stop offset="1" stop-color="#0a0f1c" stop-opacity="0"/></linearGradient>
		<linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0c868" stop-opacity="0"/><stop offset="0.5" stop-color="#f0c868" stop-opacity="0.9"/><stop offset="1" stop-color="#f0c868" stop-opacity="0"/></linearGradient>
	</defs>
	<rect x="0" y="6" width="640" height="60" rx="30" fill="url(#g)"/>
	<rect x="40" y="6" width="560" height="2" fill="url(#l)"/><rect x="40" y="64" width="560" height="2" fill="url(#l)"/>`);

// an ability slot
await png("slot.png", 360, 64, panel(360, 64, 14, 0.78));

// the tracker for the quest in hand: a soft panel that fades to the right
await png("tracker.png", 520, 180, `
	<defs>
		<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0a0f1c" stop-opacity="0"/><stop offset="0.25" stop-color="#0a0f1c" stop-opacity="0.72"/><stop offset="1" stop-color="#0a0f1c" stop-opacity="0.82"/></linearGradient>
		<linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0c868" stop-opacity="0"/><stop offset="0.4" stop-color="#f0c868" stop-opacity="0.85"/><stop offset="1" stop-color="#f0c868" stop-opacity="0.85"/></linearGradient>
	</defs>
	<rect x="0" y="6" width="520" height="168" rx="14" fill="url(#g)"/>
	<rect x="80" y="6" width="440" height="2.5" fill="url(#l)"/>`);

// the reticle: a thin ring broken at four points, and a dot
await png("reticle.png", 128, 128, `
	<g fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round">
		<path d="M64 14 A50 50 0 0 1 114 64" stroke-opacity="0.85" transform="rotate(-70 64 64)"/>
		<path d="M64 14 A50 50 0 0 1 114 64" stroke-opacity="0.85" transform="rotate(20 64 64)"/>
		<path d="M64 14 A50 50 0 0 1 114 64" stroke-opacity="0.85" transform="rotate(110 64 64)"/>
		<path d="M64 14 A50 50 0 0 1 114 64" stroke-opacity="0.85" transform="rotate(200 64 64)"/>
	</g>
	<circle cx="64" cy="64" r="4.5" fill="#ffffff"/>
	<g stroke="#000000" stroke-opacity="0.35" fill="none" stroke-width="1"><circle cx="64" cy="64" r="52"/></g>`);
