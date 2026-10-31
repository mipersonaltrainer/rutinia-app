import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Términos y condiciones", description: "Condiciones de uso de Rutinia: cuentas, suscripción, pagos, reembolsos, uso de inteligencia artificial, responsabilidades y límites del servicio.", alternates: { canonical: "/terminos" } };

export default function Terminos() {
  return (
    <LegalPage title="Términos y condiciones de uso" updated={LEGAL.updated}>
      <section><h2>1. Quiénes somos y qué aceptas</h2>
        <p>{LEGAL.brand} (en adelante «Rutinia», «nosotros») es una plataforma web, disponible en <b>{LEGAL.site}</b>, para que entrenadores personales gestionen a sus alumnos: evaluación inicial, planes de entrenamiento, seguimiento del progreso, mensajes y fotos de progreso. Estos términos regulan el uso de la plataforma por parte de <b>entrenadores</b> y de <b>alumnos</b> (en conjunto, «usuarios»).</p>
        <p>Al crear una cuenta, aceptar una invitación o usar la plataforma, declaras que leíste estos términos y la <a href="/privacidad">Política de privacidad</a> y que los aceptas. Si no estás de acuerdo, no uses el servicio.</p>
        <p>Puedes escribirnos en cualquier momento a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o desde la sección Soporte de la plataforma.</p></section>

      <section><h2>2. Quién puede usar Rutinia</h2>
        <ul><li>La plataforma está dirigida a personas <b>mayores de 18 años</b>. El entrenador no debe registrar a menores de edad; si un alumno resulta ser menor, la plataforma lo señala y se requiere supervisión profesional específica fuera de ella.</li>
          <li>Debes tener capacidad legal para contratar según la ley colombiana.</li>
          <li>Una cuenta es personal e intransferible. No la compartas.</li></ul></section>

      <section><h2>3. Qué es Rutinia y qué no es</h2>
        <p>Rutinia es una herramienta de <b>gestión y seguimiento</b>. <b>No presta servicios médicos, de fisioterapia ni de nutrición clínica</b>, no diagnostica y no reemplaza la valoración de un profesional de la salud.</p>
        <ul><li>Los indicadores que calcula (por ejemplo IMC, gasto energético estimado, porcentaje de grasa estimado) son <b>estimaciones</b> con fórmulas publicadas, no diagnósticos.</li>
          <li>El cribado de riesgo de la evaluación inicial es una ayuda para que el entrenador decida si debe remitir al alumno a un profesional; no es una autorización médica para entrenar.</li>
          <li>Las indicaciones de entrenamiento y alimentación que recibe un alumno son responsabilidad del entrenador que las prescribe. Rutinia no es parte de la relación entre entrenador y alumno ni responde por ella.</li></ul></section>

      <section><h2>4. Cuentas y seguridad</h2>
        <ul><li>Debes dar información veraz y mantenerla actualizada.</li>
          <li>Eres responsable de custodiar tu contraseña, tu acceso con Google y tu segundo factor de verificación, y de lo que se haga con tu cuenta. Avísanos de inmediato si sospechas un acceso no autorizado.</li>
          <li>Podemos aplicar controles anti-abuso (por ejemplo verificación CAPTCHA y límites de intentos) para proteger a los usuarios.</li>
          <li>El entrenador contrata la suscripción y puede invitar alumnos. Los alumnos se registran con la invitación de su entrenador y <b>no pagan</b> por el software.</li></ul></section>

      <section><h2>5. Información de los alumnos: deberes del entrenador</h2>
        <p>El alumno decide qué información aporta y con quién la comparte (ver la <a href="/privacidad">Política de privacidad</a>). El entrenador solo ve los datos del alumno mientras este mantenga los consentimientos correspondientes. El entrenador se obliga a:</p>
        <ul><li>usar la información únicamente para prestar su servicio de entrenamiento a ese alumno;</li>
          <li>no copiarla, publicarla ni compartirla con terceros sin autorización del alumno, y mantener la confidencialidad de los datos de salud;</li>
          <li>no usarla para publicidad, discriminación ni cualquier fin distinto;</li>
          <li>respetar el retiro de consentimientos y las solicitudes de eliminación del alumno;</li>
          <li>cumplir las normas de protección de datos personales respecto de la información que obtenga del alumno por fuera de la plataforma.</li></ul></section>

      <section><h2>6. Prueba gratuita, planes y precios</h2>
        <ul><li><b>Prueba gratuita de 7 días</b>, sin tarjeta y sin cobro automático al terminar.</li>
          <li><b>Suscripción del entrenador:</b> $40.000 COP por mes pagando con Bold (pesos colombianos, sin conversión de moneda), o USD 10.00 por mes con PayPal para quien paga desde fuera de Colombia. Incluye hasta 20 alumnos activos.</li>
          <li><b>Cupos adicionales</b> (pago único, de 1 a 10 por compra, no se renuevan): en pesos, $2.500 cada uno al comprar 1 o 2, $2.400 al comprar 3 o 4, $2.200 al comprar de 5 a 9 y $2.000 al comprar 10; en dólares, USD 0.75 cada uno.</li>
          <li><b>Borradores con inteligencia artificial:</b> 3 gratis al mes; después, paquetes de pago único de 20 borradores por $25.000 COP (USD 6.00) o de 100 por $100.000 COP (USD 20.00). Si un borrador falla o se descarta, el crédito se devuelve.</li>
          <li>Los precios no incluyen impuestos ni comisiones del procesador de pagos cuando la ley o el procesador los apliquen. Te mostramos el valor a pagar antes de confirmar.</li>
          <li>Podemos cambiar los precios hacia adelante. Los avisaremos con al menos <b>15 días</b> de anticipación y no afectarán el periodo ya pagado.</li></ul></section>

      <section><h2>7. Pagos</h2>
        <ul><li>Los pagos se procesan por <b>Bold</b> (pesos colombianos) y <b>PayPal</b> (dólares). Rutinia <b>no recibe ni guarda números de tarjeta</b>; solo conserva referencias de la transacción.</li>
          <li>El acceso o la capacidad comprada se activan cuando <b>el servidor verifica el pago directamente con el proveedor</b>, no por la simple redirección de tu navegador. Un pago pendiente no activa nada hasta confirmarse.</li>
          <li><b>Bold:</b> pagas cada periodo por separado; no hay cobro automático. <b>PayPal:</b> la suscripción es recurrente y puedes cancelarla en cualquier momento desde Facturación en Rutinia o desde tu cuenta de PayPal.</li>
          <li>Conservamos los registros de pagos por las obligaciones contables y tributarias que apliquen.</li></ul></section>

      <section><h2>8. Vencimiento, cancelación y suspensión</h2>
        <ul><li>Si la prueba o el periodo pagado terminan, el espacio de trabajo del entrenador <b>se bloquea</b>, pero <b>tus datos se conservan</b> y puedes reactivarlo pagando. El soporte sigue disponible aunque el espacio esté bloqueado.</li>
          <li>Al cancelar, conservas el acceso hasta el final del periodo pagado.</li>
          <li>Puedes exportar tus datos desde la plataforma cuando quieras (ver la <a href="/privacidad">Política de privacidad</a>).</li>
          <li>Un pago anulado, rechazado o reembolsado reduce la capacidad de alumnos asociada. <b>Nunca eliminamos ni desactivamos a un alumno automáticamente</b> por esa causa.</li>
          <li>Podemos suspender o cerrar una cuenta que incumpla estos términos o ponga en riesgo a otros usuarios, avisándote el motivo por correo siempre que sea posible.</li></ul></section>

      <section><h2>9. Reembolsos y derecho de retracto</h2>
        <ul><li><b>Retracto.</b> Si compraste a distancia (por internet) tienes derecho a retractarte dentro de los <b>5 días hábiles siguientes al pago</b>, conforme al Estatuto del Consumidor (Ley 1480 de 2011), y te devolvemos el valor pagado por el mismo medio de pago. Escribe a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> indicando la compra.</li>
          <li><b>Cobros duplicados o erróneos:</b> se devuelven íntegramente, sin importar el plazo, una vez verificados.</li>
          <li><b>Cupos y créditos de IA:</b> si ya usaste los cupos o los créditos comprados, descontamos lo consumido.</li>
          <li>Los reembolsos se hacen por el mismo medio de pago; el tiempo en que lo veas reflejado depende de tu banco o del procesador.</li>
          <li>Si crees que un cobro es incorrecto, escríbenos primero: lo revisamos y respondemos en los plazos de la sección 17.</li></ul></section>

      <section><h2>10. Inteligencia artificial</h2>
        <ul><li>Los «borradores con IA» son <b>sugerencias</b> para ahorrar tiempo al entrenador (por ejemplo, un borrador de plan o de propuesta de progresión). <b>Nunca se aplican solos</b>: el entrenador los revisa, los edita y es quien decide y responde por lo que entrega.</li>
          <li>Pueden contener errores. No son consejo médico ni nutricional.</li>
          <li>Para generarlos se envía información a <b>Google (Gemini)</b>, nuestro proveedor externo de modelos de IA, y solo cuando el alumno otorgó el consentimiento específico de IA. No usamos tus datos ni tus fotos para entrenar modelos propios.</li></ul></section>

      <section><h2>11. Uso aceptable</h2>
        <p>No puedes:</p>
        <ul><li>tratar datos de una persona sin su consentimiento, ni usar la plataforma para fines ilícitos, fraudulentos o discriminatorios;</li>
          <li>dar indicaciones que contradigan restricciones médicas informadas por el alumno;</li>
          <li>subir contenido ilegal, que infrinja derechos de terceros o que contenga imágenes de menores o de terceros sin autorización;</li>
          <li>intentar acceder a datos de otros usuarios, vulnerar la seguridad, hacer ingeniería inversa, extraer datos masivamente o sobrecargar la plataforma;</li>
          <li>revender o sublicenciar el acceso.</li></ul></section>

      <section><h2>12. Contenido y propiedad intelectual</h2>
        <ul><li>La plataforma, su diseño, su software, la biblioteca de ejercicios y la marca Rutinia son de Rutinia o de sus licenciantes. Te damos una licencia limitada, no exclusiva e intransferible para usarlos mientras tengas acceso.</li>
          <li>Lo que tú incorporas (tus planes, plantillas, mensajes, evaluaciones y fotos) <b>sigue siendo tuyo</b>. Nos autorizas únicamente a almacenarlo, procesarlo y mostrarlo para prestarte el servicio.</li></ul></section>

      <section><h2>13. Disponibilidad y soporte</h2>
        <p>Trabajamos para que Rutinia esté disponible de forma continua, pero <b>no garantizamos que funcione sin interrupciones ni errores</b>: puede haber mantenimientos, fallas de terceros (hosting, correo, pagos) o causas fuera de nuestro control. Atendemos el soporte por el chat de la plataforma y por <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p></section>

      <section><h2>14. Limitación de responsabilidad</h2>
        <ul><li>Rutinia es una herramienta de apoyo. <b>No responde</b> por lesiones, daños a la salud o resultados derivados de la ejecución de entrenamientos, de dietas o de decisiones tomadas por el entrenador o el alumno, ni por la información de salud que el alumno omita o declare de forma inexacta.</li>
          <li>Dentro de lo que la ley permite, nuestra responsabilidad total frente a ti por cualquier reclamación se limita al <b>valor que pagaste a Rutinia en los 12 meses anteriores</b> al hecho que la origina, y no incluye daños indirectos, lucro cesante ni pérdida de oportunidades.</li>
          <li><b>Estos límites no aplican</b> en caso de dolo o culpa grave, ni en lo que la ley no permita limitar, en particular los derechos irrenunciables del consumidor y las garantías legales.</li></ul></section>

      <section><h2>15. Fuerza mayor</h2>
        <p>Ninguna de las partes responde por incumplimientos causados por hechos fuera de su control razonable (por ejemplo fallas generales de internet o de proveedores de infraestructura, desastres, actos de autoridad), mientras duren y se avise cuando sea posible.</p></section>

      <section><h2>16. Cambios en estos términos</h2>
        <p>Podemos actualizar estos términos. Si el cambio es sustancial, te avisaremos por correo o dentro de la plataforma con al menos <b>15 días</b> de anticipación. Si sigues usando Rutinia después de esa fecha, entendemos que aceptas la nueva versión; si no estás de acuerdo, puedes cancelar y exportar tus datos. La versión vigente y su fecha están siempre al comienzo de esta página.</p></section>

      <section><h2>17. Peticiones, quejas y reclamos</h2>
        <p>Escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o desde Soporte en la plataforma. Respondemos dentro de los <b>15 días hábiles</b> siguientes a la recepción; si necesitamos más tiempo te lo informamos antes y te damos una fecha. Las solicitudes sobre tus datos personales siguen el procedimiento de la <a href="/privacidad">Política de privacidad</a>. Si no quedas conforme, puedes acudir a la <b>Superintendencia de Industria y Comercio</b> (consumidor y protección de datos).</p></section>

      <section><h2>18. Ley aplicable y jurisdicción</h2>
        <p>Estos términos se rigen por las leyes de la <b>República de Colombia</b>. Cualquier controversia se resolverá ante las autoridades competentes en Colombia, sin perjuicio de las competencias de la Superintendencia de Industria y Comercio y de los derechos del consumidor.</p></section>

      <section><h2>19. Documentos relacionados</h2>
        <p>Forman parte de estos términos la <a href="/privacidad">Política de privacidad y tratamiento de datos</a> y la <a href="/cookies">Política de cookies</a>. Si alguna parte de estos términos se declara inválida, el resto sigue vigente.</p></section>
    </LegalPage>
  );
}
