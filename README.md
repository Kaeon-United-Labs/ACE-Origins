# ACE Origins — Build

An open-world adventure tech demo for the later, open-universe *ACE of Angaia*, written as an
[ACE](../Docs/Resource/ACE/README.md) document: `ACE Origins.json` and the files in `Assets/`. This folder is the whole game.

## Playing it

```
cd Tools
npm install          # once; only needed to rebuild
node serve.mjs       # then open http://localhost:8080/
```

Any static file server will do (`python -m http.server` from this folder, for instance). The page needs the internet once
per load for Babylon.js 7.54.3 (read from the Babylon CDN; the version is pinned on purpose).

Start from the title screen: **New game**, **Continue** (the most recent save) or any slot. The game saves by itself
(the *Autosave* slot) when a quest moves or something is picked up, and you can save to three slots from the pause menu.
Saves are kept by the browser, so they stay on the machine and the address you played on.

| | Desktop | Headset |
|---|---|---|
| Look | mouse | turn with the right stick, look with your head |
| Fly forward / back along where you look | W / S | left stick, push / pull |
| Pan across the view | A / D. E or Space to rise, Q or Ctrl to descend | left stick sideways, right stick up and down |
| Boost / run | Shift (flying: drains the blue bar) | left grip |
| **Left / right mouse button** | whatever the inventory has put on each (see below), or J / K | right trigger / right grip |
| Fly / fall | F toggles. Taking off from the ground gives a push; letting go in the air drops you from the speed you had. C drops you too; Q or Ctrl down to the ground lands you; Space in the air takes off again | left trigger |
| Walk and jump | WASD, Shift to run, Space to jump. You steer a little in the air | left stick |
| **Swim** | Fly into the sea and carry on: flying is the same in water as in air. On foot, walk in until the water is deeper than you and you swim: where you look, at walking pace. You float up to tread water with your head in the air to look around, but you cannot leave the water. E / Space rise, Q / Ctrl sink | |
| **Interact** | **R**: talk to someone, or take something | |
| Inventory / log / map | I / L / M. Esc or the same key closes it | |
| Pause | Esc (opens the menu; Enter or Esc resumes) | |

Add `?detail=0.6` to the address on a slower machine: it pulls the tree and terrain ranges in to 60% (the trees themselves stay).

### In a headset (Quest and other WebXR headsets)

| | Controllers |
|---|---|
| Walk / fly | left stick; **left grip** run or boost |
| Turn | right stick left / right |
| Rise / sink (flying and swimming) | right stick up / down |
| Take off / land | left trigger |
| The two bound actions | right trigger, right grip |
| **Interact** (talk, take, enter, answer) | **A** |
| Jump | B |
| Inventory / map / log | X / Y / left stick click |
| Menus | point a hand at the menu (a ring shows where) and pull its trigger; or stick up/down and **A**. Grips change tab, **B** resumes |
| Inventory | X puts the chosen ability on the trigger, Y on the grip, left stick click clears |
| Map | hold the trigger and move to drag, left stick pans, right stick zooms, trigger on an icon travels, A finds you |

