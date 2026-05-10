/* ── Transaction categories for Stars Academy accounts ── */

export interface Category {
  value: string;
  label: string;
  type: "income" | "expense";
}

export const CATEGORIES: Category[] = [
  // Income
  { value: "session_fees",    label: "Session fees",     type: "income" },
  { value: "kit_sales",       label: "Kit sales",        type: "income" },
  { value: "other_income",    label: "Other income",     type: "income" },

  // Expenses
  { value: "coaching_fees",   label: "Coaching fees",    type: "expense" },
  { value: "pitch_hire",      label: "Pitch / venue hire", type: "expense" },
  { value: "equipment_kit",   label: "Equipment & kit",  type: "expense" },
  { value: "bank_charges",    label: "Bank charges",     type: "expense" },
  { value: "other_expense",   label: "Other expense",    type: "expense" },
];

export const INCOME_CATEGORIES = CATEGORIES.filter(c => c.type === "income");
export const EXPENSE_CATEGORIES = CATEGORIES.filter(c => c.type === "expense");

export function getCategoryLabel(value: string): string {
  return CATEGORIES.find(c => c.value === value)?.label ?? value;
}

export function getCategoryType(value: string): "income" | "expense" | null {
  return CATEGORIES.find(c => c.value === value)?.type ?? null;
}
