// Browser-side mannequin: forward kinematics from sagittal/frontal angles + primitive meshes. Rendered offline by build.mjs (never shipped to users).
import * as THREE from "three";

const D = Math.PI / 180;
export const BODIES = {
  male:   { s: 1.0,  shoulder: 0.205, hip: 0.10,  thigh: 0.43, shin: 0.43, foot: 0.25, torso: 0.52, arm: 0.30, fore: 0.28, head: 0.108, rThigh: 0.083, rShin: 0.056, rArm: 0.052, rFore: 0.043, chestW: 0.20, chestD: 0.13, waistW: 0.15, waistD: 0.105, pelvisW: 0.165, pelvisD: 0.115, glute: 0.085 },
  female: { s: 0.94, shoulder: 0.168, hip: 0.112, thigh: 0.43, shin: 0.43, foot: 0.235, torso: 0.50, arm: 0.285, fore: 0.265, head: 0.1, rThigh: 0.09, rShin: 0.054, rArm: 0.042, rFore: 0.036, chestW: 0.165, chestD: 0.115, waistW: 0.12, waistD: 0.09, pelvisW: 0.18, pelvisD: 0.115, glute: 0.098 },
};
const dir = (th, ph, side) => new THREE.Vector3(Math.sin(th * D) * Math.cos(ph * D), -Math.cos(th * D) * Math.cos(ph * D), side * Math.sin(ph * D));
const pair = (v) => (Array.isArray(v) ? v : [v ?? 0, 0]);

/** pose -> joints (world, hip at origin before anchoring). Near side = +z (R), far side = -z (L). */
export function solve(p, sex) {
  const B = BODIES[sex], k = B.s;
  const lean = p.lean ?? 0, tdir = new THREE.Vector3(Math.sin(lean * D), Math.cos(lean * D), 0);
  const hipC = new THREE.Vector3(0, 0, 0), shC = hipC.clone().addScaledVector(tdir, B.torso * k);
  const headA = p.head ?? lean * 0.85, hdir = new THREE.Vector3(Math.sin(headA * D), Math.cos(headA * D), 0);
  const neck = shC.clone().addScaledVector(hdir, 0.075 * k), head = neck.clone().addScaledVector(hdir, (0.09 + B.head) * k);
  const J = { hipC, shC, neck, head, hdir, tdir, lean };
  for (const [name, side] of [["R", 1], ["L", -1]]) {
    const o = side === 1 ? p : { ...p, ...(p.l ?? {}) };
    const hip = hipC.clone().add(new THREE.Vector3(0, 0, side * B.hip * k));
    const th = pair(o.thigh), sh = pair(o.shin);
    const knee = hip.clone().addScaledVector(dir(th[0], th[1], side), B.thigh * k);
    const ankle = knee.clone().addScaledVector(dir(sh[0], sh[1], side), B.shin * k);
    const fa = o.foot ?? 90, toe = ankle.clone().add(new THREE.Vector3(Math.sin(fa * D), -Math.cos(fa * D), 0).multiplyScalar(B.foot * k));
    const sho = shC.clone().add(new THREE.Vector3(0, 0, side * B.shoulder * k));
    const ar = pair(o.arm), fo = pair(o.fore);
    const elbow = sho.clone().addScaledVector(dir(ar[0], ar[1], side), B.arm * k);
    const wrist = elbow.clone().addScaledVector(dir(fo[0], fo[1], side), B.fore * k);
    J[name] = { hip, knee, ankle, toe, sho, elbow, wrist };
  }
  if (p.roll) { // roll the whole body around the world x axis through the hip (side planks)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p.roll * D);
    for (const v of [J.shC, J.neck, J.head, J.hdir, J.tdir]) v.applyQuaternion(q);
    for (const s of ["R", "L"]) for (const v of Object.values(J[s])) v.applyQuaternion(q);
  }
  return J;
}

export function lerpPose(a, b, t) {
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  if (Array.isArray(a) || Array.isArray(b)) { const A = pair(a), B = pair(b); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; }
  if (a && typeof a === "object") { const o = {}; for (const key of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) o[key] = lerpPose(a[key] ?? b[key], b?.[key] ?? a[key], t); return o; }
  return b ?? a;
}
export const mergePose = (base, over) => { const o = { ...base }; for (const [k2, v] of Object.entries(over ?? {})) o[k2] = k2 === "l" ? { ...(base.l ?? {}), ...v } : v; return o; };

