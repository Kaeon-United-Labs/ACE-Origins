// Flight and walking, and the body that does them. True Flight: the body is oriented by a target (yaw, pitch); it
// moves along the target vector and pans across the plane square to it; velocity eases toward what is asked of it.
// Flight can be left at any moment and the player falls, walks, and may take off again.
// Nothing moves while a menu or a conversation is open
if (dat('game').mode !== 'play') {
	put('player', { fire: 0, evStep: 0, evLand: 0, evJump: 0 });
} else {
const me = get('player'), d = me.properties.meta.data;
const ctl = E.packages.controllers.utilities;
const kb = ctl['keyboard-0'], pt = ctl['pointer-0'], L = ctl['xr-controller-left'], R = ctl['xr-controller-right'];
const display = E.utilities.display.properties.state;
const view = me.packages.head.utilities.camera.properties.state;
const vr = !!(view && view.presenting);

const keys = kb ? kb.properties.state.digital : [];
const struck = kb ? kb.properties.state.pressed : [];
const on = k => keys.indexOf(k) >= 0;
const hit = k => struck.indexOf(k) >= 0;
const stick = (pad, axis) => pad ? ((pad.properties.state.analog || {})[axis] || 0) : 0;
const held = (pad, name) => !!pad && pad.properties.state.digital.indexOf(name) >= 0;
const tapped = (pad, name) => !!pad && pad.properties.state.pressed.indexOf(name) >= 0;

const GAME = dat('game'), RPG = dat('rpg'), DEF = dat('defs');
const alive = !(d.dead > 0);
const inRoom = GAME.area !== 'overworld';
const play = alive && GAME.mode === 'play';   // menus, conversations and the title leave the body where it is
let yaw = d.yaw, pitch = d.pitch, roll = d.roll || 0;
let pos = d.position.slice(), vel = d.vel.slice();
let flying = d.flying ? 1 : 0, boost = d.boost, boosting = 0, cool = Math.max(0, (d.cool || 0) - DT);
let vy = d.vy || 0;
const wasFlying = flying;
let jumped = 0, landed = 0, stepTick = 0, boostSpent = d.spent ? 1 : 0;

// ---------------------------------------------------------------- look
let turn = 0;
if (play) {
	if (vr) {
		turn = -stick(R, 'thumbstick-x') * 2.2 * DT; yaw += turn;
	} else if (pt && display.locked) {
		const a = pt.properties.state.analog;
		turn = -(a.dx || 0) * 3.2; yaw += turn;
		pitch = clamp(pitch + (a.dy || 0) * 3.2, -1.45, 1.45);
	}
}

// ---------------------------------------------------------------- intent
const fwd = heading(yaw, pitch);
const level = heading(yaw, 0);
const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
const up = [-right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1]];

let ahead = 0, aside = 0, rise = 0, wantBoost = false, fire = false, fireR = false, toggle = false, land = false, jump = false;
if (play) {
	if (vr) {
		ahead = stick(L, 'thumbstick-y'); aside = stick(L, 'thumbstick-x');
		rise = stick(R, 'thumbstick-y');
		wantBoost = held(L, 'squeeze');
		fire = held(R, 'trigger');
		fireR = held(R, 'squeeze');
		toggle = !!X.vrEdge.Lt && !inRoom;
		jump = !!X.vrEdge.B && T.frame - (GAME.playFrom || 0) > 6;   // not the press that has just closed a menu
	} else {
		ahead = (on('KeyW') || on('ArrowUp') ? 1 : 0) - (on('KeyS') || on('ArrowDown') ? 1 : 0);
		aside = (on('KeyD') || on('ArrowRight') ? 1 : 0) - (on('KeyA') || on('ArrowLeft') ? 1 : 0);
		rise = (on('KeyE') || on('Space') ? 1 : 0) - (on('KeyQ') || on('ControlLeft') ? 1 : 0);
		wantBoost = on('ShiftLeft') || on('ShiftRight');
		fire = display.locked && ((pt && pt.properties.state.digital.indexOf('button0') >= 0) || on('KeyJ'));
		fireR = display.locked && ((pt && pt.properties.state.digital.indexOf('button2') >= 0) || on('KeyK'));
		toggle = hit('KeyF') && !inRoom;
		land = hit('KeyC') && !inRoom;
		jump = hit('Space');
	}
}

