/**
 * Browser-side calls to the API's auth endpoints (same origin through the
 * /api rewrite, so the session cookie is set on this site).
 */
export type AuthResult = { ok: boolean; status: number; error?: string; fieldErrors?: Record<string, string> };

export async function authRequest(path: string, body: Record<string, unknown> = {}, method: "POST" | "DELETE" = "POST"): Promise<AuthResult> {
  try {
    const res = await fetch(`/api/auth/${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string> };
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : (data.error ?? "Something went wrong. Please try again."),
      fieldErrors: data.fieldErrors,
    };
  } catch {
    return { ok: false, status: 0, error: "Can't reach the server. Check your connection and try again." };
  }
}
