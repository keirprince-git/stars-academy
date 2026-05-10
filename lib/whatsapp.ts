/* ── WhatsApp message templates for Stars Academy ──── */

import { getAllSettings } from "./db";
import { getCurrentTariff, type TariffPackage } from "./tariff";

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
    ? `${playerName} has used ${Math.abs(balance)} session${Math.abs(balance) !== 1 ? "s" : ""} beyond their paid balance.`
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
 * Generate a tariff info message for a player's parent.
 * Shows the current pricing for the player's age group.
 */
export function buildTariffMessage({
  playerName,
  parentName,
  ageGroup,
}: {
  playerName: string;
  parentName?: string | null;
  ageGroup: string | null;
}): string {
  const settings = getAllSettings();
  const tariff = getCurrentTariff();
  const group = ageGroup === "Lower" ? "Lower" : "Upper";
  const parentFirst = parentName ? parentName.split(/\s+/)[0] : "there";

  const lines: string[] = [];
  lines.push(`Hi ${parentFirst},`);
  lines.push("");
  lines.push(`Here are the current session prices for ${playerName} at Stars Football Academy:`);
  lines.push("");

  for (const pkg of tariff) {
    const price = pkg.price[group];
    const perSession = Math.round(price / pkg.sessions);
    lines.push(`• ${pkg.label}: ₦${price.toLocaleString()} (₦${perSession.toLocaleString()}/session)`);
  }

  lines.push("");
  lines.push("Payments can be made to:");
  lines.push(`Account Name: ${settings.bank_name || ""}`);
  lines.push(`Bank: ${settings.bank_bank || ""}`);
  lines.push(`Account Number: ${settings.bank_account || ""}`);
  lines.push("");
  lines.push(`Please send confirmation of payment to Coach Sunny on ${settings.coach_phone || ""}.`);
  lines.push("");
  lines.push("Thank you!");

  return lines.join("\n");
}

/**
 * Generate a tariff announcement for a WhatsApp group.
 * Shows both Upper and Lower pricing for all packages.
 */
export function buildGroupTariffMessage(): string {
  const settings = getAllSettings();
  const tariff = getCurrentTariff();

  const lines: string[] = [];
  lines.push("Dear Parents and Guardians,");
  lines.push("");
  lines.push("Here are the current session prices at Stars Football Academy:");
  lines.push("");

  // Check if Upper and Lower prices differ for any package
  const hasDifferentPricing = tariff.some(pkg => pkg.price.Upper !== pkg.price.Lower);

  if (hasDifferentPricing) {
    lines.push("*Upper Group:*");
    for (const pkg of tariff) {
      const perSession = Math.round(pkg.price.Upper / pkg.sessions);
      lines.push(`• ${pkg.label}: ₦${pkg.price.Upper.toLocaleString()} (₦${perSession.toLocaleString()}/session)`);
    }
    lines.push("");
    lines.push("*Lower Group:*");
    for (const pkg of tariff) {
      const perSession = Math.round(pkg.price.Lower / pkg.sessions);
      lines.push(`• ${pkg.label}: ₦${pkg.price.Lower.toLocaleString()} (₦${perSession.toLocaleString()}/session)`);
    }
  } else {
    for (const pkg of tariff) {
      const perSession = Math.round(pkg.price.Upper / pkg.sessions);
      lines.push(`• ${pkg.label}: ₦${pkg.price.Upper.toLocaleString()} (₦${perSession.toLocaleString()}/session)`);
    }
  }

  lines.push("");
  lines.push("Payments can be made to:");
  lines.push(`Account Name: ${settings.bank_name || ""}`);
  lines.push(`Bank: ${settings.bank_bank || ""}`);
  lines.push(`Account Number: ${settings.bank_account || ""}`);
  lines.push("");
  lines.push(`Please send confirmation of payment to Coach Sunny on ${settings.coach_phone || ""}.`);
  lines.push("");
  lines.push("Thank you!");

  return lines.join("\n");
}

/**
 * Generate a session cancellation message for a WhatsApp group.
 */
export function buildCancellationMessage({
  date,
  reason,
}: {
  date: string;
  reason: string;
}): string {
  const lines: string[] = [];
  lines.push("Dear Parents and Guardians,");
  lines.push("");
  // Format date nicely: "Saturday 10th May"
  const d = new Date(date + "T00:00:00");
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
  const dayNum = d.getDate();
  const suffix = [11,12,13].includes(dayNum) ? "th" : dayNum % 10 === 1 ? "st" : dayNum % 10 === 2 ? "nd" : dayNum % 10 === 3 ? "rd" : "th";
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const friendlyDate = `${dayName} ${dayNum}${suffix} ${month}`;

  lines.push(`Please note that the training session on *${friendlyDate}* has been cancelled due to ${reason}.`);
  lines.push("");
  lines.push("Thank you for your understanding.");

  return lines.join("\n");
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
