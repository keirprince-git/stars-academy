/**
 * TAJ Bank PDF Statement Parser
 *
 * Parses text extracted from TAJ Bank PDF statements.
 * Handles the concatenated description format and messy amount embedding.
 */

export interface ParsedTransaction {
  trans_date: string;   // ISO date YYYY-MM-DD
  value_date: string;   // ISO date YYYY-MM-DD
  description: string;
  reference: string;
  deposit: number;
  withdrawal: number;
  balance: number;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  account_number: string;
  period: string;
  opening_balance: number;
  closing_balance: number;
}

/** Convert DD-MMM-YY to YYYY-MM-DD */
function parseDate(raw: string): string {
  const months: Record<string, string> = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
  };
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  const day = parts[0].padStart(2, "0");
  const mon = months[parts[1].toUpperCase()] ?? "01";
  const year = parseInt(parts[2], 10);
  const fullYear = year < 50 ? 2000 + year : 1900 + year;
  return `${fullYear}-${mon}-${day}`;
}

/** Parse a comma-formatted number like "40,000.00" */
function parseAmount(raw: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

/**
 * Clean the concatenated TAJ Bank transaction description into something readable.
 */
function cleanDescription(raw: string): string {
  let desc = raw.trim();
  if (!desc) return "(no description)";

  // NIP transfer: "NIPFRMSenderNamePurposeMOBUTOTHESTNIPReceivableAcc"
  const nipMatch = desc.match(/^NIPFRM(.+?)(?:NIPReceivableAcc|NIPTran)(.*)$/i);
  if (nipMatch) {
    let name = nipMatch[1];
    // Insert spaces before uppercase letters following lowercase
    name = name.replace(/([a-z])([A-Z])/g, "$1 $2");
    // Insert spaces around common keywords
    name = name.replace(/MOBU?\s*TO\s*THE/gi, " → ");
    name = name.replace(/MOBILE\s*TO\s*THE/gi, " → ");
    name = name.replace(/MOB\s*$/i, "");
    return `NIP: ${name.trim()}`;
  }

  // SMS charges: amounts are embedded in text, just label it
  if (desc.match(/smschargesfor/i)) {
    const monthMatch = desc.match(/smschargesfor(\w+?)(\d{4})/i);
    if (monthMatch) return `SMS charges – ${monthMatch[1]} ${monthMatch[2]}`;
    return "SMS charges";
  }

  // Transfer out: "trfifo<name>the..."
  if (desc.match(/trfifo/i)) {
    const tMatch = desc.match(/trfifo(.+?)(?:the|$)/i);
    if (tMatch) {
      let name = tMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2");
      return `Transfer: ${name.trim()}`;
    }
    return "Transfer out";
  }

  // Mobile transfer: "...MOBILETETRANZACTRECEIVABLE"
  if (desc.match(/MOBILETETRANZACT/i)) {
    const cleaned = desc.replace(/MOBILETETRANZACTRECEIVABLE$/i, "").trim();
    return `Mobile: ${cleaned}`;
  }

  // General cleanup: insert spaces before uppercase following lowercase
  return desc.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * Parse the raw text from a TAJ Bank PDF statement.
 * Uses balance tracking to accurately compute deposit/withdrawal amounts
 * even when they're embedded in the description text.
 */
export function parseBankStatementText(text: string): ParseResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let accountNumber = "";
  let period = "";
  let openingBalance = 0;

  // Extract metadata
  const accMatch = text.match(/Account\s*Number\s*(\d+)/i);
  if (accMatch) accountNumber = accMatch[1];

  const periodMatch = text.match(/Statement\s*Cycle:\s*(.+?)(?:\n|$)/i);
  if (periodMatch) period = periodMatch[1].trim();

  const openMatch = text.match(/Opening\s*Balance\s*([\d,]+\.\d{2})/i);
  if (openMatch) openingBalance = parseAmount(openMatch[1]);

  // Also get the "Balance Brought Forward" which may differ from opening balance
  const bfMatch = text.match(/Balance\s*Brought\s*Forward\s*([\d,]+\.\d{2})/i);
  let prevBalance = bfMatch ? parseAmount(bfMatch[1]) : openingBalance;

  const transactions: ParsedTransaction[] = [];

  // TAJ Bank's PDF text extraction concatenates every column with no spaces:
  //   11-FEB-2611-FEB-2600002THESTARS...0.0013.602,525,318.40
  // So the prefix is transDate(DD-MMM-YY) + valueDate(DD-MMM-YY) + branch(5
  // digits), optionally with whitespace between, and the line ends with three
  // run-together amounts: deposit, withdrawal, balance.
  const datePattern = /^(\d{2}-[A-Z]{3}-\d{2})\s*(\d{2}-[A-Z]{3}-\d{2})\s*(\d{5})\s*/i;

  for (const line of lines) {
    // Stop at end of statement
    if (line.startsWith("END OF STATEMENT")) break;
    if (line.startsWith("Trans Date") || line.startsWith("Statement of Account")) continue;
    if (line.startsWith("Balance Brought Forward")) continue;
    if (line.match(/^Page\s+\d/i)) continue;
    if (line.match(/^You must advise/i)) continue;
    if (line.match(/^terms and conditions/i)) continue;

    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;

    const transDate = dateMatch[1];
    const valueDate = dateMatch[2];
    const descStart = dateMatch[0].length;

    // The three trailing amounts (deposit, withdrawal, balance) are always the
    // last three amount tokens on the line. An amount-like token inside the
    // description sorts before them, so taking the last three stays correct.
    const amountMatches = [...line.matchAll(/\d[\d,]*\.\d{2}/g)];
    if (amountMatches.length < 3) continue;
    const last3 = amountMatches.slice(-3);

    let deposit = parseAmount(last3[0][0]);
    let withdrawal = parseAmount(last3[1][0]);
    const balance = parseAmount(last3[2][0]);
    const descEnd = last3[0].index ?? line.length;

    // Cross-check the parsed amounts against the balance movement. If they
    // don't reconcile (a misread digit somewhere), trust the balance delta —
    // that keeps a single bad line from corrupting deposit/withdrawal.
    const change = Math.round((balance - prevBalance) * 100) / 100;
    const parsedChange = Math.round((deposit - withdrawal) * 100) / 100;
    if (Math.abs(change - parsedChange) > 0.01) {
      deposit = change > 0 ? change : 0;
      withdrawal = change < 0 ? -change : 0;
    }

    const rawDesc = line.substring(descStart, descEnd).trim();
    const description = cleanDescription(rawDesc);

    // Reference
    let reference = "";
    if (rawDesc.includes("NIPReceivableAcc")) reference = "NIPReceivableAcc";
    if (rawDesc.includes("MOBILETETRANZACTRECEIVABLE")) reference = "MobileTransfer";

    transactions.push({
      trans_date: parseDate(transDate),
      value_date: parseDate(valueDate),
      description,
      reference,
      deposit,
      withdrawal,
      balance,
    });

    prevBalance = balance;
  }

  // Closing balance from TRANS SUMMARY
  let closingBalance = prevBalance;
  const transBalMatch = text.match(/Trans\s*Balance\s*([\d,]+\.\d{2})/i);
  if (transBalMatch) closingBalance = parseAmount(transBalMatch[1]);

  return {
    transactions,
    account_number: accountNumber,
    period,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  };
}
