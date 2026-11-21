// The adventure. Four modes: title, play, menu (the pause menu with its tabs) and talk (a conversation).
// This section decides what mode the game is in, runs the menus, saving and loading, quests, items and
// conversations, and hands what the menus should show to menu.js through X.
const G = dat('game'), P = dat('player'), R = dat('rpg'), D = dat('defs');
const ctlPads = E.packages.controllers.utilities;
const kbd = ctlPads['keyboard-0'], mouse = ctlPads['pointer-0'];
const struck = kbd ? kbd.properties.state.pressed : [];
const hitK = (...codes) => codes.some(c => struck.indexOf(c) >= 0);
const clicked = !!mouse && mouse.properties.state.pressed.indexOf('button0') >= 0;
const disp = E.utilities.display.properties.state;
const locked = !!(disp.locked || (disp.xr && disp.xr.presenting));
const now = T.elapsed;
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const copy = o => JSON.parse(JSON.stringify(o || {}));

const g = {};                                         // what changes in the game's own data this frame
const setG = (k, v) => { if (G[k] !== v) g[k] = v; };
let mode = G.mode;

// working copies of the adventure's state; written back only if something changed
let inv = copy(R.inv), bind = copy(R.bind), q = copy(R.q), flags = copy(R.flags), found = copy(R.found), kills = copy(R.kills);
let dirty = false, autosave = false;
const rep = (cur, next) => { const o = {}; for (const k of Object.keys(cur || {})) if (!(k in next)) o[k] = null; return Object.assign(o, next); };
const sfx = name => { g.sfx = name; };
const note = text => { g.note = text; g.noteTimer = 4.5; };

// ---------------------------------------------------------------- the people and things of the world
const things = Object.keys(get('things').packages).map(id => Object.assign({ id }, dat('things.' + id)));
const itemName = id => (D.items[id] || { name: id }).name;

// ---------------------------------------------------------------- where the player is: out in the world, or inside a building
// Out in the world, each island is switched on only while the player is within reach of it (with a margin, so that it does not flicker on and off at the
// edge): its terrain, plants, monsters, buildings and people are not drawn, streamed or thought about otherwise. Inside a building none of the world
// is: the player is in a room of their own, far from everything, and the outdoors is switched off entirely.
const AREA = G.area || 'overworld';
const REACH = { A: [8800, 9600], B: [7600, 8400], F: [4600, 5400] };
const vis = {};
for (const k of ['A', 'B', 'F']) {
	const c = G.isles[k], d = Math.hypot(P.position[0] - c[0], P.position[2] - c[1]), was = G['vis' + k];
	vis[k] = AREA !== 'overworld' ? 0 : d < REACH[k][0] ? 1 : d > REACH[k][1] ? 0 : was;
	if (vis[k] !== was) g['vis' + k] = vis[k];
}
const GROUPS = { A: ['terrain', 'forest', 'flora', 'reef', 'fish', 'landmarks', 'camp', 'enemies'], B: ['isleB'], F: ['isleF'] };
const setOn = (pkg, on) => { const d = dat(pkg); if (d && (d.enabled !== false) !== !!on) put(pkg, { enabled: !!on }); };
for (const k of Object.keys(GROUPS)) for (const pkg of GROUPS[k]) setOn(pkg, vis[k]);
for (const pkg of ['water', 'seabed', 'clouds']) setOn(pkg, AREA === 'overworld');
for (const k of Object.keys(G.rooms)) {
	setOn('rooms.' + k, AREA === k);
	for (const l of ['lightA', 'lightB']) {
		const lu = get('rooms.' + k + '.' + l).utilities.light, now = AREA === k;
		if ((lu.properties.data.on !== false) !== now) comp('rooms.' + k + '.' + l, 'light', { on: now });
	}
}