const probe = me.utilities.ground.properties.state;
const surface = probe && probe.hits && probe.hits.length ? probe.hits[0] : null;
const ground = surface ? surface.point[1] : null;
// for a few frames after being put somewhere new the ground probe still reports where the player was
const tele = d.tele || 0;
// the floor is whatever solid ground is under the player, which under the sea is the sea bed (the probe finds the bed
// beyond the map's edge too); the sea itself is not a floor to anything
const SEA = GAME.sea.level;
const floorY = tele > 0 ? null : (ground == null ? GAME.sea.floor : ground);
const grounded = floorY != null && pos[1] <= floorY + 0.3 && vy <= 0.5;
const depthHere = floorY == null ? 0 : SEA - floorY;
const wasSwimming = !flying && !!d.swim;

// ---------------------------------------------------------------- switching between flying and falling
if (flying && (toggle || land)) {
	flying = 0;
	vy = Math.max(vel[1], -55);                       // keeps what vertical speed there was and falls from it
} else if (!flying && toggle) {
	flying = 1;
	vel = [vel[0], Math.max(vy, 0) + (grounded ? 14 : 0), vel[2]];   // a push off the ground; in the air, simply engages
	vy = 0;
	jumped = grounded ? 1 : 0;
} else if (!flying && jump && !grounded && !wasSwimming && !inRoom) {
	flying = 1;
	vel = [vel[0], Math.max(vy * 0.3, 0), vel[2]];
	vy = 0;
} else if (!flying && jump && grounded && !wasSwimming) {
	vy = 8.5; jumped = 1;
}
// pressing down into the ground from the air is how you land (not under the sea, where flying simply goes on)
if (flying && rise < 0 && floorY != null && pos[1] < floorY + 3.4 && pos[1] > SEA + 0.5) {
	flying = 0; vy = Math.min(vel[1], 0);
}

// ---------------------------------------------------------------- swimming
// On foot, in water too deep to wade, the body swims: it goes where it looks, at walking pace, and cannot rise out of the water: the head
// may come up into the air (treading water, upright, to look around) but the shoulders stay in it. It begins when the body is in the water
// to the waist, and goes on until the water is shallow again.
const swim = (!flying && depthHere > 1.3 && (wasSwimming || pos[1] + 1.0 < SEA)) ? 1 : 0;

// ---------------------------------------------------------------- the things the body is touching
const bump = me.utilities.bump.properties.state;
const bodyR = flying ? 2.3 : (swim ? 1.0 : d.radius);
const pushOut = () => {
	if (!bump || !bump.hits) return;
	for (const h of bump.hits) {
		const depth = bodyR - h.distance; if (depth <= 0) continue;
		let n = h.normal.slice();
		if (h.distance < 0 && len(vel) > 0.1) n = norm([-vel[0], (flying || swim) ? -vel[1] : 0, -vel[2]]);
		if (!flying && !swim) { n[1] = 0; const f = Math.hypot(n[0], n[2]); if (f < 1e-4) continue; n = [n[0] / f, 0, n[2] / f]; }
		pos = add(pos, mul(n, depth));
		const into = dot(vel, n);
		if (into < 0) vel = sub(vel, mul(n, into));     // slide along, and lose the speed that was going into it
	}
};

