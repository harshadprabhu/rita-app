import { TicketCategory } from '../api/categories';

export interface ClassifyResult {
  category: string | null;
  categoryId: string | null;
  subcategory: string | null;
  subcategoryId: string | null;
  item: string | null;
  itemId: string | null;
  confidence: { category: number; subcategory: number; item: number };
}

const EMPTY: ClassifyResult = {
  category: null, categoryId: null,
  subcategory: null, subcategoryId: null,
  item: null, itemId: null,
  confidence: { category: 0, subcategory: 0, item: 0 },
};

const MIN_CONFIDENCE = 0.15;

// ---- Stemming (lightweight suffix stripping for IT-helpdesk English) ---------

const SUFFIX_RE = /(ies|ies|ing|tion|sion|ment|ness|ers|er|ed|ly|es|s)$/;

function stem(word: string): string {
  if (word.length <= 4) return word;
  const stripped = word.replace(SUFFIX_RE, '');
  return stripped.length >= 3 ? stripped : word;
}

// ---- Tokenisation -----------------------------------------------------------

const STOP = new Set(
  'the a an of to for in on at is are be not no and or with without your you it its this that from into request please issue problem unable able cannot can get getting got need needs error working help kindly regarding as we our am has have had will shall been being also but was were they them their there here some very much many all any most more other than same'.split(' '),
);

function tokenize(text: string): { unigrams: Set<string>; bigrams: Set<string> } {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const unigrams = new Set<string>();
  const bigrams = new Set<string>();

  const meaningful: string[] = [];
  for (const w of words) {
    if (STOP.has(w)) continue;
    const s = stem(w);
    unigrams.add(w);
    if (s !== w) unigrams.add(s);
    meaningful.push(w);
  }

  for (let i = 0; i < meaningful.length - 1; i++) {
    bigrams.add(`${meaningful[i]} ${meaningful[i + 1]}`);
  }

  return { unigrams, bigrams };
}

// ---- Name-based bonus scoring -----------------------------------------------
// The category/subcategory/item name itself is a strong signal — "hardware
// problem" should boost "Hardware Issue" even when "hardware" isn't in the
// TF-IDF keywords.

function nameScore(tokens: { unigrams: Set<string>; bigrams: Set<string> }, name: string): number {
  const nameWords = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
  if (!nameWords.length) return 0;
  let hits = 0;
  for (const nw of nameWords) {
    if (tokens.unigrams.has(nw) || tokens.unigrams.has(stem(nw))) hits++;
  }
  return hits / nameWords.length;
}

// ---- TF-IDF keyword scoring -------------------------------------------------
// A keyword that's itself a two-word phrase (e.g. "mobile number") is a much
// more specific signal than a single generic word ("number") matching —
// bare-unigram overlap is cheap to produce by accident, phrase-level overlap
// isn't. Confirmed live: "Mobile number changing request" matched "Serial
// Number Not Available" (86 historical tickets, "number" ranked high in its
// list) ahead of "Phone No. Change" (8 tickets, but carries the distinctive
// "mobile number" bigram) — a bare "number" hit was enough to win. Giving
// bigram keywords a weight bonus (both in what they contribute when matched
// AND in the max they're measured against, so the 0-1 ratio stays
// meaningful) fixes this without blanket-penalizing single-word keywords,
// which are often legitimately the strongest signal for other nodes.
const BIGRAM_BONUS = 1.5;

function scoreNode(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  keywords: string[] | null,
): number {
  if (!keywords?.length) return 0;
  let hit = 0;
  let max = 0;
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const isPhrase = kw.includes(' ');
    const weight = (keywords.length - i) * (isPhrase ? BIGRAM_BONUS : 1);
    max += weight;
    if (isPhrase) {
      if (tokens.bigrams.has(kw)) hit += weight;
      continue;
    }
    if (tokens.unigrams.has(kw) || tokens.unigrams.has(stem(kw))) {
      hit += weight;
    } else {
      const kwStem = stem(kw);
      for (const tok of tokens.unigrams) {
        if (stem(tok) === kwStem) { hit += weight * 0.8; break; }
      }
    }
  }
  return max ? hit / max : 0;
}

