/* ── Transaction categories for Stars Academy accounts ── */
/* Categories are stored in the database and managed via the UI. */
/* This module re-exports helpers for convenience. */

import { getCategories, type CategoryRow } from "./db";

export type Category = CategoryRow;

export function getAllCategories(): Category[] {
  return getCategories();
}

export function getCategoryLabel(value: string): string {
  const cats = getCategories();
  return cats.find(c => c.value === value)?.label ?? value;
}

export function getCategoryType(value: string): "income" | "expense" | null {
  const cats = getCategories();
  return cats.find(c => c.value === value)?.type ?? null;
}