// ---------------------------------------------------------------- quests
const prog = id => {
	const def = D.quests[id], rec = q[id] || { base: {} };
	return def.objectives.map(o => {
		let have = 0, need = o.need || 1;
		if (o.type === 'have') have = inv[o.item] || 0;
		else if (o.type === 'kill') have = Math.max(0, ((kills[o.kind] || {}).n || 0) - ((rec.base || {})[o.kind] || 0));
		else have = flags[o.flag] ? 1 : 0;
		return { text: o.text, have: Math.min(have, need), need, ok: have >= need, bar: o.type !== 'flag' };
	});
};
const qstate = id => {
	const rec = q[id];
	if (!rec) return 'inactive';
	if (rec.s === 'done') return 'done';
	return prog(id).every(o => o.ok) ? 'ready' : 'active';
};
const startQuest = id => {
	if (q[id]) return;
	const base = {};
	for (const k of Object.keys(D.kinds)) base[k] = (kills[k] || {}).n || 0;
	q[id] = { s: 'active', base, t: now, rn: 0 };
	note('New quest: ' + D.quests[id].title); sfx('quest'); dirty = autosave = true;
};
const completeQuest = id => {
	if (qstate(id) !== 'ready') return;
	const r = D.quests[id].reward || {};
	for (const k of Object.keys(r.items || {})) inv[k] = (inv[k] || 0) + r.items[k];
	if (r.maxHealth) { put('player', { maxHealth: P.maxHealth + r.maxHealth, health: P.maxHealth + r.maxHealth }); }
	q[id].s = 'done';
	note('Quest complete: ' + D.quests[id].title + '   Reward: ' + (r.text || 'none')); sfx('quest'); dirty = autosave = true;
};
const effects = list => {
	for (const e of list || []) {
		if (e[0] === 'start') startQuest(e[1]);
		else if (e[0] === 'complete') completeQuest(e[1]);
		else if (e[0] === 'give') { inv[e[1]] = (inv[e[1]] || 0) + (e[2] || 1); dirty = true; }
		else if (e[0] === 'take') { inv[e[1]] = Math.max(0, (inv[e[1]] || 0) - (e[2] || 1)); dirty = true; }
		else if (e[0] === 'flag') { flags[e[1]] = 1; dirty = true; }
	}
};

// defeated creatures are recorded as they fall (combat reports them in game.kill_<kind>)
for (const kind of Object.keys(D.kinds)) {
	const n = G['kill_' + kind] || 0;
	if (n > 0) { const k = kills[kind] || { n: 0, first: now }; k.n += n; k.last = now; kills[kind] = k; g['kill_' + kind] = 0; dirty = true; }
}
// a quest whose objectives are met says so once
for (const id of Object.keys(q)) {
	const s = qstate(id);
	if (s === 'ready' && !q[id].rn) { q[id].rn = 1; dirty = true; note('Quest updated: ' + D.quests[id].title + '  (return to ' + D.quests[id].giver + ')'); sfx('quest'); }
	else if (s === 'active' && q[id].rn) { q[id].rn = 0; dirty = true; }
}

// ---------------------------------------------------------------- saving and loading
const SLOTS = [0, 1, 2, 3];
const slotName = n => n === 0 ? 'Autosave' : 'Slot ' + n;
const readSlot = n => {
	const u = get('saves.slot' + n).utilities.disk.properties;
	if (!u.state || !u.state.value) return null;
	try { return JSON.parse(u.state.value); } catch (e) { return null; }
};
const snapshot = () => ({
	v: 1, t: Date.now(), play: now, inv, bind, q, flags, found, kills,
	taken: things.filter(t => t.taken).map(t => t.id),
	health: P.health, maxHealth: P.maxHealth, score: G.score, deaths: G.deaths, killsTotal: G.kills,
	pos: P.position, yaw: P.yaw, pitch: P.pitch, flying: P.flying, area: AREA, ret: G.ret
});
const saveSlot = n => {
	const rev = (get('saves.slot' + n).utilities.disk.properties.data.revision || 0) + 1;
	comp('saves.slot' + n, 'disk', { value: JSON.stringify(snapshot()), revision: rev });
};
const describe = s => {
	if (!s) return 'Empty';
	const done = Object.keys(s.q || {}).filter(id => s.q[id].s === 'done').length;
	const defeated = Object.keys(s.kills || {}).reduce((a, k) => a + s.kills[k].n, 0);
	return fmt(s.play || 0) + ' played   ' + done + '/' + Object.keys(D.quests).length + ' quests   ' + defeated + ' defeated' +
		(s.t ? '\n' + new Date(s.t).toLocaleString() : '');
};
const updateThings = takenList => {
	for (const t of things) {
		const gone = takenList.indexOf(t.id) >= 0;
		if (!!t.taken !== gone) put('things.' + t.id, { taken: gone ? 1 : 0 });
	}
};
const writeBack = () => put('rpg', { inv: rep(R.inv, inv), bind: rep(R.bind, bind), q: rep(R.q, q), flags: rep(R.flags, flags), found: rep(R.found, found), kills: rep(R.kills, kills) });
const loadSnapshot = s => {
	inv = copy(s.inv); bind = copy(s.bind); q = copy(s.q); flags = copy(s.flags); found = copy(s.found); kills = copy(s.kills);
	dirty = true;
	updateThings(s.taken || []);
	put('player', {
		position: s.pos, vel: [0, 0, 0], vy: 0, flying: s.flying ? 1 : 0, health: s.health, maxHealth: s.maxHealth, dead: 0,
		yaw: s.yaw, pitch: s.pitch, roll: 0, boost: 1, hurt: 0, tele: 5
	});
	g.kills = s.killsTotal || 0; g.score = s.score || 0; g.deaths = s.deaths || 0;
	g.area = s.area || 'overworld'; if (s.ret) g.ret = s.ret;
	note('Game loaded');
};
const newGame = () => {
	inv = { bolt: 1 }; bind = { l: 'bolt', r: '' }; q = {}; flags = {}; found = { camp: 1 }; kills = {};
	dirty = true;
	updateThings([]);
	put('player', {
		position: G.spawn, vel: [0, 0, 0], vy: 0, flying: 0, health: 100, maxHealth: 100, dead: 0,
		yaw: G.spawnYaw, pitch: 0, roll: 0, boost: 1, hurt: 0, tele: 5
	});
	g.kills = 0; g.score = 0; g.deaths = 0; g.area = 'overworld';
	note('Speak to Maren, by the fire.');
	autosave = true;
};

