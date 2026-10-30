"use client";
import { useState } from "react";

/**
 * Fields that only a script touches: the signed time token and a hidden "website" input (see src/lib/auth/antibot.ts).
 * The token is captured ONCE. A server action that sets cookies makes Next re-render the page and issue a fresh token; if the
 * form adopted it, a person who retries right after a response would look like a script (age ≈ 0) and be silently ignored.
 */
export function AntibotFields({ token }: { token: string }) {
  const [issued] = useState(token);
  return (
    <>
      <input type="hidden" name="ft" value={issued} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>No llenar este campo<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
    </>
  );
}
