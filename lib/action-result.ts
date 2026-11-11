export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

// Server actions strip thrown error messages in production, so user-facing failures are returned instead.
export function fail(error: unknown, fallback = "Something went wrong. Please try again."): ActionResult<never> {
  const message = error instanceof Error && error.message ? error.message : fallback;
  return { ok: false, error: message };
}
