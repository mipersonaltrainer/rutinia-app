// Builds one text-to-video prompt per exercise (for Google Flow or any video model), always with the same faceless gray mannequin.
// Source of truth: data/exercises.generated.json. Output: docs/video-prompts/ (CSV for spreadsheets + Markdown per muscle group).
// Usage: node scripts/build-video-prompts.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const { items } = JSON.parse(readFileSync(join(root, "data/exercises.generated.json"), "utf8"));
const outDir = join(root, "docs/video-prompts");

export const MANNEQUIN = "a faceless, featureless matte-gray anatomical mannequin with sculpted, clearly defined muscles (smooth uniform gray surface like a 3D écorché figure; no face, no hair, no skin texture, no clothing, no genitals)";
export const SCENE = "Fixed locked-off camera, plain light-gray seamless studio background, soft even studio lighting with gentle shadows that emphasize muscle definition, no text, no logos, no watermark, no other people, no music, no camera movement";
export const NEGATIVE = "face, eyes, hair, skin texture, clothing, text, subtitles, logo, watermark, extra limbs, distorted hands, extra fingers, blur, fast cuts, camera shake, zoom, people in the background";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MUSCLE = { chest: "chest", back: "back", shoulders: "shoulders", biceps: "biceps", triceps: "triceps", forearms: "forearms", quadriceps: "quadriceps", hamstrings: "hamstrings", glutes: "glutes", calves: "calves", core: "abdominals and core", adductors: "inner thighs", abductors: "outer hips", hip_flexors: "hip flexors", lower_back: "lower back", neck: "neck", full_body: "full body", cardio: "whole body (cardio)", traps: "trapezius", lats: "lats" };
const PROP = { barbell: "an Olympic barbell loaded with plates", dumbbell: "dumbbells", machine: "a generic gym machine", cable: "a cable pulley station with a handle", kettlebell: "a kettlebell", band: "a long elastic resistance band anchored securely", bodyweight: "", suspension: "suspension-trainer straps anchored overhead", medicine_ball: "a medicine ball", plate: "a weight plate", cardio_machine: "a cardio machine", other: "" };
const ENGLISH = /\b(press|curl|row|squat|lunge|raise|fly|flye|dip|pull|push|extension|crunch|plank|deadlift|bench|cable|dumbbell|band|machine|bridge|thrust|kick|jump|walk|carry|swing|clean|snatch|stretch|twist|shrug|pulldown|pullover|bird|dog|burpee|climber|step|hop|raise|rotation|hold|sit-up|leg|arm|hip|calf|glute|ham|smith|goblet|romanian|bulgarian|incline|decline|flat|chin|face|hammer|preacher|skull)\b/i;
const englishName = (it) => (it.alt_names ?? []).find((a) => ENGLISH.test(a) && !/[áéíóúñ]/i.test(a)) ?? null;