/** Shift so the anchor stays at x = 0 and the floor contact sits at y = 0 (the same rule in every frame of an exercise). */
export function place(J, anchor, floor, radius = 0.045) {
  const pts = [...Object.values(J.R), ...Object.values(J.L), J.head, J.shC, J.hipC];
  const ax = anchor === "hip" ? J.hipC.x : anchor === "shoulder" ? J.shC.x : anchor === "wrist" ? J.R.wrist.x : anchor === "knee" ? J.R.knee.x : J.R.ankle.x;
  if (typeof floor === "number") return new THREE.Vector3(-ax, floor - J.R.wrist.y, 0);
  let miny;
  if (floor === "ankle") miny = Math.min(J.R.ankle.y, J.L.ankle.y, J.R.toe.y, J.L.toe.y) - 0.04;
  else miny = Math.min(...pts.map((v) => v.y)) - radius;
  return new THREE.Vector3(-ax, -miny, 0);
}

const mat = (c, rough = 0.62) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.05 });
function capsule(a, b, r, m) { const len = a.distanceTo(b); const g = new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.001), 6, 14); const me = new THREE.Mesh(g, m); me.position.copy(a).add(b).multiplyScalar(0.5); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return me; }
function ell(c, rx, ry, rz, m, quat) { const me = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), m); me.scale.set(rx, ry, rz); me.position.copy(c); if (quat) me.quaternion.copy(quat); return me; }

export function buildFigure(J, sex, hl) {
  const B = BODIES[sex], k = B.s, g = new THREE.Group();
  const base = mat(0xb8bcc4), hot = new THREE.MeshStandardMaterial({ color: 0xff5a2e, roughness: 0.5, emissive: 0x551400, metalness: 0.05 });
  const m = (...tags) => (tags.some((t) => hl.includes(t)) ? hot : base);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), J.tdir);
  const mid = (t) => J.hipC.clone().lerp(J.shC, t);
  // torso: pelvis, waist, chest (front/back zones are separate meshes so they can light up on their own)
  g.add(ell(mid(0.04), B.pelvisW * k, 0.115 * k, B.pelvisD * k, base, q));
  g.add(ell(mid(0.36), B.waistW * k, 0.2 * k, B.waistD * k, base, q));
  const front = new THREE.Vector3(1, 0, 0).applyQuaternion(q), back = front.clone().negate();
  g.add(ell(mid(0.30).addScaledVector(front, 0.035 * k), B.waistW * 0.8 * k, 0.15 * k, B.waistD * 0.7 * k, m("abs"), q));
  g.add(ell(mid(0.30).addScaledVector(back, 0.04 * k), B.waistW * 0.8 * k, 0.15 * k, B.waistD * 0.65 * k, m("lowback"), q));
  g.add(ell(mid(0.80), B.chestW * k, 0.2 * k, B.chestD * k, base, q));
  g.add(ell(mid(0.80).addScaledVector(front, 0.04 * k), B.chestW * 0.9 * k, 0.15 * k, B.chestD * 0.7 * k, m("chest"), q));
  g.add(ell(mid(0.82).addScaledVector(back, 0.045 * k), B.chestW * 0.95 * k, 0.19 * k, B.chestD * 0.65 * k, m("back"), q));
  if (sex === "female") for (const s of [1, -1]) g.add(ell(mid(0.78).addScaledVector(front, 0.085 * k).add(new THREE.Vector3(0, 0, s * 0.065 * k)), 0.05 * k, 0.05 * k, 0.05 * k, base, q));
  for (const s of [1, -1]) g.add(ell(J.hipC.clone().addScaledVector(back, 0.075 * k).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(q), -0.01).add(new THREE.Vector3(0, 0, s * 0.085 * k)), B.glute * k, B.glute * 1.05 * k, B.glute * 0.95 * k, m("glutes"), q));
  // neck + head (+ ponytail for the female figure so the two read differently at a glance)
  g.add(capsule(J.shC.clone().addScaledVector(J.tdir, 0.02), J.neck.clone().addScaledVector(J.hdir, 0.04), 0.04 * k, base));
  g.add(ell(J.head, B.head * k, B.head * 1.12 * k, B.head * 0.95 * k, base));
  if (sex === "female") { const pt = J.head.clone().addScaledVector(J.hdir, 0.05 * k).addScaledVector(back, 0.1 * k); g.add(ell(pt, 0.045 * k, 0.07 * k, 0.045 * k, mat(0x8a8d95))); }
  for (const s of ["R", "L"]) {
    const j = J[s];
    g.add(capsule(j.hip, j.knee, B.rThigh * k, m("quads", "hamstrings")));
    g.add(capsule(j.knee, j.ankle, B.rShin * k, m("calves")));
    g.add(capsule(j.ankle, j.toe, 0.04 * k, base));
    g.add(ell(j.sho, 0.062 * k, 0.062 * k, 0.062 * k, m("delts")));
    g.add(capsule(j.sho, j.elbow, B.rArm * k, m("biceps", "triceps")));
    g.add(capsule(j.elbow, j.wrist, B.rFore * k, m("forearms")));
    g.add(ell(j.wrist.clone().addScaledVector(j.wrist.clone().sub(j.elbow).normalize(), 0.04 * k), 0.04 * k, 0.05 * k, 0.034 * k, base));
    g.add(ell(j.knee, B.rShin * 1.05 * k, B.rShin * 1.05 * k, B.rShin * 1.05 * k, base)); g.add(ell(j.elbow, B.rFore * 1.1 * k, B.rFore * 1.1 * k, B.rFore * 1.1 * k, base));
  }
  return g;
}

