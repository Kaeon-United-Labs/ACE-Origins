// Projectiles, hits, explosions. Everything that flies and can hurt something lives here.
const P = dat('player'), G = dat('game');
const SHOTS = 40, BALLS = 16, FX = 10;

const enemies = Object.keys(get('enemies').packages).map(id => ({ id, path: 'enemies.' + id, e: dat('enemies.' + id) }));
const live = enemies.filter(o => o.e.alive && o.e.state !== 'dying');
const hp = {};
live.forEach(o => { hp[o.id] = o.e.hp; });

const fell = {};
let kills = 0, score = 0, damage = 0, hurt = 0, hitEvents = 0;
const usedShot = {}, usedFx = {};
let message = null;

const free = (prefix, n, used) => {
	for (let i = 0; i < n; i++) {
		const d = dat(prefix + i);
		if (d && d.enabled !== true && !used[i]) { used[i] = 1; return i; }
	}
	return -1;
};

const boom = (position, size, loud) => {
	const slot = free('fx.x', FX, usedFx);
	if (slot < 0) return;
	const path = 'fx.x' + slot;
	put(path, { enabled: true, position, scale: 1, life: 0, size });
	comp(path, 'fire', { emitting: true, rate: 700 * size, size: [2.4 * size + 1, 7 * size + 2], speed: [4 * size, 22 * size] });
	comp(path, 'smoke', { emitting: true, rate: 140 * size, size: [3 * size + 2, 9 * size + 4], speed: [2 * size, 9 * size] });
	comp(path, 'flash', { emitting: true, rate: 260, size: [9 * size + 3, 20 * size + 6] });
	if (loud) comp(path, 'boom', { play: true, volume: clamp(0.35 + size * 0.3, 0.3, 1) });
};

const segment = (p0, p1, c, r) => {
	const d = sub(p1, p0), dd = dot(d, d) || 1e-6;
	const t = clamp(dot(sub(c, p0), d) / dd, 0, 1);
	return len(sub(add(p0, mul(d, t)), c)) < r;
};

const alive = !(P.dead > 0);

// ---------------------------------------------------------------- the player fires
if (P.fire === 1 && alive) {
	const count = P.nshots || 1, spread = P.spread || 0;
	for (let n = 0; n < count; n++) {
		const slot = free('shots.s', SHOTS, usedShot);
		if (slot < 0) break;
		// from the muzzle of the controller that is pointing, in a headset; otherwise from just ahead of and beside the eye
		const origin = P.muzzle ? add(P.muzzle, mul(P.aim, 1.2))
			: add(add(add(P.position, [0, P.eye - 0.3, 0]), mul(P.aim, 5)), add(mul(P.side, P.alt ? 0.9 : -0.9), mul(P.lift, -0.5)));
		let dir = P.aim;

		// a gentle pull toward whatever is nearly in the sights
		let best = null, bestAngle = 0.11;
		for (const o of live) {
			const c = add(o.e.position, [0, o.e.cy, 0]);
			const v = sub(c, origin), dist = len(v);
			if (dist > 2200 || dist < 8) continue;
			const angle = Math.acos(clamp(dot(norm(v), P.aim), -1, 1));
			if (angle < bestAngle) { bestAngle = angle; best = { c, dist, o }; }
		}
		if (best) {
			const lead = add(best.c, mul(best.o.e.vel, best.dist / 600));
			const want = norm(sub(lead, origin));
			dir = norm(add(mul(want, 0.8), mul(P.aim, 0.2)));
		}
		// a volley fans out across the line of sight
		if (count > 1) {
			const f = (n / (count - 1) - 0.5) * 2;
			dir = norm(add(add(dir, mul(P.side, f * spread)), mul(P.lift, (hash(T.frame * 7 + n) - 0.5) * spread * 0.6)));
		}
		put('shots.s' + slot, {
			enabled: true, position: origin, vel: mul(dir, 600), life: 1.9, dmg: P.bdmg || 1,
			rotation: [Math.asin(clamp(dir[1], -1, 1)), Math.atan2(-dir[0], -dir[2]), 0]
		});
	}
}

