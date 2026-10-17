import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { MAX_RECEIPT_BYTES, deleteReceiptFile, saveReceiptFile, sniffReceiptType } from "@/lib/receipts";

/** Upload (or replace) the receipt for an expense in the active ledger. multipart: expenseId, file */
export async function POST(request: Request) {
  if (!(await auth.api.getSession({ headers: await headers() }))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { ledger } = await requireLedger();

  const form = await request.formData();
  const expenseId = String(form.get("expenseId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_RECEIPT_BYTES) return Response.json({ error: "Receipts can be up to 5 MB." }, { status: 413 });

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, ledgerId: ledger.id },
    select: { id: true, receipt: { select: { id: true, storageKey: true } } },
  });
  if (!expense) return Response.json({ error: "Expense not found." }, { status: 404 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffReceiptType(bytes);
  if (!mimeType) return Response.json({ error: "Use a JPEG, PNG, WebP or PDF file." }, { status: 415 });

  const storageKey = await saveReceiptFile(ledger.id, bytes);
  const originalName = file.name.slice(0, 200) || "receipt";
  await prisma.receipt.upsert({
    where: { expenseId: expense.id },
    create: { expenseId: expense.id, ledgerId: ledger.id, storageKey, mimeType, size: bytes.length, originalName },
    update: { storageKey, mimeType, size: bytes.length, originalName, createdAt: new Date() },
  });
  if (expense.receipt) await deleteReceiptFile(expense.receipt.storageKey);
  return Response.json({ ok: true });
}