/** Hand-written pose + motion for the first-50 movements whose name alone doesn't pin the technique down. Precedence over every rule below. */
const OVERRIDES = {
  "cruce-de-poleas-alto-a-bajo": ["standing in a split stance between two high pulleys, holding a handle in each hand with arms wide and a slight elbow bend, torso leaning slightly forward", "brings both hands down and together in a wide arc to meet in front of the lower chest, squeezes the chest, then returns slowly along the same arc"],
  "aperturas-en-maquina-peck-deck": ["seated at a pec-deck machine with the back flat against the pad and the upper arms parallel to the floor on the arm pads", "brings the arms together in front of the chest, squeezes, then opens slowly to a comfortable chest stretch"],
  "remo-con-barra-inclinado": ["standing with the knees slightly bent and the torso hinged forward to about 45 degrees with a flat back, arms hanging while holding the barbell", "pulls the bar to the lower ribcage by driving the elbows back, squeezes the shoulder blades, then lowers it under control"],
  "remo-con-mancuerna-a-una-mano": ["one knee and one hand supported on a flat bench with a flat back, the free hand holding a dumbbell with the arm hanging", "pulls the dumbbell toward the hip keeping the elbow close to the body, squeezes the back, then lowers it fully"],
  "jalon-al-pecho-agarre-ancho": ["seated at a lat pulldown machine with the thighs under the pads, wide overhand grip on the bar, arms extended overhead", "pulls the bar down to the upper chest leaning back slightly with the elbows driving down, then returns slowly to straight arms"],
  "jalon-al-pecho-agarre-cerrado-neutro": ["seated at a lat pulldown machine with the thighs under the pads, holding a close neutral-grip handle with arms extended overhead", "pulls the handle down to the upper chest with the elbows driving down and close to the body, then returns slowly to straight arms"],
  "remo-en-polea-baja-agarre-cerrado": ["seated at a low cable row with the feet on the platform and the knees slightly bent, torso upright, holding the close-grip handle with arms extended", "pulls the handle to the abdomen squeezing the shoulder blades while the torso stays upright, then extends the arms slowly"],
  "remo-en-maquina-con-apoyo-de-pecho": ["seated at a chest-supported row machine with the chest against the pad, holding the handles with arms extended", "pulls the handles back driving the elbows behind the torso, squeezes the shoulder blades, then returns slowly"],
  "pajaros-con-mancuernas-inclinado": ["lying chest-down on an incline bench set to about 45 degrees, holding a dumbbell in each hand with the arms hanging", "raises both arms out to the sides to shoulder height with soft elbows, squeezes the shoulder blades, then lowers slowly"],
  "plancha-con-toque-de-hombro": ["in a high plank on the hands with the feet wider than shoulder width", "lifts one hand and taps the opposite shoulder while the hips stay completely still, returns the hand, then repeats with the other hand"],
  "crunch-abdominal": ["lying on the back with the knees bent, feet flat and hands lightly behind the head", "curls the head and shoulder blades off the floor by contracting the abdominals, pauses, then lowers slowly"],
  "dead-bug": ["lying on the back with the arms pointing to the ceiling and the hips and knees bent at 90 degrees", "extends the opposite arm and leg slowly toward the floor while the lower back stays pressed down, returns, and alternates sides"],
  "pallof-press-de-pie": ["standing sideways to a cable pulley at chest height, holding the handle at the chest with both hands, feet shoulder-width apart", "presses the handle straight out in front while resisting the pull to rotate, holds a moment, then returns it to the chest"],
  "crunch-bicicleta": ["lying on the back with the hands behind the head and the legs lifted", "brings one elbow toward the opposite knee while extending the other leg, then alternates in a smooth pedaling motion"],
};

