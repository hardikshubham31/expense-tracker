import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import { getAuth, getCtx, requireAuth, requireLedger } from "../middleware/context.js";
import { MAX_RECEIPT_BYTES, deleteReceiptFile, readReceiptFile, saveReceiptFile, sniffReceiptType } from "../services/receipts.js";
import { HttpError, badRequest, notFound } from "../http.js";
import { param } from "./body.js";

export const receiptsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } });

/** POST /api/receipts (multipart: expenseId, file): attach or replace an expense's receipt. */
receiptsRouter.post("/", requireLedger, upload.single("file"), async (req, res) => {
  const { ledger } = getCtx(req);
  const expenseId = typeof req.body?.expenseId === "string" ? req.body.expenseId : "";
  if (!req.file) throw badRequest("Choose a file.");

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, ledgerId: ledger.id },
    select: { id: true, receipt: { select: { storageKey: true } } },
  });
  if (!expense) throw notFound("Expense not found.");

  // The browser-supplied type isn't trusted: check the bytes
  const bytes = new Uint8Array(req.file.buffer);
  const mimeType = sniffReceiptType(bytes);
  if (!mimeType) throw new HttpError(415, "Use a JPEG, PNG, WebP or PDF file.");

  const storageKey = await saveReceiptFile(ledger.id, bytes);
  const originalName = req.file.originalname.slice(0, 200) || "receipt";
  await prisma.receipt.upsert({
    where: { expenseId: expense.id },
    create: { expenseId: expense.id, ledgerId: ledger.id, storageKey, mimeType, size: bytes.length, originalName },
    update: { storageKey, mimeType, size: bytes.length, originalName, createdAt: new Date() },
  });
  if (expense.receipt) await deleteReceiptFile(expense.receipt.storageKey);
  res.status(201).json({ ok: true });
});

/** GET /api/receipts/:id: only for members of the receipt's ledger. */
receiptsRouter.get("/:id", requireAuth, async (req, res) => {
  const { user } = getAuth(req);
  const receipt = await prisma.receipt.findFirst({
    where: { id: param(req, "id"), ledger: { members: { some: { userId: user.id, leftAt: null } } } },
    select: { storageKey: true, mimeType: true, originalName: true },
  });
  if (!receipt) throw notFound();
  const body = await readReceiptFile(receipt.storageKey).catch(() => null);
  if (!body) throw notFound();

  const filename = receipt.originalName.replace(/[^\w.\- ]+/g, "_");
  res
    .type(receipt.mimeType)
    .set("Content-Disposition", `inline; filename="${filename}"`)
    .set("Cache-Control", "private, max-age=3600")
    .set("X-Content-Type-Options", "nosniff")
    // Uploaded content must never run scripts in our origin
    .set("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
    .send(body);
});