const steel = mat(0x3b3f47, 0.4), plate = mat(0x23262c, 0.5), padM = mat(0x2d3b57, 0.7), frame = mat(0x4b5260, 0.5);
const cyl = (a, b, r, m) => capsule(a, b, r, m);
const disc = (c, r, th, m) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 28), m); me.rotation.x = Math.PI / 2; me.position.copy(c); return me; };
export function buildProps(props, J, sex, off) {
  const g = new THREE.Group(), B = BODIES[sex], k = B.s;
  const W = (v) => v.clone().add(off);
  for (const pr of props ?? []) {
    if (pr.t === "bar") { // barbell held by both hands, or placed at a body point
      const c = pr.at === "back" ? W(J.shC).addScaledVector(new THREE.Vector3(-Math.cos(J.lean * D), Math.sin(J.lean * D), 0), 0.09).addScaledVector(J.tdir, -0.03) : pr.at === "hips" ? W(J.hipC).add(new THREE.Vector3(0.0, 0.1, 0)) : W(J.R.wrist.clone().add(J.L.wrist).multiplyScalar(0.5));
      g.add(cyl(c.clone().add(new THREE.Vector3(0, 0, 0.62)), c.clone().add(new THREE.Vector3(0, 0, -0.62)), 0.014, steel));
      for (const s of [1, -1]) for (const o of [0.5, 0.45]) g.add(disc(c.clone().add(new THREE.Vector3(0, 0, s * o)), o === 0.5 ? 0.13 : 0.1, 0.04, plate));
    } else if (pr.t === "dbc") { const c = W(J.R.wrist.clone().add(J.L.wrist).multiplyScalar(0.5)); g.add(cyl(c.clone().add(new THREE.Vector3(0, 0.09, 0)), c.clone().add(new THREE.Vector3(0, -0.09, 0)), 0.014, steel)); for (const y of [0.1, -0.1]) { const d = disc(c.clone().add(new THREE.Vector3(0, y, 0)), 0.07, 0.05, plate); d.rotation.set(0, 0, 0); g.add(d); }
    } else if (pr.t === "seat") { const h = W(J.hipC); g.add(cyl(h.clone().add(new THREE.Vector3(-0.1, -0.15, 0.12)), h.clone().add(new THREE.Vector3(0.14, -0.15, 0.12)), 0.04, padM)); g.add(cyl(h.clone().add(new THREE.Vector3(-0.1, -0.15, -0.12)), h.clone().add(new THREE.Vector3(0.14, -0.15, -0.12)), 0.04, padM)); g.add(cyl(new THREE.Vector3(h.x, 0, 0.1), new THREE.Vector3(h.x, h.y - 0.15, 0.1), 0.025, frame));
      if (pr.back) { const back = new THREE.Vector3(-Math.cos(J.lean * D), Math.sin(J.lean * D), 0), a = h.clone().addScaledVector(back, 0.14 * k + 0.04).add(new THREE.Vector3(0, -0.08, 0)); const b = a.clone().addScaledVector(J.tdir, 0.62); g.add(cyl(a.clone().add(new THREE.Vector3(0, 0, 0.12)), b.clone().add(new THREE.Vector3(0, 0, 0.12)), 0.04, padM)); g.add(cyl(a.clone().add(new THREE.Vector3(0, 0, -0.12)), b.clone().add(new THREE.Vector3(0, 0, -0.12)), 0.04, padM)); } }
    else if (pr.t === "boxat") { const [sd, jn] = pr.j.split("."), j = W(jn ? J[sd][jn] : J[sd]); const me = new THREE.Mesh(new THREE.BoxGeometry(...pr.s), padM); me.position.set(j.x + (pr.dx ?? 0), j.y - (pr.dy ?? 0.05) - pr.s[1] / 2, 0); g.add(me); if (pr.post !== false) for (const z of [pr.s[2] / 2 - 0.03, -pr.s[2] / 2 + 0.03]) for (const dx of [pr.s[0] / 2 - 0.03, -pr.s[0] / 2 + 0.03]) g.add(cyl(new THREE.Vector3(me.position.x + dx, 0, z), new THREE.Vector3(me.position.x + dx, me.position.y - pr.s[1] / 2, z), 0.02, frame)); }
    else if (pr.t === "rail") { for (const s of ["R", "L"]) { const w = W(J[s].wrist), z = w.z + (s === "R" ? 0.05 : -0.05); g.add(cyl(new THREE.Vector3(w.x - 0.4, w.y - 0.04, z), new THREE.Vector3(w.x + 0.4, w.y - 0.04, z), 0.02, steel)); for (const dx of [-0.4, 0.4]) g.add(cyl(new THREE.Vector3(w.x + dx, 0, z), new THREE.Vector3(w.x + dx, w.y - 0.04, z), 0.025, frame)); } }
    else if (pr.t === "plate") { const [sd, jn] = pr.j.split("."), j = W(J[sd][jn]); const me = new THREE.Mesh(new THREE.BoxGeometry(...pr.s), padM); me.position.copy(j).add(new THREE.Vector3(pr.dx ?? 0.05, pr.dy ?? 0, 0)); me.rotation.z = (pr.rot ?? 0) * D; g.add(me); }
    else if (pr.t === "db") {
      for (const s of ["R", "L"]) { if (pr.only && pr.only !== s) continue; const c = W(J[s].wrist); g.add(cyl(c.clone().add(new THREE.Vector3(0, 0, 0.08)), c.clone().add(new THREE.Vector3(0, 0, -0.08)), 0.014, steel)); for (const z of [0.1, -0.1]) g.add(ell(c.clone().add(new THREE.Vector3(0, 0, z)), 0.05, 0.05, 0.035, plate)); }
    } else if (pr.t === "kb") {
      const c = W(J.R.wrist.clone().add(J.L.wrist).multiplyScalar(0.5)); g.add(ell(c.clone().add(new THREE.Vector3(0.0, -0.12, 0)), 0.1, 0.1, 0.1, plate)); const t = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), steel); t.position.copy(c); g.add(t);
    } else if (pr.t === "bench") { // a slab under the torso (+ head) with legs to the floor
      const a = W(J.hipC).addScaledVector(J.tdir, -0.12), b = W(J.shC).addScaledVector(J.tdir, 0.2), nrm = new THREE.Vector3(-J.tdir.y, J.tdir.x, 0); if (nrm.y > 0) nrm.negate();
      const A = a.addScaledVector(nrm, 0.13 * k + 0.045), Bp = b.addScaledVector(nrm, 0.13 * k + 0.045);
      g.add(cyl(A, Bp, 0.05, padM)); g.add(cyl(A.clone().add(new THREE.Vector3(0, 0, 0.1)), Bp.clone().add(new THREE.Vector3(0, 0, 0.1)), 0.05, padM)); g.add(cyl(A.clone().add(new THREE.Vector3(0, 0, -0.1)), Bp.clone().add(new THREE.Vector3(0, 0, -0.1)), 0.05, padM));
      for (const p of [A.clone().lerp(Bp, 0.1), A.clone().lerp(Bp, 0.9)]) g.add(cyl(p, new THREE.Vector3(p.x, 0, p.z), 0.022, frame));
    } else if (pr.t === "pullbar") { const c = new THREE.Vector3(pr.x ?? 0, pr.y, 0); g.add(cyl(c.clone().add(new THREE.Vector3(0, 0, 0.55)), c.clone().add(new THREE.Vector3(0, 0, -0.55)), 0.016, steel)); for (const s of [1, -1]) g.add(cyl(new THREE.Vector3(c.x, 0, s * 0.55), c.clone().add(new THREE.Vector3(0, 0, s * 0.55)), 0.02, frame)); }
    else if (pr.t === "box") { const me = new THREE.Mesh(new THREE.BoxGeometry(...pr.s), padM); me.position.set(...pr.c); me.rotation.z = (pr.rot ?? 0) * D; g.add(me); }
    else if (pr.t === "post") g.add(cyl(new THREE.Vector3(pr.x, 0, pr.z ?? 0), new THREE.Vector3(pr.x, pr.y, pr.z ?? 0), 0.03, frame));
    else if (pr.t === "cable") { const hand = W(J.R.wrist.clone().add(J.L.wrist).multiplyScalar(0.5)); const p = new THREE.Vector3(pr.x + off.x, pr.y, 0); g.add(cyl(hand, p, 0.006, steel)); g.add(cyl(new THREE.Vector3(p.x, 0, 0.0), p, 0.035, frame)); g.add(ell(p, 0.05, 0.05, 0.03, frame)); }
    else if (pr.t === "slab") { const a = new THREE.Vector3(pr.a[0] + off.x, pr.a[1], 0), b = new THREE.Vector3(pr.b[0] + off.x, pr.b[1], 0); g.add(cyl(a.clone().add(new THREE.Vector3(0, 0, 0.14)), b.clone().add(new THREE.Vector3(0, 0, 0.14)), 0.03, padM)); g.add(cyl(a.clone().add(new THREE.Vector3(0, 0, -0.14)), b.clone().add(new THREE.Vector3(0, 0, -0.14)), 0.03, padM)); }
  }
  return g;
}

