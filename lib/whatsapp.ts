/* ── WhatsApp message templates for Stars Academy ──── */

import { getAllSettings } from "./db";

export interface ChaseMessageParams {
  playerName: string;
  balance: number;          // sessions remaining (can be negative)
  parentName?: string | null;
}

/**
 * Generate a payment chase message for a player's parent.
 * Uses the template and bank details from the settings table.
 * Returns the message text (ready to URL-encode for wa.me).
 *
 * Template placeholders:
 *   {{player}}       — player name
 *   {{balance_line}} — auto-generated balance description
 *   {{bank_name}}    — account name from settings
 *   {{bank_bank}}    — bank name from settings
 *   {{bank_account}} — account number from settings
 *   {{coach_phone}}  — coach phone from settings
 *   {{parent}}       — parent's first name (or "there")
 */
export function buildChaseMessage({ playerName, balance, parentName }: ChaseMessageParams): string {
  const settings = getAllSettings();

  const balanceLine = balance < 0
    ? `${playerName} has used ${Math.abs(balance)} session${Math.abs(balance) !== 1 ? "s" : ""} beyond their paid balance and currently owes for those sessions.`
    : balance === 0
    ? `${playerName}'s session balance has reached zero.`
    : `${playerName} has ${balance} session${balance !== 1 ? "s" : ""} remaining.`;

  const parentFirst = parentName ? parentName.split(/\s+/)[0] : "there";

  let message = settings.chase_template || "";
  message = message.replace(/\{\{player\}\}/g, playerName);
  message = message.replace(/\{\{balance_line\}\}/g, balanceLine);
  message = message.replace(/\{\{bank_name\}\}/g, settings.bank_name || "");
  message = message.replace(/\{\{bank_bank\}\}/g, settings.bank_bank || "");
  message = message.replace(/\{\{bank_account\}\}/g, settings.bank_account || "");
  message = message.replace(/\{\{coach_phone\}\}/g, settings.coach_phone || "");
  message = message.replace(/\{\{parent\}\}/g, parentFirst);

  return message;
}

/**
 * Build a wa.me URL with pre-populated message.
 * phone should be in international format (e.g. +2348070777069)
 * or local format (e.g. 08070777069) — we strip non-digits.
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  // Strip everything except digits
  let digits = phone.replace(/[^0-9]/g, "");
  // Convert Nigerian local format (0xxx) to international (234xxx)
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "234" + digits.slice(1);
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
