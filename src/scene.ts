import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ANATOMY, PATHS, PROTEINS, type AnatomyId, type Path, type ProteinId, type Scale } from "./education";
import type { Lab } from "./lab";
import type { Reading } from "./model";

export type Quality = "high" | "performance";
export interface View {
  scale: Scale; path?: Path; reaction: number; protein: ProteinId; anatomy: AnatomyId;
  cut: boolean; cutAngle: number; cutOffset: number; opacity: number;
  spin: boolean; labels: boolean; quality: Quality; home: number; focus: number;
}
type Label = { id: string; text: string; position: T.Vector3; color: string; pick?: () => void };
type World = {
  group: T.Group; labels: Label[]; update: (r: Reading, simDelta: number, view: View) => void;
  focus: (view: View) => { target: T.Vector3; eye: T.Vector3 };
};
type Select = { protein: (id: ProteinId) => void; anatomy: (id: AnatomyId) => void };
const TAU = 2 * Math.PI;
const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(x, b));
const fract = (x: number) => x - Math.floor(x);
const hash = (i: number) => fract(Math.sin(i * 127.1 + 43.7) * 43758.5453);

function surface(uCount: number, vCount: number, point: (u: number, w: number) => T.Vector3) {
  const xyz: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= uCount; i++) {
    for (let j = 0; j <= vCount; j++) {
      const p = point(i / uCount, j / vCount);
      xyz.push(p.x, p.y, p.z);
      const n = i * (vCount + 1) + j;
      if (i < uCount && j < vCount) indices.push(n, n + 1, n + vCount + 1, n + 1, n + vCount + 2, n + vCount + 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(xyz, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function membraneMaterial(color: string, scale = 18) {
  const material = new T.MeshPhysicalMaterial({
    color, roughness: 0.77, metalness: 0.05, clearcoat: 0.23, clearcoatRoughness: 0.55, side: T.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.grainScale = { value: scale };
    shader.vertexShader = "varying vec3 tissuePosition;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\ntissuePosition = position;",
    );
    shader.fragmentShader = [
      "varying vec3 tissuePosition; uniform float grainScale;",
      "float seeded(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,41.762)))*43758.5453);}",
      "float grains(vec3 p){vec3 f=fract(p);return smoothstep(.22,.48,length(f-.5))*seeded(floor(p));}",
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat n = grains(tissuePosition*grainScale); float m = grains(tissuePosition*grainScale*.33+7.1); diffuseColor.rgb *= .74 + .30*n + .24*m;",
      ),
    ].join("\n");
  };
  return material;
}

function ball(parent: T.Object3D, geo: T.BufferGeometry, mat: T.Material, position: T.Vector3, size: T.Vector3) {
  const mesh = new T.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.scale.copy(size);
  parent.add(mesh);
  return mesh;
}

function link(parent: T.Object3D, a: T.Vector3, b: T.Vector3, radius: number, mat: T.Material) {
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, a.distanceTo(b), 8), mat);
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(mesh);
  return mesh;
}

type Stream = { curve: T.CatmullRomCurve3; rate: (r: Reading) => number; phase: number; size: number; color: T.Color; density: number };
const stream = (coords: T.Vector3[], rate: Stream["rate"], color: string, size = 0.043, density = 3): Stream =>
  ({ curve: new T.CatmullRomCurve3(coords), rate, phase: 0, color: new T.Color(color), size, density });

function flowPoints(parent: T.Group, streams: Stream[], capacity = 300) {
  const geometry = new T.SphereGeometry(1, 7, 5);
  const material = new T.MeshBasicMaterial({ toneMapped: false });
  const instances = new T.InstancedMesh(geometry, material, capacity);
  instances.count = 0;
  instances.frustumCulled = false;
  instances.instanceMatrix.setUsage(T.DynamicDrawUsage);
  parent.add(instances);
  const transform = new T.Object3D();
  return (r: Reading, dt: number) => {
    let k = 0;
    for (const s of streams) {
      const rate = s.rate(r);
      if (rate <= 0.0001) continue;
      s.phase = fract(s.phase + dt * rate * 0.13);
      const count = Math.min(16, Math.ceil(s.density * rate));
      for (let i = 0; i < count && k < capacity; i++) {
        const t = fract(s.phase + i / count);
        s.curve.getPoint(t, transform.position);
        transform.scale.setScalar(s.size * (0.45 + 0.55 * Math.sin(Math.PI * t)));
        transform.updateMatrix();
        instances.setMatrixAt(k, transform.matrix);
        instances.setColorAt(k, s.color);
        k++;
      }
    }
    instances.count = k;
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  };
}

function organelle(plane: T.Plane, select: Select): World {
  const group = new T.Group();
  const labels: Label[] = [];
  const shell = (u: number, w: number, factor: number) => {
    const angle = w * TAU;
    const alpha = Math.PI * u;
    const x = -3.65 * Math.cos(alpha) * (0.96 + 0.04 * Math.sin(2 * alpha));
    const r = Math.pow(Math.sin(alpha), 0.78);
    const shape = 1 + 0.09 * Math.sin(3 * angle + 6 * u) + 0.055 * Math.sin(8 * u - angle * 2);
    return v(
      x * factor,
      (0.34 * Math.sin(x * 0.66) - 0.24 + r * Math.cos(angle) * 1.63 * shape) * factor,
      (0.17 * Math.sin(x * 0.95) + r * Math.sin(angle) * 1.23 * shape) * factor,
    );
  };
  const outer = membraneMaterial("#9d3b49", 43);
  outer.transparent = true;
  outer.depthWrite = false;
  outer.clippingPlanes = [plane];
  const outerMesh = new T.Mesh(surface(128, 100, (u, w) => shell(u, w, 1)), outer);
  outerMesh.renderOrder = 2;
  group.add(outerMesh);
  const inner = membraneMaterial("#a84450", 42);
  inner.clippingPlanes = [plane];
  group.add(new T.Mesh(surface(100, 80, (u, w) => shell(u, w, 0.92)), inner));

  const fold = membraneMaterial("#ef795e", 38);
  fold.clippingPlanes = [plane];
  const cristaCount = 10;
  for (let i = 0; i < cristaCount; i++) {
    const x = -2.94 + 5.90 * i / (cristaCount - 1);
    const u = Math.acos(-x / 3.65) / Math.PI;
    const back = shell(u, 0.75, 0.92);
    const reach = 0.80 + hash(i) * 0.28;
    // Flattened lamellar pocket rooted in the back wall of the inner membrane.
    const pocket = surface(32, 32, (s, w) => {
      const a = w * TAU;
      const rib = Math.sin(Math.PI * s);
      const spread = Math.sqrt(Math.max(0.06, 1 - (x / 3.65) ** 2));
      return v(
        back.x + s * (0.26 + 0.17 * Math.sin(i)) + Math.cos(a) * rib * (0.15 + 0.028 * Math.sin(10 * s + i)) + spread * .17 * Math.sin(a * 1.0) * rib * s,
        back.y + (s * (0.20 + .12 * Math.cos(2 * i)) + Math.sin(a) * rib * (1.13 + .13 * hash(i + 40))) * spread,
        back.z - 0.10 + (s * reach + rib * 0.43) * spread + 0.093 * Math.sin(a * 2 + i),
      );
    });
    group.add(new T.Mesh(pocket, fold));
  }

  const ribMat = new T.MeshStandardMaterial({ color: "#ffa98b", emissive: "#522029", roughness: 0.6 });
  const rim = new T.Mesh(new T.BufferGeometry(), ribMat);
  group.add(rim);
  let lastCut = "";
  const traceCut = (view: View) => {
    const key = [view.cut, view.cutAngle, view.cutOffset].join("/");
    if (key === lastCut) return;
    lastCut = key;
    rim.visible = view.cut;
    if (!view.cut) return;
    // Extract a bright rim from triangle/plane intersections, including the outer membrane's thickness cue.
    const geo = outerMesh.geometry;
    const attr = geo.getAttribute("position");
    const result: number[] = [];
    const pts = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    for (let k = 0; k < geo.index!.count; k += 3) {
      const cross: T.Vector3[] = [];
      pts.forEach((p, j) => p.fromBufferAttribute(attr, geo.index!.getX(k + j)));
      for (let j = 0; j < 3; j++) {
        const a = pts[j], b = pts[(j + 1) % 3];
        const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
        if ((da < 0) !== (db < 0)) cross.push(a.clone().lerp(b, da / (da - db)));
      }
      if (cross.length === 2) {
        const [a, b] = cross;
        const n = b.clone().sub(a).cross(plane.normal).normalize().multiplyScalar(0.020);
        for (const p of [a, b, a.clone().add(n), a.clone().add(n), b, b.clone().add(n)]) result.push(p.x, p.y, p.z);
      }
    }
    rim.geometry.dispose();
    rim.geometry = new T.BufferGeometry();
    rim.geometry.setAttribute("position", new T.Float32BufferAttribute(result, 3));
    rim.geometry.computeVertexNormals();
    ribMat.side = T.DoubleSide;
  };

  const beads = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({
    color: "#ffc0a0", roughness: 0.8, clippingPlanes: [plane],
  }), 1400);
  const o = new T.Object3D();
  for (let i = 0; i < beads.count; i++) {
    o.position.copy(shell(0.025 + hash(i * 4) * 0.95, hash(i * 4 + 1), 1.003));
    o.scale.setScalar(0.008 + 0.025 * hash(i * 4 + 2));
    o.updateMatrix();
    beads.setMatrixAt(i, o.matrix);
  }
  group.add(beads);

  const proteinDots = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({
    roughness: 0.63, emissive: "#662227", clippingPlanes: [plane],
  }), 125);
  for (let i = 0; i < proteinDots.count; i++) {
    const x = -2.9 + 5.80 * (i % cristaCount) / (cristaCount - 1);
    o.position.set(x * .91 + 0.13 + 0.24 * (hash(i * 2) - .5), 1.98 * (hash(i) - .5) + 0.34 * Math.sin(x * .66) - .10, -0.21 - hash(i * 3) * .35);
    o.scale.set(.025 + .02 * hash(i), .048 + .028 * hash(i + 3), .035);
    o.updateMatrix();
    proteinDots.setMatrixAt(i, o.matrix);
    proteinDots.setColorAt(i, new T.Color(i % 6 === 0 ? "#ffcf85" : "#e28cbe"));
  }
  group.add(proteinDots);

  const positions: Record<AnatomyId, T.Vector3> = {
    outer: v(-2.75, 0.99, 0.48), inner: v(-2.48, -1.45, 0.32),
    cristae: v(0.43, 1.43, 0.29), ims: v(2.86, 0.94, 0.27), matrix: v(1.62, -1.53, 0.31),
  };
  ANATOMY.forEach((node, i) => labels.push({
    id: node.id, text: node.title, color: ["#ffaf99", "#fd806a", "#ffd4b5", "#e0a6ed", "#ffd4b5"][i],
    position: positions[node.id], pick: () => select.anatomy(node.id),
  }));
  const flux = flowPoints(group, [
    stream([v(-2.4,-.5,.4), v(-1.5,-.75,.44), v(.2,-.64,.42), v(2.5,-.2,.22)], r => r.pairI, "#6eedec", .038, 5),
    stream([v(-1.5,0,.39), v(-1.38,.35,.4), v(-1.3,.77,.44)], r => r.pumpI, "#ff77cb", .037, 1.1),
    stream([v(.35,-.22,.4), v(.32,.18,.43), v(.33,.69,.46)], r => r.pumpIII, "#ff77cb", .037, 1.1),
    stream([v(1.55,.1,.37), v(1.42,.50,.40), v(1.44,.89,.43)], r => r.pumpIV, "#ff77cb", .037, 1.1),
    stream([v(2.0,.55,.45), v(1.84,.14,.47), v(1.81,-.53,.46)], r => r.synthH, "#ffd888", .033, 1.4),
  ]);
  return {
    group, labels,
    update(r, dt, view) {
      outer.opacity = view.opacity;
      outerMesh.visible = view.opacity > 0;
      beads.visible = view.opacity > 0.28;
      traceCut(view);
      flux(r, dt);
    },
    focus(view) {
      const target = view.focus > 0 ? positions[view.anatomy].clone().multiplyScalar(0.42) : v(0, 0, 0);
      return { target, eye: target.clone().add(v(.35, 1.17, 9.8)) };
    },
  };
}

