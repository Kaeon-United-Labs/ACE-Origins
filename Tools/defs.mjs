// The content of ACE Origins as data: what exists, what can be done, who says what.
// build.mjs puts this into the document as untagged data (the package "defs"), where the scripts read it.
//
// Quests move through "inactive", "active", "ready" (every objective met, waiting to be handed in) and "done".
// An objective is one of
//   { type: "have", item, need }   the player is carrying that many
//   { type: "kill", kind, need }   that many of that kind defeated since the quest was taken
//   { type: "flag", flag }         something has happened (set by an effect or an interaction)
// A dialogue is a list of entries; the first whose `when` holds is the one spoken. `when` may name a quest and
// its state (q, s) and/or a flag. After the last line the `then` effects are applied, in order:
//   ["start", quest] ["complete", quest] ["give", item, n] ["take", item, n] ["flag", name]
// A quest can only be completed while it is ready, so "complete" comes before any "take" of what it asks for.

export const defs = {

	title: "ACE Origins",

	items: {
		bolt: { name: "Plasma Bolt", type: "ability", desc: "A rapid stream of plasma. The first thing the wardens teach a flier, and the last thing they forget." },
		burst: { name: "Scatter Burst", type: "ability", desc: "Five bolts in a spread. Slower than a Plasma Bolt, and kinder to anyone who cannot aim." },
		mending: { name: "Mending Light", type: "ability", desc: "A warm light that closes wounds. Restores 35 health, and needs 8 seconds before it will answer again." },
		apple: { name: "Moonapple", type: "item", heal: 25, desc: "Sweet, and faintly luminous after dark. Eat it to restore 25 health, if you can bear to." },
		charm: { name: "Sage's Charm", type: "item", desc: "A small disc of pale glass that Ione presses into your hand. It is warm, and it seems to know which way is home." },
		shard: { name: "Moon Shard", type: "item", desc: "A sliver of the Moon Stone, cold to the touch and humming very quietly. It seems to be listening." }
	},

	abilities: {
		bolt: { kind: "shoot", cool: 0.085, shots: 1, spread: 0, dmg: 1 },
		burst: { kind: "shoot", cool: 0.7, shots: 5, spread: 0.1, dmg: 1 },
		mending: { kind: "heal", cool: 8, heal: 35 }
	},

	flags: ["stone_touched", "ione_done"],
	kinds: {
		bat: { name: "Cave Bat", plural: "Cave Bats", desc: "Quick, brittle and always hungry. Dives from above, and does not stop to think about it. One bolt is enough." },
		drone: { name: "Sentry Drone", plural: "Sentry Drones", desc: "A saucer of old, humming metal that still keeps its watch. It rams what it finds in the sky, and takes three bolts to bring down." },
		dragon: { name: "Wyrm", plural: "Wyrms", desc: "A great winged lizard that circles its lair and spits fire at anything that flies. Takes fourteen bolts to bring down." }
	},

	quests: {
		apples: {
			title: "Fallen Moonapples",
			giver: "Maren",
			summary: "Maren's Moonapples fell when the wyrms flew over her camp. They lie scattered on the grass and under the trees nearby. She would like three of them back.",
			objectives: [{ id: "apples", type: "have", item: "apple", need: 3, text: "Moonapples gathered" }],
			reward: { items: { mending: 1 }, text: "Mending Light" }
		},
		stones: {
			title: "Echoes of the Stones",
			giver: "Maren",
			summary: "The old stones to the north have started to hum. Touch the Moon Stone in the middle of the circle, then bring Maren what it gives you.",
			objectives: [
				{ id: "touch", type: "flag", flag: "stone_touched", text: "Touch the Moon Stone" },
				{ id: "shard", type: "have", item: "shard", need: 1, text: "Bring the Moon Shard to Maren" }
			],
			reward: { maxHealth: 20, text: "+20 maximum health" }
		},
		wings: {
			title: "Wings Over the Vale",
			giver: "Hale",
			summary: "Captain Hale holds the Warden's Fort, to the south-east across the vale, against bats and wyrms alike. He wants three bats and one dragon out of the sky.",
			objectives: [
				{ id: "bat", type: "kill", kind: "bat", need: 3, text: "Bats defeated" },
				{ id: "dragon", type: "kill", kind: "dragon", need: 1, text: "Dragons slain" }
			],
			reward: { items: { burst: 1 }, text: "Scatter Burst" }
		}
	},

	npcs: {
		maren: {
			name: "Maren", pitch: 1.12, rate: 0.93, voice: "Zira",
			dialog: [
				{
					when: { q: "stones", s: "ready" },
					say: [
						"You touched the Stone. I can feel it on you, like frost on a window.",
						"So the old song is waking. Keep the Shard, child. It will remember you.",
						"Take this warmth with you. It is not much, but it will last."
					],
					then: [["complete", "stones"]]
				},
				{
					when: { q: "apples", s: "ready" },
					say: [
						"Moonapples! Three of them, and not a bruise between them.",
						"The wyrms came over last week and shook my orchard bare. I have not had the heart to walk it since.",
						"Here, take the light I kept for hard days. And listen, there is something else.",
						"The old stones to the north have begun to hum. Go to the circle and touch the Moon Stone. Then come back and tell me what it says."
					],
					then: [["complete", "apples"], ["take", "apple", 3], ["start", "stones"]]
				},
				{
					when: { q: "apples", s: "active" },
					say: [
						"Three Moonapples, if you would. They fell near the camp, on the grass and under the trees.",
						"They shine a little at dusk. You will know them when you see them."
					]
				},
				{
					when: { q: "stones", s: "active" },
					say: [
						"The stone circle is to the north. Touch the Moon Stone and see what answers.",
						"Mind the sky on the way. The wings are back."
					]
				},
				{
					when: { q: "stones", s: "done" },
					say: ["Fly well, child. This valley has not had a visitor like you in a long while."]
				},
				{
					say: [
						"Oh. A traveller. Sit, sit. The fire is warm, and the soup is not poison, whatever the bats say.",
						"I am Maren. I keep this camp, such as it is.",
						"Would you do an old woman a kindness? My Moonapples fell when the wyrms flew over. Three of them, scattered round the camp.",
						"Bring them to me and I will make it worth your while."
					],
					then: [["start", "apples"]]
				}
			]
		},
		hale: {
			name: "Captain Hale", pitch: 0.7, rate: 0.88, voice: "David",
			dialog: [
				{
					when: { q: "wings", s: "ready" },
					say: [
						"Three bats and a wyrm, and you stand here with nothing worse than a scratch.",
						"The Watch has not seen the sky this quiet in years. Take this. We used it to clear the walls. Bind it to a button and aim at the sky."
					],
					then: [["complete", "wings"]]
				},
				{
					when: { q: "wings", s: "active" },
					say: ["Three bats and one wyrm. The bats nest in the hills, and the wyrms keep to the high peaks. Keep your height, and keep moving."]
				},
				{
					when: { q: "wings", s: "done" },
					say: ["The fort stands because of you. For now."]
				},
				{
					say: [
						"Halt. Hale, of the Warden's Watch. You will be the one Maren sent word about.",
						"The wyrms have been testing these walls for a month, and the bats are worse. They never stop.",
						"I cannot leave my post, but you can fly. Put three bats and one wyrm out of the sky, and the Watch will remember it."
					],
					then: [["start", "wings"]]
				}
			]
		},
		ione: {
			name: "Sage Ione", pitch: 0.95, rate: 0.9, voice: "Zira",
			dialog: [
				{
					when: { flag: "ione_done" },
					say: ["Hello again, little flier. The sea is still wide, and the sky still empty. Go well."]
				},
				{
					say: [
						"Ah. You found the door. Few do. The sea is wide, and the sky above it wider.",
						"I keep this perch because it keeps me. Sit a moment, and answer me three things. There is no wrong answer, only a true one."
					],
					ask: [
						{
							q: "When the sky is empty and the water wide, what do you trust?",
							opts: [
								{ t: "The wind under my wings.", trait: "wind", reply: "The wind. It carries everything, and keeps nothing. A generous master." },
								{ t: "The stars, when I can see them.", trait: "star", reply: "The stars. Patient, and always where you left them. A steadying choice." },
								{ t: "My own two hands.", trait: "hand", reply: "Your hands. Then you have never needed to be rescued, only to be told where the shore is." }
							]
						},
						{
							q: "A door stands closed before you. What do you do?",
							opts: [
								{ t: "Open it, and look.", trait: "wind", reply: "You open it. Good. Doors are only questions that have not been asked." },
								{ t: "Knock, and wait to be answered.", trait: "star", reply: "You knock. Courtesy is a kind of navigation." },
								{ t: "Find the hinges, and see how it is made.", trait: "hand", reply: "You study the hinges. Of course you do." }
							]
						},
						{
							q: "If you could carry one thing home from here, what would it be?",
							opts: [
								{ t: "A view of the whole sea.", trait: "wind", reply: "A view. It weighs nothing, and you will never lose it." },
								{ t: "A name for each light in the sky.", trait: "star", reply: "Names. Yes. To name a thing is to be unafraid of it." },
								{ t: "Something I made myself.", trait: "hand", reply: "Something made. That is the only luggage that grows heavier in a good way." }
							]
						}
					],
					endings: {
						wind: ["Three answers, and every one a window. You are a creature of the wind, and I envy it.", "Take this. It knows which way is home, and it will not mind if you ignore it."],
						star: ["Three answers, and every one a bearing. You steer by what does not move, and I think you will be found by what does.", "Take this. It is warm, and it knows which way is home."],
						hand: ["Three answers, and every one with something in it you can hold. You are a maker, and the world is short of them.", "Take this. It is warm, and it knows which way is home."]
					},
					then: [["give", "charm", 1], ["flag", "ione_done"]]
				}
			]
		},
		pip: {
			name: "Pip", pitch: 1.35, rate: 1.08, voice: "Mark",
			dialog: [
				{
					when: { flag: "stone_touched" },
					say: [
						"You touched it! Did you hear it hum? I swear it sang my name.",
						"Maren will want to know. She always does."
					]
				},
				{
					say: [
						"Oh! A flier! I have never seen anyone leave the ground and come back on purpose.",
						"I came to listen to the Moon Stone. It hums, you know, if you stand close enough.",
						"Go on, touch it. Just do not blame me if your hair stands on end."
					]
				}
			]
		}
	},

	// where things are is decided by the world generator; these are only their names
	pois: {
		camp: { name: "Maren's Camp" },
		fort: { name: "The Warden's Fort" },
		stones: { name: "The Standing Stones" },
		town: { name: "Meridian Quay" },
		sky: { name: "Ione's Perch" }
	}
};
