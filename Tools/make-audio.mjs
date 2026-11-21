// Synthesises the sound effects as real WAV files and copies the licensed music into Build/Assets/Audio.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "Assets", "Audio");
const cache = path.join(here, "..", "..", "Scratch", "cache", "audio");
fs.mkdirSync(out, { recursive: true });

const SR = 32000;
let seed = 1234567;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;

function wav(name, samples) {
	let peak = 0;
	for (const s of samples) peak = Math.max(peak, Math.abs(s));
	const gain = peak > 0 ? 0.92 / peak : 1;
	const buf = Buffer.alloc(44 + samples.length * 2);
	buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
	buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36);
	buf.writeUInt32LE(samples.length * 2, 40);
	for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
	fs.writeFileSync(path.join(out, name), buf);
	console.log(name, (samples.length / SR).toFixed(2) + "s", Math.round(buf.length / 1024) + "KB");
}

const lowpass = () => { let y = 0; return (x, fc) => { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); y += a * (x - y); return y; }; };
const bandpass = () => {
	let lp = 0, bp = 0;
	return (x, fc, q) => { const f = 2 * Math.sin(Math.PI * Math.min(fc, SR * 0.2) / SR); lp += f * bp; const hp = x - lp - bp / q; bp += f * hp; return bp; };
};
const env = (t, attack, decay) => Math.min(1, t / attack) * Math.exp(-t / decay);

// plasma bolt
{
	const n = Math.floor(SR * 0.26), s = new Float32Array(n);
	let phase = 0; const lp = lowpass();
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const f = 260 + 2400 * Math.exp(-t * 16);
		phase += 2 * Math.PI * f / SR;
		const tone = Math.sin(phase) * 0.7 + Math.sin(phase * 2.01) * 0.25 + Math.sign(Math.sin(phase * 0.5)) * 0.1;
		const click = noise() * Math.exp(-t * 220) * 0.9;
		s[i] = (tone * env(t, 0.002, 0.07) + lp(click, 6000)) * 0.9;
	}
	wav("bolt.wav", s);
}

// fireball
{
	const n = Math.floor(SR * 1.1), s = new Float32Array(n);
	const lp = lowpass(), lp2 = lowpass();
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const sweep = 250 + 1700 * Math.sin(Math.min(1, t / 0.7) * Math.PI) ** 2;
		const body = lp(noise(), sweep) * 3.2;
		const rumble = lp2(noise(), 90) * 5 + Math.sin(2 * Math.PI * 52 * t) * 0.6;
		s[i] = (body + rumble) * Math.min(1, t / 0.12) * Math.exp(-Math.max(0, t - 0.4) * 3.2);
	}
	wav("fireball.wav", s);
}

// being hit
{
	const n = Math.floor(SR * 0.45), s = new Float32Array(n);
	const bp = bandpass(), lp = lowpass();
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		const thump = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 6) + 38) * t) * Math.exp(-t * 9);
		const crack = bp(noise(), 1800, 2) * Math.exp(-t * 45) * 1.6;
		s[i] = thump * 1.4 + crack + lp(noise(), 400) * Math.exp(-t * 18) * 0.7;
	}
	wav("hurt.wav", s);
}

// explosion
{
	const n = Math.floor(SR * 2.4), s = new Float32Array(n);
	const lp = lowpass(), lp2 = lowpass(); let brown = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		brown = (brown + noise() * 0.06) * 0.995;
		const cut = 60 + 2400 * Math.exp(-t * 3.2);
		const blast = lp(noise(), cut) * Math.exp(-t * 2.1) * 2.6;
		const sub = Math.sin(2 * Math.PI * (32 + 40 * Math.exp(-t * 4)) * t) * Math.exp(-t * 1.7) * 1.8;
		const crack = lp2(noise(), 7000) * Math.exp(-t * 55) * 1.4;
		s[i] = (blast + sub + brown * Math.exp(-t * 1.2) * 5 + crack) * Math.min(1, t / 0.004);
	}
	wav("boom.wav", s);
}

// dragon roar
{
	const n = Math.floor(SR * 2.0), s = new Float32Array(n);
	const f1 = bandpass(), f2 = bandpass(), f3 = bandpass(), lp = lowpass();
	let phase = 0;
	for (let i = 0; i < n; i++) {
		const t = i / SR, u = t / 2.0;
		const f0 = (62 + 70 * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.5) * (1 + 0.04 * Math.sin(2 * Math.PI * 6.2 * t));
		phase += f0 / SR; phase %= 1;
		const glottal = (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) + (rand() - 0.5) * 0.25;
		const open = 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.1));
		const voiced = f1(glottal, 380 + 480 * open, 4) * 1.5 + f2(glottal, 850 + 500 * open, 5) * 1.0 + f3(glottal, 2300, 6) * 0.35;
		const breath = lp(noise(), 1800) * 0.6 * open;
		const swell = Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.6;
		s[i] = (voiced * 2.2 + breath) * swell * Math.min(1, t / 0.08);
	}
	wav("roar.wav", s);
}

