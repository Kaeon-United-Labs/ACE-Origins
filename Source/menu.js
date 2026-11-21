// Draws what game.js decided: the title screen, the pause menu and its tabs, the map, and the conversation box.
// Everything is entities in camera space, so a headset sees what the screen does. Text is only rebuilt when it changes.
const V = X.view, TK = X.talk;
const U = dat('ui');
const G_POIS = dat('game').pois;
const labelOf = path => { const n = get(path); return n && n.utilities ? n.utilities.label : null; };
const setTxt = (path, text) => { const u = labelOf(path); if (u && u.content !== text) comp(path, 'label', null, text); };
const setCol = (path, color) => {
	const u = labelOf(path);
	if (u && JSON.stringify(u.properties.data.color) !== JSON.stringify(color)) comp(path, 'label', { color });
};
const show = (path, on) => { const n = get(path); if (n && n.properties.meta.data.enabled !== on) put(path, { enabled: on }); };
const placed = (path, pos) => { const n = dat(path); if (n && (Math.abs(n.position[0] - pos[0]) > 1e-4 || Math.abs(n.position[1] - pos[1]) > 1e-4)) put(path, { position: pos }); };

const inUi = X.mode === 'title' || X.mode === 'menu';
show('ui.dim', inUi);
show('ui.title', X.mode === 'title');
show('ui.menu', inUi && !!V);
show('ui.talk', X.mode === 'talk' && !!TK);
show('ui.loading', X.mode === 'loading');
if (X.mode === 'loading') {
	setTxt('ui.loading.note', X.loadNote || 'Loading');
	setTxt('ui.loading.tip', X.loadTip || '');
}