// ---------------------------------------------------------------- the interface's views, built per mode
const nav = (n) => {
	let sel = G.sel || 0;
	if (hitK('ArrowDown', 'KeyS')) { sel = (sel + 1) % Math.max(1, n); sfx('click'); }
	if (hitK('ArrowUp', 'KeyW')) { sel = (sel + n - 1) % Math.max(1, n); sfx('click'); }
	return clamp(sel, 0, Math.max(0, n - 1));
};
const ABIL = Object.keys(D.abilities);
const bindMark = id => (bind.l === id ? 'L' : '') + (bind.r === id ? 'R' : '');

const inventoryRows = () => {
	const rows = [];
	for (const id of Object.keys(D.items)) {
		if (!(inv[id] > 0)) continue;
		const it = D.items[id];
		if (it.type === 'ability') {
			const m = bindMark(id);
			rows.push({ id, label: it.name + (m ? '      [' + (m === 'LR' ? 'LMB RMB' : m === 'L' ? 'LMB' : 'RMB') + ']' : ''), detail: it.name + '\n\n' + it.desc + '\n\nPress 1 to place it on the left mouse button, 2 for the right, 3 to clear it.' });
		} else {
			rows.push({ id, label: it.name + '      x' + inv[id], detail: it.name + '\n\n' + it.desc + (it.heal ? '\n\nPress Enter to use it.' : '') });
		}
	}
	return rows;
};
const questRows = () => {
	const rows = [{ label: '-  QUESTS  -', detail: 'What you have taken on, and what is left to do. Quests ready to hand in are listed first.' }], order = { ready: 0, active: 1, done: 2 };
	const ids = Object.keys(q).sort((a, b) => order[qstate(a)] - order[qstate(b)] || q[a].t - q[b].t);
	for (const id of ids) {
		const def = D.quests[id], s = qstate(id);
		const lines = prog(id).map(o => (o.ok ? '-   ' : '•   ') + o.text + (o.bar ? '   ' + o.have + ' / ' + o.need : ''));
		const status = s === 'done' ? 'Completed.' : s === 'ready' ? 'Return to ' + def.giver + '.' : 'Given by ' + def.giver + '.';
		rows.push({
			label: def.title + (s === 'done' ? '   (done)' : s === 'ready' ? '   (ready)' : ''),
			detail: def.title + '\n' + status + '\n\n' + def.summary + '\n\n' + lines.join('\n') + '\n\nReward: ' + ((def.reward || {}).text || 'none')
		});
	}
	if (!ids.length) rows.push({ label: 'none yet', detail: 'Nobody has asked anything of you yet. People in the world may.' });
	const defeated = Object.keys(D.kinds).filter(k => (kills[k] || {}).n > 0);
	rows.push({ label: '-  DEFEATED  -', detail: 'Everything you have brought down is written here.' });
	if (!defeated.length) rows.push({ label: 'nothing yet', detail: 'Nothing has fallen to you yet.' });
	for (const k of defeated) {
		const kd = D.kinds[k], rec = kills[k];
		rows.push({ label: kd.plural + '      ' + rec.n, detail: kd.name + '\n\n' + kd.desc + '\n\nDefeated: ' + rec.n + '\nFirst: ' + fmt(rec.first) + ' into the journey\nMost recent: ' + fmt(rec.last) });
	}
	return rows;
};
const mapRows = () => Object.keys(G.pois).filter(k => found[k]).map(k => ({ id: k, label: G.pois[k].name, detail: '' }));
const systemRows = () => {
	const rows = [{ label: 'Resume', act: 'resume', detail: 'Back to the game.' }];
	for (const n of [1, 2, 3]) rows.push({ label: 'Save    ' + slotName(n), act: 'save', n, detail: describe(readSlot(n)) });
	for (const n of SLOTS.slice().reverse()) { const s = readSlot(n); if (s) rows.push({ label: 'Load    ' + slotName(n), act: 'load', n, detail: describe(s) }); }
	rows.push({ label: 'Quit to title', act: 'title', detail: 'Return to the title screen. Unsaved progress is lost.' });
	return rows;
};
const CONTROLS = 'WASD  move or fly\nMouse  look\nShift  run, or boost in flight\nSpace  jump, take off, or rise\nQ / Ctrl  descend\nF  take off or land\nE  talk to people and take things\nLeft / right mouse  the two actions you have bound\nI  inventory    L  log (quests and the defeated)    M  map\nEsc  pause';
const titleRows = () => {
	const rows = [];
	let latest = null;
	for (const n of SLOTS) { const s = readSlot(n); if (s && (!latest || s.t > latest.s.t)) latest = { n, s }; }
	if (latest) rows.push({ label: 'Continue', act: 'load', n: latest.n, detail: slotName(latest.n) + '\n' + describe(latest.s) });
	rows.push({ label: 'New game', act: 'new', detail: 'Begin again at Maren\'s camp.' });
	for (const n of SLOTS) { const s = readSlot(n); if (s) rows.push({ label: 'Load    ' + slotName(n), act: 'load', n, detail: describe(s) }); }
	rows.push({ label: 'Controls', act: 'none', detail: CONTROLS });
	return rows;
};

