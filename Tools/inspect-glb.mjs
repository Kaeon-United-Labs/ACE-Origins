import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
	const doc = await io.read(`../Assets/Models/City/${f}.glb`);
	const root = doc.getRoot();
	console.log(f, "nodes:", root.listNodes().map(n => n.getName() + (n.getMesh() ? "[" + n.getMesh().listPrimitives().length + "]" : "")).join(", "), "| materials:", root.listMaterials().map(m => m.getName()).join(", "));
}
