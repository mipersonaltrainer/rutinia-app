# Correos de la plataforma (SMTP propio)

Rutinia envía correos solo desde **Supabase Auth**: confirmación de registro y recuperación de contraseña. El SMTP de prueba de Supabase tiene una cuota muy baja y no sirve para lanzar.

## Qué necesitas
1. Un **dominio propio** (p. ej. `rutinia.co`) y acceso a su DNS.
2. Una cuenta en un proveedor de correo transaccional: **Resend**, Brevo o Postmark (los tres sirven; Resend es el más simple).

## Pasos con Resend (los datos de conexión son los habituales; compruébalos en su panel)
1. Crea la cuenta en resend.com → **Domains** → añade tu dominio y copia los registros DNS que te pide (SPF, DKIM y, recomendado, DMARC) en tu proveedor de DNS. Espera a que diga **Verified**.
2. **API Keys** → crea una clave con permiso de envío. Es secreta: no la pegues en chats ni en el repositorio.
3. En Supabase → tu proyecto → **Authentication → Emails → SMTP Settings** → activa *Enable custom SMTP* y completa:
   - Sender email: `no-responder@TU_DOMINIO` · Sender name: `Rutinia`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: la clave del paso 2.
4. **Authentication → Rate Limits**: sube el límite de correos por hora a un valor acorde a tu volumen (la app ya limita a 3 solicitudes de recuperación por correo y hora).
5. **Authentication → Emails → Templates**: en «Reset password» usa el enlace `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` (así funciona desde cualquier dispositivo; ver `docs/DEPLOY.md`). Traduce los asuntos y textos al español.
6. Prueba de punta a punta con un correo real **de otro dominio** (Gmail): registrarse → llega el correo (revisa spam) → confirmar → entrar; luego «Olvidé mi contraseña».

## Pendiente de verificar tras configurarlo
Que los correos no caigan en spam (Gmail/Outlook) y que SPF/DKIM/DMARC pasen (en Gmail: «Mostrar original»).
