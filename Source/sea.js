// The air and the water, as the viewer meets them: whether the eyes are under the surface, and what changes when they are. The haze goes blue
// and thick, the sky is no longer there; all of it eases over a moment so that crossing the surface is not a cut. Indoors there is neither:
// no sky, no sun, a dim warm haze, and the room's own lamps.
// (This is one section of a script that has others after it: it must not return early.)
const P = dat('player'), G = dat('game');
const sea = G.sea;
const inside = (G.area || 'overworld') !== 'overworld';
if (inside) {
	if (G.atmo !== 'in') {
		comp('world', 'settings', { fog: { color: [0.07, 0.06, 0.06], density: 0.0007 }, sky: false });
		comp('sun', 'light', { on: false });
		comp('skyfill', 'light', { intensity: 0.5 });
		put('game', { atmo: 'in', uw: 0 });
	}
} else {
	const restore = G.atmo === 'in';
	if (restore) { comp('sun', 'light', { on: true }); comp('skyfill', 'light', { intensity: 0.9 }); }
	const eyeY = P.position[1] + P.eye;
	const target = eyeY < sea.level ? 1 : 0;
	let u = restore ? 0 : (G.uw || 0);
	u += (target - u) * Math.min(1, 16 * DT);
	if (Math.abs(target - u) < 0.01) u = target;
	if (u !== (G.uw || 0) || restore) {
		const mixc = (a, b, t) => a.map((v, i) => +(v + (b[i] - v) * t).toFixed(4));
		comp('world', 'settings', {
			fog: { color: mixc(sea.air.color, sea.under.color, u), density: +(sea.air.density + (sea.under.density - sea.air.density) * u).toFixed(6) },
			sky: u < 0.5
		});   // (the grading is left alone: changing it makes every material in the scene look again, and that was a stutter)
		put('game', { uw: +u.toFixed(3), atmo: 'out' });
	}
}
return done();
