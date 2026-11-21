import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const s = doc.getRoot().listSkins()[0];
console.log(s.listJoints().length, s.listJoints().map(j => j.getName()).slice(0, 14).join(","));
const a = doc.getRoot().listAnimations().find(x => x.getName() === "Idle_Loop");
if (a) console.log("Idle_Loop channels", a.listChannels().length, a.listChannels().slice(0,3).map(c => c.getTargetNode().getName() + "." + c.getTargetPath()).join(","));
