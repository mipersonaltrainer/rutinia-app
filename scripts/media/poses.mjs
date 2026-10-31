// Pose data for the exercise mannequin. Angles in degrees; every limb is [sagittal, abduction]. Sagittal: 0 = hanging straight down, 90 = forward horizontal,
// 180 = straight up, negative = backward. Frames are [start, (middle), end]; with two frames the middle is the average. `base` is merged under every frame;
// `l: {…}` overrides the far (left) side only. lean: torso from vertical (+ forward); head follows lean unless set; roll rotates around the body's long axis.
const PLANK = { lean: 74, head: 66, thigh: -74, shin: -74, foot: 15, arm: 0, fore: 0 };
const SUPINE = { lean: -90, head: -90, thigh: 135, shin: -20, arm: 0, fore: 0 };
const BENCH_LEGS = { thigh: 84, shin: -4 };
const QUAD = { lean: 88, head: 76, arm: 0, fore: 0, thigh: 0, shin: -90 };
export const EXERCISES = [
  // ---- pecho
  { slug: "press-de-banca-plano-con-barra", hl: ["chest", "triceps", "delts"], props: [{ t: "bench" }, { t: "bar" }], base: { lean: -90, head: -90, ...BENCH_LEGS }, frames: [{ arm: 180, fore: 180 }, { arm: 35, fore: 180 }] },
  { slug: "press-de-banca-inclinado-con-barra", hl: ["chest", "delts", "triceps"], props: [{ t: "bench" }, { t: "bar" }], base: { lean: -48, head: -50, ...BENCH_LEGS }, frames: [{ arm: 180, fore: 180 }, { arm: 25, fore: 180 }] },
  { slug: "flexiones-estandar", hl: ["chest", "triceps", "delts"], anchor: "wrist", base: PLANK, frames: [{}, { lean: 80, head: 72, thigh: -80, shin: -80, arm: -58, fore: 28 }] },
  { slug: "fondos-en-paralelas-inclinado-al-frente", hl: ["chest", "triceps", "delts"], anchor: "wrist", props: [{ t: "rail" }], base: { thigh: 5, shin: -45, foot: 40 }, frames: [{ lean: 18, arm: 0, fore: 0 }, { lean: 32, head: 40, arm: -72, fore: 6 }] },
  { slug: "aperturas-con-mancuernas-en-banco-plano", hl: ["chest", "delts"], props: [{ t: "bench" }, { t: "db" }], base: { lean: -90, head: -90, ...BENCH_LEGS }, frames: [{ arm: [180, 4], fore: [180, 4] }, { arm: [180, 78], fore: [172, 62] }] },
  // ---- espalda
  { slug: "dominadas-pronas", hl: ["back", "biceps"], floor: 2.15, props: [{ t: "pullbar", y: 2.15 }], base: { thigh: 8, shin: -35, foot: 40 }, frames: [{ arm: [180, 22], fore: [180, 22], lean: 0 }, { arm: [24, 30], fore: [172, 14], lean: 6 }] },
  { slug: "jalon-al-pecho-agarre-ancho", hl: ["back", "biceps"], anchor: "hip", props: [{ t: "seat", back: false }, { t: "bar" }, { t: "cable", x: 0.25, y: 2.5 }], base: { lean: -12, head: -8, thigh: 90, shin: 4 }, frames: [{ arm: [180, 38], fore: [180, 38] }, { arm: [10, 52], fore: [168, 30] }] },
  { slug: "remo-con-barra-inclinado", hl: ["back", "biceps", "lowback"], props: [{ t: "bar" }], base: { lean: 62, head: 40, thigh: 18, shin: -14 }, frames: [{ arm: 0, fore: 0 }, { arm: -58, fore: -4 }] },
  { slug: "remo-con-mancuerna-a-una-mano", hl: ["back", "biceps"], anchor: "ankle", props: [{ t: "db", only: "R" }, { t: "boxat", j: "L.wrist", s: [0.95, 0.1, 0.3], dx: -0.1 }], base: { lean: 78, head: 62, thigh: 12, shin: -8, l: { thigh: 80, shin: -90, arm: 0, fore: 0 } }, frames: [{ arm: 0, fore: 0 }, { arm: -62, fore: -2 }] },
  { slug: "remo-en-polea-baja-agarre-cerrado", hl: ["back", "biceps"], anchor: "hip", props: [{ t: "seat" }, { t: "cable", x: 1.45, y: 0.3 }], base: { thigh: 88, shin: 80, foot: 100 }, frames: [{ lean: 22, head: 20, arm: 88, fore: 88 }, { lean: -8, head: -4, arm: -42, fore: 88 }] },
  { slug: "face-pull-en-polea", hl: ["delts", "back"], props: [{ t: "cable", x: 1.1, y: 1.5 }], base: { lean: -3, thigh: 4, shin: -2 }, frames: [{ arm: [90, 10], fore: [90, 10] }, { arm: [96, 74], fore: [168, 36] }] },
  // ---- hombro
  { slug: "press-militar-con-barra-de-pie", hl: ["delts", "triceps"], props: [{ t: "bar" }], base: { thigh: 0, shin: 0 }, frames: [{ lean: -3, arm: 22, fore: 172 }, { lean: -6, arm: 180, fore: 180 }] },
  { slug: "elevaciones-laterales-con-mancuernas", hl: ["delts"], yaw: 70, props: [{ t: "db" }], base: { lean: 4, thigh: 0, shin: 0 }, frames: [{ arm: [0, 6], fore: [4, 6] }, { arm: [0, 86], fore: [6, 84] }] },
  { slug: "press-de-hombros-en-maquina", hl: ["delts", "triceps"], yaw: 45, anchor: "hip", props: [{ t: "seat", back: true }], base: { lean: -4, head: -2, thigh: 90, shin: 4 }, frames: [{ arm: [40, 52], fore: [172, 12] }, { arm: [178, 14], fore: [180, 8] }] },
  // ---- brazos
  { slug: "curl-con-barra-recta-de-pie", hl: ["biceps", "forearms"], props: [{ t: "bar" }], base: { arm: -3 }, frames: [{ fore: 2 }, { fore: 146 }] },
  { slug: "curl-martillo", hl: ["biceps", "forearms"], props: [{ t: "db" }], base: { arm: -4, fore: 0 }, frames: [{ fore: 2 }, { fore: 138 }] },
  { slug: "extension-de-triceps-en-polea-con-cuerda", hl: ["triceps"], props: [{ t: "cable", x: 0.2, y: 2.2 }], base: { lean: 12, head: 8, thigh: 4, shin: -3, arm: 2 }, frames: [{ fore: 112 }, { fore: 6 }] },
  { slug: "fondos-de-triceps-en-banco", hl: ["triceps", "delts"], anchor: "wrist", props: [{ t: "boxat", j: "R.wrist", s: [0.55, 0.1, 0.5], dx: -0.05, dy: 0.04 }], base: { thigh: 82, shin: 72, foot: 110 }, frames: [{ lean: 2, arm: [-6, 0], fore: [0, 0] }, { lean: 6, arm: [-62, 0], fore: [58, 0] }] },
  // ---- piernas
  { slug: "sentadilla-trasera-con-barra", hl: ["quads", "glutes"], props: [{ t: "bar", at: "back" }], base: {}, frames: [{ arm: -35, fore: 150 }, { lean: 42, thigh: 98, shin: -34, arm: 4, fore: 186 }] },
  { slug: "sentadilla-goblet-con-mancuerna", hl: ["quads", "glutes"], props: [{ t: "dbc" }], base: {}, frames: [{ arm: 14, fore: 150 }, { lean: 28, thigh: 100, shin: -30, arm: 6, fore: 160 }] },
  { slug: "sentadilla-con-peso-corporal", hl: ["quads", "glutes"], base: {}, frames: [{ arm: 4, fore: 8 }, { lean: 38, thigh: 96, shin: -32, arm: 86, fore: 88 }] },
  { slug: "prensa-de-piernas-45-grados", hl: ["quads", "glutes"], anchor: "hip", floor: "min", props: [{ t: "bench" }, { t: "plate", j: "R.ankle", s: [0.05, 0.4, 0.5], rot: -45, dx: 0.1, dy: 0.05 }], base: { lean: -48, head: -45, foot: 135, arm: 20, fore: 30 }, frames: [{ thigh: 128, shin: 132 }, { thigh: 162, shin: 112 }] },
  { slug: "extension-de-cuadriceps-en-maquina", hl: ["quads"], anchor: "hip", props: [{ t: "seat", back: true }], base: { lean: -8, head: -4, thigh: 90, arm: 6, fore: 30 }, frames: [{ shin: 2 }, { shin: 88 }] },
  { slug: "sentadilla-bulgara-con-mancuernas", hl: ["quads", "glutes"], floor: "ankle", props: [{ t: "db" }, { t: "boxat", j: "L.ankle", s: [0.5, 0.1, 0.4], dx: -0.05, dy: 0.05 }], base: { arm: 0, fore: 0, l: { thigh: -22, shin: -96, foot: -90 } }, frames: [{ lean: 6, thigh: 8, shin: -4 }, { lean: 16, thigh: 86, shin: -14, l: { thigh: -28, shin: -100, foot: -90 } }] },
  { slug: "zancada-caminando-con-mancuernas", hl: ["quads", "glutes"], anchor: "hip", props: [{ t: "db" }], base: { arm: 0, fore: 0 }, frames: [{ lean: 0 }, { lean: 6, thigh: 82, shin: -10, l: { thigh: -22, shin: -82, foot: 20 } }] },
  { slug: "zancada-hacia-atras-con-mancuernas", hl: ["quads", "glutes"], anchor: "hip", props: [{ t: "db" }], base: { arm: 0, fore: 0 }, frames: [{ lean: 0 }, { lean: 8, thigh: 80, shin: -8, l: { thigh: -26, shin: -84, foot: 20 } }] },
  { slug: "step-up-al-cajon-con-mancuernas", hl: ["quads", "glutes"], props: [{ t: "db" }, { t: "boxat", j: "R.ankle", s: [0.5, 0.4, 0.45], dx: 0.05, dy: 0.04, post: false }], floor: "ankle", base: { arm: 0, fore: 0 }, frames: [{ lean: 8, thigh: 70, shin: -14, l: { thigh: 0, shin: 0 } }, { lift: 0.4, lean: 0, thigh: 0, shin: 0, l: { thigh: 78, shin: -6 } }] },
  // ---- cadena posterior
  { slug: "peso-muerto-convencional", hl: ["glutes", "hamstrings", "lowback"], props: [{ t: "bar" }], floor: "ankle", base: { arm: 0, fore: 0 }, frames: [{ lean: 64, head: 40, thigh: 64, shin: -14 }, { lean: 0, thigh: 0, shin: 0 }] },
  { slug: "peso-muerto-rumano-con-barra", hl: ["hamstrings", "glutes", "lowback"], props: [{ t: "bar" }], base: { arm: 0, fore: 0 }, frames: [{ lean: 0, thigh: 0, shin: 0 }, { lean: 72, head: 50, thigh: 10, shin: -6 }] },
  { slug: "peso-muerto-rumano-con-mancuernas", hl: ["hamstrings", "glutes", "lowback"], props: [{ t: "db" }], base: { arm: 0, fore: 0 }, frames: [{ lean: 0, thigh: 0, shin: 0 }, { lean: 72, head: 50, thigh: 10, shin: -6 }] },
  { slug: "curl-femoral-tumbado-en-maquina", hl: ["hamstrings"], anchor: "hip", props: [{ t: "bench" }], base: { lean: 90, head: 82, thigh: -90, arm: 90, fore: 90 }, frames: [{ shin: -92 }, { shin: -168 }] },
  { slug: "hip-thrust-con-barra", hl: ["glutes", "hamstrings"], anchor: "ankle", floor: "ankle", props: [{ t: "boxat", j: "shC", s: [0.5, 0.06, 0.5], dx: -0.05, dy: 0.08 }, { t: "bar", at: "hips" }], base: { arm: 70, fore: 90 }, frames: [{ lean: -48, head: -50, thigh: 128, shin: -4 }, { lean: -86, head: -84, thigh: 88, shin: -2 }] },
  { slug: "puente-de-gluteo-con-peso-corporal", hl: ["glutes", "hamstrings"], anchor: "ankle", floor: "ankle", base: { arm: 0, fore: 0 }, frames: [{ ...SUPINE, thigh: 135, shin: -20 }, { lean: -142, head: -142, thigh: 80, shin: -5, arm: 0, fore: 0 }] },
  { slug: "patada-de-gluteo-en-cuadrupedia", hl: ["glutes"], anchor: "wrist", base: QUAD, frames: [{ thigh: 18, shin: -78 }, { thigh: -102, shin: -168 }] },
  { slug: "swing-con-kettlebell", hl: ["glutes", "hamstrings", "lowback"], props: [{ t: "kb" }], base: {}, frames: [{ lean: 52, head: 30, thigh: 22, shin: -16, arm: -12, fore: -4 }, { lean: 0, thigh: 0, shin: 0, arm: 90, fore: 92 }] },
  // ---- core
  { slug: "crunch-abdominal", hl: ["abs"], anchor: "hip", floor: "min", base: { thigh: 135, shin: -20, arm: [-100, 60], fore: [-140, 20] }, frames: [{ lean: -90, head: -90 }, { lean: -52, head: -42 }] },
  { slug: "plancha-frontal", hl: ["abs", "delts"], anchor: "wrist", base: { lean: 80, head: 72, thigh: -80, shin: -80, foot: 15, arm: 0, fore: 90 }, frames: [{ lean: 80 }, { lean: 80 }] },
  { slug: "plancha-lateral", hl: ["abs", "glutes"], anchor: "hip", yaw: 22, base: { roll: -90, lean: 90, head: 86, thigh: -90, shin: -90, foot: 20, arm: [0, 90], fore: [0, 90], l: { arm: [0, 90], fore: [90, 0] } }, frames: [{ lean: 82, thigh: -82, shin: -82 }, { lean: 90 }] },
  { slug: "bird-dog", hl: ["lowback", "glutes", "abs"], anchor: "wrist", base: QUAD, frames: [{}, { thigh: -92, shin: -92, foot: 40, l: { arm: 94, fore: 94 } }] },
  { slug: "dead-bug", hl: ["abs"], anchor: "hip", floor: "min", base: { lean: -90, head: -90, arm: 180, fore: 180, thigh: 175, shin: 100 }, frames: [{}, { thigh: 100, shin: 98, l: { arm: -100, fore: -100 } }] },
  { slug: "mountain-climbers", hl: ["abs", "quads"], anchor: "wrist", base: PLANK, frames: [{ thigh: -74, shin: -74, l: { thigh: 52, shin: -48 } }, { thigh: 52, shin: -48, l: { thigh: -74, shin: -74 } }] },
  { slug: "superman-isometrico", hl: ["lowback", "glutes"], anchor: "hip", base: { lean: 90, head: 84, thigh: -90, shin: -90, arm: 90, fore: 90 }, frames: [{}, { lean: 74, head: 70, thigh: -102, shin: -102, arm: 104, fore: 104 }] },
  // ---- cuerpo completo / cardio
  { slug: "burpee", hl: ["quads", "chest", "abs"], anchor: "wrist", base: {}, frames: [{ lean: 58, head: 40, thigh: 104, shin: -40, arm: 8, fore: 10, foot: 90 }, { ...PLANK }, { lean: 0, thigh: 0, shin: 0, arm: [178, 14], fore: [178, 8], foot: 15 }] },
  { slug: "saltos-de-tijera-jumping-jacks", hl: ["delts", "calves"], yaw: 70, anchor: "hip", base: { thigh: 0, shin: 0 }, frames: [{ arm: [0, 6], fore: [0, 6], thigh: [0, 3], shin: [0, 3] }, { lift: 0.12, arm: [178, 38], fore: [178, 32], thigh: [0, 24], shin: [0, 24] }] },
  { slug: "caminata-rapida-al-aire-libre", hl: ["quads", "glutes", "calves"], anchor: "hip", floor: "min", base: { lean: 4 }, frames: [{ thigh: 26, shin: -4, l: { thigh: -22, shin: -22, foot: 40 }, arm: -30, fore: 10, l2: 0 }, { thigh: 0, shin: 0, arm: 0, fore: 0 }, { thigh: -22, shin: -22, foot: 40, l: { thigh: 26, shin: -4 }, arm: 34, fore: 84 }] },
  { slug: "bicicleta-estatica-ritmo-continuo", hl: ["quads", "calves"], anchor: "hip", props: [{ t: "seat" }, { t: "boxat", j: "R.wrist", s: [0.1, 0.1, 0.5], dx: 0.05, dy: 0, post: false }], base: { lean: 36, head: 30, arm: 52, fore: 80, foot: 90 }, frames: [{ thigh: 84, shin: -16, l: { thigh: 22, shin: 6 } }, { thigh: 52, shin: 12, l: { thigh: 52, shin: 12 } }, { thigh: 22, shin: 6, l: { thigh: 84, shin: -16 } }] },
  { slug: "caminata-lateral-con-banda", hl: ["glutes"], yaw: 68, base: { lean: 14, head: 10, arm: [60, 0], fore: [90, 0] }, frames: [{ thigh: [34, 4], shin: [-22, 4] }, { thigh: [34, 14], shin: [-22, 14] }, { thigh: [34, 26], shin: [-22, 26] }] },
  { slug: "thruster-con-mancuernas", hl: ["quads", "delts", "glutes"], props: [{ t: "db" }], base: {}, frames: [{ lean: 24, thigh: 98, shin: -30, arm: 20, fore: 165 }, { lean: 6, thigh: 40, shin: -14, arm: 40, fore: 172 }, { lean: -2, thigh: 0, shin: 0, arm: 180, fore: 180 }] },
  { slug: "jalon-al-pecho-agarre-cerrado-neutro", hl: ["back", "biceps"], anchor: "hip", props: [{ t: "seat" }, { t: "cable", x: 0.25, y: 2.5 }], base: { lean: -12, head: -8, thigh: 90, shin: 4 }, frames: [{ arm: [180, 10], fore: [180, 10] }, { arm: [18, 14], fore: [172, 6] }] },
  { slug: "caminata-rapida-placeholder", skip: true, frames: [] },
].filter((e) => !e.skip);