function membrane(select: Select): World {
  const group = new T.Group();
  const labels: Label[] = [];
  const lipidGeo = new T.SphereGeometry(1, 9, 7);
  const sphere = new T.IcosahedronGeometry(1, 2);
  const centers: Record<ProteinId, T.Vector3> = {
    I: v(-3.88, -.02, .32), II: v(-2.48, .12, .37), Q: v(-1.62, .08, .49),
    III: v(-.68, .04, .44), c: v(.30, .73, .50), IV: v(1.28, .04, .44), ATP: v(3.47, .02, .37),
  };
  const embedded = [centers.I, centers.II, centers.III, centers.IV, centers.ATP];
  const wave = (x: number, z: number) => Math.sin(x * .65 + z * .8) * .135 + .085 * Math.sin(2.2 * z);
  const bilayer = membraneMaterial("#6f3146", 30);
  group.add(new T.Mesh(surface(72, 24, (u, w) => {
    const x = (u - .5) * 10.25, z = (w - .5) * 3.05;
    return v(x, wave(x, z), z);
  }), bilayer));
  const lips = new T.InstancedMesh(lipidGeo, new T.MeshStandardMaterial({ roughness: .59, metalness: .02 }), 48 * 15 * 2);
  const tails = new T.InstancedMesh(new T.CylinderGeometry(.014, .012, .26, 5), new T.MeshStandardMaterial({ color: "#be6275" }), 48 * 15 * 4);
  const o = new T.Object3D();
  let k = 0, tail = 0;
  for (let a = 0; a < 48; a++) for (let b = 0; b < 15; b++) for (const side of [-1, 1]) {
    const seed = a * 15 + b;
    const x = (a - 23.5) * .213 + (hash(seed) - .5) * .065;
    const z = (b - 7) * .21 + (hash(seed + 1) - .5) * .06;
    if (embedded.some(center => (center.x - x) ** 2 + (center.z - z) ** 2 < .21)) continue;
    const y = wave(x, z);
    o.position.set(x, y + side * .251, z);
    o.scale.set(.092, .078, .089);
    o.updateMatrix();
    lips.setMatrixAt(k, o.matrix);
    lips.setColorAt(k++, new T.Color(side > 0 ? "#ca737e" : "#914e6b").lerp(new T.Color("#ffb19a"), hash(k) * .30));
    for (const offset of [-.024, .024]) {
      o.position.set(x + offset, y + side * .122, z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      tails.setMatrixAt(tail++, o.matrix);
    }
  }
  lips.count = k;
  tails.count = tail;
  group.add(tails, lips);
  const units = new Map<ProteinId, T.MeshStandardMaterial>();
  for (const protein of PROTEINS) {
    const id = protein.id;
    const center = centers[id];
    const material = new T.MeshStandardMaterial({ color: protein.color, roughness: .66, metalness: .1, emissive: protein.color, emissiveIntensity: .025 });
    units.set(id, material);
    if (id !== "ATP") {
      const small = id === "Q" || id === "c";
      const count = small ? 8 : 34;
      for (let i = 0; i < count; i++) {
        const a = hash(i * 3 + 1), b = hash(i * 3 + 2), c = hash(i * 3 + 3);
        const x = (a - .5) * (small ? .23 : .66) + (id === "I" && b < .47 ? -.38 : 0);
        const y = (b - .5) * (small ? .22 : (id === "I" ? 1.66 : 1.15)) - (id === "II" ? .20 : 0);
        const z = (c - .5) * (small ? .2 : .68);
        const size = small ? .12 : .22;
        ball(group, sphere, material, center.clone().add(v(x, y, z)), v(size, size * 1.12, size * .89));
      }
    }
    labels.push({ id, text: id === "ATP" ? "ATP 합성효소" : id === "c" ? "Cyt c" : id,
      color: protein.color, position: center.clone().add(v(0, id === "c" ? .35 : 1.06, .12)), pick: () => select.protein(id) });
  }

  const atp = centers.ATP;
  const atpMat = units.get("ATP")!;
  const darkGold = new T.MeshStandardMaterial({ color: "#b47536", roughness: .57, metalness: .28 });
  const gold = new T.MeshStandardMaterial({ color: "#ffd088", roughness: .52, metalness: .24, emissive: "#7d4913", emissiveIntensity: .22 });
  const rotor = new T.Group();
  rotor.position.copy(atp);
  group.add(rotor);
  ball(rotor, new T.CylinderGeometry(.35, .34, .35, 32), darkGold, v(0, 0, 0), v(1, 1, 1));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ball(rotor, sphere, i % 2 ? gold : atpMat, v(Math.cos(a) * .30, .08, Math.sin(a) * .30), v(.122,.204,.124));
  }
  link(rotor, v(0, -.02, 0), v(0, -1.06, 0), .10, gold);
  ball(rotor, sphere, gold, v(.12, -.72, 0), v(.14,.14,.13));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    ball(group, sphere, i % 2 ? gold : atpMat, atp.clone().add(v(.38 * Math.cos(a), -1.01, .38 * Math.sin(a))), v(.24,.30,.24));
  }
  link(group, atp.clone().add(v(.44, .12, -.13)), atp.clone().add(v(.64, -.95, -.22)), .072, darkGold);
  link(group, atp.clone().add(v(.64, -.95, -.22)), atp.clone().add(v(.30, -1.21, -.26)), .072, darkGold);
  labels.push(
    { id: "fo", text: "F₀ · 로터", position: atp.clone().add(v(.46, .34, .29)), color: "#ffda95" },
    { id: "f1", text: "F₁ · 촉매 머리", position: atp.clone().add(v(-.74, -1.22, .40)), color: "#ffda95" },
    { id: "stator", text: "스테이터", position: atp.clone().add(v(.76, -.59, .18)), color: "#e5a55f" },
  );
  const pmTag = (id: string, text: string, p: T.Vector3, color: string) => labels.push({ id, text, position: p, color });
  pmTag("ims", "막사이공간 · H⁺ ↑", v(-4.4, 1.83, .4), "#fc9dd3");
  pmTag("matrix", "바탕질", v(-4.38, -1.55, 1.1), "#afc3db");
  pmTag("nadh", "NADH → NAD⁺", v(-4.12, -.96, 1.05), "#84c4ff");
  pmTag("fadh", "FADH₂ → FAD", v(-2.34, -.81, 1.04), "#bc9cfd");
  pmTag("oxygen", "O₂ → H₂O", v(1.6, -.83, .9), "#ffa792");
  pmTag("atp", "ADP + Pᵢ → ATP", v(3.6, -1.59, .72), "#ffd58c");

  const streams: Stream[] = [
    stream([v(-1.69,-1.26,.70), v(-1.81,-.63,.70), centers.Q.clone().add(v(0,.01,.33))], r => r.pairQ, "#aa99ff", .052, 5),
    stream([v(-4.9,-.85,.62), centers.I.clone().add(v(0,-.16,.28)), centers.Q.clone().add(v(0,.01,.33))], r => r.pairI, "#6cf3e6", .052),
    stream([v(-2.63,-.92,.56), centers.II.clone().add(v(0,-.16,.25)), centers.Q.clone().add(v(0,.01,.33))], r => r.pairII, "#b694ff", .052),
    stream([centers.Q, centers.III.clone().add(v(0,.13,.25)), centers.c.clone().add(v(0,0,.24)), centers.IV.clone().add(v(0,.26,.25))], r => r.electron, "#72f9db", .054, 1.6),
    stream([v(2.36,-.98,.68), v(1.97,-.46,.67), v(1.53,-.38,.63)], r => r.oxygenRate, "#ff776d", .068, 5),
    stream([v(1.53,-.38,.65), v(1.72,-.73,.84), v(2.05,-1.03,1.0)], r => 2 * r.oxygenRate, "#8fcdff", .057, 4),
    stream([v(2.56,-.86,.67), v(2.88,-1.10,.74), v(atp.x,-1.08,.71)], r => r.oxRate, "#76c9ff", .058, 5),
    stream([v(2.51,-1.32,.75), v(2.94,-1.29,.78), v(atp.x,-1.08,.72)], r => r.oxRate, "#d3dfef", .035, 5),
    stream([v(atp.x,-1.08,.72), v(4.11,-1.34,.70), v(4.80,-1.0,.72)], r => r.oxRate, "#ffce74", .066, 6),
    stream([v(atp.x,1.47,.53), v(atp.x,.38,.54), v(atp.x,-.50,.56), v(atp.x,-1.07,.66)], r => r.synthH, "#ff82cf", .055, 1.8),
    stream([v(2.38,1.24,1.12), v(2.47,.22,1.27), v(2.46,-.90,1.22)], r => r.leakH, "#ff9a9c", .043, 1.15),
  ];
  for (const [id, key] of [["I", "pumpI"], ["III", "pumpIII"], ["IV", "pumpIV"]] as const) {
    const x = centers[id].x;
    streams.push(stream([v(x-.15,-.92,.67), v(x+.13,.02,.71), v(x+.18,.83,.63), v(x+.28,1.59,.32)], r => r[key], "#ff81cf", .057, 1.2));
  }
  streams.push(
    stream([v(atp.x,-1.05,.66), v(atp.x,-.30,.55), v(atp.x,.43,.54), v(atp.x,1.42,.53)], r => r.reverseH, "#ff82cf", .058, 2),
    stream([v(4.8,-1,.72), v(4.07,-1.34,.70), v(atp.x,-1.08,.72)], r => r.hydrolysisRate, "#ffce74", .066, 9),
    stream([v(atp.x,-1.08,.71), v(2.88,-1.1,.74), v(2.56,-.86,.67)], r => r.hydrolysisRate, "#76c9ff", .058, 9),
    stream([v(atp.x,-1.08,.73), v(2.99,-1.36,.78), v(2.51,-1.32,.75)], r => r.hydrolysisRate, "#d3dfef", .035, 9),
  );
  const particles = flowPoints(group, streams);

  const protonField = new T.InstancedMesh(new T.IcosahedronGeometry(.036, 0), new T.MeshBasicMaterial({ color: "#d460ac", toneMapped: false }), 110);
  group.add(protonField);
  for (let i = 0; i < 110; i++) {
    const ims = i >= 11;
    o.position.set(-4.8 + 9.6 * hash(i), (ims ? 1 : -1) * (.52 + 1.15 * hash(i + 9)), -.62 + 1.75 * hash(i * 3 + 7));
    o.scale.setScalar(.55 + hash(i * 3 + 2));
    o.updateMatrix();
    protonField.setMatrixAt(i, o.matrix);
  }

  return {
    group, labels,
    update(r, dt, view) {
      rotor.rotation.y += dt * (r.synthH - r.reverseH) * 1.4;
      labels.find(label => label.id === "atp")!.text = r.hydrolysisRate > 0.001 ? "ATP → ADP + Pᵢ" : "ADP + Pᵢ → ATP";
      protonField.count = clamp(Math.round(11 + 6.1 * r.gradient), 11, 110);
      for (const [id, m] of units) {
        const inhibited = (id === "I" && r.pairI < .0001 && r.pairII > .001)
          || (id === "IV" && r.oxygenRate < .0001)
          || (id === "ATP" && r.oxRate < .0001 && r.hydrolysisRate < .0001);
        m.emissive.set(inhibited ? "#ff782f" : PROTEINS.find(p => p.id === id)!.color);
        m.emissiveIntensity = inhibited ? .25 : view.protein === id ? .15 : .025;
      }
      particles(r, dt);
    },
    focus(view) {
      if (view.scale === "molecular") {
        const target = centers[view.protein].clone();
        if (view.protein === "ATP") target.y -= .37;
        return { target, eye: target.clone().add(v(.55, .65, 4.45)) };
      }
      const target = view.focus > 0 ? centers[view.protein].clone().multiplyScalar(.17) : v(0, 0, 0);
      return { target, eye: target.clone().add(v(.10, 2.55, 14.8)) };
    },
  };
}

