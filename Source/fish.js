// Wildlife. Each shoal keeps to its own stretch of water and circles it a little above the floor; there are ninety such places and a dozen
// shoals' worth of fish, dealt out each frame to the places nearest the player. Sharks glide in long circles over deep water. None of it minds the player.
const P = dat('player'), G = dat('game'), F = dat('fish');
const t = T.elapsed, schools = F.schools, surface = G.sea.level;
const nearest = schools.map((s, i) => ({ i, d: Math.hypot(s.x - P.position[0], s.z - P.position[2]) }))
	.filter(o => o.d < 450).sort((a, b) => a.d - b.d).slice(0, F.drawn);
// sharks: the five nearest homes within a kilometre (more than that cannot be seen through the water anyway)
const homes = F.sharks.map((h, i) => ({ h, d: Math.hypot(h.x - P.position[0], h.z - P.position[2]) })).filter(o => o.d < 1000).sort((a, b) => a.d - b.d).slice(0, F.sharksDrawn);
let slot = 0, sharkSlot = 0;
for (const id of Object.keys(get('fish').packages)) {
	const path = 'fish.' + id, e = dat(path);
	if (e.kind === 'shark') {
		const mine = homes[sharkSlot++];
		if (!mine) { if (e.enabled) put(path, { enabled: false }); continue; }
		const h = mine.h, a = h.phase + t * h.w;
		const x = h.x + Math.cos(a) * h.radius, z = h.z + Math.sin(a) * h.radius;
		const y = Math.min(surface - 14, h.floor + 18 + Math.sin(t * 0.07 + h.phase) * 7);
		const dir = Math.sign(h.w);
		const hx = -Math.sin(a) * dir, hz = Math.cos(a) * dir;      // the way it is heading
		put(path, { enabled: true, position: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], rotation: [0, +(Math.atan2(-hx, -hz) + e.yawOff).toFixed(3), 0] });
		continue;
	}
	const mine = nearest[slot++];
	if (!mine) { if (e.enabled) put(path, { enabled: false }); continue; }
	const s = schools[mine.i];
	const a = s.phase + t * s.w;
	const vx = -Math.sin(a) * s.w * s.r, vz = Math.cos(a) * s.w * s.r, speed = Math.hypot(vx, vz) || 1;
	const fx = vx / speed, fz = vz / speed;
	const x = s.x + Math.cos(a) * s.r, z = s.z + Math.sin(a) * s.r;
	// these places are deep (29 m or more) and clear of the shore all round, so the shoal sits well down and never near the surface
	const y = Math.min(s.floor + 9 + Math.sin(t * 0.13 + s.phase * 2) * 1.5, surface - 8);
	put(path, { enabled: true, position: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], rotation: [0, +(Math.atan2(-fx, -fz) + e.yawOff).toFixed(3), 0] });
}
return done();