/** Where the body is and what the movement looks like, from the Spanish name + pattern. Returns [pose, motion, confident]. */
function describe(it) {
  const manual = OVERRIDES[it.slug]; if (manual) return [manual[0], manual[1], true];
  const n = norm(it.name_es), p = it.movement_pattern, one = /(una mano|un brazo|a una pierna|unilateral|alterno|alterna|a un lado|una pierna)/.test(n);
  const angle = it.bench_angle ?? (/declinad/.test(n) ? "decline" : /inclinad/.test(n) ? "incline" : /plano|banca/.test(n) ? "flat" : null);
  const bench = angle === "incline" ? "on an adjustable bench set to about 30–45 degrees (inclined)" : angle === "decline" ? "on a decline bench with the head lower than the hips" : "flat on a horizontal bench";
  const eq = it.equipment;
  const load = eq === "dumbbell" ? (one ? "one dumbbell" : "a dumbbell in each hand") : eq === "barbell" ? "the barbell" : eq === "kettlebell" ? "the kettlebell" : eq === "cable" ? "the cable handle" : eq === "band" ? "the elastic band" : eq === "plate" ? "the weight plate" : eq === "medicine_ball" ? "the medicine ball" : eq === "machine" ? "the machine handles" : "";
  const side = one ? " Work one side only (the other limb stays relaxed)." : "";
  const has = (re) => re.test(n);
  if (has(/flexion|push-up|fondos en banco|fondos de triceps en banco/) && !has(/fondos en paralelas|maquina/)) return ["in a straight-line push-up (plank) position, hands under the shoulders", "lowers the chest toward the floor with elbows at about 45 degrees, then pushes back up to straight arms", true];
  if (has(/plancha|plank/)) return ["in a forearm plank, body in a straight line from head to heels", "holds the position with a slight, controlled breathing movement and only the exercise-specific limb or hip action described in the name", false];
  if (has(/dominada|colgado|pull-up|chin/)) return ["hanging from a pull-up bar with arms extended", "pulls the chest toward the bar by driving the elbows down, then lowers under control to a full hang", true];
  if (has(/fondos en paralelas/)) return ["supported on parallel bars with straight arms", "lowers the body by bending the elbows until the upper arms are roughly parallel to the floor, then presses back up", true];
  if (has(/(banca|banco|plano|inclinad|declinad|suelo|supino|tumbad)/) && has(/(press|aperturas|pullover|extension|francés|frances|skull|rompecraneos|puente)/) && !has(/(remo|curl|jalon|pajaros|elevaciones)/)) return [`lying ${has(/suelo/) ? "on the floor" : bench}, feet planted, holding ${load || "the load"} over the chest`, has(/aperturas/) ? "opens the arms in a wide arc with a slight elbow bend until the chest is stretched, then brings the arms back together over the chest" : has(/pullover/) ? "lowers the weight in an arc behind the head with slightly bent elbows, then returns over the chest" : has(/(extension|frances|skull|rompecraneos)/) ? "bends only the elbows to lower the weight toward the forehead, then extends the arms back up" : "lowers the weight under control to the chest, then presses it back up to straight arms", true];
  if (has(/(inclinad)/) && has(/(curl|pajaros|elevaciones)/)) return [`seated ${bench}, ${load ? `holding ${load}` : "arms hanging"}`, has(/curl/) ? "curls the weight up by bending only the elbows, then lowers it fully under control" : "raises the arms in an arc keeping a soft elbow bend, then lowers slowly", false];
  // Name-driven movements that the generic pattern templates would describe poorly.
  const standing = has(/sentad/) ? "seated" : "standing tall";
  const RULES = [
    [/curl (femoral|de pierna|de isquio|nordico)|curl nordico|isquiotibial.*maquina/, "lying face down on a leg-curl machine", "bends the knees to bring the heels toward the glutes, then extends back under control"],
    [/extension de (pierna|cuadriceps|rodilla)/, "seated on a leg-extension machine with the back supported", "extends the knees until the legs are straight, pauses, and lowers under control"],
    [/curl/, `${standing}${load ? `, holding ${load}` : ""}, upper arms fixed against the sides`, "curls the weight up by bending only the elbows without swinging the torso, squeezes the biceps, and lowers fully under control"],
    [/(extension|patada|jalon|press frances|rompecraneos|fondos).*triceps|triceps.*(extension|patada|jalon|polea)|press frances/, `${standing}${load ? `, holding ${load}` : ""}, upper arms fixed`, "extends only the elbows until the arms are straight, squeezes the triceps, and returns slowly"],
    [/elevacion(es)? lateral/, `${standing}${load ? `, holding ${load} at the sides` : ""}`, "raises the arms out to the sides up to shoulder height with a soft elbow bend, then lowers slowly"],
    [/elevacion(es)? frontal/, `${standing}${load ? `, holding ${load} in front of the thighs` : ""}`, "raises the arms straight forward to shoulder height, then lowers slowly"],
    [/pajaros|vuelo(s)? posterior|deltoide posterior|face pull/, "hinged forward with a flat back", "raises the arms out to the sides (or pulls toward the face) squeezing the shoulder blades, then lowers slowly"],
    [/encogimiento|shrug/, `standing tall${load ? `, holding ${load} at the sides` : ""}`, "lifts the shoulders straight up toward the ears, pauses, then lowers fully"],
    [/hip thrust|puente de gluteo|puente/, "with the upper back resting on a bench, feet planted and knees bent", "drives the hips up until the body forms a straight line from shoulders to knees, squeezes the glutes, and lowers under control"],
    [/patada|coz/, "on hands and knees (or standing at a cable)", "extends one leg back and up squeezing the glute without arching the lower back, then returns"],
    [/abduccion/, "seated at a machine with the back supported", "presses the legs outward against the pads, pauses, then returns slowly"],
    [/aduccion/, "seated at a machine with the back supported", "squeezes the legs together against the pads, pauses, then opens slowly"],
    [/talones|gemelo|pantorrilla/, `standing tall on the edge of a step${load ? `, holding ${load}` : ""}`, "rises onto the balls of the feet as high as possible, pauses, then lowers the heels below the step"],
    [/elevacion(es)? de piernas|elevacion(es)? de rodillas/, has(/colgad|barra/) ? "hanging from a bar with the body still" : "lying on the back with the lower back pressed down", "raises the legs (or knees) with control using the abdominals, then lowers without swinging"],
    [/step|subida al cajon|subidas al cajon/, "standing in front of a sturdy box", "steps up driving through the heel until fully upright, then steps down under control"],
    [/burpee/, "standing in an athletic stance", "drops to a push-up position, performs one push-up, jumps the feet in, and finishes with a small jump upright"],
    [/salto|jump|brinco/, "in an athletic stance", "dips the hips, jumps explosively, and lands softly with bent knees, then resets"],
  ];
  for (const [re, pose2, motion2] of RULES) if (has(re)) return [pose2, `${motion2}${side}`, true];

  if (p === "push_horizontal") return [eq === "machine" ? "seated at the machine with the back supported" : has(/de pie|polea/) ? "standing in a split stance" : "standing with a stable stance", `pushes ${load || "the handles"} straight forward from the chest until the arms are extended, then returns slowly`, false];
  if (p === "push_vertical") return [has(/sentad/) ? "seated with the back supported" : "standing tall with the core braced", `presses ${load || "the load"} from shoulder height straight overhead until the arms are extended, then lowers it to the shoulders`, true];
  if (p === "pull_horizontal") return [has(/inclinad|barra|curvad|pendlay/) ? "hinged forward at the hips with a flat back" : has(/sentad|maquina|polea/) ? "seated, chest supported or upright" : "in a stable stance", `pulls ${load || "the handles"} toward the torso by driving the elbows back and squeezing the shoulder blades, then extends the arms under control`, false];
  if (p === "pull_vertical") return [has(/jalon|pulldown/) ? "seated under a high pulley with the thighs secured" : "standing or kneeling under a high anchor", `pulls ${load || "the bar"} down toward the upper chest with the elbows driving down, then returns slowly to straight arms`, false];
  if (p === "squat") return [has(/goblet/) ? "standing, holding the weight at the chest" : has(/barra/) ? "standing with the barbell on the upper back" : "standing with feet about shoulder-width apart", "sits the hips down and back until the thighs are at least parallel to the floor with the chest up and knees tracking over the toes, then drives up to standing", true];
  if (p === "hinge") return ["standing with a soft knee bend, " + (load ? `holding ${load}` : "arms in front"), "pushes the hips straight back keeping the spine neutral and the weight close to the legs until the hamstrings are stretched, then drives the hips forward to stand tall", true];
  if (p === "lunge") return ["standing tall", `steps ${has(/atras|reversa|reverse/) ? "backward" : has(/lateral/) ? "to the side" : "forward"} into a lunge, lowering the back knee toward the floor with the front shin vertical, then pushes back to the start${side}`, true];
  if (p === "carry") return ["standing tall holding the load", "walks forward slowly with short controlled steps, shoulders level and core braced", false];
  if (p === "core_flexion") return ["lying on the back with the knees bent", "curls the ribcage toward the pelvis using the abdominals, then lowers back under control", false];
  if (p === "core_rotation") return ["in a stable position with the core braced", "rotates the torso smoothly from side to side, led by the ribcage, with the hips staying stable", false];
  if (p === "core_stability") return ["in a braced, stable position with the body in a straight line", "keeps the trunk still while performing only the small limb movement named in the exercise", false];
  if (it.exercise_type === "cardio" || eq === "cardio_machine") return ["in an athletic stance", "performs the cardio movement at a steady, rhythmic pace for one clear cycle", false];
  if (it.exercise_type === "mobility" || /estiramiento|movilidad|stretch/.test(n)) return ["in a relaxed, supported position", "moves slowly into the stretch or mobility range, holds briefly, then returns, never forcing the end range", false];
  if (it.exercise_type === "power") return ["in an athletic stance, ready to move", "performs one explosive repetition with a controlled landing and reset", false];
  // isolation and everything else: name-driven
  const muscle = MUSCLE[it.primary_muscle] ?? it.primary_muscle;
  return [`${has(/sentad/) ? "seated" : has(/de pie/) ? "standing" : "in a stable position"}${load ? ` holding ${load}` : ""}`, `moves only the joint that works the ${muscle} through its full range as the exercise name indicates, slowly and under control, then returns to the start${side}`, false];
}

