/**
 * Structured data. The payload is built by the server from constants (never from user input) and `<` is escaped so the
 * JSON can never close the script element. Type `application/ld+json` is a data block: the CSP's script-src does not apply to it.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
