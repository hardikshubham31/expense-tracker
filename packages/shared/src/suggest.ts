/** Category suggestions for the expense form. Client-safe, no I/O. */

type Hint = { description: string; categoryId: string | null };
type Category = { id: string; name: string };

/** Keyword fallbacks, keyed by the default category names (only used if the ledger has that category). */
const KEYWORDS: Record<string, string[]> = {
  "Food & Dining": ["restaurant", "lunch", "dinner", "breakfast", "cafe", "coffee", "zomato", "swiggy", "pizza", "burger", "snack", "tea", "starbucks", "bakery"],
  Groceries: ["grocery", "groceries", "supermarket", "bigbasket", "blinkit", "zepto", "dmart", "vegetables", "fruits", "milk", "instamart"],
  Transport: ["uber", "ola", "rapido", "metro", "bus", "taxi", "cab", "auto", "fuel", "petrol", "diesel", "parking", "toll", "train"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "clothes", "shoes", "mall", "ikea"],
  "Bills & Utilities": ["electricity", "water", "gas", "internet", "wifi", "broadband", "mobile", "recharge", "rent", "bill", "maintenance", "insurance", "emi"],
  Entertainment: ["netflix", "spotify", "movie", "cinema", "concert", "prime", "hotstar", "youtube", "game", "tickets", "bookmyshow"],
  Health: ["pharmacy", "doctor", "hospital", "medicine", "clinic", "gym", "dental", "apollo", "lab", "medical"],
  Travel: ["flight", "hotel", "airbnb", "booking", "trip", "irctc", "makemytrip", "holiday", "visa"],
};

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

/** Past exact match, then a past expense sharing the first word, then keywords. */
export function suggestCategory(description: string, hints: Hint[], categories: Category[]): string | null {
  const text = description.trim().toLowerCase();
  if (text.length < 3) return null;
  const valid = new Set(categories.map((c) => c.id));

  const exact = hints.find((h) => h.categoryId && h.description.toLowerCase() === text && valid.has(h.categoryId));
  if (exact) return exact.categoryId;

  const first = words(text)[0];
  if (first) {
    const similar = hints.find((h) => h.categoryId && valid.has(h.categoryId) && words(h.description)[0] === first);
    if (similar) return similar.categoryId;
  }

  const tokens = new Set(words(text));
  for (const [name, keys] of Object.entries(KEYWORDS)) {
    if (keys.some((k) => tokens.has(k))) {
      const category = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (category) return category.id;
    }
  }
  return null;
}