// A place is loaded behind a screen of its own: the player is put where they are going, the world streams in around them, and play begins when it
// has (every model and texture there, nothing left waiting to be made) and not before.
const TIPS = ['Moonapples glow in the grass.', 'R speaks to people and takes things.', 'Q and E take you down and up. F takes you off and lands you.', 'The left and right mouse buttons do what the inventory says.', 'Deep water holds sharks, and they mind their own business.', 'Dragons keep to the high peaks.'];
const beginLoading = label => { mode = 'loading'; g.loadFrom = T.frame; g.loadLabel = label; g.loadTipN = Math.floor(hash(now * 7 + T.frame) * TIPS.length); };
// through a door, in or out: the player is put on the other side, and the place behind them is switched off
const warp = t => {
	if (t.room === 'out') {
		const r = G.ret, from = (G.rooms[AREA] || {}).name || 'the building';
		g.area = 'overworld';
		put('player', { position: r.pos, vel: [0, 0, 0], vy: 0, flying: 0, yaw: r.yaw, pitch: 0, tele: 5 });
		beginLoading('Leaving ' + from);
	} else {
		const r = G.rooms[t.room];
		g.ret = t.exit; g.area = t.room;
		put('player', { position: r.spawn, vel: [0, 0, 0], vy: 0, flying: 0, yaw: r.yaw, pitch: 0, tele: 5 });
		beginLoading('Entering ' + r.name);
	}
	g.pLock = 1; sfx('click');
};
const worldReady = () => {
	let waiting = 0;
	const walk = n => {
		for (const u of Object.values(n.utilities || {})) {
			const st = u.properties && u.properties.state;
			if (st && (st.loaded === false || st.queued > 0)) waiting++;
		}
		for (const c of Object.values(n.packages || {})) walk(c);
	};
	walk(S);
	return waiting === 0;
};
const enterPlay = () => { mode = 'play'; g.playFrom = T.frame; g.lockSeen = 0; g.started = 1; };
const openMenu = tab => { mode = 'menu'; g.tab = tab; g.sel = 0; g.mapOpen = 0; sfx('click'); };

// ---------------------------------------------------------------- what the player is facing
let target = null;
if (mode === 'play') {
	let best = 1e9;
	for (const t of things) {
		if (t.taken || t.kind === 'portal' || (t.area || 'overworld') !== AREA) continue;
		const d = len(sub(add(t.position, [0, 1, 0]), add(P.position, [0, 1, 0])));
		if (d < t.radius && d < best) { best = d; target = t; }
	}
}
const promptFor = t => !t ? '' : t.kind === 'door' ? '[R]  Enter ' + t.name : t.kind === 'npc' ? '[R]  Talk to ' + t.name : t.kind === 'stone' ? '[R]  Touch the ' + t.name : '[R]  Take ' + t.name;
setG('interact', promptFor(target));

// locations come to be known by going near them
if (mode === 'play') {
	for (const k of Object.keys(G.pois)) {
		if (found[k]) continue;
		const p = G.pois[k].pos;
		if (Math.hypot(p[0] - P.position[0], p[2] - P.position[2]) < 280) { found[k] = 1; dirty = true; note('Discovered: ' + G.pois[k].name); sfx('quest'); }
	}
}

// ---------------------------------------------------------------- voices
let voiceRev = G.voiceRev || 0;
const speak = (npc, text) => { voiceRev++; comp('voice', 'say', { text, revision: voiceRev, pitch: npc.pitch, rate: npc.rate, voice: npc.voice }); };
const hush = () => { voiceRev++; comp('voice', 'say', { text: '', revision: voiceRev }); };
const holds = w => !w || ((!w.q || qstate(w.q) === w.s) && (!w.flag || flags[w.flag]));
X.talk = null;

