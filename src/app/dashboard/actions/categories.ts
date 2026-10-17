"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLedger } from "@/lib/session";
import { COLOR_SLOTS } from "@/lib/categories";
import { parseAmount } from "@/lib/money";
import { fail, failMessage, firstErrors, isUniqueViolation, text, type ActionResult } from "@/lib/action-utils";

const categorySchema = z.object({
  name: text(40).min(1, "Give the category a name."),
  color: z.enum(COLOR_SLOTS, { error: "Pick a color." }),
  budget: z.string().optional(),
});

const DUPLICATE_NAME = { name: "There's already a category with this name." };

function parseCategory(formData: FormData, currency: string) {
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const rawBudget = parsed.data.budget?.trim();
  const budget = rawBudget ? parseAmount(rawBudget, currency) : null;
  if (rawBudget && budget === null) return { errors: { budget: "Enter a budget greater than zero, or leave it empty." } };

  return { data: { name: parsed.data.name, color: parsed.data.color, budget } };
}

/** The unique index is case-sensitive; also treat "groceries" and "Groceries" as the same. */
async function nameTaken(ledgerId: string, name: string, exceptId?: string) {
  const existing = await prisma.category.findFirst({
    where: { ledgerId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  const { data, errors } = parseCategory(formData, ledger.currency);
  if (!data) return fail(errors!);
  if (await nameTaken(ledger.id, data.name)) return fail(DUPLICATE_NAME);

  try {
    const category = await prisma.category.create({ data: { ...data, ledgerId: ledger.id }, select: { id: true } });
    refresh();
    return { ok: true, id: category.id };
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DUPLICATE_NAME);
    throw error;
  }
}

export async function updateCategory(id: string, formData: FormData): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  const { data, errors } = parseCategory(formData, ledger.currency);
  if (!data) return fail(errors!);
  if (await nameTaken(ledger.id, data.name, id)) return fail(DUPLICATE_NAME);

  try {
    const { count } = await prisma.category.updateMany({ where: { id, ledgerId: ledger.id }, data });
    if (!count) return failMessage("That category no longer exists.");
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DUPLICATE_NAME);
    throw error;
  }
  refresh();
  return { ok: true, id };
}

/** Expenses in a deleted category become uncategorized (onDelete: SetNull). */
export async function deleteCategory(id: string): Promise<ActionResult> {
  const { ledger } = await requireLedger();
  await prisma.category.deleteMany({ where: { id, ledgerId: ledger.id } });
  refresh();
  return { ok: true };
}