function pathway(path: Path): World {
  const group = new T.Group();
  const labels: Label[] = [];
  let current = -1;
  const selector = new T.Group();
  group.add(selector);
  let transfer = (_r: Reading, _dt: number) => {};
  const sphere = new T.SphereGeometry(1, 26, 18);
  const carbon = new T.MeshPhysicalMaterial({ color: "#5fe2cb", metalness: .20, roughness: .38, clearcoat: .5 });
  const bonds = new T.MeshStandardMaterial({ color: "#4a8f8e", roughness: .56 });
  const floor = new T.GridHelper(18, 24, "#214754", "#172b39");
  floor.position.y = -1.38;
  group.add(floor);
  const pathData = PATHS[path];
  return {
    group, labels,
    update(r, dt, view) {
      if (view.reaction !== current) {
        current = view.reaction;
        for (const child of selector.children) {
          child.traverse(obj => {
            if (obj instanceof T.Mesh && obj.geometry !== sphere) obj.geometry.dispose();
            if (obj instanceof T.InstancedMesh) { obj.material.dispose(); obj.dispose(); }
          });
        }
        selector.clear();
        labels.length = 0;
        const reaction = pathData.stages[current];
        const copies = reaction.copies ?? 1;
        const streams: Stream[] = [];
        for (let c = 0; c < copies; c++) {
          const offset = copies === 1 ? 0 : (c - .5) * 3.6;
          const atoms = Array.from({ length: reaction.carbon }, (_, i) =>
            v(offset + (i - (reaction.carbon - 1) / 2) * .66, (i % 2 ? .23 : -.17) + .14, Math.sin(i * 1.9) * .22));
          atoms.forEach((p, i) => {
            ball(selector, sphere, carbon, p, v(.38, .38, .38));
            if (i) link(selector, atoms[i - 1], p, .063, bonds);
          });
          labels.push({ id: String(c), text: reaction.carbon + "C", color: "#83ead8", position: v(offset, -.68, .45) });
          streams.push(stream([v(offset-1.17,.75,0), v(offset,.96,.11), v(offset+1.4,.69,0)], a => a[pathData.rate], "#fadb85", .071, 6));
        }
        transfer = flowPoints(selector, streams, 48);
        labels.push({ id: "location", text: pathData.place, color: "#a8b8ce", position: v(0, 1.45, -.04) });
      }
      selector.rotation.y += dt * r[pathData.rate] * .16;
      labels.forEach((label, i) => {
        if (label.id === "location") return;
        const offset = (pathData.stages[current].copies ?? 1) === 1 ? 0 : (i - .5) * 3.6;
        label.position.set(offset, -.68, .45).applyAxisAngle(v(0, 1, 0), selector.rotation.y);
      });
      transfer(r, dt);
    },
    focus: () => ({ target: v(0, .23, 0), eye: v(0, 1.35, 8.25) }),
  };
}

