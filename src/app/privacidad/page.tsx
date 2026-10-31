import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidad y tratamiento de datos", description: "Qué datos trata Rutinia, para qué, con qué autorización, quién puede verlos, cuánto tiempo los conservamos y cómo ejercer tus derechos de habeas data.", alternates: { canonical: "/privacidad" } };

export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad y tratamiento de datos personales" updated={LEGAL.updated}>
      <section><h2>1. Responsable del tratamiento</h2>
        <p><b>{LEGAL.brand}</b> (plataforma <b>{LEGAL.site}</b>) es la responsable del tratamiento de los datos personales descritos en esta política. Para cualquier consulta, reclamo o ejercicio de tus derechos escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o desde la sección Soporte de la plataforma. Esta política se expide conforme al artículo 15 de la Constitución Política, la Ley 1581 de 2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y demás normas que los modifiquen.</p></section>

      <section><h2>2. A quién aplica</h2>
        <p>A <b>entrenadores</b>, a <b>alumnos</b> invitados por un entrenador y a las personas que visitan el sitio o nos escriben. En esta política, «tú» eres el titular de los datos.</p></section>

      <section><h2>3. Qué datos tratamos</h2>
        <ul><li><b>Entrenadores:</b> nombre, correo, datos de la suscripción y de los pagos (referencias de transacción; <b>nunca números de tarjeta</b>), mensajes de soporte y registros de uso y seguridad.</li>
          <li><b>Alumnos:</b> nombre, correo, fecha de nacimiento y lo que decidan aportar: evaluación inicial, medidas corporales, registros de entrenamiento, molestias o dolor, mensajes con su entrenador y fotos de progreso.</li>
          <li><b>Datos sensibles (de salud):</b> lesiones, dolor, antecedentes relevantes para el ejercicio, medidas corporales e indicadores estimados, y las fotos de progreso, que pueden revelar aspectos de tu salud o físico. Ver sección 5.</li>
          <li><b>Datos técnicos:</b> dirección IP, tipo de dispositivo y navegador, fecha y hora de acceso, y registros de seguridad. Si activas las notificaciones del navegador, el identificador técnico que el navegador nos entrega para enviártelas.</li>
          <li><b>Visitantes:</b> los datos que nos escribas por correo o por el formulario de registro.</li></ul>
        <p><b>No tratamos datos de niños, niñas ni adolescentes.</b> La plataforma es para mayores de 18 años; si detectamos que un titular es menor, suspendemos el tratamiento y lo eliminamos cuando corresponda.</p></section>

      <section><h2>4. Para qué los usamos (finalidades)</h2>
        <ul><li>Crear y administrar tu cuenta, e invitar y conectar a entrenadores con sus alumnos.</li>
          <li>Prestar el servicio: evaluar, planificar, registrar y medir el progreso; mostrar tus datos a tu entrenador solo si lo autorizaste.</li>
          <li>Calcular indicadores (IMC, gasto energético estimado, % de grasa estimado) con fórmulas documentadas. Son estimaciones, no diagnósticos.</li>
          <li>Generar borradores con inteligencia artificial para tu entrenador, solo con tu consentimiento específico.</li>
          <li>Gestionar suscripciones, pagos, reembolsos y facturación.</li>
          <li>Enviarte avisos del servicio (seguridad, pagos, respuestas de soporte) y, si lo autorizaste, recordatorios y comunicaciones.</li>
          <li>Atender soporte, peticiones, quejas y reclamos.</li>
          <li>Garantizar la seguridad, prevenir fraude y abuso, y dejar trazabilidad de los accesos a datos sensibles.</li>
          <li>Cumplir obligaciones legales, contables y tributarias, y atender requerimientos de autoridades competentes.</li></ul>
        <p><b>No vendemos tus datos, no los cedemos a terceros con fines comerciales y no los usamos para publicidad.</b> Tus fotos y datos de salud nunca se usan para entrenar modelos de IA. La mejora del producto con datos anonimizados es opcional y hoy no se realiza.</p></section>

      <section><h2>5. Autorización y datos sensibles</h2>
        <ul><li>Tratamos tus datos con tu <b>autorización previa, expresa e informada</b>, otorgada al crear la cuenta y, para cada finalidad específica, en la pantalla de Privacidad. <b>Ningún consentimiento viene premarcado.</b></li>
          <li>Los datos de salud y las fotos son <b>datos sensibles</b>. <b>No estás obligado a autorizar su tratamiento</b> ni a responder preguntas sobre ellos; sin esa autorización el entrenador no los verá ni se usarán, aunque algunas funciones del servicio no podrán prestarse.</li>
          <li>Puedes <b>ver, otorgar y retirar</b> cada consentimiento cuando quieras desde Privacidad: datos personales, datos de salud, compartir con mi entrenador, fotos de progreso, recordatorios y comunicaciones, asistente de IA y mejora del producto. Retirar «compartir con mi entrenador» o «fotos» corta el acceso de tu entrenador de inmediato.</li>
          <li>La autorización de datos personales es necesaria para mantener tu cuenta; si la retiras, puedes eliminarla.</li></ul></section>

      <section><h2>6. Quién puede ver tus datos</h2>
        <ul><li><b>Tu entrenador:</b> solo mientras exista la relación activa y mantengas los consentimientos de compartir y, según el dato, de salud o fotos. Cada vez que un entrenador abre tus fotos queda un registro.</li>
          <li><b>El equipo de soporte de Rutinia:</b> accede al canal de soporte y a nombres de entrenadores, <b>no</b> a datos de salud, fotos, mensajes ni planes de los alumnos. Usan cuentas individuales con verificación en dos pasos y cada acceso queda registrado.</li>
          <li><b>Proveedores que tratan datos por encargo nuestro</b> (sección 7).</li>
          <li><b>Autoridades</b>, cuando la ley lo exija.</li></ul></section>

      <section><h2>7. Proveedores, transmisión y transferencia internacional</h2>
        <p>Para operar usamos proveedores que tratan datos por nuestra cuenta, con medidas de seguridad y obligaciones de confidencialidad. Parte de ellos opera fuera de Colombia, principalmente en <b>Estados Unidos</b>; al aceptar esta política autorizas esa transmisión y transferencia, que hacemos solo para prestarte el servicio.</p>
        <div className="overflow-x-auto"><table><thead><tr><th>Proveedor</th><th>Para qué</th><th>Qué datos</th></tr></thead><tbody>
          <tr><td>Supabase (servidores en AWS, EE. UU.)</td><td>Base de datos, autenticación y almacenamiento privado de fotos</td><td>Todos los de la cuenta y la plataforma</td></tr>
          <tr><td>Vercel (EE. UU.)</td><td>Alojamiento de la aplicación</td><td>Datos técnicos de acceso y contenido que se muestra</td></tr>
          <tr><td>Bold</td><td>Pagos en pesos</td><td>Datos de pago que tú das al procesador; a nosotros nos llega la referencia</td></tr>
          <tr><td>PayPal</td><td>Pagos en dólares</td><td>Ídem</td></tr>
          <tr><td>Resend</td><td>Envío de correos del servicio</td><td>Correo y contenido del aviso</td></tr>
          <tr><td>Cloudflare Turnstile</td><td>Verificación anti-bots al registrarte o iniciar sesión</td><td>Datos técnicos del navegador</td></tr>
          <tr><td>Google (opcional)</td><td>Iniciar sesión con tu cuenta de Google</td><td>Nombre y correo que Google comparte</td></tr>
          <tr><td>Proveedor de modelos de IA (Anthropic, OpenAI o Google, según el configurado)</td><td>Borradores con IA para el entrenador</td><td>Solo con tu consentimiento de IA, la información necesaria para el borrador</td></tr>
          <tr><td>Servicios de notificaciones de tu navegador</td><td>Avisos push si los activas</td><td>Identificador técnico; el aviso no incluye datos de salud</td></tr>
        </tbody></table></div></section>

      <section><h2>8. Tus derechos como titular</h2>
        <p>Conforme al artículo 8 de la Ley 1581 de 2012 puedes:</p>
        <ul><li><b>Conocer, actualizar y rectificar</b> tus datos.</li>
          <li>Solicitar <b>prueba de la autorización</b> que otorgaste.</li>
          <li>Ser informado sobre el <b>uso</b> que se ha dado a tus datos.</li>
          <li>Presentar quejas ante la <b>Superintendencia de Industria y Comercio (SIC)</b> por infracciones a la ley.</li>
          <li><b>Revocar la autorización</b> y/o solicitar la <b>supresión</b> de tus datos cuando no se respeten los principios o derechos, o ya no sean necesarios.</li>
          <li><b>Acceder de forma gratuita</b> a tus datos personales.</li></ul>
        <p><b>Lo puedes hacer tú mismo en la plataforma:</b> desde Privacidad exportas todos tus datos en un archivo, ajustas tus consentimientos y eliminas tu cuenta (te pedimos tu contraseña y confirmar escribiendo «ELIMINAR»). Los entrenadores cierran su cuenta desde su sección de cuenta.</p></section>

      <section><h2>9. Cómo presentar consultas y reclamos</h2>
        <ul><li><b>Canal:</b> <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o Soporte dentro de la plataforma. Indica tu nombre, el correo de tu cuenta y qué solicitas. Podemos pedirte que confirmes tu identidad.</li>
          <li><b>Consultas:</b> las respondemos en máximo <b>10 días hábiles</b>. Si no podemos, te informamos el motivo y la nueva fecha, que no superará <b>5 días hábiles</b> adicionales.</li>
          <li><b>Reclamos</b> (corrección, actualización, supresión o por presunto incumplimiento): los resolvemos en máximo <b>15 días hábiles</b>; si no podemos, te informamos y la nueva fecha no superará <b>8 días hábiles</b> adicionales. Si el reclamo está incompleto, te pedimos completarlo en <b>5 días</b>; pasados <b>2 meses</b> sin respuesta se entiende que desististe.</li>
          <li>La supresión no procede cuando exista un deber legal o contractual de conservar el dato (por ejemplo, los registros de pagos).</li>
          <li>Solo puedes acudir a la SIC después de agotar este trámite con nosotros.</li></ul></section>

      <section><h2>10. Seguridad</h2>
        <p>Aplicamos medidas técnicas y organizativas razonables para proteger tus datos, entre ellas: conexiones cifradas; acceso a los datos restringido por reglas en la base de datos, de modo que cada usuario solo vea lo suyo; fotos en un espacio privado, sin enlaces públicos y con enlaces temporales que se generan tras comprobar el acceso; eliminación de metadatos (como la ubicación) de las fotos al subirlas; verificación anti-bots; sesiones protegidas; segundo factor obligatorio para el equipo de soporte y registro de sus accesos; y copias de seguridad. Ningún sistema es infalible: si ocurre un incidente que afecte tus datos, te lo informaremos y lo reportaremos a la autoridad cuando la ley lo exija.</p>
        <p>Tú también ayudas: usa una contraseña única, no la compartas y cierra sesión en equipos ajenos.</p></section>

      <section><h2>11. Cuánto tiempo conservamos tus datos</h2>
        <ul><li><b>Mientras tengas la cuenta</b> y sea necesario para prestar el servicio.</li>
          <li><b>Si eliminas la cuenta de alumno:</b> borramos tu evaluación, medidas, entrenamientos, mensajes y fotos (archivos y registros).</li>
          <li><b>Si cierras la cuenta de entrenador:</b> anonimizamos tu perfil, archivamos tus alumnos y planes y bloqueamos el acceso.</li>
          <li><b>Pagos y facturación:</b> conservamos los registros durante el tiempo que exijan las normas contables y tributarias colombianas, aunque se cierre la cuenta.</li>
          <li><b>Registros de seguridad y de acceso:</b> el tiempo necesario para proteger la plataforma y atender reclamaciones.</li>
          <li><b>Copias de seguridad:</b> se rotan y eliminan de forma periódica, por lo que un dato suprimido desaparece de ellas con la rotación.</li>
          <li>Cuando ya no haya finalidad ni deber legal, eliminamos o anonimizamos el dato.</li></ul>
        <p>La vigencia de nuestras bases de datos es la de la relación contigo más el tiempo de las obligaciones legales aplicables.</p></section>

      <section><h2>12. Cookies y tecnologías similares</h2>
        <p>Usamos solo las necesarias para que la plataforma funcione. Más detalle en la <a href="/cookies">Política de cookies</a>.</p></section>

      <section><h2>13. Cambios en esta política</h2>
        <p>Si cambiamos esta política de forma sustancial, te avisaremos por correo o dentro de la plataforma antes de que aplique y, cuando la ley lo requiera, te pediremos de nuevo tu autorización. La versión vigente y su fecha están al comienzo de esta página.</p></section>
    </LegalPage>
  );
}
