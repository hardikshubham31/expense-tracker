/**
 * Same-origin proxy to the Express API: the browser only ever talks to this
 * site, so the session cookie stays first-party and no CORS is needed.
 *
 * A route handler instead of a next.config rewrite because rewrite targets are
 * fixed at build time; this reads API_URL at runtime, so one build works
 * against any API address.
 */

// Hop-by-hop or recomputed headers that must not be copied across
const DROP_REQUEST = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "content-length", "expect"]);
const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length", "set-cookie"]);

async function proxy(request: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const incoming = new URL(request.url);
  const target = `${process.env.API_URL ?? "http://localhost:4000"}/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key)) headers.set(key, value);
  });
  // The API trusts this one local hop for the client IP (rate limits) and protocol
  headers.set("x-forwarded-for", request.headers.get("x-forwarded-for") ?? "127.0.0.1");
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-forwarded-host", incoming.host);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error -- Node fetch needs duplex for streamed request bodies (not in the DOM types)
      duplex: hasBody ? "half" : undefined,
      // Pass redirects (Google sign-in) straight to the browser
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ ok: false, error: "The server is unavailable. Please try again in a moment." }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key)) out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE, proxy as HEAD };