// ---------------------------------------------------------------- motion
const EYE = d.eye;
if (flying) {
	const cruise = 85, burst = 270, pan = 48, climb = 42;
	// Once the energy is spent boosting stays off until a fair amount has come back; without that gap the boost
	// switched on and off every few frames, taking the speed and the field of view with it.
	let spent = d.spent ? 1 : 0;
	if (boost <= 0.01) spent = 1;
	if (boost >= 0.3) spent = 0;
	boosting = (wantBoost && !spent && ahead > 0) ? 1 : 0;
	boost = clamp(boost + (boosting ? -0.32 : 0.16) * DT, 0, 1);
	boostSpent = spent;
	const top = boosting ? burst : cruise;
	const want = add(add(mul(fwd, ahead * (ahead < 0 ? cruise * 0.5 : top)), mul(right, aside * pan)), mul(up, rise * climb));
	const k = 1 - Math.exp(-(boosting ? 1.6 : 2.4) * DT);
	vel = [vel[0] + (want[0] - vel[0]) * k, vel[1] + (want[1] - vel[1]) * k, vel[2] + (want[2] - vel[2]) * k];
	pos = [pos[0] + vel[0] * DT, pos[1] + vel[1] * DT, pos[2] + vel[2] * DT];
	pushOut();
	vy = 0;
	// never under the ground or the sea
	if (floorY != null && pos[1] < floorY + 1.4) { pos[1] = floorY + 1.4; if (vel[1] < 0) vel[1] *= 0.2; }
	pos[1] = Math.min(pos[1], 3200);
} else if (swim) {
	boost = clamp(boost + 0.2 * DT, 0, 1);
	const speed = wantBoost ? 10 : 5;
	const want = add(add(mul(fwd, ahead * speed), mul(right, aside * speed * 0.8)), mul(up, rise * speed * 0.8));
	// near the surface, and not asking to go anywhere vertically, the body floats up until the head is out
	if (rise === 0 && pos[1] + EYE > SEA - 1.5) want[1] += 0.8;
	const k = 1 - Math.exp(-4 * DT);           // water drags: it takes a moment to get going, and to stop
	vel = [vel[0] + (want[0] - vel[0]) * k, vel[1] + (want[1] - vel[1]) * k, vel[2] + (want[2] - vel[2]) * k];
	pos = add(pos, mul(vel, DT));
	pushOut();
	vy = 0;
	// the head can rise a little above the surface, no more, and the eyes stay off the floor
	const eyeTop = SEA + 0.55 - EYE, eyeBottom = floorY == null ? -1e9 : floorY + 0.6 - EYE;
	if (pos[1] > eyeTop) { pos[1] = eyeTop; if (vel[1] > 0) vel[1] = 0; }
	else if (pos[1] < eyeBottom) { pos[1] = Math.min(eyeBottom, eyeTop); if (vel[1] < 0) vel[1] = 0; }
} else {
	boost = clamp(boost + 0.2 * DT, 0, 1);
	const speed = wantBoost ? 10 : 5;
	const want = add(mul(level, ahead * speed), mul(right, aside * speed * 0.8));
	// on the ground the body answers quickly; in the air it only leans, and keeps the speed it left with
	const k = 1 - Math.exp(-(grounded ? 9 : 1.6) * DT);
	vel = [vel[0] + (want[0] - vel[0]) * k, 0, vel[2] + (want[2] - vel[2]) * k];
	let step = [vel[0] * DT, 0, vel[2] * DT];

	// on a slope the speed is spent on the ground covered
	if (surface && surface.normal && Math.abs(surface.normal[1]) > 1e-3 && grounded) {
		const n = surface.normal, h = norm([step[0], 0, step[2]]);
		const grade = -(h[0] * n[0] + h[2] * n[2]) / n[1];
		const f = 1 / Math.sqrt(1 + grade * grade);
		step = [step[0] * f, 0, step[2] * f];
	}
	pos = [pos[0] + step[0], pos[1], pos[2] + step[2]];

	vy -= 24 * DT;
	vy = Math.max(vy, -55);
	pos[1] += vy * DT;
	vel = [vel[0], vy, vel[2]];
	pushOut();
	vy = vel[1]; vel = [vel[0], 0, vel[2]];
	if (floorY != null) {
		if (pos[1] <= floorY) {
			if (vy < -9 && !d.grounded) landed = Math.min(1, -vy / 30);
			pos[1] = floorY; vy = Math.max(0, vy);
		} else if (grounded && vy <= 0) pos[1] += (floorY - pos[1]) * Math.min(1, 16 * DT);
	} else if (pos[1] < -50) { pos[1] = 400; vy = 0; }
}

// ---------------------------------------------------------------- swept contact
// The overlap test only sees where the body is, so a body that moves more than its own width in a frame (flying at 85 m/s is three metres a frame) can
// step clean over a thin wall. A ray from last frame's eye along last frame's motion says what is in the way; a step may not cross it.
{
	const sw = me.utilities.sweep.properties.state;
	const hit = sw && sw.hits && sw.hits.length ? sw.hits[0] : null;
	const sx = pos[0] - d.position[0], sy = pos[1] - d.position[1], sz = pos[2] - d.position[2];
	let step = Math.hypot(sx, sy, sz);
	if (hit && tele <= 0 && step > 1e-4 && step < 40) {
		const dir = hit.point ? norm(sub(hit.point, add(d.position, [0, EYE, 0]))) : [0, 0, 0];
		if ((sx * dir[0] + sy * dir[1] + sz * dir[2]) / step > 0.25) {
			const room = Math.max(0, hit.distance - (d.lastStep || 0) - bodyR * 0.9);
			if (step > room) {
				const k = room / step;
				pos = [d.position[0] + sx * k, d.position[1] + sy * k, d.position[2] + sz * k];
				vel = sub(vel, mul(dir, Math.max(0, dot(vel, dir))));
				step = room;
			}
		}
	}
	const head = len(vel) > 0.5 ? norm(vel) : [fwd[0], fwd[1], fwd[2]];
	comp('player', 'sweep', { direction: head.map(v => +v.toFixed(4)), distance: +Math.max(8, step * 2.5 + bodyR + 4).toFixed(1), offset: [0, EYE, 0] });
	put('player', { lastStep: step });
}