// wind, seamless: the tail is crossfaded into the head
{
	const seconds = 8, n = SR * seconds, fade = Math.floor(SR * 0.75);
	const raw = new Float32Array(n + fade);
	const lp = lowpass(), lp2 = lowpass(), lp3 = lowpass();
	for (let i = 0; i < raw.length; i++) {
		const t = i / SR;
		const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.21 * t) * Math.sin(2 * Math.PI * 0.13 * t + 1);
		const a = lp(noise(), 650 + 500 * gust), b = lp2(noise(), 2200) * 0.25 * gust, c = lp3(noise(), 140) * 1.4;
		raw[i] = (a * 2.6 + b + c) * (0.5 + gust * 0.6);
	}
	const s = new Float32Array(n);
	for (let i = 0; i < n; i++) s[i] = raw[i];
	for (let i = 0; i < fade; i++) { const k = i / fade; s[i] = raw[i] * k + raw[n + i] * (1 - k); }
	wav("wind.wav", s);
}


// a bolt landing: a short bright tick
{
	const n = Math.floor(SR * 0.09), s = new Float32Array(n);
	let phase = 0;
	for (let i = 0; i < n; i++) { const t = i / SR; phase += 2 * Math.PI * (2600 - 9000 * t) / SR; s[i] = (Math.sin(phase) + noise() * 0.25) * Math.exp(-t * 55); }
	wav("hit.wav", s);
}

// a footfall on grass: a soft thud with a little rustle
{
	const n = Math.floor(SR * 0.2), s = new Float32Array(n), lp = lowpass(), lp2 = lowpass();
	for (let i = 0; i < n; i++) { const t = i / SR; s[i] = Math.sin(2 * Math.PI * (95 - 40 * t) * t) * Math.exp(-t * 28) * 1.4 + lp(noise(), 1400) * Math.exp(-t * 32) * 0.6 + lp2(noise(), 5000) * Math.exp(-t * 60) * 0.12; }
	wav("step.wav", s);
}

// landing after a fall
{
	const n = Math.floor(SR * 0.45), s = new Float32Array(n), lp = lowpass();
	for (let i = 0; i < n; i++) { const t = i / SR; s[i] = Math.sin(2 * Math.PI * (70 - 30 * t) * t) * Math.exp(-t * 11) * 1.6 + lp(noise(), 700) * Math.exp(-t * 14) * 0.9; }
	wav("land.wav", s);
}

// taking off: air rushing past
{
	const n = Math.floor(SR * 0.9), s = new Float32Array(n), lp = lowpass(), bp = bandpass();
	for (let i = 0; i < n; i++) { const t = i / SR, u = t / 0.9; const sweep = 300 + 2400 * Math.sin(Math.PI * Math.min(1, u)) ** 2; s[i] = (lp(noise(), sweep) * 2.4 + bp(noise(), sweep * 1.3, 2) * 0.7) * Math.sin(Math.PI * Math.min(1, u)) ** 0.8; }
	wav("whoosh.wav", s);
}

// interface: a soft click
{
	const n = Math.floor(SR * 0.07), s = new Float32Array(n);
	for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(2 * Math.PI * 1500 * t) * 0.6 + Math.sin(2 * Math.PI * 2250 * t) * 0.3) * Math.exp(-t * 70); }
	wav("ui_click.wav", s);
}

// picking something up: two rising notes
{
	const n = Math.floor(SR * 0.45), s = new Float32Array(n);
	for (let i = 0; i < n; i++) { const t = i / SR; const f = t < 0.12 ? 784 : 1175; const e = Math.exp(-((t < 0.12 ? t : t - 0.12)) * 9); s[i] = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t)) * e * Math.min(1, t / 0.004); }
	wav("pickup.wav", s);
}

// a quest moving on: a rising arpeggio
{
	const notes = [523.25, 659.25, 783.99, 1046.5], n = Math.floor(SR * 1.2), s = new Float32Array(n);
	for (let k = 0; k < notes.length; k++) for (let i = 0; i < n; i++) { const t = i / SR - k * 0.14; if (t < 0) continue; s[i] += (Math.sin(2 * Math.PI * notes[k] * t) + 0.3 * Math.sin(2 * Math.PI * notes[k] * 3 * t)) * Math.exp(-t * 3.2) * Math.min(1, t / 0.005) * 0.5; }
	wav("quest.wav", s);
}

// the Moon Stone: a low shimmering hum
{
	const n = Math.floor(SR * 2.6), s = new Float32Array(n), lp = lowpass();
	for (let i = 0; i < n; i++) { const t = i / SR; const e = Math.sin(Math.PI * Math.min(1, t / 2.6)) ** 1.5; s[i] = (Math.sin(2 * Math.PI * 196 * t) + 0.6 * Math.sin(2 * Math.PI * 293.66 * t + 1.2 * Math.sin(2 * Math.PI * 5 * t)) + 0.4 * Math.sin(2 * Math.PI * 392 * t) + lp(noise(), 900) * 0.15) * e; }
	wav("stone.wav", s);
}

for (const [src, dest] of [["Heroic Age.mp3", "music_heroic_age.mp3"], ["Skye Cuillin.mp3", "music_skye_cuillin.mp3"], ["Crusade.mp3", "music_crusade.mp3"]]) {
	fs.copyFileSync(path.join(cache, src), path.join(out, dest));
	console.log("copied", dest);
}
