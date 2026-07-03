// Localized keyword parser for RITA chat auto-triage — no AI API, runs entirely
// in the app. Ported verbatim from the Python local parser used in the sibling
// system: decides whether a chat message should raise a ticket, then assigns a
// category and priority. See PART 1 / PART 2 of the parser spec.
import { TicketPriority } from '../../types';

// ── PART 1: detection ────────────────────────────────────────────────────────

// Core keyword pattern (word-boundary isolated).
const CORE_KEYWORDS = [
  'product', 'pricing', 'price', 'cost', 'billing', 'making charge', 'charge',
  'issue', 'problem', 'bug', 'glitch', 'error', 'network', 'system', 'software',
  'hardware', 'wi-fi', 'wifi', 'image', 'photo', 'picture', 'mismatch', 'rights',
  'permission', 'permissions', 'access', 'approval', 'approved', 'approve', 'sku',
  'item id', 'itemid', 'serial id', 'serialid', 'design mismatch', 'design related',
  'drp', 'mto', 'gold freeze', 'freeze', 'order', 'shipped', 'purchased', 'broken',
  'failed', 'fail', 'crash', 'crashed', 'stuck', 'slow', 'delay', 'wrong',
  'incorrect', 'missing', 'offline', 'unable', 'help', 'support', 'fix',
  'complaint', 'trouble', 'down', 'fault', 'defect', 'discrepancy', 'grn', 'asn',
  'inwarding', 'fg', 'fgid', 'po', 'pos', 'amend', 'transfer order', 'to cancelation',
  'workflow', 'purchase requisition', 'requisition', 'pr', 'prs', 'set item',
  'set break', 'break details', 'f&o', 'f & o', 'serial number', 'enquiry',
  'submission date', 'tat', 'vendor access', 'attachment dump', 'catagory',
  'category', 'consignment', 'object reference', 'vault team', 'set creation',
  'irn', 'foco', 'by-product', 'net weight', 'ledger', 'mismatched', 'metal rate',
  'tax invoice', 'erp', 'fixed assets', 'formula version', 'duplicate stock',
  'nsv', 'gsv', 'cogep', 'co gep', 'cn discripancy', 'discripancy', 'bom',
  'bom upload', 'lease', 'leases', 'lease summary', 'deposit summary', 'refund',
  'other gold', 'gold not showing', 'showing', 'reflecting',
];

// IT department core identifiers.
const IT_KEYWORDS = [
  'it issue', 'it support', 'it team', 'it department', 'it system',
  'it hardware', 'it software',
];

// Actionable issue phrasing.
const ISSUE_PHRASES = [
  'not working', 'not reflecting', 'not showing', 'not loading', 'not syncing',
  'not active', 'not responding',
  "can't", 'cannot', 'unable to', 'failed to',
  'please check', 'please look', 'please fix', 'please resolve',
  'something is wrong', 'wrong with', 'how to', 'why is', 'what is wrong',
];