On a Quest the page starts with the tree and terrain ranges at half and the picture at 70% of the headset's own resolution; `?detail=` and `?xrscale=` override both. The post-processing finish (bloom, grade) is off inside a headset session.
`Tools/xr-emu.mjs` runs the game in a software WebXR device (Meta's IWER, a Quest 3 profile) in headless Chrome, over https, for testing without a headset; `adv-vr.mjs` tests the controller logic.

### The adventure

- **Inventory.** Abilities and things you carry. Select an ability and press **1** to put it on the left mouse button, **2** for the right, **3** to
  clear it; what is on each button is shown on the screen while you play. Select a Moonapple and press Enter to eat it.
- **Log.** One tab with two sections: *Quests* (open and completed, with each objective's progress) and *Defeated* (everything you have brought down: how many, and when the first
  and the most recent fell).
- **Map.** The island, you on it, and the places you have found. Select one and press Enter to **fast travel** there.
- **People.** Walk up to someone (a prompt appears) and press R. They speak in text and, where the browser has voices, aloud;
  press R to move through what they say. Maren keeps the camp where you wake. Captain Hale holds the fort across the vale. Pip is at the stones.
- **Three demo quests.** *Fallen Moonapples* (find three apples that glow in the grass, bring them to Maren), *Echoes of the Stones*
  (touch the Moon Stone, bring Maren its shard) and *Wings Over the Vale* (three bats and a wyrm for Captain Hale).

### The map

**M** opens it: the whole region, filling the window. Drag with the left mouse button (or W A S D) to pan, scroll (or + and -) to zoom about the pointer, **R** to find yourself. Each place you have found has an icon; rest the pointer on one for its name, and click it to travel there. The arrow is you, pointing the way you face. Q and E change tab.

### The world

- **Three places, a long way apart.** The first island (Maren's camp, the fort, the stones, the forests and the monsters); **Meridian Quay**, a flat island 20 km east with a modern town; and **Ione's Perch**, a small island that floats over the open sea between them, with a house on it. Each is switched on only when you are within reach of it, so the others cost nothing.
- **Buildings.** In Meridian Quay and on Ione's Perch some buildings have a door. A *closed* door (a wooden one) is opened with **R**; an *open* doorway (a dark one) is simply walked into. Either way you go to a loading screen and then to a room of your own, and the world outside is switched off entirely; walk out through the lit doorway to go back where you came from. You cannot fly indoors. Saving inside a building saves where you were, and Continue puts you back in it.
- **Solid things.** Buildings, the fort, the floating island (top and underside) and the trees are solid by their real shape: you are stopped by walls, can walk round them, and stand on their roofs, floors and tops. Fast flight cannot cut through a wall, either.
- **Ione** (the house on the floating island) asks three questions; choose answers with W / S and R.

Trees, boulders, the ruins and the people are solid in both modes. Flying you lie along your line of sight with your hands out in front of you.
Dragons breathe fire and nest on the high peaks; bats dive at you from their roosts. Defeated monsters return elsewhere.
Health recovers if you are left alone for a few seconds. If you fall you wake at the camp.

## What is here

| | |
|---|---|
| `ACE Origins.json` | the game: world, player, people, items, monsters, projectiles, effects, HUD, menus, audio, and the script that runs a frame |
| `Assets/` | textures, models, sky, terrain data, the map, sounds. See `Assets/CREDITS.md` |
| `Engine/` | a copy of the ACE engine (`ace.js`, `aceOperators.js`, `aceWorld.js`), copied from `../Docs/Resource/ACE/Code/Engine/Core/Babylon` by the build |
| `Source/` | the game's scripts, as ordinary JavaScript files. The build inlines them into the document. `game.js` is the adventure (modes, saving, quests, conversations), `menu.js` draws it |
| `Tools/defs.mjs` | **the content of the game as data**: every item, ability, quest and line of dialogue. Add to it to add to the game |
| `Tools/` | the pipeline that produces everything above. `npm run all` rebuilds from scratch; `npm run build` only re-assembles the document. `adv-*.mjs` (`test`, `flow`, `combat`, `kill`, `sea`, `fort`, `town`, `sage`, `float`, `building`, `map`, `save`, `load`) play the systems through a real browser |
| `index.html` | the page |

Documentation of how and why is in `../Docs/Notes`.

## Deploying (Render)

The game is static files, so any static host works. On [Render](https://render.com): push the contents of this folder to a git
repository (the folder itself is the repository root), then either **New → Blueprint** (it reads `render.yaml`) or **New → Static Site**
with *Build command* empty (or `echo ok`) and *Publish directory* `.`. Open the URL it gives you. Saves are kept per browser and address.
`Tools/node_modules` is ignored by git; run `npm install` in `Tools` only if you want to rebuild.

## Licence

The code is under the [Apache License 2.0](LICENSE) (see also [NOTICE](NOTICE)). The files in `Assets/` are third-party works under their
own licences, listed in [Assets/CREDITS.md](Assets/CREDITS.md); the Apache licence does not apply to them.
