// Pure, deterministic exercise-library builder. Source of truth: data/exercises/*.txt
export const MUSCLES = ["chest","back","shoulders","biceps","triceps","forearms","quadriceps","hamstrings","glutes","calves","core","adductors","abductors","hip_flexors","lower_back","cardio","full_body","hips","spine"];
export const PATTERNS = ["push_horizontal","push_vertical","pull_horizontal","pull_vertical","squat","hinge","lunge","carry","isolation","core_flexion","core_stability","core_rotation","core_lateral","jump","throw","locomotion","mobility","stability"];
export const TYPES = ["strength","power","cardio","mobility","stability","isometric"];
export const EQUIPMENT = { bw: "bodyweight", db: "dumbbell", bb: "barbell", cable: "cable", mach: "machine", kb: "kettlebell", band: "band", susp: "suspension", med: "medicine_ball", plate: "plate", cardio: "cardio_machine", other: "other" };
export const LEVELS = { b: "beginner", i: "intermediate", a: "advanced" };
const HOME = new Set(["bodyweight", "band", "dumbbell", "kettlebell", "suspension"]);

export const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const slugify = (s) => normalize(s).replace(/ /g, "-");

export function parse(files) {
  const rows = []; const errors = [];
  for (const [file, text] of files) {
    let ctx = {};
    text.split("\n").forEach((raw, idx) => {
      const line = raw.trim(); const where = `${file}:${idx + 1}`;
      if (!line || line.startsWith("#")) return;
      if (line.startsWith("@")) { ctx = {}; for (const kv of line.split(/\s+/)) { const [k, v] = kv.slice(1).split("="); ctx[k] = v; } return; }
      const [name, eq, lvl, sec = "", alt = ""] = line.split("|").map((x) => x.trim());
      if (!name || !EQUIPMENT[eq] || !LEVELS[lvl]) return errors.push(`${where}: línea inválida (${line})`);
      if (!MUSCLES.includes(ctx.muscle)) errors.push(`${where}: músculo inválido ${ctx.muscle}`);
      if (!PATTERNS.includes(ctx.pattern)) errors.push(`${where}: patrón inválido ${ctx.pattern}`);
      if (!TYPES.includes(ctx.type)) errors.push(`${where}: tipo inválido ${ctx.type}`);
      const secondary = sec ? sec.split(",").map((x) => x.trim()) : [];
      for (const s of secondary) if (!MUSCLES.includes(s)) errors.push(`${where}: secundario inválido ${s}`);
      rows.push({ where, name, equipment: EQUIPMENT[eq], difficulty: LEVELS[lvl], primary_muscle: ctx.muscle, movement_pattern: ctx.pattern, exercise_type: ctx.type, secondary_muscles: secondary.filter((s) => s !== ctx.muscle), alt_names: alt ? alt.split(",").map((x) => x.trim()) : [] });
    });
  }
  return { rows, errors };
}

