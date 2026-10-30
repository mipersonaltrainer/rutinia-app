// A server action is a network request. When the connection drops, `fetch` rejects and React turns that into an uncaught
// error: the page is replaced by a generic "This page couldn't load" and whatever the person typed is gone.
// guardAction turns *connection* failures (and only those) into the form's own error state, so the inputs stay and the
// message says what happened. Anything else — including Next's redirect/notFound signals — is rethrown untouched.

export const NETWORK_ERROR = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; lo que escribiste sigue ahí.";

export function isNetworkError(e: unknown, online: boolean = typeof navigator === "undefined" ? true : navigator.onLine): boolean {
  if (!(e instanceof Error)) return false;
  if ((e as { digest?: string }).digest) return false;                                   // Next control-flow errors (redirect, notFound) carry a digest
  if (e.name === "AbortError") return false;
  if (!online && e instanceof TypeError) return true;
  return e instanceof TypeError && /failed to fetch|network|load failed|fetch failed|connection|timeout/i.test(e.message);
}

export function guardAction<A extends unknown[], S>(action: (...a: A) => Promise<S>, onNetworkError: () => S): (...a: A) => Promise<S> {
  return async (...a: A) => {
    try { return await action(...a); }
    catch (e) { if (isNetworkError(e)) return onNetworkError(); throw e; }
  };
}

/** The common `{ error?: string; ok?: string }` form state. */
export const guardForm = <A extends unknown[], S extends { error?: string } | void>(action: (...a: A) => Promise<S>) => guardAction(action, () => ({ error: NETWORK_ERROR }) as S);