function dispose(group: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  group.traverse(obj => {
    if (obj instanceof T.Mesh || obj instanceof T.LineSegments) {
      geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
      if (obj instanceof T.InstancedMesh) obj.dispose();
    }
  });
  geometries.forEach(geo => geo.dispose());
  materials.forEach(mat => mat.dispose());
}

export function createScene(host: HTMLElement, labelHost: HTMLElement, lab: Lab, get: () => View, select: Select, fps: (n: number) => void) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.31;
  renderer.domElement.setAttribute("aria-label", "대화형 3D 모형");
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, .025, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.autoRotateSpeed = .72;
  controls.minDistance = .68;
  controls.maxDistance = 40;
  scene.add(new T.HemisphereLight("#d7ebff", "#512941", 2.20), new T.AmbientLight("#ffb188", .72));
  const key = new T.DirectionalLight("#ffd4b0", 2.6);
  key.position.set(-4, 7, 4);
  const rim = new T.DirectionalLight("#74bbff", 2.0);
  rim.position.set(4, 2, -6);
  const fill = new T.DirectionalLight("#ff8eac", 1.55);
  fill.position.set(6, -3, 3);
  scene.add(key, rim, fill);

  const plane = new T.Plane(v(0, 0, -1), .44);
  const labelNodes = new Map<string, HTMLElement>();
  const projection = new T.Vector3();
  let world: World | undefined;
  let kind = "";
  let viewKey = "";
  let tween: ReturnType<World["focus"]> | undefined;
  let size = { width: 1, height: 1 };
  let lastQuality: Quality | undefined;
  const fit = (aspect: number, view: View) => Math.min(2.6, Math.max(1, (view.scale === "molecular" && !view.path ? .87 : 1.46) / aspect));
  const resize = () => {
    size = { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
    lastQuality = get().quality;
    renderer.setPixelRatio(lastQuality === "high" ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio * .8, 1));
    renderer.setSize(size.width, size.height, false);
    if (world && size.width / size.height !== camera.aspect) viewKey = "";
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  controls.addEventListener("start", () => { tween = undefined; });
  let last = performance.now(), lastSim = lab.state.time, epoch = lab.epoch, count = 0, marker = last;
  let request = 0;
  const render = (now: number) => {
    const view = get();
    const dt = Math.min(.05, (now - last) / 1000);
    const simDelta = epoch === lab.epoch ? Math.max(0, lab.state.time - lastSim) : 0;
    last = now;
    lastSim = lab.state.time;
    epoch = lab.epoch;
    const next = view.path ?? (view.scale === "organelle" ? "organelle" : "membrane");
    const changed = kind !== next;
    const first = !world;
    if (changed) {
      if (world) {
        scene.remove(world.group);
        dispose(world.group);
      }
      kind = next;
      world = view.path ? pathway(view.path) : view.scale === "organelle" ? organelle(plane, select) : membrane(select);
      scene.add(world.group);
      labelHost.replaceChildren();
      labelNodes.clear();
      viewKey = "";
    }
    const active = world!;
    const newKey = [view.scale, view.focus, view.home, view.path].join("/");
    if (newKey !== viewKey) {
      viewKey = newKey;
      tween = active.focus(view);
      // Fit wide specimens in compact and split-screen viewports.
      tween.eye.sub(tween.target).multiplyScalar(fit(camera.aspect, view)).add(tween.target);
      if (first) {
        controls.target.copy(tween.target);
        camera.position.copy(tween.eye);
        tween = undefined;
      }
    }
    if (lastQuality !== view.quality) resize();
    plane.normal.set(Math.sin(view.cutAngle), 0, -Math.cos(view.cutAngle));
    plane.constant = view.cut ? view.cutOffset : 100;
    active.update(lab.reading, simDelta, view);
    if (tween) {
      const factor = 1 - Math.exp(-dt * 7.5);
      controls.target.lerp(tween.target, factor);
      camera.position.lerp(tween.eye, factor);
      if (camera.position.distanceToSquared(tween.eye) < 0.0001) tween = undefined;
    }
    controls.autoRotate = view.spin && !tween;
    controls.update(dt);
    renderer.render(scene, camera);
    const review = new Set<string>();
    for (const label of active.labels) {
      review.add(label.id);
      let el = labelNodes.get(label.id);
      if (!el) {
        el = document.createElement(label.pick ? "button" : "span");
        el.className = "scene-label";
        el.textContent = label.text;
        el.style.setProperty("--tag", label.color);
        if (label.pick) {
          (el as HTMLButtonElement).type = "button";
          el.addEventListener("click", label.pick);
        }
        labelNodes.set(label.id, el);
        labelHost.append(el);
      }
      if (el.textContent !== label.text) el.textContent = label.text;
      projection.copy(label.position).project(camera);
      const parts = ["fo", "f1", "stator"].includes(label.id);
      const molecular = view.scale === "molecular" && !view.path;
      const dense = size.width < 480 && kind === "membrane" && ["nadh", "fadh", "atp"].includes(label.id);
      const visible = parts ? molecular && view.protein === "ATP" : !dense && (!molecular || label.id === view.protein || label.id === "oxygen" && view.protein === "IV" || label.id === "atp" && view.protein === "ATP");
      el.hidden = !view.labels || !visible || projection.z > 1 || projection.x < -.94 || projection.x > .94 || Math.abs(projection.y) > .9;
      el.classList.toggle("selected", (kind === "organelle" && label.id === view.anatomy) || (kind === "membrane" && label.id === view.protein));
      if (!el.hidden) el.style.transform = "translate(" + ((projection.x + 1) * size.width / 2) + "px," + ((1-projection.y) * size.height / 2) + "px) translate(-50%,-50%)";
    }
    for (const [id, node] of labelNodes) if (!review.has(id)) { node.remove(); labelNodes.delete(id); }
    count++;
    if (now - marker > 800) {
      fps(Math.round(count * 1000 / (now - marker)));
      count = 0; marker = now;
    }
    request = requestAnimationFrame(render);
  };
  request = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(request);
    observer.disconnect();
    controls.dispose();
    if (world) dispose(world.group);
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    labelHost.replaceChildren();
  };
}


