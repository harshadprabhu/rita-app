import { TicketCategory } from '../api/categories';

// Auto-parse engine for Category / Subcategory / Item — the same 3-level
// classification Sampark itself uses. Unlike a hand-typed keyword list, this
// engine is DATA-DRIVEN: it scores a description against the `keywords` field
// on each ticket_categories row, which the sampark-sync edge function
// re-learns on every run via TF-IDF over real historical ticket subjects
// (currently ~4,000 tickets across 35 categories / 145 subcategories / 301
// items). A word that appears in most nodes ("issue", "not working") scores
// low everywhere; a word concentrated in a few nodes ("saksham", "grn",
// "zscaler", even real staff typos like "slowness") scores high exactly where
// it should. Accuracy improves automatically as Sampark accumulates more
// tickets and sampark-sync re-runs — no code change needed.

export interface ClassifyResult {
  category: string | null;
  categoryId: string | null;
  subcategory: string | null;
  subcategoryId: string | null;
  item: string | null;
  itemId: string | null;
  /** 0..1 per level — how strongly the description matched the winning node.
   *  Below MIN_CONFIDENCE a level is left unset rather than guessed. */
  confidence: { category: number; subcategory: number; item: number };
}

const EMPTY: ClassifyResult = {
  category: null, categoryId: null,
  subcategory: null, subcategoryId: null,
  item: null, itemId: null,
  confidence: { category: 0, subcategory: 0, item: 0 },
};

// Below this score a match is considered too weak to trust — better to leave
// the field for the user to pick than to confidently guess wrong.
const MIN_CONFIDENCE = 0.12;

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3),
  );
}

// `keywords` is already ranked most → least discriminative (TF-IDF order), so
// weight by rank: the top keyword counts more than the twelfth. Normalizing by
// the node's own max possible score keeps nodes with short vs. long keyword
// lists comparable on the same 0..1 scale.
function scoreNode(tokens: Set<string>, keywords: string[] | null): number {
  if (!keywords?.length) return 0;
  let hit = 0;
  let max = 0;
  keywords.forEach((kw, i) => {
    const weight = keywords.length - i;
    max += weight;
    if (tokens.has(kw)) hit += weight;
  });
  return max ? hit / max : 0;
}

function bestMatch(tokens: Set<string>, candidates: TicketCategory[]): { node: TicketCategory; confidence: number } | null {
  let best: { node: TicketCategory; confidence: number } | null = null;
  for (const node of candidates) {
    const s = scoreNode(tokens, node.keywords);
    if (s > 0 && (!best || s > best.confidence)) best = { node, confidence: s };
  }
  return best && best.confidence >= MIN_CONFIDENCE ? best : null;
}

/**
 * Classify a ticket description into Sampark's live Category → Subcategory →
 * Item taxonomy. Each level is only filled when confidently matched; an
 * unmatched level returns null so the UI shows "pick manually" instead of a
 * wrong forced guess.
 */
export function classifySamparkTicket(description: string, allNodes: TicketCategory[]): ClassifyResult {
  const tokens = tokenize(description);
  if (!tokens.size || !allNodes.length) return EMPTY;

  const categories = allNodes.filter((n) => !n.is_subcategory);
  const bestCategory = bestMatch(tokens, categories);
  if (!bestCategory) return EMPTY;

  const subcategories = allNodes.filter((n) => n.is_subcategory && !n.is_item && n.parent_id === bestCategory.node.id);
  const bestSubcategory = bestMatch(tokens, subcategories);

  const items = bestSubcategory
    ? allNodes.filter((n) => n.is_item && n.parent_id === bestSubcategory.node.id)
    : [];
  const bestItem = bestMatch(tokens, items);

  return {
    category: bestCategory.node.name,
    categoryId: bestCategory.node.id,
    subcategory: bestSubcategory?.node.name ?? null,
    subcategoryId: bestSubcategory?.node.id ?? null,
    item: bestItem?.node.name ?? null,
    itemId: bestItem?.node.id ?? null,
    confidence: {
      category: bestCategory.confidence,
      subcategory: bestSubcategory?.confidence ?? 0,
      item: bestItem?.confidence ?? 0,
    },
  };
}
