import type { Player } from "./types";

/**
 * Try to guess which player(s) a bank transaction relates to,
 * based on the description and reference fields.
 *
 * Returns player IDs sorted by match confidence (best first).
 * Only returns matches that score above a threshold.
 */
export function guessPlayers(
  description: string,
  reference: string,
  players: Player[],
): number[] {
  const text = `${description} ${reference}`.toLowerCase();

  const scored: { id: number; score: number }[] = [];

  for (const p of players) {
    let score = 0;

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