// ---- Volume prior -------------------------------------------------------
// A small tie-breaker, not a primary signal: real Sampark history is heavily
// skewed (e.g. "POS Issue" alone is ~42% of all real, non-"Other" tickets),
// so when two nodes score similarly on keywords, prefer the one that's
// actually common. Log-scaled and capped low (+0.03 max) so it can nudge a
// close call but never outweighs an actual keyword/name mismatch.
function volumePrior(node: TicketCategory): number {
  const count = node.ticket_count ?? 0;
  if (count <= 0) return 0;
  return 0.03 * Math.min(1, Math.log10(1 + count) / 3);
}

// ---- Confirmed real-world ambiguity corrections --------------------------
// A small number of Sampark items legitimately compete for very similar
// generic phrasing, where text-matching alone can't tell them apart, but one
// is confirmed (by actual usage volume + a human decision, not guessed) to
// be the overwhelmingly correct read in RITA's real usage. Verified live:
// "Mobile number changing request" scores well against BOTH "Phone No.
// Change" (Email ID Issue > Accounts and Groups — a staff member's own
// number for MFA/login, 9 historical tickets) and "Customer details change"
// (POS Issue > Customer Information — a customer's number in POS/CRM, 60
// historical tickets) — the latter's keyword list ranks "mobile"/"mobile
// number" near the bottom of its top-20 (diluted by covering name/PAN/bank
// corrections too), so it loses on raw keyword rank despite being ~7x more
// common in practice. Rather than tune the general scoring formula (risks
// side effects elsewhere, confirmed by the earlier over-broad volume-prior
// regression), this is an explicit, auditable, per-item correction — add to
// it only when a specific real ambiguity has been confirmed, not to tune
// general accuracy.
const CONFIRMED_ITEM_PREFERENCE: Record<string, number> = {
  '12734000007129756': 0.2, // Customer details change — customer's mobile/PAN/bank corrections
};

function itemPreference(node: TicketCategory): number {
  return CONFIRMED_ITEM_PREFERENCE[node.id] ?? 0;
}

// ---- Combined scoring -------------------------------------------------------

function combinedScore(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  node: TicketCategory,
): number {
  const kwScore = scoreNode(tokens, node.keywords);
  const nmScore = nameScore(tokens, node.name);
  // 70% keyword TF-IDF + 30% name match — name acts as a strong prior — plus
  // a small real-world-frequency nudge on top. The confirmed-preference bonus
  // only applies when the node already has some genuine keyword overlap
  // (kwScore > 0) — it breaks ties between real candidates, it never
  // fabricates a match out of nothing.
  const preference = kwScore > 0 ? itemPreference(node) : 0;
  return kwScore * 0.7 + nmScore * 0.3 + volumePrior(node) + preference;
}

function bestMatch(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  candidates: TicketCategory[],
  threshold = MIN_CONFIDENCE,
): { node: TicketCategory; confidence: number } | null {
  let best: { node: TicketCategory; confidence: number } | null = null;
  for (const node of candidates) {
    const s = combinedScore(tokens, node);
    if (s > 0 && (!best || s > best.confidence)) best = { node, confidence: s };
  }
  return best && best.confidence >= threshold ? best : null;
}

// ---- Bottom-up rescue ---------------------------------------------------
// A top-level category's keyword list is TF-IDF'd across every ticket filed
// under it, so it's necessarily generic/diluted — a description built almost
// entirely from leaf-specific vocabulary (an exact POS error string, a
// terminal ID) can score below MIN_CONFIDENCE at the category level even
// though one specific item matches it almost exactly. Rather than give up,
// search every item in the tree directly and walk up its parent chain.

