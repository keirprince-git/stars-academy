"use server";

import { requireAuth } from "@/lib/auth";
import { createBundle, getKitOrderForPlayer } from "@/lib/db";
import { KIT_YEAR } from "@/lib/kit";
import { redirect } from "next/navigation";

/**
 * Top-level server action for saving a bundle. Deliberately closes over NOTHING
 * (everything comes from the form, including the deposit ids via hidden inputs)
 * so there are no bound arguments to serialise — avoids the RSC serialization
 * pitfalls of inline server actions.
 */
export async function saveBundleAction(formData: FormData) {
  const auth = await requireAuth();
  if (auth.role !== "admin") redirect("/bank");

  const ids = formData
    .getAll("bundle_id")
    .map((v) => parseInt(v as string, 10))
    .filter((n) => !isNaN(n));

  const playerLines: Array<{ playerId: number; sessions: number; amount: number; package: string | null; notes: string | null }> = [];
  let i = 0;
  while (formData.has(`p_player_${i}`)) {
    const playerId = parseInt(formData.get(`p_player_${i}`) as string, 10);
    const sessions = parseInt(formData.get(`p_sessions_${i}`) as string, 10);
    const amount = parseFloat(formData.get(`p_amount_${i}`) as string);
    const pkg = ((formData.get(`p_pkg_${i}`) as string) || "").trim() || null;
    if (playerId && !isNaN(sessions) && sessions > 0 && !isNaN(amount) && amount > 0) {
      playerLines.push({ playerId, sessions, amount, package: pkg, notes: null });
    }
    i++;
  }

  const kitLines: Array<{ playerId: number; kitOrderId: number; amount: number; notes: string | null }> = [];
  let k = 0;
  while (formData.has(`k_player_${k}`)) {
    const playerId = parseInt(formData.get(`k_player_${k}`) as string, 10);
    const amount = parseFloat(formData.get(`k_amount_${k}`) as string);
    const notes = ((formData.get(`k_notes_${k}`) as string) || "").trim() || null;
    if (playerId && !isNaN(amount) && amount > 0) {
      const ko = getKitOrderForPlayer(playerId, KIT_YEAR);
      kitLines.push({ playerId, kitOrderId: ko ? ko.id : 0, amount, notes });
    }
    k++;
  }

  const categoryLines: Array<{ category: string; amount: number; notes: string | null }> = [];
  let j = 0;
  while (formData.has(`c_cat_${j}`)) {
    const category = ((formData.get(`c_cat_${j}`) as string) || "").trim();
    const amount = parseFloat(formData.get(`c_amount_${j}`) as string);
    const notes = ((formData.get(`c_notes_${j}`) as string) || "").trim() || null;
    if (category && !isNaN(amount) && amount > 0) {
      categoryLines.push({ category, amount, notes });
    }
    j++;
  }

  const qs = ids.map((id) => `ids=${id}`).join("&");
  try {
    createBundle(ids, playerLines, kitLines, categoryLines);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("NEXT_REDIRECT")) throw e;
    redirect(`/bank/bundle?${qs}&error=${encodeURIComponent(msg)}`);
  }
  redirect("/bank?success=bundled");
}
