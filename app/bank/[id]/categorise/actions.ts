"use server";

import { requireAuth } from "@/lib/auth";
import {
  getBankTransaction,
  setTransactionSplits,
  clearTransactionSplits,
  type TransactionSplitInput,
} from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Top-level server actions for the categorise page. They close over nothing —
 * the transaction id comes from a hidden field — so there are no bound args to
 * serialise (avoids the inline-action RSC pitfalls).
 */
export async function saveSplitsAction(formData: FormData) {
  const auth = await requireAuth();
  if (auth.role !== "admin") redirect("/bank");

  const txnId = parseInt((formData.get("txn_id") as string) || "", 10);
  const txn = getBankTransaction(txnId);
  if (!txn) redirect("/bank");
  const totalAmount = txn!.deposit > 0 ? txn!.deposit : txn!.withdrawal;

  const lines: TransactionSplitInput[] = [];
  let i = 0;
  while (formData.has(`category_${i}`)) {
    const category = (formData.get(`category_${i}`) as string).trim();
    const amountRaw = formData.get(`amount_${i}`) as string;
    const notes = ((formData.get(`notes_${i}`) as string) || "").trim() || null;
    const amount = parseFloat(amountRaw);
    if (category && !isNaN(amount) && amount > 0) {
      lines.push({ category, amount, notes });
    }
    i++;
  }

  if (lines.length === 0) {
    redirect(`/bank/${txnId}/categorise?error=empty`);
  }

  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    redirect(`/bank/${txnId}/categorise?error=sum_mismatch&sum=${encodeURIComponent(sum.toFixed(2))}`);
  }

  try {
    setTransactionSplits(txnId, lines, auth.userId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("NEXT_REDIRECT")) throw e;
    redirect(`/bank/${txnId}/categorise?error=${encodeURIComponent(msg)}`);
  }
  redirect("/bank?success=categorised");
}

export async function clearSplitsAction(formData: FormData) {
  const auth = await requireAuth();
  if (auth.role !== "admin") redirect("/bank");
  const txnId = parseInt((formData.get("txn_id") as string) || "", 10);
  if (!txnId) redirect("/bank");
  clearTransactionSplits(txnId, auth.userId);
  redirect(`/bank/${txnId}/categorise?success=cleared`);
}
