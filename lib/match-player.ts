import type { Player } from "./types";

/**
 * Extract the payer's name from a TAJ NIP narrative, e.g.
 * "NIP: ATULUKUBENJAMINAhmadto THEST" -> "ATULUKUBENJAMIN".
 * The payer is the leading run of capitals after "NIP:". If that run is
 * immediately followed by a lowercase letter, its last capital is the start of
 * the payer's memo (the "A" of "Ahmad") and is dropped.
 */
export function extractPayer(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = description.match(/^\s*NIP:?\s*(.*)$/);
  if (!m) return null;
  const s = m[1].replace(/\s+/g, "");
  const run = s.match(/^[A-Z]+/);
  if (!run) return null;
  let tok = run[0];
  const next = s.charAt(tok.length);
  if (next >= "a" && next <= "z" && tok.length > 1) tok = tok.slice(0, -1);
  return tok;
}

/**
 * Same payer if one name is a prefix of the other (narratives are truncated at
 * different points) and the shorter is long enough to be distinctive — 10+
 * letters, so a bare first name like "MOHAMMED" can't link two different payers.
 */
export function samePayer(a: string | null, b: string | null, minLen = 10): boolean {
  if (!a || !b) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= minLen && l.startsWith(s);
}

export interface PayerHistoryRow { description: string; player_id: number; trans_date: string }

/** Players previously allocated from the same payer — most frequent, then most recent, first. */
export function payerHistoryMatches(description: string, history: PayerHistoryRow[]) {
  const payer = extractPayer(description);
  const byPlayer = new Map<number, { playerId: number; count: number; lastDate: string }>();
  if (payer) {
    for (const h of history) {
      if (!samePayer(payer, extractPayer(h.description))) continue;
      const cur = byPlayer.get(h.player_id) ?? { playerId: h.player_id, count: 0, lastDate: "" };
      cur.count += 1;
      if (h.trans_date > cur.lastDate) cur.lastDate = h.trans_date;
      byPlayer.set(h.player_id, cur);
    }
  }
  const matches = [...byPlayer.values()].sort((x, y) => y.count - x.count || y.lastDate.localeCompare(x.lastDate));
  return { payer, matches };
}

/**
 * Try to guess which player(s) a bank transaction relates to, based on the
 * description and reference fields and — if `history` is given — on which
 * children the same payer has paid for before (the strongest signal).
 *
 * Returns player IDs sorted by match confidence (best first).
 * Only returns matches that score above a threshold.
 */
export function guessPlayers(
  description: string,
  reference: string,
  players: Player[],
  history: PayerHistoryRow[] = [],
): number[] {
  const text = `${description} ${reference}`.toLowerCase();
  const payerHits = new Map(payerHistoryMatches(description, history).matches.map((m) => [m.playerId, m.count]));

  const scored: { id: number; score: number }[] = [];

  for (const p of players) {
    let score = 0;

    // Same payer has paid for this child before — outranks a bare name match
    const prior = payerHits.get(p.id);
    if (prior) score += 12 + Math.min(prior - 1, 3);

    // Check player name (most common in descriptions)
    const name = p.name.toLowerCase();
    // Handle names with parenthetical qualifiers like "Daniel (3D)"
    const baseName = name.replace(/\s*\(.*\)/, "").trim();

    if (baseName.length >= 3 && text.includes(baseName)) {
      // Longer name matches are more reliable
      score += baseName.length >= 5 ? 10 : 6;
    }

    // Check individual words of multi-word names
    const nameParts = baseName.split(/\s+/);
    if (nameParts.length > 1) {
      for (const part of nameParts) {
        if (part.length >= 3 && text.includes(part)) {
          score += 3;
        }
      }
    }

    // Check qualifier in parentheses (e.g. "3D", "MannyBro")
    const qualifier = name.match(/\(([^)]+)\)/)?.[1];
    if (qualifier && qualifier.length >= 2 && text.includes(qualifier.toLowerCase())) {
      score += 4;
    }

    // Check player code
    if (text.includes(p.code.toLowerCase())) {
      score += 8;
    }

    // Check parent name if available
    if (p.parent_name) {
      const parentName = p.parent_name.toLowerCase();
      if (parentName.length >= 3 && text.includes(parentName)) {
        score += 10;
      }
      // Check surname (last word)
      const parentParts = parentName.split(/\s+/);
      for (const part of parentParts) {
        if (part.length >= 4 && text.includes(part)) {
          score += 5;
        }
      }
    }

    if (score > 0) {
      scored.push({ id: p.id, score });
    }
  }

  // Sort by score descending, return IDs
  scored.sort((a, b) => b.score - a.score);

  // Only return meaningful matches (score >= 5)
  return scored.filter(s => s.score >= 5).map(s => s.id);
}