// ================================================================ the modes
if (mode === 'title') {
	const rows = titleRows();
	const sel = nav(rows.length);
	setG('sel', sel);
	if (hitK('Enter', 'Space')) {
		const r = rows[sel];
		sfx('click');
		if (r.act === 'new') { newGame(); beginLoading('Beginning'); }
		else if (r.act === 'load') { loadSnapshot(readSlot(r.n)); beginLoading('Loading ' + slotName(r.n)); }
	}
	X.view = { title: true, rows: rows.map(r => r.label), sel, detail: (rows[sel] || {}).detail || '', footer: 'W / S  choose        ENTER  select' };

} else if (mode === 'menu') {
	let tab = G.tab || 0;
	const onMap = tab === 2;                                    // on the map the movement keys pan it, so only Q and E change the tab
	if (onMap ? hitK('KeyE') : hitK('ArrowRight', 'KeyD', 'KeyE')) { tab = (tab + 1) % 4; g.tab = tab; g.sel = 0; sfx('click'); }
	if (onMap ? hitK('KeyQ') : hitK('ArrowLeft', 'KeyA', 'KeyQ')) { tab = (tab + 3) % 4; g.tab = tab; g.sel = 0; sfx('click'); }
	if (hitK('KeyI')) { if (tab === 0) { enterPlay(); } else { tab = 0; g.tab = 0; g.sel = 0; sfx('click'); } }
	if (hitK('KeyL')) { if (tab === 1) { enterPlay(); } else { tab = 1; g.tab = 1; g.sel = 0; sfx('click'); } }
	if (hitK('KeyM')) { if (tab === 2) { enterPlay(); } else { tab = 2; g.tab = 2; g.sel = 0; sfx('click'); } }
	if (hitK('Escape', 'Tab')) enterPlay();

	const rows = [inventoryRows, questRows, () => [], systemRows][tab]();
	const sel = tab !== (G.tab || 0) ? 0 : nav(rows.length);
	setG('sel', sel);
	const cur = rows[sel];
	let footer = 'Q / E  change tab        W / S  choose        ESC  resume';

	if (tab === 0 && cur) {
		const it = D.items[cur.id];
		if (it.type === 'ability') {
			const setSlot = which => {
				const other = which === 'l' ? 'r' : 'l';
				if (bind[other] === cur.id) bind[other] = bind[which] || '';
				bind[which] = cur.id; dirty = true; sfx('click');
			};
			if (hitK('Digit1', 'Numpad1')) setSlot('l');
			if (hitK('Digit2', 'Numpad2')) setSlot('r');
			if (hitK('Digit3', 'Numpad3')) { if (bind.l === cur.id) bind.l = ''; if (bind.r === cur.id) bind.r = ''; dirty = true; sfx('click'); }
			footer = '1  left mouse        2  right mouse        3  clear        Q / E  tab';
		} else if (it.heal && hitK('Enter', 'Space')) {
			if (P.health < P.maxHealth - 0.5) {
				inv[cur.id] -= 1; dirty = true; sfx('pickup');
				put('player', { health: Math.min(P.maxHealth, P.health + it.heal) });
				note('You eat the ' + it.name + '.');
			} else note('You are already unhurt.');
		}
	}
	// ---- the map: a window on the whole region that is dragged to pan and scrolled to zoom; an icon says its name when the pointer is on it, and travels when clicked
	let mapView = null;
	if (tab === 2) try {
		const MV = dat('ui').mapv, held = c => !!kbd && kbd.properties.state.digital.indexOf(c) >= 0;
		const an = mouse ? mouse.properties.state.analog : { x: 0.5, y: 0.5, wheel: 0 };
		const down = !!mouse && mouse.properties.state.digital.indexOf('button0') >= 0;
		const pressed = down && !G.mapDown, released = !down && !!G.mapDown;      // edges worked out here: the held list is reliable, the edge lists are only there for a frame
		const aspect = disp.aspect || 16 / 9, halfH = Math.tan(0.56), halfW = halfH * aspect;
		const fit = Math.min(1, (2 * halfW - 0.08) / (MV.w + 0.06));          // a narrow screen shrinks the window to fit
		const regW = MV.x1 - MV.x0, regH = MV.z1 - MV.z0, ratio = MV.h / MV.w;
		const hereP = AREA !== 'overworld' ? G.ret.pos : P.position, hereYaw = AREA !== 'overworld' ? G.ret.yaw : P.yaw;
		let W = G.mapW, cx = G.mapCx, cz = G.mapCz;
		if (!W || tab !== (G.tab || 0) || G.mapOpen !== 1) { W = 7600; cx = hereP[0]; cz = hereP[2]; g.mapOpen = 1; }
		// where the pointer is on the map, in the window's own units, and in metres
		const ux = ((an.x - 0.5) * 2 * halfW) / fit, uy = ((an.y - 0.5) * 2 * halfH - MV.cy) / fit;
		const inside = Math.abs(ux) < MV.w / 2 && Math.abs(uy) < MV.h / 2;
		const clampView = () => { W = Math.max(MV.minSpan, Math.min(MV.maxSpan, W)); const hm = W * ratio; cx = Math.max(MV.x0 + W / 2, Math.min(MV.x1 - W / 2, cx)); cz = Math.max(MV.z0 + hm / 2, Math.min(MV.z1 - hm / 2, cz)); };
		// zoom: the wheel (about the pointer) or the plus and minus keys (about the middle)
		let zoom = 1;
		if (inside && Math.abs(an.wheel) > 0.01) zoom = an.wheel > 0 ? 1.25 : 1 / 1.25;
		if (held('Equal') || held('NumpadAdd')) zoom = Math.pow(1 / 1.9, DT);
		if (held('Minus') || held('NumpadSubtract')) zoom = Math.pow(1.9, DT);
		if (zoom !== 1) {
			const ax = zoom !== 1 && (Math.abs(an.wheel) > 0.01) && inside ? ux : 0, ay = (Math.abs(an.wheel) > 0.01) && inside ? uy : 0;
			const mpu = W / MV.w;                                              // metres per unit now
			const wx = cx + ax * mpu, wz = cz + ay * mpu;                      // the point that stays under the pointer
			W *= zoom; const mpu2 = W / MV.w; cx = wx - ax * mpu2; cz = wz - ay * mpu2;
		}
		// pan: dragging, or the movement keys
		const mpu = W / MV.w;
		if (down && G.mapDown) { cx -= (an.x - G.mapLX) * 2 * halfW / fit * mpu; cz -= (an.y - G.mapLY) * 2 * halfH / fit * mpu; }
		const pan = W * 0.55 * DT;
		if (held('KeyA') || held('ArrowLeft')) cx -= pan;
		if (held('KeyD') || held('ArrowRight')) cx += pan;
		if (held('KeyW') || held('ArrowUp')) cz += pan;
		if (held('KeyS') || held('ArrowDown')) cz -= pan;
		if (hitK('KeyR')) { cx = hereP[0]; cz = hereP[2]; sfx('click'); }
		clampView();
		const toL = (x, z) => [(x - cx) / W * MV.w, (z - cz) / W * MV.w];
		// the icon under the pointer
		let hover = null, best = 0.052;
		if (inside) for (const k of Object.keys(G.pois)) { if (!found[k]) continue; const l = toL(G.pois[k].pos[0], G.pois[k].pos[2]); const d = Math.hypot(l[0] - ux, l[1] - uy); if (d < best) { best = d; hover = k; } }
		// a click is a press and a release in nearly the same place; a drag is not
		if (pressed) { g.mapDown = 1; g.mapOX = an.x; g.mapOY = an.y; g.mapMoved = 0; }
		if (down && G.mapDown && !G.mapMoved && Math.hypot(an.x - G.mapOX, an.y - G.mapOY) > 0.008) g.mapMoved = 1;
		if (released) {
			g.mapDown = 0;
			if (hover && !G.mapMoved) {
				if (AREA !== 'overworld') note('You cannot travel from indoors.');
				else { const p = G.pois[hover]; put('player', { position: p.travel, vel: [0, 0, 0], vy: 0, flying: 0, tele: 5 }); note('Travelled to ' + p.name); sfx('quest'); beginLoading('Travelling to ' + p.name); }
			}
		}
		g.mapLX = an.x; g.mapLY = an.y;
		if (W !== G.mapW) g.mapW = W; if (cx !== G.mapCx) g.mapCx = cx; if (cz !== G.mapCz) g.mapCz = cz;
		mapView = { W, cx, cz, fit, hover, ptr: [ux, uy], inside, you: [hereP[0], hereP[2], hereYaw], found, away: AREA !== 'overworld', dragging: down && G.mapDown };
		footer = 'Drag  pan        Wheel  zoom        Click an icon  travel        R  find yourself        Q / E  tab';
	} catch (e) { g.mapErr = String(e && e.message); }
	if (tab === 3 && cur && hitK('Enter', 'Space')) {
		sfx('click');
		if (cur.act === 'resume') enterPlay();
		else if (cur.act === 'save') { saveSlot(cur.n); note('Saved to ' + slotName(cur.n)); }
		else if (cur.act === 'load') { loadSnapshot(readSlot(cur.n)); beginLoading('Loading ' + slotName(cur.n)); }
		else if (cur.act === 'title') { mode = 'title'; g.sel = 0; }
	}

	const binds = 'LEFT MOUSE:  ' + itemName(bind.l) + (bind.l ? '' : 'nothing') + '        RIGHT MOUSE:  ' + (bind.r ? itemName(bind.r) : 'nothing');
	X.view = { tab, tabs: true, rows: rows.map(r => r.label), sel: Math.min(sel, rows.length - 1), detail: cur ? cur.detail : (tab === 0 ? 'Nothing carried.' : ''), footer, bindline: tab === 0 ? binds : '', map: tab === 2, mapView };

} else if (mode === 'loading') {
	const frames = T.frame - (g.loadFrom !== undefined ? g.loadFrom : G.loadFrom);
	X.loadNote = (G.loadLabel || 'Loading') + '.'.repeat(1 + Math.floor(frames / 18) % 3);
	X.loadTip = TIPS[(G.loadTipN || 0) % TIPS.length];
	let ready = !!G.loadIdle;
	if (frames % 6 === 0) { ready = frames > 75 && worldReady(); g.loadIdle = ready ? 1 : 0; }
	if ((ready && frames > 75) || frames > 900) { g.loadIdle = 0; enterPlay(); }
} else if (mode === 'talk') {
	const npcDef = D.npcs[G.talkNpc], entry = npcDef.dialog[G.talkEntry];
	const ask = entry.ask || null;
	const phase = G.talkPhase || 'say';
	const advance = hitK('KeyR', 'Enter', 'Space') || clicked;
	const finish = () => { hush(); effects(entry.then); sfx('click'); mode = 'play'; g.playFrom = T.frame; g.talkPhase = 'say'; };
	const traitsOf = () => { const t = {}; for (const a2 of ask) for (const o of a2.opts) t[o.trait] = 0; return t; };
	const endLines = () => { const t = G.traits || {}; let best = null; for (const k of Object.keys(t)) if (best === null || t[k] > t[best]) best = k; return (entry.endings || {})[best] || null; };
	let text = '', hint = '', options = null, sel = 0;
	if (phase === 'say') {
		if (advance) {
			if (G.talkLine < entry.say.length - 1) { g.talkLine = G.talkLine + 1; speak(npcDef, entry.say[g.talkLine]); sfx('click'); }
			else if (ask) { g.talkPhase = 'ask'; g.askIdx = 0; g.askSel = 0; g.traits = traitsOf(); speak(npcDef, ask[0].q); sfx('click'); }
			else finish();
		}
		const line = g.talkLine !== undefined ? g.talkLine : G.talkLine;
		text = entry.say[Math.min(line, entry.say.length - 1)];
		hint = (line < entry.say.length - 1 || ask ? '[R]  continue' : '[R]  end') + '   ' + (line + 1) + ' / ' + entry.say.length;
	} else if (phase === 'ask') {
		const qn = ask[G.askIdx], n = qn.opts.length;
		let s2 = G.askSel || 0;
		if (hitK('ArrowDown', 'KeyS')) { s2 = (s2 + 1) % n; sfx('click'); }
		if (hitK('ArrowUp', 'KeyW')) { s2 = (s2 + n - 1) % n; sfx('click'); }
		if (s2 !== G.askSel) g.askSel = s2;
		if (advance) {
			const o = qn.opts[s2];
			g.traits = { [o.trait]: ((G.traits || {})[o.trait] || 0) + 1 };
			g.talkPhase = 'reply'; g.askText = o.reply; speak(npcDef, o.reply); sfx('click');
		}
		text = qn.q; options = qn.opts.map(o => o.t); sel = s2;
		hint = 'W / S  choose        R  answer        question ' + (G.askIdx + 1) + ' / ' + ask.length;
	} else if (phase === 'reply') {
		if (advance) {
			if (G.askIdx < ask.length - 1) { g.askIdx = G.askIdx + 1; g.askSel = 0; g.talkPhase = 'ask'; speak(npcDef, ask[G.askIdx + 1].q); sfx('click'); }
			else {
				// what the three answers add up to
				const t = Object.assign({}, G.traits || {});
				let best = null; for (const k of Object.keys(t)) if (best === null || t[k] > t[best]) best = k;
				const lines = (entry.endings || {})[best];
				if (lines) { g.talkPhase = 'end'; g.endKey = best; g.talkLine = 0; speak(npcDef, lines[0]); sfx('click'); }
				else finish();
			}
		}
		text = G.askText; hint = '[R]  continue';
	} else {
		const lines = (entry.endings || {})[G.endKey] || [''];
		if (advance) {
			if (G.talkLine < lines.length - 1) { g.talkLine = G.talkLine + 1; speak(npcDef, lines[g.talkLine]); sfx('click'); }
			else finish();
		}
		const line = g.talkLine !== undefined ? g.talkLine : G.talkLine;
		text = lines[Math.min(line, lines.length - 1)]; hint = line < lines.length - 1 ? '[R]  continue' : '[R]  end';
	}
	X.talk = { speaker: npcDef.name, text, hint, options, sel };

} else {
	// ---- play
	if (locked && !G.lockSeen) g.lockSeen = 1;
	// an open doorway is a way through for anyone on foot who walks into it; the lock keeps the one they have just come out of from sending them back
	let warped = false;
	const near = things.find(t => t.kind === 'portal' && !t.taken && (t.area || 'overworld') === AREA && len(sub(add(t.position, [0, 1, 0]), add(P.position, [0, 1, 0]))) < t.radius);
	if (G.pLock) { if (!near) g.pLock = 0; }
	else if (near && !P.flying && !(P.dead > 0)) { warp(near); warped = true; }
	if (warped) { /* on the way */ }
	else if ((G.lockSeen && !locked) || (!G.lockSeen && !locked && T.frame - G.playFrom > 120)) openMenu(0);
	else if (hitK('KeyI')) openMenu(0);
	else if (hitK('KeyL')) openMenu(1);
	else if (hitK('KeyM')) openMenu(2);
	else if (hitK('KeyR') && target && !(P.dead > 0)) {
		const t = target;
		if (t.kind === 'npc') {
			const npcDef = D.npcs[t.ref];
			const idx = Math.max(0, npcDef.dialog.findIndex(e => holds(e.when)));
			mode = 'talk'; g.talkNpc = t.ref; g.talkEntry = idx; g.talkLine = 0; g.talkPhase = 'say'; sfx('click');
			speak(npcDef, npcDef.dialog[idx].say[0]);
		} else if (t.kind === 'item') {
			inv[t.ref] = (inv[t.ref] || 0) + 1; dirty = autosave = true;
			put('things.' + t.id, { taken: 1, enabled: false });
			note('Picked up: ' + itemName(t.ref)); sfx('pickup');
		} else if (t.kind === 'door') {
			warp(t);
		} else if (t.kind === 'stone') {
			sfx('stone');
			if (!flags.stone_touched) {
				flags.stone_touched = 1; inv.shard = (inv.shard || 0) + 1; dirty = autosave = true;
				note('The Moon Stone hums. A shard comes loose in your hand.');
			} else note('The Moon Stone hums quietly.');
		}
	}
	// people turn to face you
	for (const t of things) {
		if (t.kind !== 'npc') continue;
		const dx = P.position[0] - t.position[0], dz = P.position[2] - t.position[2];
		if (Math.hypot(dx, dz) > 28) continue;
		const want = Math.atan2(-dx, -dz), cur = t.rotation[1];
		const next = cur + wrap(want - cur) * Math.min(1, 4 * DT);
		if (Math.abs(next - cur) > 0.004) put('things.' + t.id, { rotation: [0, next, 0] });
	}
	X.view = null;
}

