import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad", description: "Qué datos trata Rutinia, con qué consentimiento, quién puede verlos y cómo exportarlos o eliminarlos.", alternates: { canonical: "/privacidad" } };

export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad" updated="19 de octubre de 2026">
      <section><h2>Responsable del tratamiento</h2><p>[Razón social, NIT, dirección y correo de contacto: por completar antes del lanzamiento.]</p></section>
      <section><h2>Qué datos tratamos</h2><ul><li><b>Entrenadores:</b> nombre, correo, datos de suscripción y pagos (referencias de transacción; nunca números de tarjeta).</li><li><b>Alumnos:</b> nombre, correo, fecha de nacimiento y la información que ellos decidan aportar en la evaluación inicial, incluida información de salud (lesiones, dolor, antecedentes relevantes para el ejercicio), medidas corporales, registros de entrenamiento y molestias.</li><li>Registros de acceso a datos sensibles (quién consultó la ficha de un alumno y cuándo).</li></ul></section>
      <section><h2>Datos sensibles</h2><p>La información de salud es un dato sensible. Solo se trata con el consentimiento expreso del alumno, que no viene premarcado y puede retirarse. Su entrenador solo puede verla mientras el alumno mantenga los consentimientos de datos de salud y de compartición con su entrenador.</p></section>
      <section><h2>Para qué los usamos</h2><ul><li>Prestar el servicio: evaluar, planificar, registrar y medir el progreso.</li><li>Calcular indicadores (IMC, metabolismo basal, % de grasa estimado) con fórmulas documentadas. Son estimaciones, no diagnósticos.</li><li>Gestionar la suscripción y los pagos.</li><li>Seguridad y trazabilidad.</li></ul><p>No vendemos datos ni los usamos para publicidad.</p></section>
      <section><h2>Encargados y terceros</h2><p>Base de datos y autenticación (Supabase); pagos (PayPal y Bold). [Completar con ubicación de servidores y condiciones de transferencia internacional.]</p></section>
      <section><h2>Tus derechos (Ley 1581 de 2012 y normas relacionadas)</h2><ul><li>Conocer, actualizar y rectificar tus datos.</li><li>Solicitar prueba de la autorización y revocarla.</li><li>Solicitar la supresión de tus datos cuando proceda.</li><li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li></ul><p>[Canal de atención de solicitudes: por completar.]</p></section>
      <section><h2>Conservación</h2><p>[Plazos de retención por definir.] Los registros de pagos se conservan por obligaciones contables aunque se elimine la cuenta; se anonimizarán los datos personales cuando la ley lo permita.</p></section>
    </LegalPage>
  );
}