let renderer, scene, cam;
export function init(size) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); renderer.setSize(size, size); renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5060, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1); sun.position.set(2, 4, 3); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 0.9); rim.position.set(-3, 2, -2); scene.add(rim);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
}
const shadow = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();

/** Renders every frame of an exercise with one shared framing. Returns PNG data URLs. */
export function renderExercise(ex, sex, yaw = 32) {
  const frames = ex.frames.map((f) => mergePose(ex.base ?? {}, f));
  if (frames.length === 2) frames.splice(1, 0, lerpPose(frames[0], frames[1], 0.5));
  yaw = ex.yaw ?? yaw;
  const sol = frames.map((f) => { const J = solve(f, sex); const off = place(J, ex.anchor ?? "ankle", ex.floor); off.y += f.lift ?? 0; return { f, J, off }; });
  // shared framing: union of bounding boxes in world space, rotated by the camera yaw
  const yawQ = new THREE.Euler(0, -yaw * D, 0), pts = [];
  for (const s of sol) for (const v of [s.J.head, s.J.shC, s.J.hipC, ...Object.values(s.J.R), ...Object.values(s.J.L)]) pts.push(v.clone().add(s.off).applyEuler(yawQ));
  for (const s of sol) pts.push(s.J.head.clone().add(s.off).add(new THREE.Vector3(0, 0.22, 0)).applyEuler(yawQ));
  let minx = 9, maxx = -9, miny = 0, maxy = -9; for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); }
  const w = maxx - minx, h = maxy - miny, span = Math.max(w, h, 1.7) * 1.16, cx = (minx + maxx) / 2, cy = Math.max(h, 1.7) / 2 - 0.02;
  const out = [];
  for (const s of sol) {
    scene.children.filter((c) => c.userData.fig).forEach((c) => scene.remove(c));
    const root = new THREE.Group(); root.userData.fig = true;
    const fig = buildFigure(s.J, sex, ex.hl ?? []); fig.position.copy(s.off); root.add(fig);
    root.add(buildProps(ex.props ?? s.f.props, s.J, sex, s.off));
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.003, 0); root.add(sh);
    root.rotation.y = -yaw * D; scene.add(root);
    cam.left = -span / 2; cam.right = span / 2; cam.top = span / 2; cam.bottom = -span / 2;
    cam.position.set(cx, cy, 10); cam.lookAt(cx, cy, 0); cam.updateProjectionMatrix();
    renderer.render(scene, cam); out.push(renderer.domElement.toDataURL("image/png"));
  }
  return out;
}