const STEPS = {
  push_horizontal: ["Colócate con la espalda y la pelvis estables; escápulas atrás y abajo.", "Baja el peso de forma controlada hasta que el pecho o los codos alcancen un rango cómodo.", "Empuja hasta extender los codos sin bloquearlos de golpe.", "Mantén las muñecas alineadas con los antebrazos durante todo el recorrido."],
  push_vertical: ["Apoya los pies firmes y contrae glúteos y abdomen para no arquear la zona lumbar.", "Empuja el peso hacia arriba en línea recta, pasando la cabeza ligeramente hacia delante al final.", "Termina con los brazos extendidos junto a las orejas, sin encoger los hombros.", "Baja con control hasta la posición inicial."],
  pull_horizontal: ["Adopta una postura estable con el tronco firme; inicia el movimiento llevando las escápulas hacia atrás.", "Tira llevando los codos hacia atrás, cerca del cuerpo o abiertos según el agarre.", "Pausa brevemente con el dorso contraído.", "Regresa lentamente estirando los brazos sin perder la posición del tronco."],
  pull_vertical: ["Toma el agarre indicado y activa los hombros alejándolos de las orejas.", "Tira llevando los codos hacia las costillas hasta que el mentón o el pecho se acerque a la barra o agarre.", "Controla la fase de bajada hasta estirar los brazos.", "Evita balancear el cuerpo para completar la repetición."],
  squat: ["Coloca los pies a la anchura cómoda, con las puntas ligeramente abiertas.", "Inspira, contrae el abdomen y baja flexionando cadera y rodillas a la vez.", "Mantén el peso en todo el pie y las rodillas siguiendo la línea de los pies.", "Sube empujando el suelo hasta extender cadera y rodillas."],
  hinge: ["Pies a la anchura de la cadera, rodillas ligeramente flexionadas, columna neutra.", "Lleva la cadera hacia atrás como si cerraras una puerta con ella; el tronco se inclina de forma natural.", "Mantén el peso cerca del cuerpo y siente la tensión en los isquiotibiales y glúteos.", "Vuelve a la posición inicial extendiendo la cadera, sin hiperextender la zona lumbar."],
  lunge: ["Da un paso con el pie que corresponda y mantén el tronco erguido.", "Baja flexionando ambas rodillas hasta un rango controlado, con la rodilla delantera alineada con el pie.", "Empuja con el pie delantero (o el apoyo) para volver a la posición inicial.", "Trabaja ambas piernas con el mismo número de repeticiones."],
  carry: ["Toma la carga con la espalda neutra y los hombros hacia atrás y abajo.", "Camina con pasos cortos y firmes, sin inclinar el tronco.", "Respira de forma regular mientras mantienes el abdomen activo.", "Deja la carga en el suelo con control al terminar."],
  isolation: ["Ajusta la posición para aislar el músculo objetivo y estabiliza el resto del cuerpo.", "Realiza el movimiento a velocidad controlada, sin impulso.", "Contrae el músculo al final del recorrido durante un instante.", "Regresa lentamente a la posición inicial manteniendo la tensión."],
  core_flexion: ["Acuéstate o cuélgate en la posición indicada con la zona lumbar controlada.", "Exhala y acerca costillas y pelvis contrayendo el abdomen.", "Evita tirar del cuello con las manos.", "Vuelve lentamente sin perder la tensión abdominal."],
  core_stability: ["Alinea cabeza, tronco y cadera en una línea neutra.", "Contrae el abdomen y los glúteos, y respira de forma continua.", "Mantén la posición durante el tiempo indicado sin hundir la cadera.", "Termina cuando pierdas la alineación, no antes ni después."],
  core_rotation: ["Posiciónate estable con los pies firmes y el abdomen activo.", "Gira desde el tronco y las costillas, no desde los brazos.", "Controla el recorrido en ambas direcciones.", "Trabaja ambos lados por igual."],
  core_lateral: ["Mantén la cadera y los hombros alineados en el plano frontal.", "Inclínate o resiste lateralmente de forma controlada.", "Evita girar o inclinarte hacia delante.", "Regresa a la posición neutra sin impulso."],
  jump: ["Calienta articulaciones y tobillos antes de saltar.", "Realiza un contramovimiento corto y salta con intención máxima.", "Aterriza suave, con rodillas flexionadas y alineadas con los pies.", "Descansa lo suficiente entre repeticiones para mantener la calidad."],
  throw: ["Adopta una postura atlética y agarra el implemento con ambas manos.", "Genera la fuerza desde las piernas y la cadera hacia los brazos.", "Lanza o golpea con velocidad y control.", "Recoge o reinicia con la técnica correcta antes de la siguiente repetición."],
  locomotion: ["Comienza con un ritmo fácil durante unos minutos.", "Eleva la intensidad hasta la zona objetivo de esfuerzo percibido.", "Mantén una respiración que te permita controlar el esfuerzo.", "Termina con unos minutos de ritmo suave."],
  mobility: ["Adopta la posición sin forzar el rango; debe sentirse tensión, no dolor.", "Respira lento y profundo durante el estiramiento o el movimiento.", "Mantén la posición o repite el movimiento de forma suave.", "Sal de la posición lentamente."],
  stability: ["Colócate en la posición indicada con el peso bien repartido.", "Activa los músculos estabilizadores y mantén la mirada fija.", "Realiza el movimiento o sostén la posición sin compensaciones.", "Aumenta la dificultad solo cuando domines la versión actual."],
};
const ERRORS = {
  push_horizontal: ["Arquear en exceso la zona lumbar", "Abrir demasiado los codos", "Rebotar el peso en el pecho"],
  push_vertical: ["Arquear la espalda para completar la repetición", "Empujar la cabeza hacia delante demasiado pronto", "Encoger los hombros"],
  pull_horizontal: ["Redondear la espalda", "Tirar con impulso de todo el cuerpo", "Encoger los hombros hacia las orejas"],
  pull_vertical: ["Balancear el cuerpo (kipping) sin intención", "Recorrido incompleto", "Tirar con los brazos sin activar la espalda"],
  squat: ["Dejar que las rodillas colapsen hacia dentro", "Levantar los talones", "Redondear la zona lumbar al fondo"],
  hinge: ["Flexionar demasiado las rodillas y convertirlo en sentadilla", "Redondear la espalda", "Alejar la carga del cuerpo"],
  lunge: ["Paso demasiado corto o largo", "Inclinar el tronco hacia delante en exceso", "Perder el equilibrio por apoyar mal el pie"],
  carry: ["Inclinar el tronco hacia un lado", "Encoger los hombros", "Pasos largos y descontrolados"],
  isolation: ["Usar demasiado impulso", "Peso excesivo que rompe la técnica", "Recorrido incompleto"],
  core_flexion: ["Tirar del cuello", "Usar impulso", "Perder el control de la zona lumbar"],
  core_stability: ["Hundir o elevar demasiado la cadera", "Aguantar la respiración", "Mirar hacia delante con el cuello en extensión"],
  core_rotation: ["Girar solo los brazos", "Usar impulso", "Hiperextender la zona lumbar"],
  core_lateral: ["Girar el tronco en lugar de inclinarlo", "Usar impulso", "Compensar con la cadera"],
  jump: ["Aterrizar con las piernas rígidas", "Rodillas hacia dentro al aterrizar", "Fatiga acumulada que degrada la técnica"],
  throw: ["Lanzar solo con los brazos", "Postura inestable", "Soltar el implemento sin control"],
  locomotion: ["Empezar demasiado rápido", "Zancada excesivamente larga", "Ignorar señales de fatiga o dolor"],
  mobility: ["Forzar el rango hasta sentir dolor", "Aguantar la respiración", "Rebotar en el estiramiento"],
  stability: ["Compensar con el tronco", "Avanzar de nivel demasiado pronto", "Perder la alineación de rodilla y cadera"],
};
const SAFETY = {
  base: ["Detente si sientes dolor agudo, mareo o presión en el pecho.", "Elige una carga que permita técnica correcta en todas las repeticiones."],
  barbell: ["Usa topes de seguridad o un asistente en ejercicios con riesgo de quedar atrapado bajo la barra."],
  advanced: ["Ejercicio de nivel avanzado: practica primero la versión regresiva y ten supervisión del entrenador."],
  power: ["Ejecútalo descansado: la fatiga reduce la calidad y aumenta el riesgo de lesión."],
  overhead: ["Si hay molestia en el hombro, usa un rango menor o consulta a tu entrenador."],
  cardio: ["Ajusta la intensidad a tu condición; la hidratación y el calentamiento son necesarios."],
};