export function buildPrompt(it) {
  const [pose, motion, confident] = describe(it);
  const en = englishName(it); const muscle = MUSCLE[it.primary_muscle] ?? it.primary_muscle;
  const prop = PROP[it.equipment] ? ` Equipment in frame: ${PROP[it.equipment]}.` : " No equipment.";
  const prompt = `${MANNEQUIN[0].toUpperCase()}${MANNEQUIN.slice(1)} performs the exercise "${en ?? it.name_es}"${en ? ` (Spanish: ${it.name_es})` : ""}, ${pose}. In one smooth, continuous repetition the mannequin ${motion}.${prop} The target muscles (${muscle}) are visible and the movement shows correct technique, a controlled tempo and a full range of motion. The clip is a seamless loop of a single repetition, 5 seconds long. Camera: ${["squat", "hinge", "lunge", "push_vertical"].includes(it.movement_pattern) || /de pie|polea/.test(norm(it.name_es)) ? "full body, side three-quarter view" : "full body, side view"}. ${SCENE}.`;
  return { prompt, en, confident };
}


// The 50 most used movements: generate these first (a trainer builds most plans from them) and judge the style before spending credits on the rest.
export const FIRST_50 = [
  "sentadilla-trasera-con-barra", "sentadilla-goblet-con-mancuerna", "sentadilla-frontal-con-barra", "sentadilla-sumo-con-mancuerna", "prensa-de-piernas-45-grados", "peso-muerto-convencional", "peso-muerto-rumano-con-barra",
  "zancada-caminando-con-mancuernas", "sentadilla-bulgara-con-mancuernas", "step-up-al-cajon-con-mancuernas", "hip-thrust-con-barra", "puente-de-gluteo-con-peso-corporal", "curl-femoral-tumbado-en-maquina", "elevacion-de-talones-de-pie-en-maquina",
  "press-de-banca-plano-con-barra", "press-de-banca-inclinado-con-barra", "press-de-banca-declinado-con-barra", "press-plano-con-mancuernas", "press-inclinado-con-mancuernas", "press-declinado-con-mancuernas",
  "aperturas-con-mancuernas-en-banco-plano", "aperturas-inclinadas-con-mancuernas", "cruce-de-poleas-alto-a-bajo", "aperturas-en-maquina-peck-deck", "flexiones-estandar",
  "remo-con-barra-inclinado", "remo-con-mancuerna-a-una-mano", "jalon-al-pecho-agarre-ancho", "jalon-al-pecho-agarre-cerrado-neutro", "dominadas-pronas", "remo-en-polea-baja-agarre-cerrado", "remo-en-maquina-con-apoyo-de-pecho",
  "press-militar-con-barra-de-pie", "press-arnold", "elevaciones-laterales-con-mancuernas", "face-pull-en-polea", "pajaros-con-mancuernas-inclinado",
  "curl-con-barra-z", "curl-con-mancuernas-alterno", "curl-martillo", "extension-de-triceps-en-polea-con-cuerda", "press-frances-con-barra-z", "patada-de-triceps-con-mancuerna", "fondos-de-triceps-en-banco",
  "plancha-con-toque-de-hombro", "crunch-abdominal", "dead-bug", "pallof-press-de-pie", "crunch-bicicleta", "burpee",
];

