import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
let tris = 0;
for (const m of root.listMeshes()) { let t = 0; for (const p of m.listPrimitives()) t += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute("POSITION").getCount()) / 3; console.log("mesh", m.getName(), Math.round(t), "tris", m.listPrimitives().length, "prims"); tris += t; }
console.log("skins", root.listSkins().map(s => s.getName() + ":" + s.listJoints().length + " joints"));
console.log("animations", root.listAnimations().length, root.listAnimations().map(a => a.getName()).join(", "));
console.log("materials", root.listMaterials().map(m => m.getName()).join(", "));
console.log("textures", root.listTextures().map(t => t.getName() + " " + (t.getImage() ? t.getImage().length : 0)).join(", "));