const jointsFor = (e) => {
  const j = { push_horizontal: ["shoulder", "elbow", "wrist"], push_vertical: ["shoulder", "elbow", "wrist"], pull_horizontal: ["shoulder", "elbow"], pull_vertical: ["shoulder", "elbow", "wrist"],
    squat: ["knee", "hip"], hinge: ["lower_back", "hip"], lunge: ["knee", "hip", "ankle"], carry: ["wrist", "shoulder", "lower_back"], core_flexion: ["lower_back", "neck"], core_stability: ["lower_back", "shoulder"],
    core_rotation: ["lower_back"], core_lateral: ["lower_back"], jump: ["knee", "ankle", "hip"], throw: ["shoulder", "lower_back"], locomotion: ["knee", "ankle", "hip"], mobility: [], stability: ["ankle", "knee"] }[e.movement_pattern];
  if (e.movement_pattern === "isolation") return { biceps: ["elbow"], triceps: ["elbow", "shoulder"], forearms: ["wrist", "elbow"], shoulders: ["shoulder"], chest: ["shoulder"], back: ["shoulder", "lower_back"], hamstrings: ["knee"], glutes: ["hip"], quadriceps: ["knee"], calves: ["ankle"], adductors: ["hip", "knee"], abductors: ["hip"] }[e.primary_muscle] ?? [];
  const out = new Set(j);
  if (e.equipment === "barbell" && ["squat", "pull_horizontal", "push_vertical"].includes(e.movement_pattern)) out.add("lower_back");
  if (/inclinado|Pendlay|barra T|Seal|Kroc|Meadows/.test(e.name) && e.movement_pattern === "pull_horizontal") out.add("lower_back");
  return [...out];
};
const goalsFor = (e) => {
  const g = new Set();
  if (e.exercise_type === "strength") { g.add("strength"); g.add("hypertrophy"); if (e.difficulty === "beginner") g.add("general_health"); }
  if (e.movement_pattern === "isolation") { g.delete("strength"); g.add("hypertrophy"); }
  if (e.exercise_type === "power") { g.add("sport"); g.add("strength"); }
  if (e.exercise_type === "cardio") { g.add("endurance"); g.add("fat_loss"); g.add("general_health"); }
  if (e.exercise_type === "mobility") { g.add("mobility"); g.add("general_health"); g.add("return_to_training"); }
  if (["stability", "isometric"].includes(e.exercise_type)) { g.add("general_health"); if (e.difficulty !== "advanced") g.add("return_to_training"); }
  if (e.equipment === "bodyweight" && e.difficulty === "beginner") g.add("return_to_training");
  return [...g].sort();
};

