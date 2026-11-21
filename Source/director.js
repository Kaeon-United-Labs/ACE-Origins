// The rules of the game: the player's health and death, and keeping the sky populated.
const P = dat('player'), G = dat('game');
const t = T.elapsed;
const display = E.utilities.display.properties.state;
// (the pause and the pointer are handled by game.js, which knows what mode the game is in)
put('game', { hitMark: Math.max(0, (G.hitMark || 0) - DT) });

let health = P.health, dead = P.dead || 0, hurt = Math.max(0, (P.hurt || 0) - DT);
let msg = G.msg, msgTimer = Math.max(0, G.msgTimer - DT), deaths = G.deaths;

if (dead > 0) {
	dead -= DT;
	if (dead <= 0) {
		const s = G.spawn;
		put('player', {
			position: [s[0], s[1] + 2, s[2]], vel: [0, 0, 0], vy: 0, flying: 0, tele: 5, health: P.maxHealth, dead: 0,
			boost: 1, hurt: 0, pitch: 0, yaw: G.spawnYaw, roll: 0
		});
		msg = 'YOU WAKE AT THE CAMP'; msgTimer = 3;
		health = P.maxHealth; dead = 0;
	} else {
		put('player', { dead, hurt, vel: mul(P.vel, 0.97) });
	}
} else if (health <= 0) {
	put('player', { dead: 4.5, health: 0, hurt: 0.6 });
	msg = 'YOU WERE SLAIN'; msgTimer = 4.5; deaths += 1;
} else {
	if (t - (P.lastHit || -99) > 6 && health < P.maxHealth) health = Math.min(P.maxHealth, health + 7 * DT);
	put('player', { health, hurt });
}

// ---- keep the sky populated: a fallen monster returns at a lair or a roost, a good way off but not too far
const pp = P.position;
const pick = (list, seed) => {
	const near = list.filter(p => { const d = Math.hypot(p[0] - pp[0], p[2] - pp[2]); return d > 900 && d < 3400; });
	const pool = near.length ? near : list;
	return pool[Math.floor(hash(seed) * pool.length) % pool.length];
};
Object.keys(get('enemies').packages).forEach((id, n) => {
	const path = 'enemies.' + id, e = dat(path);
	if (e.alive) return;
	const wait = e.respawn - DT;
	if (wait > 0) { put(path, { respawn: wait }); return; }
	const home = pick(e.kind === 'dragon' ? G.lairs : G.roosts, t * 3 + n * 17);
	const spawn = [home[0] + (hash(t + n) - 0.5) * 200, home[1] + 60, home[2] + (hash(t * 2 + n) - 0.5) * 200];
	put(path, {
		alive: 1, enabled: true, state: 'patrol', hp: e.maxHp, position: spawn, anchor: spawn, yaw: hash(n + t) * 6.28,
		pitch: 0, speed: e.vcruise, cool: 3, atk: 0, timer: 0, vy: 0, respawn: 0, phase: hash(n * 7 + t) * 6.28
	});
	comp(path, 'model', { opacity: 1 });
	comp(path, 'anim', { clip: { dragon: 'DragonArmature|Dragon_Flying', bat: 'BatArmature|Bat_Flying', drone: 'flight' }[e.kind] || 'BatArmature|Bat_Flying', loop: true });
});

put('game', {
	time: t, msg: msgTimer > 0 ? msg : '', msgTimer, deaths
});

return done();
