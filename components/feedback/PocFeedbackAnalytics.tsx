import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../common/Screen';
import { AppHeader } from '../common/AppHeader';
import { getAllFeedback } from '../../lib/api/pocFeedback';
import { getAllTicketRatings } from '../../lib/api/ticketRatings';
import { theme } from '../../constants/theme';

const FEATURE_LABELS: Record<string, string> = {
  ticket_creation: 'Ticket Creation',
  status_tracking: 'Status Tracking',
  photo_attachments: 'Photo Attachments',
  push_notifications: 'Push Notifications',
  gold_rates: 'Gold Rate Updates',
  promotions: 'Promotions / Offers',
  checklists: 'Daily Checklists',
};

const VS_WA: Record<number, string> = {
  1: 'Much harder', 2: 'Harder', 3: 'Same', 4: 'Easier', 5: 'Much easier',
};

export function PocFeedbackAnalytics() {
  const { data: feedback, isLoading } = useQuery({
    queryKey: ['poc-feedback-all'],
    queryFn: getAllFeedback,
  });
  const { data: ticketRatings } = useQuery({
    queryKey: ['ticket-ratings-all'],
    queryFn: getAllTicketRatings,
  });

  if (isLoading) return <Screen edges={['top']}><AppHeader title="POC Analytics" showBack /><ActivityIndicator style={{ marginTop: 40 }} /></Screen>;

  const fb = feedback ?? [];
  const n = fb.length;
  const tr = ticketRatings ?? [];
  const trN = tr.length;

  // Only show the "nothing yet" empty state when BOTH data sources are empty.
  // Previously this bailed on `n === 0` alone, which hid the Ticket Ratings
  // section entirely — users have been rating tickets (real data exists) but
  // nobody fills the long POC survey, so the whole page looked blank.
  if (n === 0 && trN === 0) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title="POC Analytics" showBack />
        <View style={s.empty}>
          <Ionicons name="analytics-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={s.emptyText}>No feedback or ratings submitted yet</Text>
        </View>
      </Screen>
    );
  }

  // POC survey aggregates — only meaningful when survey responses exist.
  const avg = (fn: (f: typeof fb[0]) => number) => (fb.reduce((sum, f) => sum + fn(f), 0) / n).toFixed(1);
  const pct = (fn: (f: typeof fb[0]) => boolean) => Math.round((fb.filter(fn).length / n) * 100);

  const avgEase = n > 0 ? avg((f) => f.ease_of_ticket_creation) : '0.0';
  const avgTracking = n > 0 ? avg((f) => f.ease_of_tracking) : '0.0';
  const avgOverall = n > 0 ? avg((f) => f.overall_experience) : '0.0';
  const avgSpeed = n > 0 ? avg((f) => f.app_speed_performance) : '0.0';
  const avgVsWa = n > 0 ? avg((f) => f.vs_whatsapp) : '0.0';

  const preferYes = n > 0 ? pct((f) => f.would_prefer_app === 'yes') : 0;
  const preferMaybe = n > 0 ? pct((f) => f.would_prefer_app === 'maybe') : 0;
  const preferNo = n > 0 ? pct((f) => f.would_prefer_app === 'no') : 0;

  const recommendYes = n > 0 ? pct((f) => f.would_recommend === 'yes') : 0;
  const recommendMaybe = n > 0 ? pct((f) => f.would_recommend === 'maybe') : 0;
  const recommendNo = n > 0 ? pct((f) => f.would_recommend === 'no') : 0;

  const vsWaDist = [1, 2, 3, 4, 5].map((v) => ({
    label: VS_WA[v],
    count: fb.filter((f) => f.vs_whatsapp === v).length,
    pct: n > 0 ? pct((f) => f.vs_whatsapp === v) : 0,
  }));

  const featureCounts = Object.entries(FEATURE_LABELS)
    .map(([key, label]) => ({ key, label, count: fb.filter((f) => f.useful_features.includes(key)).length }))
    .sort((a, b) => b.count - a.count);

  const appWins = parseFloat(avgVsWa) > 3;
  const strongPreference = preferYes > 50;

  // Ticket rating aggregates — computed here (was inline in JSX) so all
  // stats live in one place and the section can render regardless of survey.
  const trAvg = (fn: (r: typeof tr[0]) => number) =>
    trN > 0 ? (tr.reduce((sum, r) => sum + fn(r), 0) / trN).toFixed(1) : '0.0';
  const trDist = (fn: (r: typeof tr[0]) => number) =>
    [1, 2, 3, 4, 5].map((v) => ({ star: v, count: tr.filter((r) => fn(r) === v).length }));

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title="POC Analytics" showBack />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── Ticket Ratings section — always first when data exists, since it
             carries the bulk of real POC signal (per-ticket, high volume)
             while the survey trickles slowly. ─────────────────────────── */}
        {trN > 0 && (
          <>
            <Text style={s.responseCount}>{trN} ticket rating{trN !== 1 ? 's' : ''} collected</Text>

            <Text style={s.sectionTitle}>Ticket Ratings</Text>
            <View style={s.ratingGrid}>
              <RatingTile label="Auto-Category Accuracy" value={trAvg((r) => r.auto_category_accuracy)} />
              <RatingTile label="Ease of Creation" value={trAvg((r) => r.ease_of_creation)} />
              <RatingTile label="Overall Experience" value={trAvg((r) => r.overall_experience)} />
            </View>

            <Text style={s.sectionTitle}>Auto-Category Accuracy Distribution</Text>
            <View style={s.card}>
              {trDist((r) => r.auto_category_accuracy).map((d) => (
                <View key={d.star} style={s.barRow}>
                  <Text style={[s.barLabel, { width: 60 }]}>{'★'.repeat(d.star)}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, s.barFillAccent, { width: `${Math.round((d.count / trN) * 100)}%` }]} />
                  </View>
                  <Text style={s.barPct}>{d.count}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>Ease of Creation Distribution</Text>
            <View style={s.card}>
              {trDist((r) => r.ease_of_creation).map((d) => (
                <View key={d.star} style={s.barRow}>
                  <Text style={[s.barLabel, { width: 60 }]}>{'★'.repeat(d.star)}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, s.barFillAccent, { width: `${Math.round((d.count / trN) * 100)}%` }]} />
                  </View>
                  <Text style={s.barPct}>{d.count}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>Overall Experience Distribution</Text>
            <View style={s.card}>
              {trDist((r) => r.overall_experience).map((d) => (
                <View key={d.star} style={s.barRow}>
                  <Text style={[s.barLabel, { width: 60 }]}>{'★'.repeat(d.star)}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, s.barFillAccent, { width: `${Math.round((d.count / trN) * 100)}%` }]} />
                  </View>
                  <Text style={s.barPct}>{d.count}</Text>
                </View>
              ))}
            </View>

            {tr.filter((r) => r.feedback?.trim()).length > 0 && (
              <>
                <Text style={s.sectionTitle}>Ticket Rating Comments</Text>
                <View style={s.card}>
                  {tr.filter((r) => r.feedback?.trim()).map((r, i) => (
                    <View key={r.id} style={[s.freeTextRow, i > 0 && s.freeTextBorder]}>
                      <Text style={s.freeText}>&quot;{r.feedback}&quot;</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ── POC Survey section — only when survey responses exist ────── */}
        {n > 0 && (
          <>
            <Text style={[s.responseCount, trN > 0 && { marginTop: theme.spacing.xl }]}>{n} survey response{n !== 1 ? 's' : ''} collected</Text>

            <View style={[s.verdictCard, strongPreference ? s.verdictPositive : preferNo > 50 ? s.verdictNegative : s.verdictNeutral]}>
              <Ionicons
                name={strongPreference ? 'checkmark-circle' : preferNo > 50 ? 'close-circle' : 'help-circle'}
                size={28}
                color={strongPreference ? '#10B981' : preferNo > 50 ? '#EF4444' : theme.colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.verdictTitle}>
                  {strongPreference ? 'Users prefer the app over WhatsApp' : preferNo > 50 ? 'Users prefer WhatsApp' : 'Mixed signals — more data needed'}
                </Text>
                <Text style={s.verdictSub}>
                  {preferYes}% Yes · {preferMaybe}% Maybe · {preferNo}% No
                </Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>Average Ratings</Text>
            <View style={s.ratingGrid}>
              <RatingTile label="Ticket Creation" value={avgEase} />
              <RatingTile label="Status Tracking" value={avgTracking} />
              <RatingTile label="Overall Experience" value={avgOverall} />
              <RatingTile label="Speed & Performance" value={avgSpeed} />
            </View>

            <Text style={s.sectionTitle}>App vs WhatsApp</Text>
            <View style={s.card}>
              <View style={s.vsAvgRow}>
                <Text style={s.vsAvgLabel}>Average Score</Text>
                <Text style={[s.vsAvgValue, { color: appWins ? '#10B981' : parseFloat(avgVsWa) < 3 ? '#EF4444' : theme.colors.accent }]}>
                  {avgVsWa}/5
                </Text>
                <Text style={s.vsAvgHint}>{appWins ? '(App is easier)' : parseFloat(avgVsWa) < 3 ? '(WhatsApp is easier)' : '(About the same)'}</Text>
              </View>
              {vsWaDist.map((d) => (
                <View key={d.label} style={s.barRow}>
                  <Text style={s.barLabel}>{d.label}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${d.pct}%` }]} />
                  </View>
                  <Text style={s.barPct}>{d.count} ({d.pct}%)</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>Would Recommend</Text>
            <View style={s.card}>
              <View style={s.triBar}>
                <TriSeg label="Yes" pct={recommendYes} color="#10B981" />
                <TriSeg label="Maybe" pct={recommendMaybe} color={theme.colors.accent} />
                <TriSeg label="No" pct={recommendNo} color="#EF4444" />
              </View>
            </View>

            <Text style={s.sectionTitle}>Most Useful Features</Text>
            <View style={s.card}>
              {featureCounts.map((f) => (
                <View key={f.key} style={s.barRow}>
                  <Text style={s.barLabel}>{f.label}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, s.barFillAccent, { width: `${Math.round((f.count / n) * 100)}%` }]} />
                  </View>
                  <Text style={s.barPct}>{f.count}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>What Users Liked Most</Text>
            <FreeTextList items={fb.map((f) => ({ text: f.liked_most, name: (f as any).profile?.display_name, store: (f as any).store?.name }))} />

            <Text style={s.sectionTitle}>Suggested Improvements</Text>
            <FreeTextList items={fb.map((f) => ({ text: f.improvements, name: (f as any).profile?.display_name, store: (f as any).store?.name }))} />

            <Text style={s.sectionTitle}>Additional Feedback</Text>
            <FreeTextList items={fb.map((f) => ({ text: f.additional_feedback, name: (f as any).profile?.display_name, store: (f as any).store?.name }))} />
          </>
        )}

        {/* Hint when only one data source has landed */}
        {n === 0 && trN > 0 && (
          <View style={[s.card, { marginTop: theme.spacing.xl, backgroundColor: '#FFFBEB', borderColor: theme.colors.accent }]}>
            <Text style={s.hintText}>
              No POC survey responses yet — the sections above are per-ticket
              ratings only. Ask users to fill the POC Feedback form for a full
              picture.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}

function RatingTile({ label, value }: { label: string; value: string }) {
  const v = parseFloat(value);
  const color = v >= 4 ? '#10B981' : v >= 3 ? theme.colors.accent : '#EF4444';
  return (
    <View style={s.ratingTile}>
      <Text style={[s.ratingValue, { color }]}>{value}</Text>
      <Ionicons name="star" size={12} color={color} />
      <Text style={s.ratingLabel}>{label}</Text>
    </View>
  );
}

function TriSeg({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={[s.triSeg, { flex: Math.max(pct, 5) }]}>
      <View style={[s.triSegBar, { backgroundColor: color }]} />
      <Text style={s.triSegLabel}>{label} {pct}%</Text>
    </View>
  );
}

function FreeTextList({ items }: { items: { text: string | null; name?: string; store?: string }[] }) {
  const filtered = items.filter((i) => i.text?.trim());
  if (filtered.length === 0) return <View style={s.card}><Text style={s.noData}>No responses</Text></View>;
  return (
    <View style={s.card}>
      {filtered.map((item, i) => (
        <View key={i} style={[s.freeTextRow, i > 0 && s.freeTextBorder]}>
          <Text style={s.freeText}>"{item.text}"</Text>
          {(item.name || item.store) && (
            <Text style={s.freeTextAuthor}>— {[item.name, item.store].filter(Boolean).join(', ')}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: theme.spacing.lg, paddingBottom: 60 },
  responseCount: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: theme.spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14, ...theme.shadows.xs },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: theme.colors.textTertiary, fontWeight: '600' },

  verdictCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1.5 },
  verdictPositive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  verdictNegative: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  verdictNeutral: { backgroundColor: '#FFFBEB', borderColor: theme.colors.accent },
  verdictTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },
  verdictSub: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 2 },

  ratingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ratingTile: {
    flex: 1, minWidth: 140, backgroundColor: theme.colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    padding: 14, alignItems: 'center' as const, gap: 4, ...theme.shadows.xs,
  },
  ratingValue: { fontSize: 28, fontWeight: '900' },
  ratingLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary, textAlign: 'center' as const },

  vsAvgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  vsAvgLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  vsAvgValue: { fontSize: 20, fontWeight: '900' },
  vsAvgHint: { fontSize: 11, color: theme.colors.textTertiary, fontWeight: '600' },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  barLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary, width: 100 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  barFill: { height: 8, borderRadius: 4, backgroundColor: theme.colors.brand, minWidth: 2 },
  barFillAccent: { backgroundColor: theme.colors.accent },
  barPct: { fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary, width: 50, textAlign: 'right' as const },

  triBar: { flexDirection: 'row', gap: 6 },
  triSeg: { alignItems: 'center' as const, gap: 4 },
  triSegBar: { height: 8, borderRadius: 4, width: '100%' },
  triSegLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary },

  distTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 10 },
  noData: { fontSize: 13, color: theme.colors.textTertiary, fontStyle: 'italic', textAlign: 'center' as const, paddingVertical: 8 },
  freeTextRow: { paddingVertical: 10 },
  freeTextBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  freeText: { fontSize: 13, color: theme.colors.textPrimary, lineHeight: 20, fontStyle: 'italic' },
  freeTextAuthor: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 4, fontWeight: '600' },
  hintText: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, fontWeight: '600' },
});
