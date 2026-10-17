/** Split `amount` hundredths equally; the leftover hundredths go to the first members. */
export function equalSplit(amount: number, memberIds: string[]) {
  const base = Math.floor(amount / memberIds.length);
  const remainder = amount - base * memberIds.length;
  return memberIds.map((memberId, i) => ({ memberId, amount: base + (i < remainder ? 1 : 0) }));
}

export type Transfer = { from: string; to: string; amount: number };

/**
 * Net position per member: positive = is owed money, negative = owes.
 * paid - share of expenses, adjusted by settlements (paying someone back raises your net).
 */
export function computeBalances(
  memberIds: string[],
  expenses: { paidById: string; amount: number; splits: { memberId: string; amount: number }[] }[],
  settlements: { fromMemberId: string; toMemberId: string; amount: number }[],
) {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);

  for (const e of expenses) {
    if (e.splits.length === 0) continue; // not shared
    add(e.paidById, e.amount);
    for (const s of e.splits) add(s.memberId, -s.amount);
  }
  for (const s of settlements) {
    add(s.fromMemberId, s.amount);
    add(s.toMemberId, -s.amount);
  }
  return net;
}

/** Greedy settle-up: fewest transfers in practice (largest debtor pays largest creditor). */
export function suggestTransfers(net: Map<string, number>): Transfer[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return transfers;
}
