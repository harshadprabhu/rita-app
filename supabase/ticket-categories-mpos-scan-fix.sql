-- Fix classification of "SKU won't scan in mPOS" tickets. Ticket #63394 was
-- misclassified as Customer Service Issue > Case Creation because the
-- top-down category picker latched onto the generic term "customer" while
-- the exact leaf match — POS Issue > Item > Item Search — never got a shot
-- (rescue-from-items only fired when NO category matched). Classifier fix
-- landed alongside this file; the corrections here move the specific ticket
-- and give the POS Issue category a bit more distinctive vocabulary so the
-- top-down path picks it too, not just the rescue path.

-- 1) Correct ticket #63394 (already in progress against the wrong category).
update tickets
set category = 'POS Issue',
    subcategory = 'Item',
    item = 'Item Search'
where sampark_display_id = '63394';

-- 2) Strengthen POS Issue category keywords so tokens like "mpos", "scan",
--    "sku", "waiting" contribute distinctive weight, not just "pos" — mPOS
--    is the mobile POS terminal and appears often in descriptions but was
--    absent from every learned POS keyword list because TF-IDF ranked it low
--    against the noisier "pos" unigram.
update ticket_categories
set keywords = array(
  select distinct unnest(
    array['mpos','sku','scan','sku scan','scan mpos','mpos urgent',
          'urgent customer','customer waiting'] || coalesce(keywords, array[]::text[])
  )
)
where id in (
  '12734000000252502', -- POS Issue (category)
  '12734000000252916', -- Item (subcategory)
  '12734000000252920'  -- Item Search (item)
);