// ---------------------------------------------------------------- housekeeping
if (g.noteTimer === undefined) { const nt = Math.max(0, (G.noteTimer || 0) - DT); if (nt !== G.noteTimer) g.noteTimer = nt; if (nt <= 0 && G.note) g.note = ''; }
// the person being spoken to moves as one who is talking
for (const t of things) {
	if (t.kind !== 'npc') continue;
	const want = (mode === 'talk' && (g.talkNpc !== undefined ? g.talkNpc : G.talkNpc) === t.ref) ? 'Idle_Talking_Loop' : 'Idle_Loop';
	if ((t.clip || 'Idle_Loop') !== want) { comp('things.' + t.id + '.model', 'anim', { clip: want, loop: true }); put('things.' + t.id, { clip: want }); }
}
// who and what exists here: anything of the place the player is in, on an island that is switched on
// within the town, a building is drawn only while the player is within about six kilometres of it (a little further to keep one that is already there), which is past the island's edge by two or more
if (vis.B && T.frame % 10 === 0) {
	const pk = get('isleB').packages;
	for (const id of Object.keys(pk)) {
		if (!/^b\d+$/.test(id)) continue;
		const b = dat('isleB.' + id), d = Math.hypot(b.position[0] - P.position[0], b.position[2] - P.position[2]), on = b.enabled !== false;
		if (on ? d > 6200 : d < 5800) put('isleB.' + id, { enabled: !on });
	}
}
for (const t of things) {
	const near = t.isle === 'B' ? Math.hypot(t.position[0] - P.position[0], t.position[2] - P.position[2]) < 1200 : true;
	const want = !t.taken && near && (t.area || 'overworld') === AREA && (t.isle === 'R' || !!vis[t.isle || 'A']);
	if (t.enabled !== want) put('things.' + t.id, { enabled: want });
}
if (dirty) writeBack();
if (autosave) saveSlot(0);
if (mode !== G.mode) g.mode = mode;
if (Object.keys(g).length) put('game', g);

// time and the pointer follow the mode
const grace = mode === 'play' && !locked && T.frame - (g.playFrom !== undefined ? g.playFrom : G.playFrom) < 120;
const wantScale = mode === 'play' && (locked || grace) ? 1 : 0;
const wantCursor = (mode === 'play' || mode === 'talk') ? 'locked' : 'free';
const curTime = E.utilities.time.properties.data || {}, curDisplay = E.utilities.display.properties.data || {};
if (curTime.scale !== wantScale || curDisplay.cursor !== wantCursor) {
	node('engine').utilities = { time: { properties: { data: { scale: wantScale } } }, display: { properties: { data: { cursor: wantCursor } } } };
}
X.mode = mode;
