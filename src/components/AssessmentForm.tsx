import { ActionForm, fieldCls } from "./ActionForm";
import { submitAssessment } from "@/app/client/actions";

const GOALS: [string, string][] = [["hypertrophy", "Hipertrofia"], ["strength", "Fuerza"], ["fat_loss", "Pérdida de grasa"], ["endurance", "Resistencia"], ["recomposition", "Recomposición"], ["mobility", "Movilidad"], ["general_health", "Salud general"], ["sport", "Preparación deportiva"], ["return_to_training", "Retorno progresivo"]];
const Sel = ({ name, children, def }: { name: string; children: React.ReactNode; def?: string }) => <select name={name} defaultValue={def} className={fieldCls}>{children}</select>;
const Chk = ({ name, label }: { name: string; label: string }) => <label className="flex gap-2 text-sm"><input type="checkbox" name={name} /> {label}</label>;
const Num = ({ name, label, min, max, def }: { name: string; label: string; min?: number; max?: number; def?: number }) => <label className="text-sm">{label}<input name={name} type="number" step="any" min={min} max={max} defaultValue={def} required className={fieldCls} /></label>;
const Txt = ({ name, label }: { name: string; label: string }) => <label className="block text-sm">{label}<textarea name={name} rows={2} maxLength={500} className={fieldCls} /></label>;
const scale = <><option value="1">1 (muy bajo)</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 (muy alto)</option></>;
const H = ({ children }: { children: React.ReactNode }) => <legend className="mb-2 text-lg font-semibold">{children}</legend>;

export function AssessmentForm() {
  return (
    <ActionForm action={submitAssessment} submitLabel="Enviar evaluación" className="space-y-8">
      <fieldset className="space-y-3"><H>1. Datos personales</H>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Fecha de nacimiento<input name="birthDate" type="date" required className={fieldCls} /></label>
          <label className="text-sm">Categoría para fórmulas metabólicas<Sel name="sexForFormulas" def="unspecified"><option value="male">Masculino</option><option value="female">Femenino</option><option value="unspecified">Prefiero no indicarlo (sin estimación metabólica)</option></Sel></label>
          <label className="text-sm">Ocupación<input name="occupation" maxLength={120} className={fieldCls} /></label>
          <label className="text-sm">Tipo de trabajo<Sel name="workType"><option value="sedentary">Sedentario</option><option value="mixed">Mixto</option><option value="active">Físicamente activo</option></Sel></label>
          <Num name="sittingHours" label="Horas sentado al día" min={0} max={24} />
          <label className="text-sm">Actividad diaria general<Sel name="activityLevel" def="light"><option value="sedentary">Sedentaria</option><option value="light">Ligera</option><option value="moderate">Moderada</option><option value="high">Alta</option><option value="veryHigh">Muy alta</option></Sel></label>
          <label className="text-sm">Calidad del sueño<Sel name="sleepQuality" def="3">{scale}</Sel></label>
          <label className="text-sm">Estrés percibido<Sel name="stress" def="3">{scale}</Sel></label>
        </div></fieldset>
      <fieldset className="space-y-3"><H>2. Historial de entrenamiento</H>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num name="experienceYears" label="Años entrenando" min={0} max={70} def={0} /><Num name="weeklyFrequency" label="Días por semana (actual)" min={0} max={14} def={0} />
          <Num name="sessionMinutes" label="Minutos por sesión" min={10} max={240} def={60} />
          <label className="text-sm">Dónde entrenas<Sel name="location"><option value="gym">Gimnasio</option><option value="home">Casa</option><option value="outdoor">Exterior</option><option value="mixed">Mixto</option></Sel></label>
        </div>
        <Txt name="equipment" label="Equipamiento disponible" /><Txt name="avoidExercises" label="Ejercicios que quieres evitar" /></fieldset>
      <fieldset className="space-y-3"><H>3. Objetivos</H>
        <div className="grid gap-2 sm:grid-cols-3">{GOALS.map(([v, l]) => <label key={v} className="flex gap-2 text-sm"><input type="checkbox" name="goals" value={v} /> {l}</label>)}</div>
        <label className="block text-sm">Plazo deseado<input name="timeframe" maxLength={120} className={fieldCls} /></label><Txt name="motivation" label="Motivación" /></fieldset>
      <fieldset className="space-y-3"><H>4. Salud y seguridad</H>
        <p className="text-xs text-[var(--muted)]">Estos datos son sensibles: solo los ve tu entrenador mientras mantengas tu consentimiento. Ninguna respuesta es un diagnóstico.</p>
        <Chk name="chestPainDuringExercise" label="He sentido dolor en el pecho al hacer ejercicio" /><Chk name="dizzinessOrFainting" label="He sentido mareo o desmayo al hacer ejercicio" />
        <Chk name="unusualBreathlessness" label="He sentido falta de aire inusual al hacer ejercicio" /><Chk name="cardiovascularHistory" label="Tengo antecedentes cardiovasculares" />
        <Chk name="medicalRestriction" label="Tengo una restricción médica para hacer ejercicio" /><Chk name="medicalClearance" label="Tengo autorización médica vigente para entrenar" />
        <Chk name="eatingDisorderHistory" label="Tengo antecedentes de trastorno alimentario" />
        <label className="block text-sm">Embarazo o posparto<Sel name="pregnancyStatus"><option value="not_applicable">No aplica</option><option value="pregnant">Embarazo</option><option value="postpartum">Posparto</option></Sel></label>
        <Num name="currentPain" label="Dolor actual (0 a 10)" min={0} max={10} def={0} />
        <Txt name="injuries" label="Lesiones previas o actuales" /><Txt name="surgeries" label="Cirugías" /><Txt name="conditions" label="Condiciones de salud relevantes (opcional)" /><Txt name="medications" label="Medicación relevante (opcional)" /></fieldset>
      <fieldset className="space-y-3"><H>5. Hábitos y recuperación</H>
        <div className="grid gap-3 sm:grid-cols-2"><Num name="sleepHours" label="Horas de sueño" min={0} max={16} def={7} />
          <label className="text-sm">Recuperación percibida<Sel name="recovery" def="3">{scale}</Sel></label></div>
        <Txt name="barriers" label="Barreras para entrenar con constancia" /></fieldset>
    </ActionForm>
  );
}