function rescueFromItems(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  allNodes: TicketCategory[],
): ClassifyResult {
  const items = allNodes.filter((n) => n.is_item);
  const bestItem = bestMatch(tokens, items, MIN_CONFIDENCE * 0.7);
  if (!bestItem) return EMPTY;

  const subNode = allNodes.find((n) => n.id === bestItem.node.parent_id) ?? null;
  const catNode = subNode ? allNodes.find((n) => n.id === subNode.parent_id) ?? null : null;
  if (!catNode) return EMPTY;

  return {
    category: catNode.name,
    categoryId: catNode.id,
    subcategory: subNode?.name ?? null,
    subcategoryId: subNode?.id ?? null,
    item: bestItem.node.name,
    itemId: bestItem.node.id,
    confidence: {
      category: combinedScore(tokens, catNode),
      subcategory: subNode ? combinedScore(tokens, subNode) : 0,
      item: bestItem.confidence,
    },
  };
}

// ---- Main classifier --------------------------------------------------------

export function classifySamparkTicket(description: string, allNodes: TicketCategory[]): ClassifyResult {
  const tokens = tokenize(description);
  if (!tokens.unigrams.size || !allNodes.length) return EMPTY;

  const categories = allNodes.filter((n) => !n.is_subcategory);
  const bestCategory = bestMatch(tokens, categories);

  // Bottom-up rescue used to only fire when NO category matched at all, which
  // meant a weak top-down match (e.g. category "Customer Service Issue" won
  // purely because its name/keyword includes the generic term "customer")
  // permanently blocked a much stronger leaf-level match from ever being
  // considered — real case, ticket #63394 "SKU will not scan in mPOS" matched
  // POS Issue > Item > Item Search on all 5 top bigrams (sku scan / scan mpos
  // / mpos urgent / urgent customer / customer waiting) yet lost to Customer
  // Service Issue > Case Creation whose keywords the ticket text didn't hit
  // at all. Now we always compute both paths and take the more confident one,
  // where "confidence" for the item path is the item match itself (leaf
  // specificity is what earned the rescue in the first place).
  const rescue = rescueFromItems(tokens, allNodes);

  const topDown: ClassifyResult | null = bestCategory
    ? (() => {
        const subcategories = allNodes.filter(
          (n) => n.is_subcategory && !n.is_item && n.parent_id === bestCategory.node.id,
        );
        const bestSubcategory = bestMatch(tokens, subcategories, MIN_CONFIDENCE * 0.8);
        const catConfidence = bestSubcategory
          ? Math.min(1, bestCategory.confidence * 1.1)
          : bestCategory.confidence;
        const items = bestSubcategory
          ? allNodes.filter((n) => n.is_item && n.parent_id === bestSubcategory.node.id)
          : [];
        const bestItem = bestMatch(tokens, items, MIN_CONFIDENCE * 0.7);
        return {
          category: bestCategory.node.name,
          categoryId: bestCategory.node.id,
          subcategory: bestSubcategory?.node.name ?? null,
          subcategoryId: bestSubcategory?.node.id ?? null,
          item: bestItem?.node.name ?? null,
          itemId: bestItem?.node.id ?? null,
          confidence: {
            category: catConfidence,
            subcategory: bestSubcategory?.confidence ?? 0,
            item: bestItem?.confidence ?? 0,
          },
        };
      })()
    : null;

  // A rescue-path result with a real item match dominates a top-down result
  // that couldn't reach a leaf (subcategory or item null). And when both have
  // items, the higher-confidence item wins — leaf specificity is the whole
  // point of learning per-item keywords.
  const topDownItemScore = topDown?.confidence.item ?? 0;
  const rescueItemScore = rescue.confidence.item;
  const rescueBeatsTopDown =
    rescueItemScore > 0 &&
    (topDown === null ||
      topDown.item === null ||
      rescueItemScore > topDownItemScore * 1.1);

  if (rescueBeatsTopDown) return rescue;
  return topDown ?? rescue;
}
