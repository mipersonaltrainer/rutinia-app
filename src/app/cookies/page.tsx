import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de cookies", description: "Qué cookies y almacenamiento local usa Rutinia: solo los necesarios para iniciar sesión, proteger la cuenta y recordar preferencias. Sin publicidad ni analítica de terceros.", alternates: { canonical: "/cookies" } };

export default function Cookies() {
  return (
    <LegalPage title="Política de cookies" updated={LEGAL.updated}>
      <section><h2>1. Qué son</h2>
        <p>Las cookies son pequeños archivos que el sitio guarda en tu navegador. El almacenamiento local del navegador cumple una función parecida. Esta política explica cuáles usa {LEGAL.brand} y para qué.</p></section>

      <section><h2>2. Lo que usamos</h2>
        <p><b>Solo usamos cookies y almacenamiento estrictamente necesarios.</b> Por eso no mostramos un aviso para aceptarlas o rechazarlas: sin ellas la plataforma no puede funcionar.</p>
        <div className="overflow-x-auto"><table><thead><tr><th>Qué</th><th>Para qué</th><th>Duración</th></tr></thead><tbody>
          <tr><td>Cookies de sesión (autenticación)</td><td>Mantenerte con la sesión iniciada y proteger tu cuenta. Son <i>httpOnly</i> (los scripts de la página no pueden leerlas) y <i>secure</i>.</td><td>Mientras dure tu sesión, renovable</td></tr>
          <tr><td>Verificación anti-bots (Cloudflare Turnstile)</td><td>Comprobar que quien se registra o inicia sesión es una persona. La carga Cloudflare en las páginas de registro e inicio de sesión.</td><td>La define Cloudflare</td></tr>
          <tr><td>Almacenamiento local del navegador</td><td>Recordar preferencias de la interfaz, por ejemplo haber descartado el aviso para instalar la aplicación en tu dispositivo.</td><td>Hasta que lo borres</td></tr>
        </tbody></table></div></section>

      <section><h2>3. Lo que no usamos</h2>
        <ul><li>No usamos cookies de publicidad ni de seguimiento entre sitios.</li>
          <li>No usamos herramientas de analítica de terceros que te identifiquen.</li>
          <li>No vendemos ni compartimos información de navegación con fines comerciales.</li></ul>
        <p>Si en el futuro incorporamos otras, actualizaremos esta política y te pediremos tu consentimiento antes de activarlas.</p></section>

      <section><h2>4. Cómo controlarlas</h2>
        <p>Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las necesarias, no podrás iniciar sesión ni usar la plataforma. El tratamiento de tus datos personales se explica en la <a href="/privacidad">Política de privacidad</a>.</p></section>

      <section><h2>5. Contacto</h2>
        <p>Para dudas sobre esta política escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p></section>
    </LegalPage>
  );
}