// the world is the sea round the islands, and no further; a room has its own walls
if (!inRoom) { pos[0] = clamp(pos[0], -9500, 29500); pos[2] = clamp(pos[2], -9500, 9500); }

// banking is for the eye and the body only; the horizon stays where it is in the world
const bankTarget = flying ? clamp(turn / Math.max(DT, 1e-3) * -0.09 - aside * 0.12, -0.45, 0.45) : 0;
roll += (bankTarget - roll) * Math.min(1, 6 * DT);

// ---------------------------------------------------------------- pose (there is no avatar to show it; the flags below still say what the player is doing)
const speedNow = Math.hypot(vel[0], vel[1], vel[2]);
const flat = Math.hypot(vel[0], vel[2]);
const isGrounded = !flying && !swim && floorY != null && pos[1] <= floorY + 0.35;
// swimming under the surface the body lies along the view; with the head up in the air it treads water, upright
const treading = swim && pos[1] + EYE > SEA - 0.9;
const bodyPitchTarget = (flying || (swim && !treading)) ? pitch - Math.PI / 2 : 0;
let bp = d.bp != null ? d.bp : 0;
bp += (bodyPitchTarget - bp) * Math.min(1, ((flying || swim) ? 7 : 5) * DT);

// footfalls
let stepT = d.stepT || 0;
if (isGrounded && flat > 0.8) { stepT -= DT * flat / 2.2; if (stepT <= 0) { stepTick = 1; stepT = 1; } } else stepT = Math.min(stepT, 0.4);

// ---------------------------------------------------------------- weapon
// the left and right mouse buttons do whatever the inventory says they do
const cds = {};
for (const k of Object.keys(RPG.cd || {})) cds[k] = Math.max(0, RPG.cd[k] - DT);
let shoot = 0, nshots = 1, spread = 0, bdmg = 1, healed = 0;
if (play) {
	const use = id => {
		const ab = DEF.abilities[id];
		if (!id || !ab || (cds[id] || 0) > 0) return;
		if (ab.kind === 'shoot' && !shoot) { shoot = 1; nshots = ab.shots; spread = ab.spread; bdmg = ab.dmg; cds[id] = ab.cool; }
		else if (ab.kind === 'heal' && d.health < d.maxHealth - 0.5) { healed = ab.heal; cds[id] = ab.cool; }
	};
	if (fire) use((RPG.bind || {}).l);
	if (fireR) use((RPG.bind || {}).r);
}
if (healed) put('player', { health: Math.min(d.maxHealth, d.health + healed) });
if (healed) put('game', { sfx: 'pickup', note: 'Mending Light', noteTimer: 2 });
if (Object.keys(cds).some(k => cds[k] > 0) || Object.keys(RPG.cd || {}).some(k => RPG.cd[k] > 0)) put('rpg', { cd: cds });

put('player', {
	position: pos, rotation: [0, yaw, 0], yaw, pitch, roll, vel, vy, bp, stepT,
	flying, boost, boosting, cool, fire: shoot, nshots, spread, bdmg, alt: shoot ? 1 - (d.alt || 0) : (d.alt || 0),
	speed: (flying || swim) ? speedNow : flat, swim, aim: fwd, side: right, lift: up, onGround: isGrounded ? 1 : 0, grounded: isGrounded ? 1 : 0,
	ground: ground == null ? 0 : ground,
	evStep: stepTick, evLand: landed, evJump: jumped
});
put('player.head', {
	position: vr ? [0, 0, 0] : [0, EYE, 0],
	rotation: [vr ? 0 : pitch, 0, vr ? 0 : roll]
});
// the field of view eases; it used to jump the moment the boost changed
const fovWant = 1.12 + (boosting ? 0.16 : 0) + clamp(speedNow / 270, 0, 1) * 0.05;
const fovNow = (d.fovNow || 1.12) + (fovWant - (d.fovNow || 1.12)) * Math.min(1, 5 * DT);
put('player', { fovNow, spent: boostSpent, tele: Math.max(0, tele - 1) });
comp('player.head', 'camera', { fov: +fovNow.toFixed(4) });
comp('player', 'bump', { shape: { shape: 'sphere', size: bodyR }, offset: [0, (flying || swim) ? EYE : 0.95, 0] });
}
return done();
