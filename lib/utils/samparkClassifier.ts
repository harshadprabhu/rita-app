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

function scoreNode(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  keywords: string[] | null,
): number {
  if (!keywords?.length) return 0;
  let hit = 0;
  let max = 0;
  for (let i = 0; i < keywords.length; i++) {
    const weight = keywords.length - i;
    max += weight;
    const kw = keywords[i];
    if (tokens.unigrams.has(kw) || tokens.unigrams.has(stem(kw))) {
      hit += weight;
    } else if (kw.includes(' ') && tokens.bigrams.has(kw)) {
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

// ---- Combined scoring -------------------------------------------------------

function combinedScore(
  tokens: { unigrams: Set<string>; bigrams: Set<string> },
  node: TicketCategory,
): number {
  const kwScore = scoreNode(tokens, node.keywords);
  const nmScore = nameScore(tokens, node.name);
  // 70% keyword TF-IDF + 30% name match — name acts as a strong prior
  return kwScore * 0.7 + nmScore * 0.3;
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
  if (!bestCategory) return rescueFromItems(tokens, allNodes);

  const subcategories = allNodes.filter(
    (n) => n.is_subcategory && !n.is_item && n.parent_id === bestCategory.node.id,
  );
  // Use a slightly lower threshold for subcategory/item — the category context
  // already narrows the search space, so weaker matches are more trustworthy.
  const bestSubcategory = bestMatch(tokens, subcategories, MIN_CONFIDENCE * 0.8);

  // Hierarchical boost: when subcategory also matches, raise category confidence
  // slightly — matching at two levels is stronger evidence.
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
}
