import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

/**
 * Receipt files live on local disk outside /public and are only served through
 * an authenticated route. Swap these three functions for S3/R2 in production.
 */
const ROOT = env.RECEIPTS_DIR || path.join(process.cwd(), "storage", "receipts");

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Detect the real type from magic bytes; the browser-supplied type isn't trusted. */
export function sniffReceiptType(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/** Resolve a storage key inside ROOT; anything escaping it is rejected. */
function resolve(key: string) {
  const root = path.resolve(ROOT);
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return file;
}

export async function saveReceiptFile(ledgerId: string, bytes: Uint8Array) {
  const key = `${ledgerId}/${randomUUID()}`;
  const file = resolve(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return key;
}

export async function readReceiptFile(key: string) {
  return fs.readFile(resolve(key));
}

export async function deleteReceiptFile(key: string) {
  await fs.rm(resolve(key), { force: true });
}
