import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readReceiptFile } from "@/lib/receipts";

/** Serve a receipt to members of its ledger only. */
export async function GET(request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const receipt = await prisma.receipt.findFirst({
    where: { id, ledger: { members: { some: { userId: session.user.id, leftAt: null } } } },
    select: { storageKey: true, mimeType: true, originalName: true },
  });
  if (!receipt) return new Response("Not found", { status: 404 });

  const body = await readReceiptFile(receipt.storageKey).catch(() => null);
  if (!body) return new Response("Not found", { status: 404 });

  const filename = receipt.originalName.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Uploaded content must never run scripts in our origin
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