if (inUi && V) {
	const ROWS = U.rows, TOP = U.top, STEP = U.step;
	show('ui.menu.tabs', !!V.tabs);
	if (V.tabs) placed('ui.menu.tabs.line', [U.tabX[V.tab], 0.47, 0.0015]);
	if (V.tabs) for (let i = 0; i < 4; i++) setCol('ui.menu.tabs.t' + i, i === V.tab ? [1, 0.86, 0.45, 1] : [0.68, 0.72, 0.8, 0.85]);

	for (let i = 0; i < ROWS; i++) {
		setTxt('ui.menu.rows.r' + i, V.rows[i] !== undefined ? V.rows[i] : '');
		setCol('ui.menu.rows.r' + i, i === V.sel ? [1, 0.92, 0.66, 1] : [0.84, 0.87, 0.94, 1]);
	}
	show('ui.menu.hl', V.rows.length > 0);
	placed('ui.menu.hl', [U.hlx, TOP - V.sel * STEP - 0.002, 0.001]);

	setTxt('ui.menu.detail', V.detail || '');
	setTxt('ui.menu.bind', V.bindline || '');
	setTxt('ui.menu.footer', V.footer || '');

	// the map takes the whole window; every other tab is a list and its detail
	const MP = V.map && V.mapView ? V.mapView : null;
	for (const k of ['listpanel', 'detailpanel', 'hl', 'rows', 'detail', 'bind']) show('ui.menu.' + k, !MP && (k === 'rows' || k === 'listpanel' || k === 'detailpanel' || (k === 'hl' ? V.rows.length > 0 : true)));
	show('ui.menu.mapview', !!MP);
	if (MP) try {
		const MV = U.mapv, base = 'ui.menu.mapview.';
		const sc = MP.fit;
		const cur = dat('ui.menu.mapview');
		if (cur && Math.abs((cur.scale ? cur.scale[0] : 1) - sc) > 1e-4) put('ui.menu.mapview', { scale: [sc, sc, 1] });
		// the picture: the window onto it
		const hm = MP.W * (MV.h / MV.w), rw = MV.x1 - MV.x0, rh = MV.z1 - MV.z0;
		const region = [(MP.cx - MP.W / 2 - MV.x0) / rw, (MP.cz - hm / 2 - MV.z0) / rh, MP.W / rw, hm / rh].map(v => +v.toFixed(6));
		const mat = get(base + 'img').utilities.mat;
		if (JSON.stringify(mat.properties.data.region) !== JSON.stringify(region)) comp(base + 'img', 'mat', { region });
		const L = (x, z) => [(x - MP.cx) / MP.W * MV.w, (z - MP.cz) / MP.W * MV.w];
		const within = (l, m = 0.03) => Math.abs(l[0]) < MV.w / 2 - m && Math.abs(l[1]) < MV.h / 2 - m;
		const put3 = (path, l) => { const n = dat(path), q = n && n.position ? n.position : [1e9, 1e9, 0]; if (n && (Math.abs(q[0] - l[0]) > 5e-5 || Math.abs(q[1] - l[1]) > 5e-5)) put(path, { position: [+l[0].toFixed(5), +l[1].toFixed(5), q[2]] }); };
		// icons of the places found
		for (const k of Object.keys(G_POIS)) {
			const l = L(G_POIS[k].pos[0], G_POIS[k].pos[2]), on = !!MP.found[k] && within(l, 0.04);
			show(base + 'icons.' + k, on);
			if (on) put3(base + 'icons.' + k, l);
		}
		const hv = MP.hover && MP.found[MP.hover] ? MP.hover : null;
		show(base + 'ring', !!hv);
		if (hv) put3(base + 'ring', L(G_POIS[hv].pos[0], G_POIS[hv].pos[2]));
		// the names of the islands, while the map is wide enough for them to mean something
		const isles = dat('game').isles, names = { A: [0, 0], B: isles.B, F: isles.F };
		for (const k of ['A', 'B', 'F']) {
			const c = isles[k], l = L(c[0], c[1] + (k === 'A' ? 4300 : (k === 'B' ? 2400 : 0)));
			if (k === 'F') l[1] -= 0.075;
			const on = MP.W > 5200 && within(l, 0.1) && !(k === 'F' && MP.W < 9000 && false);
			show(base + 'labels.' + k, on);
			if (on) put3(base + 'labels.' + k, l);
		}
		// you: an arrow that points the way you face. North is up the map (+z), and you look along (-sin yaw, -cos yaw)
		const yl = L(MP.you[0], MP.you[1]), yon = within(yl, 0.02);
		show(base + 'you', yon);
		if (yon) {
			put3(base + 'you', yl);
			const rz = +(-Math.atan2(-Math.sin(MP.you[2]), -Math.cos(MP.you[2]))).toFixed(3), yn = dat(base + 'you');
			if (Math.abs((yn.rotation ? yn.rotation[2] : 0) - rz) > 0.004) put(base + 'you', { rotation: [0, 0, rz] });
		}
		// the scale bar: the longest round distance that fits in a quarter of the window
		const per = MV.w / MP.W;                                                 // units per metre
		let len = 100; for (const c of [100, 200, 500, 1000, 2000, 5000, 10000]) if (c * per < 0.5) len = c;
		const bw = len * per, sn = dat(base + 'scale.bar');
		if (sn && Math.abs((sn.scale ? sn.scale[0] : 1) - bw) > 1e-4) { put(base + 'scale.bar', { scale: [bw, 1, 1], position: [bw / 2, 0, 0] }); put(base + 'scale.cap1', { position: [bw, 0.012, 0] }); }
		setTxt(base + 'scale.label', len >= 1000 ? (len / 1000) + ' km' : len + ' m');
		// the tooltip, by the pointer
		const tip = !!hv && !MP.dragging;
		show(base + 'tip', tip);
		if (tip) {
			const p = G_POIS[hv], l = L(p.pos[0], p.pos[2]);
			const hint = MP.away ? 'You cannot travel from indoors' : 'Click to travel';
			setTxt(base + 'tip.name', p.name.toUpperCase()); setTxt(base + 'tip.hint', hint);
			const w = Math.max(0.34, p.name.length * 0.027 + 0.08);
			const bgn = dat(base + 'tip.bg');
			if (bgn && Math.abs((bgn.scale ? bgn.scale[0] : 1) - w / 0.3) > 1e-3) put(base + 'tip.bg', { scale: [w / 0.3, 1, 1], position: [w / 2 - 0.01, 0, 0] });
			// to the right of the icon, or to its left near the right edge; above it, or below near the top
			const right = l[0] + 0.06 + w < MV.w / 2 - 0.02, x = right ? l[0] + 0.06 : l[0] - 0.06 - w + 0.02, y = Math.min(MV.h / 2 - 0.07, Math.max(-MV.h / 2 + 0.07, l[1]));
			put3(base + 'tip', [x, y]);
		}
		setTxt('ui.menu.footer', V.footer || '');
	} catch (e) { put('game', { mapErr: String(e && e.message) }); }
}

// in a headset, where the hand points
show('ui.cursor', !!X.cursor && inUi);
if (X.cursor && inUi) {
	const cn = dat('ui.cursor'), q = cn && cn.position ? cn.position : [1e9, 1e9, 0.07];
	if (cn && (Math.abs(q[0] - X.cursor[0]) > 5e-5 || Math.abs(q[1] - X.cursor[1]) > 5e-5)) put('ui.cursor', { position: [+X.cursor[0].toFixed(5), +X.cursor[1].toFixed(5), 0.07] });
}

if (X.mode === 'talk' && TK) {
	show('ui.talk.askbox', !!TK.options);
	if (TK.options) {
		for (let i = 0; i < 3; i++) { setTxt('ui.talk.askbox.o' + i, TK.options[i] !== undefined ? TK.options[i] : ''); setCol('ui.talk.askbox.o' + i, i === TK.sel ? [1, 0.92, 0.66, 1] : [0.82, 0.86, 0.94, 1]); }
		placed('ui.talk.askbox.band', [0, 0.06 - TK.sel * 0.06, 0.001]);
	}
	setTxt('ui.talk.who', TK.speaker);
	setTxt('ui.talk.body', TK.text);
	setTxt('ui.talk.hint', TK.hint);
}
