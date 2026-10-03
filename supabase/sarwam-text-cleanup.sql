-- ============================================================================
-- SARWAM — rename leftover: replace the old product name in stored alert text
-- and legacy synced-comment author tags. Idempotent: safe to re-run.
-- ============================================================================

update public.notifications
  set title = regexp_replace(title, '\mRITA\M', 'SARWAM', 'g'),
      body  = regexp_replace(body,  '\mRITA\M', 'SARWAM', 'g')
  where title ~ '\mRITA\M' or body ~ '\mRITA\M';

update public.ticket_comments
  set body = replace(body, '(RITA)', '(SARWAM)'),
      external_author = replace(external_author, '(RITA)', '(SARWAM)')
  where body like '%(RITA)%' or external_author like '%(RITA)%';
