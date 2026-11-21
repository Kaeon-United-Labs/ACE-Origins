// Monsters. Dragons circle their lairs, then circle the player and breathe fire; bats dive at the player.
const CLIPS = { dragon: ['DragonArmature|Dragon_Flying', 'DragonArmature|Dragon_Attack', 'DragonArmature|Dragon_Death'], bat: ['BatArmature|Bat_Flying', 'BatArmature|Bat_Attack', 'BatArmature|Bat_Death'], drone: ['flight', 'flight', 'hover'] };
const P = dat('player');
const G = dat('game');
const target = add(P.position, [0, 1, 0]);
const playerAlive = !(P.dead > 0);
const ids = Object.keys(get('enemies').packages);
let damage = 0, struck = 0;
const usedBalls = {};

const freeBall = () => {
	for (let i = 0; i < 16; i++) {
		const f = dat('fire.f' + i);
		if (f && f.enabled !== true && !usedBalls[i]) { usedBalls[i] = 1; return i; }
	}
	return -1;
};

for (const id of ids) {
	const path = 'enemies.' + id;
	const e = dat(path);
	if (!e || !e.alive) continue;

	const dragon = e.kind === 'dragon';
	const [clipFly, clipAtk, clipDie] = CLIPS[e.kind] || CLIPS.bat;

	let pos = e.position.slice(), yaw = e.yaw, pitch = e.pitch, speed = e.speed;
	let cool = Math.max(0, e.cool - DT), atk = Math.max(0, e.atk - DT), timer = e.timer;
	let state = e.state;
	let clip = atk > 0 ? clipAtk : clipFly;
	let vel = e.vel;

	if (state === 'dying') {
		let vy = (e.vy || 0) - 28 * DT;
		pos[1] += vy * DT;
		pos[0] += vel[0] * DT * 0.4; pos[2] += vel[2] * DT * 0.4;
		timer -= DT;
		// a falling body stops at the ground, or the sea
		const under = get(path).utilities.probe.properties.state;
		const floor = Math.max(under && under.hits && under.hits.length ? under.hits[0].point[1] : 0, 0);
		if (pos[1] < floor + e.cy * 0.4) { pos[1] = floor + e.cy * 0.4; vy = 0; vel = mul(vel, 0.9); }
		// and fades as it goes, over the last part of its fall
		comp(path, 'model', { opacity: +clamp(timer / 0.9, 0, 1).toFixed(3) });
		if (timer <= 0) {
			put(path, { alive: 0, enabled: false, respawn: dragon ? 22 : 12 });
		} else {
			put(path, { position: pos, vy, timer, rotation: [pitch + (1.4 - timer) * 0.8, yaw + e.yawOff + (1.4 - timer) * 2.2, 0] });
		}
		comp(path, 'anim', { clip: clipDie, loop: false });
		continue;
	}

	const to = sub(target, pos);
	const dist = len(to);
	const aggro = G.started && playerAlive && dist < e.aggro;
	state = aggro ? 'chase' : 'patrol';

	// ---- where to go
	let goal;
	const t = T.elapsed;
	if (!aggro) {
		const r = e.orbit, a = e.phase + t * (e.vcruise / r) * e.dir;
		goal = [e.anchor[0] + Math.cos(a) * r, e.anchor[1] + Math.sin(t * 0.21 + e.phase) * 28, e.anchor[2] + Math.sin(a) * r];
	} else if (dragon) {
		const flat = norm([pos[0] - target[0], 0, pos[2] - target[2]]);
		const tang = [-flat[2] * e.dir, 0, flat[0] * e.dir];
		goal = [
			target[0] + flat[0] * e.keep + tang[0] * e.keep * 0.9,
			target[1] + 28 + Math.sin(t * 0.7 + e.phase) * 22,
			target[2] + flat[2] * e.keep + tang[2] * e.keep * 0.9
		];
	} else {
		goal = [
			target[0] + Math.sin(t * 4 + e.phase) * 6,
			target[1] + 1 + Math.cos(t * 3 + e.phase) * 4,
			target[2] + Math.cos(t * 3.3 + e.phase) * 6
		];
	}

	// ---- steering
	const aim = sub(goal, pos);
	const wantYaw = Math.atan2(-aim[0], -aim[2]);
	const delta = wrap(wantYaw - yaw);
	yaw += clamp(delta, -e.turn * DT, e.turn * DT);
	const flatDist = Math.hypot(aim[0], aim[2]);
	const wantPitch = clamp(Math.atan2(aim[1], Math.max(flatDist, 1)), -0.7, 0.7);
	pitch += (wantPitch - pitch) * Math.min(1, 2.2 * DT);

	const vmax = aggro ? e.vchase : e.vcruise;
	speed += (vmax - speed) * Math.min(1, 1.4 * DT);

	const f = heading(yaw, pitch);
	pos = add(pos, mul(f, speed * DT));
	vel = mul(f, speed);

	// ---- keep above the ground
	const surfaceOf = name => {
		const q = get(path).utilities[name];
		const h = q && q.properties.state ? q.properties.state.hits : null;
		return h && h.length ? h[0].point[1] : null;
	};
	const below = surfaceOf('probe'), onward = surfaceOf('ahead');
	// beyond the island there is no terrain to hit, only the sea
	const ground = Math.max(below == null ? 0 : below, onward == null ? 0 : onward, 0);
	const minY = ground + e.minAlt;
	if (pos[1] < minY) pos[1] += (minY - pos[1]) * Math.min(1, 8 * DT);
	pos[1] = Math.max(pos[1], Math.max(below == null ? 0 : below, 0) + e.cy);   // never inside the ground
	pos[1] = Math.min(pos[1], 3400);
	const reach = speed * 1.6 + 40;
	comp(path, 'ahead', { offset: [+(f[0] * reach).toFixed(1), 300, +(f[2] * reach).toFixed(1)] });

	// ---- attack
	if (dragon && aggro && cool <= 0 && dist > 70 && dist < 520 && dot(f, norm(to)) > 0.9) {
		const slot = freeBall();
		if (slot >= 0) {
			const lead = add(target, mul(P.vel, Math.min(dist / 140, 2.5)));
			const dir = norm(sub(lead, add(pos, mul(f, 8))));
			put('fire.f' + slot, {
				enabled: true, position: add(add(pos, mul(f, 9)), [0, 1.5, 0]), vel: mul(dir, 140), life: 5, dmg: 14, spin: 0
			});
			comp('fire.f' + slot, 'trail', { emitting: true });
			cool = 2.1 + hash(t + e.phase) * 1.4;
			atk = 0.9;
			clip = clipAtk;
			put('game', { roar: 1 });
		}
	}
	if (!dragon && aggro && cool <= 0 && dist < e.r + 1.4) {
		damage += 7; struck = 0.45;
		cool = 0.9; atk = 0.5; clip = clipAtk;
		speed = e.vchase * 0.4;
	}

	const bank = clamp(-delta * 0.9, -0.7, 0.7);
	put(path, {
		position: pos, rotation: [pitch, yaw + e.yawOff, bank], yaw, pitch, speed, vel, state, cool, atk, timer
	});
	comp(path, 'anim', { clip, loop: atk <= 0 });
}

if (damage > 0) {
	put('player', { health: P.health - damage, hurt: Math.max(P.hurt || 0, struck), lastHit: T.elapsed });
	put('game', { hurtEvent: 1 });
}
return done();
