// Shared by every script. The document arrives as a JSON string; patches are built up as plain objects.
const S = JSON.parse(state);
const E = S.packages.engine;
const T = E.utilities.time.properties.state;
const DT = Math.min(Math.max(T.delta, 0.001), 0.05);
const patch = {};
const X = {};   // what one section of the frame tells a later one, without going through the document
const node = path => {
	let n = patch;
	for (const k of path.split('.')) { n.packages = n.packages || {}; n = n.packages[k] = n.packages[k] || {}; }
	return n;
};
const put = (path, data) => {
	const n = node(path);
	n.properties = n.properties || {}; n.properties.meta = n.properties.meta || {};
	n.properties.meta.data = Object.assign(n.properties.meta.data || {}, data);
};
const comp = (path, name, data, content) => {
	const n = node(path);
	n.utilities = n.utilities || {};
	const u = n.utilities[name] = n.utilities[name] || {};
	if (data) { u.properties = u.properties || {}; u.properties.data = Object.assign(u.properties.data || {}, data); }
	if (content !== undefined) u.content = content;
};
const get = path => {
	let n = S;
	for (const k of path.split('.')) { n = n.packages && n.packages[k]; if (!n) return null; }
	return n;
};
const dat = path => { const n = get(path); return n && n.properties && n.properties.meta ? n.properties.meta.data : null; };
const done = () => Object.keys(patch).length ? JSON.stringify(patch) : undefined;

const len = v => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const heading = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
const hash = x => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// Applies a patch to this script's own copy of the document, so that a later section of the same script sees
// what an earlier one decided, exactly as a separate script would have, without a round trip through the engine.
const mergeInto = (target, patchObject) => {
	for (const k of Object.keys(patchObject)) {
		const v = patchObject[k];
		if (v === null) delete target[k];
		else if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) mergeInto(target[k], v);
		else target[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
	}
};