// Polite/celebratory phrases. A message made up ONLY of these never raises a
// ticket (prevents false positives on "thanks", "great job", etc.).
const CONVERSATIONAL = [
  'thank you', 'thanks', 'congratulations', 'congrats', 'great job', 'well done',
  'awesome', 'perfect', 'good work', 'keep it up', 'kudos', 'fabulous', 'excellent',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundaryRegex(terms: string[]): RegExp {
  return new RegExp(`\\b(${terms.map(escapeRegex).join('|')})\\b`, 'i');
}

const CORE_RE = boundaryRegex(CORE_KEYWORDS);

/**
 * Decide whether a chat message describes an actionable support request.
 * Blocks messages that are purely polite/celebratory.
 */
export function shouldCreateTicket(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;

  // If, after removing all polite phrases, nothing meaningful remains, treat the
  // whole message as conversational and do not raise a ticket.
  let residual = text;
  for (const phrase of CONVERSATIONAL) residual = residual.split(phrase).join(' ');
  residual = residual.replace(/[^a-z0-9]+/gi, ' ').trim();
  if (residual === '') return false;

  const hasCore = CORE_RE.test(text);
  const hasIt = IT_KEYWORDS.some((k) => text.includes(k));
  const hasIssue = ISSUE_PHRASES.some((p) => text.includes(p));
  return hasCore || hasIt || hasIssue;
}

// ── PART 1: priority ─────────────────────────────────────────────────────────

/**
 * Map urgency keywords to a priority. Checked high→low; first tier wins.
 * The spec's "Urgent" maps to RITA's `critical` priority.
 */
export function parsePriority(message: string): TicketPriority {
  const t = message.toLowerCase();
  if (/\b(urgent|asap|emergency|critical)\b/.test(t)) return 'critical';
  if (/\b(broken|errors?|fail|wrong)\b/.test(t)) return 'high';
  if (/\b(low|minor)\b/.test(t)) return 'low';
  return 'medium';
}

// ── PART 2: category ─────────────────────────────────────────────────────────

// Ordered — first category with any matching marker wins. Keys are stored on the
// ticket; display labels live in locales under `category.<key>`.
const CATEGORY_RULES: { key: string; markers: string[] }[] = [
  { key: 'access_authorization', markers: ['access', 'permission', 'rights', 'approval', 'approved', 'approve', 'unauthorized', 'lease', 'deposit'] },
  { key: 'pos_system', markers: ['pos', 'cogep', 'co gep', 'set item'] },
  { key: 'erp_system', markers: ['erp', 'f&o', 'f & o', 'workflow', 'logic', 'integration', 'uploading', 'popup'] },
  { key: 'pricing', markers: ['price', 'pricing', 'cost', 'billing', 'invoice', 'charge', 'refund', 'ledger', 'tax', 'rate', 'calculation', 'cn', 'discripancy', 'discrepancy'] },
  { key: 'image_mismatch', markers: ['image', 'photo', 'picture', 'mismatch'] },
  { key: 'product', markers: ['product', 'wrong item', 'incorrect item', 'attribute', 'sku', 'serial number', 'denomination', 'enquiry', 'bom', 'attachment', 'set creation', 'break details'] },
  { key: 'data_not_reflecting', markers: ['not reflecting', 'showing', 'sync', 'missing', 'show', 'other gold'] },
  { key: 'inventory', markers: ['inventory', 'stock', 'out of', 'grn', 'fg', 'fgid', 'asn', 'inwarding'] },
  { key: 'drp_order', markers: ['drp', 'delivery note', 'distributor'] },
  { key: 'order', markers: ['order', 'shipped', 'purchased', 'requisition', 'pr', 'prs', 'irn', 'foco', 'so-', 'net weight', 'tag', 'transfer order'] },
];

const CATEGORY_RES = CATEGORY_RULES.map((r) => ({ key: r.key, re: boundaryRegex(r.markers) }));

/** Classify a message into one of the 11 categories (falls back to `other`). */
export function parseCategory(message: string): string {
  const text = message.toLowerCase();
  for (const { key, re } of CATEGORY_RES) {
    if (re.test(text)) return key;
  }
  return 'other';
}

// ── Combined helper ──────────────────────────────────────────────────────────

export interface ParsedChatTicket {
  category: string;
  priority: TicketPriority;
  summary: string;
}

/** Parse category + priority + a short summary line for a ticket-worthy message. */
export function parseChatTicket(message: string): ParsedChatTicket {
  const firstLine = message.trim().split('\n')[0];
  const summary = firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
  return {
    category: parseCategory(message),
    priority: parsePriority(message),
    summary,
  };
}

/** Roles that may auto-raise tickets from chat. Only technicians are exempt, to
 *  avoid triage loops (they work tickets rather than report them). */
export function canRaiseChatTicket(role: string | undefined | null): boolean {
  return role === 'user' || role === 'manager' || role === 'admin';
}
