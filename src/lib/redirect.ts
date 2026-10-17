/**
 * Only allow same-origin relative paths as post-login destinations,
 * so `?redirectTo=` can't be abused as an open redirect.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard") {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  return target;
}
