import { Router } from "express";
import { z } from "zod";
import { COLOR_SLOTS } from "@expense/shared/categories";
import { parseAmount } from "@expense/shared/money";
import { prisma } from "../db.js";
import { getCtx } from "../middleware/context.js";
import { getCategories } from "../services/data.js";
import { firstErrors, invalid, isUniqueViolation, notFound, text } from "../http.js";
import { bodyOf, param, str } from "./body.js";

export const categoriesRouter = Router();

const categorySchema = z.object({
  name: text(40).min(1, "Give the category a name."),
  color: z.enum(COLOR_SLOTS, { error: "Pick a color." }),
  budget: z.string().optional(),
});

const DUPLICATE_NAME = { name: "There's already a category with this name." };

function parseCategory(body: Record<string, unknown>, currency: string) {
  const parsed = categorySchema.safeParse({ name: str(body, "name"), color: str(body, "color"), budget: str(body, "budget") });
  if (!parsed.success) throw invalid(firstErrors(parsed.error));

  const rawBudget = parsed.data.budget?.trim();
  const budget = rawBudget ? parseAmount(rawBudget, currency) : null;
  if (rawBudget && budget === null) throw invalid({ budget: "Enter a budget greater than zero, or leave it empty." });
  return { name: parsed.data.name, color: parsed.data.color, budget };
}

/** The unique index is case-sensitive; also treat "groceries" and "Groceries" as the same. */
async function nameTaken(ledgerId: string, name: string, exceptId?: string) {
  const existing = await prisma.category.findFirst({
    where: { ledgerId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(existing);
}

categoriesRouter.get("/", async (req, res) => {
  res.json(await getCategories(getCtx(req)));
});

categoriesRouter.post("/", async (req, res) => {
  const { ledger } = getCtx(req);
  const data = parseCategory(bodyOf(req), ledger.currency);
  if (await nameTaken(ledger.id, data.name)) throw invalid(DUPLICATE_NAME);
  try {
    const category = await prisma.category.create({ data: { ...data, ledgerId: ledger.id }, select: { id: true } });
    res.status(201).json({ ok: true, id: category.id });
  } catch (error) {
    if (isUniqueViolation(error)) throw invalid(DUPLICATE_NAME);
    throw error;
  }
});

categoriesRouter.patch("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  const id = param(req, "id");
  const data = parseCategory(bodyOf(req), ledger.currency);
  if (await nameTaken(ledger.id, data.name, id)) throw invalid(DUPLICATE_NAME);
  try {
    const { count } = await prisma.category.updateMany({ where: { id, ledgerId: ledger.id }, data });
    if (!count) throw notFound("That category no longer exists.");
  } catch (error) {
    if (isUniqueViolation(error)) throw invalid(DUPLICATE_NAME);
    throw error;
  }
  res.json({ ok: true, id });
});

/** Expenses in a deleted category become uncategorized (onDelete: SetNull). */
categoriesRouter.delete("/:id", async (req, res) => {
  const { ledger } = getCtx(req);
  await prisma.category.deleteMany({ where: { id: param(req, "id"), ledgerId: ledger.id } });
  res.json({ ok: true });
});