// ---------------------------------------------------------------- bolts in flight
for (let i = 0; i < SHOTS; i++) {
	const s = dat('shots.s' + i);
	if (!s || s.enabled !== true || usedShot[i]) continue;
	const p0 = s.position, p1 = add(p0, mul(s.vel, DT));
	const life = s.life - DT;
	let struckEnemy = null;
	for (const o of live) {
		if (hp[o.id] <= 0) continue;
		const c = add(o.e.position, [0, o.e.cy, 0]);
		if (segment(p0, p1, c, o.e.r)) { struckEnemy = o; break; }
	}
	if (struckEnemy) {
		const o = struckEnemy, c = add(o.e.position, [0, o.e.cy, 0]);
		hp[o.id] -= s.dmg;
		hitEvents++;
		put('shots.s' + i, { enabled: false });
		if (hp[o.id] <= 0) {
			put(o.path, { hp: 0, state: 'dying', timer: 1.4, vy: 0 });
			boom(c, o.e.kind === 'dragon' ? 3.2 : 1.4, true);
			kills++; score += o.e.score; fell[o.e.kind] = (fell[o.e.kind] || 0) + 1;
			// (no banner: what has fallen is written in the quest log)
		} else {
			put(o.path, { hp: hp[o.id] });
			if (hash(T.elapsed * 91 + i) < 0.34) boom(p1, 0.35, false);
		}
	} else if (life <= 0) {
		put('shots.s' + i, { enabled: false });
	} else {
		put('shots.s' + i, { position: p1, life });
	}
}

// ---------------------------------------------------------------- fireballs in flight
for (let i = 0; i < BALLS; i++) {
	const b = dat('fire.f' + i);
	if (!b || b.enabled !== true) continue;
	const p0 = b.position, p1 = add(p0, mul(b.vel, DT));
	const life = b.life - DT;
	if (alive && segment(p0, p1, add(P.position, [0, 0.5, 0]), 7)) {
		damage += b.dmg; hurt = 0.6;
		put('fire.f' + i, { enabled: false });
		comp('fire.f' + i, 'trail', { emitting: false });
		boom(p1, 1.1, true);
	} else if (life <= 0) {
		put('fire.f' + i, { enabled: false });
		comp('fire.f' + i, 'trail', { emitting: false });
	} else {
		put('fire.f' + i, { position: p1, life, spin: b.spin + DT * 6 });
	}
}

// ---------------------------------------------------------------- explosions play out
for (let i = 0; i < FX; i++) {
	const path = 'fx.x' + i;
	const x = dat(path);
	if (!x || x.enabled !== true || usedFx[i]) continue;
	const life = x.life + DT;
	const span = 0.9 + x.size * 0.5;
	if (life > span + 1.6) {
		put(path, { enabled: false });
		comp(path, 'fire', { emitting: false });
		comp(path, 'smoke', { emitting: false });
		comp(path, 'flash', { emitting: false });
		continue;
	}
	const grow = Math.min(1, life / 0.25);
	put(path, { life });
	if (life > 0.05) comp(path, 'flash', { emitting: false });
	if (life > 0.16 + x.size * 0.04) {
		comp(path, 'fire', { emitting: false });
		if (life > 0.5 + x.size * 0.12) comp(path, 'smoke', { emitting: false });
	}
}

for (const k of Object.keys(fell)) put('game', { ['kill_' + k]: (G['kill_' + k] || 0) + fell[k] });
if (hitEvents) put('game', { hitEvent: 1, hitMark: 0.16 });
if (kills) put('game', { kills: G.kills + kills, score: G.score + score });
if (damage > 0) {
	put('player', { health: P.health - damage, hurt: Math.max(P.hurt || 0, hurt), lastHit: T.elapsed });
	put('game', { hurtEvent: 1 });
}
return done();