const rows = items.map((it) => ({ it, ...buildPrompt(it) }));
const csvEsc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const GROUP = (m) => ({ chest: "01-pecho", back: "02-espalda", shoulders: "03-hombros", biceps: "04-brazos", triceps: "04-brazos", forearms: "04-brazos", quadriceps: "05-piernas", hamstrings: "05-piernas", adductors: "05-piernas", abductors: "05-piernas", hip_flexors: "05-piernas", glutes: "06-gluteos-pantorrillas", calves: "06-gluteos-pantorrillas", core: "07-core", lower_back: "07-core" }[m] ?? "08-cuerpo-completo-cardio-movilidad");

const csv = ["archivo,nombre_es,nombre_en,musculo,equipo,inclinacion,prompt_en,revisar"]
  .concat(rows.map(({ it, prompt, en, confident }) => [`${it.slug}.mp4`, it.name_es, en ?? "", it.primary_muscle, it.equipment, it.bench_angle ?? "", prompt, confident ? "no" : "sí (movimiento genérico por patrón: ajústalo mirando el nombre)"].map(csvEsc).join(","))).join("\n") + "\n";

const groups = new Map();
for (const r of rows) { const g = GROUP(r.it.primary_muscle); groups.set(g, [...(groups.get(g) ?? []), r]); }
const md = new Map();
for (const [g, list] of [...groups.entries()].sort()) {
  md.set(`${g}.md`, `# Prompts de video — ${g.slice(3).replace(/-/g, " ")}\n\n${list.length} ejercicios. Archivo de salida sugerido: \`<slug>.mp4\`. Pega primero el estilo de \`GUIA.md\` si tu herramienta lo pide aparte.\n\n` + list.sort((a, b) => a.it.name_es.localeCompare(b.it.name_es)).map(({ it, prompt, confident }) => `## ${it.name_es}\n\n- Archivo: \`${it.slug}.mp4\` · Equipo: ${it.equipment} · Músculo: ${it.primary_muscle}${it.bench_angle ? ` · Banco: ${it.bench_angle}` : ""}${confident ? "" : " · ⚠ revisar movimiento"}\n\n\`\`\`text\n${prompt}\n\`\`\`\n`).join("\n"));
}
const bySlug = new Map(rows.map((r) => [r.it.slug, r]));
const missing = FIRST_50.filter((x) => !bySlug.has(x)); if (missing.length) { console.error(`PRIMEROS_50: no existen en la biblioteca: ${missing.join(", ")}`); process.exit(1); }
if (new Set(FIRST_50).size !== FIRST_50.length || FIRST_50.length !== 50) { console.error("PRIMEROS_50 debe tener 50 ejercicios distintos"); process.exit(1); }
const first = `# Los primeros 50 videos\n\nGenera estos primero: son los movimientos con los que se arma la mayoría de los planes. Empieza por los 5 primeros de cada bloque para validar el estilo del maniquí antes de gastar más créditos.\n\n` + FIRST_50.map((slug, i) => { const { it, prompt, confident } = bySlug.get(slug); return `## ${i + 1}. ${it.name_es}\n\n- Archivo: \`${slug}.mp4\`${confident ? "" : " · ⚠ revisar movimiento"}\n\n\`\`\`text\n${prompt}\n\`\`\`\n`; }).join("\n");
const files = new Map([["PROMPTS_EJERCICIOS.csv", csv], ["PRIMEROS_50.md", first], ...md]);

if (process.argv.includes("--check")) {
  for (const [f, c] of files) { const p = join(outDir, f); if (!existsSync(p) || readFileSync(p, "utf8") !== c) { console.error(`docs/video-prompts/${f} está desactualizado: ejecuta npm run videos:build`); process.exit(1); } }
  console.log(`OK: ${rows.length} prompts reproducibles`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const [f, c] of files) writeFileSync(join(outDir, f), c);
  console.log(`${rows.length} prompts · ${rows.filter((r) => !r.confident).length} marcados para revisar · ${files.size} archivos`);
}
