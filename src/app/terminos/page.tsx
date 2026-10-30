import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";

export const metadata: Metadata = { title: "Términos del servicio", description: "Condiciones de uso de Rutinia: suscripción, cupos, responsabilidades y límites del servicio.", alternates: { canonical: "/terminos" } };

export default function Terminos() {
  return (
    <LegalPage title="Términos del servicio" updated="19 de octubre de 2026">
      <section><h2>El servicio</h2><p>Rutinia es una plataforma para que entrenadores personales gestionen alumnos, evaluaciones, planes de entrenamiento y seguimiento del progreso. <b>No presta servicios médicos ni nutricionales</b> y no sustituye la valoración de un profesional de la salud.</p></section>
      <section><h2>Cuentas</h2><p>El entrenador contrata la suscripción; sus alumnos se registran mediante su invitación y no pagan por el software. Eres responsable de la veracidad de la información que introduzcas y de custodiar tus credenciales.</p></section>
      <section><h2>Prueba, precios y pagos</h2><ul><li>Prueba gratuita de 7 días, sin cobro automático al terminar.</li><li>Suscripción: $40.000 COP por mes con Bold (pesos colombianos, sin conversión de moneda), o USD 10.00 por mes con PayPal para quien paga desde fuera de Colombia. Incluye hasta 20 alumnos activos.</li><li>Cupos adicionales, pago único (1 a 10 por compra; no se renuevan): en pesos $2.500 cada uno al comprar 1 o 2, $2.400 al comprar 3 o 4, $2.200 al comprar de 5 a 9 y $2.000 al comprar 10; en dólares, USD 0.75 cada uno.</li><li>Borradores con inteligencia artificial: 3 gratis al mes; después, paquetes de pago único de 20 borradores por $25.000 COP (USD 6.00) o de 100 por $100.000 COP (USD 20.00). Si un borrador falla o se descarta, el crédito se devuelve.</li><li>Precios antes de impuestos y comisiones del procesador.</li><li>El acceso se activa cuando el pago es verificado por el servidor con el proveedor, no por la redirección del navegador.</li></ul></section>
      <section><h2>Vencimiento, cancelación y reembolsos</h2><p>Si la prueba o el periodo pagado terminan, el espacio de trabajo se bloquea, pero tus datos se conservan. Al cancelar conservas el acceso hasta el fin del periodo pagado. Un pago anulado o reembolsado reduce la capacidad de alumnos asociada; no se elimina ni se desactiva a ningún alumno automáticamente. [Política detallada de reembolsos: por completar.]</p></section>
      <section><h2>Uso aceptable</h2><p>No uses el servicio para tratar datos de personas sin su consentimiento, ni para dar indicaciones que contradigan restricciones médicas informadas por el alumno.</p></section>
      <section><h2>Limitación de responsabilidad</h2><p>[Cláusulas por completar con asesoría legal.]</p></section>
    </LegalPage>
  );
}
