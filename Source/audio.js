// Sound. Playback is a consumable command; the wind follows speed; two exploring themes take turns, and a battle theme
// swells in underneath them whenever something with teeth is close.
const P = dat('player'), G = dat('game');
const display = E.utilities.display.properties.state;
const A = get('audio');
const clip = name => A.packages[name].utilities.clip.properties.state;
const ready = name => { const s = clip(name); return s && s.loaded; };
const meta = A.properties.meta.data;

// how dangerous is it? dragons close in count most; bats count a little
let threat = 0;
for (const id of Object.keys(get('enemies').packages)) {
	const e = dat('enemies.' + id);
	if (!e.alive || e.state !== 'chase') continue;
	const dist = len(sub(e.position, P.position));
	threat = Math.max(threat, e.kind === 'dragon' ? clamp(1 - dist / 1100, 0, 1) : clamp(0.6 - dist / 1500, 0, 0.6));
}
const mood = clamp((meta.mood || 0) + (threat > 0.15 ? 0.45 : -0.18) * DT, 0, 1);

// What is heard depends on where the player is: the title screen has a theme of its own and nothing else; the world's sounds begin when
// play does, are lowered under the pause menu, and are silent while a place is loading. Each level eases toward its target.
const mode = G.mode;
const worldWant = (mode === 'play' || mode === 'talk') ? 1 : mode === 'menu' ? 0.25 : 0;
const menuWant = (mode === 'title' || mode === 'loading' && !meta.started) ? 1 : 0;
const worldVol = (meta.worldVol == null ? 0 : meta.worldVol) + (worldWant - (meta.worldVol == null ? 0 : meta.worldVol)) * Math.min(1, 2.5 * Math.max(DT, 0.016));
const menuVol = (meta.menuVol == null ? 0 : meta.menuVol) + (menuWant - (meta.menuVol == null ? 0 : meta.menuVol)) * Math.min(1, 1.6 * Math.max(DT, 0.016));
put('audio', { worldVol, menuVol });

if (display.gesture && !meta.menuOn && ready('menu')) {
	put('audio', { menuOn: true });
	comp('audio.menu', 'clip', { play: true });
}
if (meta.menuOn) {
	comp('audio.menu', 'clip', { volume: +(0.55 * menuVol).toFixed(3) });
	const mt = clip('menu');
	if (mt && mt.loaded && !mt.playing && menuVol > 0.02) comp('audio.menu', 'clip', { play: true });
}

if (mode === 'play' && !meta.started && ready('musicA') && ready('musicB') && ready('battle') && ready('wind')) {
	put('audio', { started: true, next: 0 });
	comp('audio.musicA', 'clip', { play: true });
	comp('audio.battle', 'clip', { play: true });
	comp('audio.wind', 'clip', { play: true });
	put('audio', { next: 1 });
}

if (meta.started) {
	const speed = P.flying ? P.speed : P.speed * 0.2;
	const under = G.uw || 0;       // under the sea the world's sounds are muffled
	comp('audio.wind', 'clip', {
		volume: clamp(0.06 + speed / 270 * 0.75 + (P.flying ? 0.08 : 0), 0.05, 0.9) * (1 - under * 0.9) * worldVol,
		rate: 0.8 + clamp(speed / 270, 0, 1) * 0.6
	});
	const w = clip('wind');
	if (w && w.loaded && !w.playing) comp('audio.wind', 'clip', { play: true });

	// the explore themes alternate; the battle theme loops and is only heard when the mood is up
	const a = clip('musicA'), b = clip('musicB');
	if (a && b && !a.playing && !b.playing && worldVol > 0.05) {
		comp(meta.next ? 'audio.musicB' : 'audio.musicA', 'clip', { play: true });
		put('audio', { next: meta.next ? 0 : 1 });
	}
	const calm = 0.5 * (1 - mood * 0.9) * (1 - under * 0.55) * worldVol;
	comp('audio.musicA', 'clip', { volume: calm });
	comp('audio.musicB', 'clip', { volume: calm });
	comp('audio.battle', 'clip', { volume: 0.62 * mood * worldVol });
	const bt = clip('battle');
	if (bt && bt.loaded && !bt.playing) comp('audio.battle', 'clip', { play: true });
}
put('audio', { mood });

if (P.fire === 1) comp('audio.shot', 'clip', { play: true });
if (G.hurtEvent) { comp('audio.hurt', 'clip', { play: true }); put('game', { hurtEvent: 0 }); }
if (G.roar) { comp('audio.roar', 'clip', { play: true }); put('game', { roar: 0 }); }
if (G.hitEvent) { comp('audio.hit', 'clip', { play: true }); put('game', { hitEvent: 0 }); }
if (P.evStep) comp('audio.step', 'clip', { play: true, volume: 0.22 + hash(T.frame) * 0.12, rate: 0.9 + hash(T.frame * 3) * 0.25 });
if (P.evLand > 0) comp('audio.land', 'clip', { play: true, volume: clamp(P.evLand, 0.3, 1) });
if (P.evJump) comp('audio.whoosh', 'clip', { play: true });
if (G.sfx) { if (A.packages[G.sfx]) comp('audio.' + G.sfx, 'clip', { play: true }); put('game', { sfx: '' }); }
return done();
