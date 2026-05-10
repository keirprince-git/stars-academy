/* ── WhatsApp message templates for Stars Academy ──── */

const BANK_DETAILS = {
  name: "The Stars Football Academy",
  bank: "Taj Bank",
  account: "0010270588",
};

const COACH_PHONE = "08070777069";

export interface ChaseMessageParams {
  playerName: string;
  balance: number;          // sessions remaining (can be negative)
  parentName?: string | null;
}

/**
 * Generate a payment chase message for a player's parent.
 * Returns the message text (ready to URL-encode for wa.me).
 */
export function buildChaseMessage({ playerName, balance, parentName }: ChaseMessageParams): string {
  const greeting = parentName
    ? `Dear ${parentName.split(/\s+/)[0]}`
    : "Good day";

  const balanceLine = balance < 0
    ? `${playerName} has used ${Math.abs(balance)} session${Math.abs(balance) !== 1 ? "s" : ""} beyond their paid balance and currently owes for those sessions.`
    : balance === 0
    ? `${playerName}'s session balance has reached zero.`
    : `${playerName} has ${balance} session${balance !== 1 ? "s" : ""} remaining.`;

  return [
    `${greeting},`,
    ``,
    `I hope you're well. This is a reminder regarding ${playerName}'s sessions at Stars Football Academy.`,
    ``,
    balanceLine,
    ``,
    `To continue attending, please make a payment to:`,
    ``,
    `Account Name: ${BANK_DETAILS.name}`,
    `Bank: ${BANK_DETAILS.bank}`,
    `Account Number: ${BANK_DETAILS.account}`,
    ``,
    `Please send confirmation of payment to Coach Sunny on ${COACH_PHONE}.`,
    ``,
    `Thank you!`,
  ].join("\n");
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
