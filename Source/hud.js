// The heads-up display. It lives in camera space, so it is the same in a headset as on a screen.
const P = dat('player'), G = dat('game'), R = dat('rpg'), DEF = dat('defs');
const display = E.utilities.display.properties.state;
const hud = get('hud');
const setText = (name, text) => { const u = hud.packages[name].utilities.label; if (u.content !== text) comp('hud.' + name, 'label', null, text); };
const show = (name, on) => { if (hud.packages[name].properties.meta.data.enabled !== on) put('hud.' + name, { enabled: on }); };
const tint = (name, color) => {
	const node = name.split('.').reduce((n, k) => n.packages[k], hud);
	const cur = node.utilities.mat.properties.data.color;
	if (JSON.stringify(cur) !== JSON.stringify(color)) comp('hud.' + name, 'mat', { color });
};

// bars
const hpFrac = clamp(P.health / P.maxHealth, 0, 1);
put('hud.hpfill', { scale: [Math.max(hpFrac, 0.001), 1, 1] });
put('hud.bsfill', { scale: [Math.max(P.boost, 0.001), 1, 1] });
tint('hpfill.bar', hpFrac > 0.5 ? [0.36, 0.84, 0.42, 1] : hpFrac > 0.25 ? [0.96, 0.76, 0.2, 1] : [0.95, 0.27, 0.22, 1]);
tint('bsfill.bar', P.boosting ? [1, 0.9, 0.5, 1] : [0.4, 0.75, 1, 1]);

// damage flash
const flash = clamp((P.hurt || 0) * 0.9 + (P.dead > 0 ? 0.5 : 0), 0, 0.8);
const old = hud.packages.flash.utilities.mat.properties.data.color[3];
if (Math.abs(old - flash) > 0.01) comp('hud.flash', 'mat', { color: [0.8, 0.02, 0.02, flash] });

// the abilities on the two mouse buttons, and how long until each is ready again
for (const [side, key, mouse] of X.vr ? [['l', 'L', 'TRIGGER'], ['r', 'R', 'GRIP']] : [['l', 'L', 'LMB'], ['r', 'R', 'RMB']]) {
	const id = (R.bind || {})[side], ab = id ? DEF.abilities[id] : null;
	const left = id ? (R.cd || {})[id] || 0 : 0;
	const frac = ab ? clamp(left / ab.cool, 0, 1) : 0;
	const cur = hud.packages['cd' + key].properties.meta.data.scale[0];
	if (Math.abs(cur - Math.max(frac, 0.001)) > 0.01) put('hud.cd' + key, { scale: [Math.max(frac, 0.001), 1, 1] });
	if (T.frame % 6 === 0) setText('act' + key, mouse + '    ' + (id ? DEF.items[id].name : '-'));
}

// text, refreshed a few times a second
if (T.frame % 8 === 0) {
	setText('health', 'HEALTH  ' + Math.ceil(P.health));
	const seaLevel = G.sea.level, eye = P.position[1] + P.eye;
	const where = eye < seaLevel ? 'DEPTH ' + Math.round(seaLevel - eye) + ' m' : 'ALT ' + Math.max(0, Math.round(P.position[1] - Math.max(P.ground, seaLevel))) + ' m';
	setText('info', (P.flying ? 'FLYING' : P.swim ? 'SWIMMING' : (P.grounded ? 'ON FOOT' : 'FALLING')) + '    ' + Math.round(P.speed * 3.6) + ' km/h    ' + where);

	let near = null, nearD = 1e9;
	for (const id of Object.keys(get('enemies').packages)) {
		const e = dat('enemies.' + id);
		if (!e.alive || e.state === 'dying' || e.kind !== 'dragon') continue;
		const d = len(sub(e.position, P.position));
		if (d < nearD) { nearD = d; near = e; }
	}
	if (near && nearD < 3500) {
		const v = sub(near.position, P.position);
		const rel = wrap(Math.atan2(-v[0], -v[2]) - P.yaw);
		const arrows = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'];
		const arrow = arrows[Math.round(((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4)) % 8];
		const vertical = v[1] > 40 ? ' ▲' : v[1] < -40 ? ' ▼' : '';
		setText('near', 'WYRM ' + arrow + ' ' + Math.round(nearD) + ' m' + vertical);
	} else setText('near', '');
}

setText('msg', G.msg || '');
setText('note', G.note || '');
show('notebg', !!G.note);
const prompt = G.mode === 'play' ? (G.interact || '') : '';
setText('interact', prompt);
show('interactbg', !!prompt);

// the reticle goes warm when a bolt lands
const marked = G.hitMark > 0;
if (!!hud.packages.reticle.utilities.mat.properties.data.hot !== marked)
	comp('hud.reticle', 'mat', { color: marked ? [1, 0.55, 0.3, 1] : [1, 1, 1, 1], hot: marked });

// the heads-up display is for play; the menus and conversations have their own
// (a prompt is cleared while the display is still on: what is written to a switched-off display is not seen again when it is switched on)
const wantHud = G.mode === 'play' || hud.packages.interact.utilities.label.content !== '' || hud.packages.interactbg.properties.meta.data.enabled === true;
if (hud.properties.meta.data.enabled !== wantHud) put('hud', { enabled: wantHud });

return done();