const STOP = new Set(["con", "de", "en", "a", "la", "el", "y", "al", "una", "un", "los", "las", "del", "por", "sobre", "para"]);
const tokens = (s) => new Set(normalize(s).split(" ").filter((t) => t && !STOP.has(t)));
const jaccard = (a, b) => { let i = 0; for (const t of a) if (b.has(t)) i++; return i / (a.size + b.size - i || 1); };
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };

export function build(rows) {
  const errors = []; const seen = new Map(); const altOwner = new Map();
  const list = [];
  for (const r of rows) {
    const key = normalize(r.name);
    if (seen.has(key)) { errors.push(`${r.where}: nombre duplicado "${r.name}" (ya en ${seen.get(key)})`); continue; }
    seen.set(key, r.where);
    list.push(r);
  }
  const names = new Set(seen.keys());
  const items = list.map((r) => {
    const alts = r.alt_names.filter((a) => { const k = normalize(a); if (names.has(k) || altOwner.has(k)) return false; altOwner.set(k, r.name); return true; });
    const safety = [...SAFETY.base];
    if (r.equipment === "barbell") safety.push(...SAFETY.barbell);
    if (r.difficulty === "advanced") safety.push(...SAFETY.advanced);
    if (["power", "plyometric"].includes(r.exercise_type) || r.movement_pattern === "jump") safety.push(...SAFETY.power);
    if (r.movement_pattern === "push_vertical") safety.push(...SAFETY.overhead);
    if (r.exercise_type === "cardio") safety.push(...SAFETY.cardio);
    const home = HOME.has(r.equipment) || r.equipment === "other";
    const e = { slug: slugify(r.name), name_es: r.name, alt_names: alts, primary_muscle: r.primary_muscle, secondary_muscles: r.secondary_muscles, movement_pattern: r.movement_pattern, exercise_type: r.exercise_type, equipment: r.equipment, difficulty: r.difficulty };
    return { ...e,
      requirements: r.difficulty === "advanced" ? ["Dominar la versión regresiva", "Aprobación del entrenador"] : r.difficulty === "intermediate" ? ["Técnica básica del patrón de movimiento"] : [],
      instructions: STEPS[r.movement_pattern], common_errors: ERRORS[r.movement_pattern], safety_notes: safety,
      joint_stress: jointsFor(e), goals: goalsFor(e), home_friendly: home,
      tags: [...new Set([r.primary_muscle, r.equipment, r.movement_pattern, r.difficulty, ...(home ? ["casa"] : [])])],
      source: "Redacción editorial Rutinia (borrador genérico por patrón de movimiento)", review_status: "draft", media_status: "pending" };
  });
  // relations (deterministic)
  const relations = [];
  const byGroup = new Map();
  for (const e of items) { const k = `${e.primary_muscle}|${e.movement_pattern}`; (byGroup.get(k) ?? byGroup.set(k, []).get(k)).push(e); }
  for (const e of items) {
    const pool = byGroup.get(`${e.primary_muscle}|${e.movement_pattern}`).filter((x) => x.slug !== e.slug);
    const et = tokens(e.name_es);
    const score = (x) => jaccard(et, tokens(x.name_es)) + (x.equipment === e.equipment ? 0.15 : 0);
    const pick = (arr, n) => arr.map((x) => [score(x), x]).sort((a, b) => b[0] - a[0] || (a[1].slug < b[1].slug ? -1 : 1)).slice(0, n).map((p) => p[1]);
    const push = (kind, arr) => arr.forEach((x) => relations.push({ from: e.slug, to: x.slug, kind }));
    push("regression", pick(pool.filter((x) => RANK[x.difficulty] < RANK[e.difficulty]), 2));
    push("progression", pick(pool.filter((x) => RANK[x.difficulty] > RANK[e.difficulty]), 2));
    push("alternative", pick(pool.filter((x) => x.equipment !== e.equipment && RANK[x.difficulty] === RANK[e.difficulty]), 3));
    push("variant", pick(pool.filter((x) => x.equipment === e.equipment && RANK[x.difficulty] === RANK[e.difficulty] && jaccard(et, tokens(x.name_es)) >= 0.25), 2));
  }
  const slugs = new Set(); for (const e of items) { if (slugs.has(e.slug)) errors.push(`slug duplicado: ${e.slug}`); slugs.add(e.slug); }
  return { items, relations, errors };
}

export function inventory(items) {
  const count = (k) => items.reduce((m, e) => { for (const v of [].concat(e[k])) m[v] = (m[v] ?? 0) + 1; return m; }, {});
  return { total: items.length, by_primary_muscle: count("primary_muscle"), by_equipment: count("equipment"), by_difficulty: count("difficulty"), by_pattern: count("movement_pattern"), by_type: count("exercise_type") };
}
