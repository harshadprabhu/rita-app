import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, Modal, StyleSheet, SectionList, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DbStore } from '../../types';
import { theme } from '../../constants/theme';

interface SingleProps {
  stores: DbStore[];
  multiple?: false;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  label?: string;
}

interface MultiProps {
  stores: DbStore[];
  multiple: true;
  selectedIds: string[];
  onMultiSelect: (ids: string[]) => void;
  label?: string;
}

type Props = SingleProps | MultiProps;

function isMulti(p: Props): p is MultiProps {
  return p.multiple === true;
}

/**
 * The store number staff actually use is the D365 RetailChannelId (NS0040).
 * `code` is the OMOperatingUnitNumber (00000968) — internal, so only fall back
 * to it when a store somehow has no channel id.
 */
function storeNumber(s: DbStore): string {
  return s.retail_channel_id ?? s.code;
}

// Zone order for the grouped list; anything unrecognised sorts last.
const ZONE_ORDER = ['North', 'South', 'East', 'West'];
const UNZONED = 'Other';

/**
 * Group stores into zone sections (region comes from D365's PwC_RegionCode),
 * each sorted by city then name so a zone reads city-by-city.
 */
function buildSections(stores: DbStore[]): { zone: string; data: DbStore[] }[] {
  const byZone = new Map<string, DbStore[]>();
  for (const s of stores) {
    const zone = s.region?.trim() || UNZONED;
    const list = byZone.get(zone);
    if (list) list.push(s); else byZone.set(zone, [s]);
  }
  const rank = (z: string) => {
    const i = ZONE_ORDER.indexOf(z);
    return i === -1 ? ZONE_ORDER.length + (z === UNZONED ? 1 : 0) : i;
  };
  return [...byZone.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([zone, data]) => ({
      zone,
      data: data.sort(
        (a, b) => (a.city ?? '').localeCompare(b.city ?? '') || a.name.localeCompare(b.name),
      ),
    }));
}

function StoreRow({
  store, selected, multiMode, onPress,
}: {
  store: DbStore;
  selected: boolean;
  multiMode: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowBadge}>
        <Text style={styles.rowCode}>{storeNumber(store)}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, selected && styles.rowNameSelected]} numberOfLines={1}>
          {store.name}
        </Text>
        {store.city ? <Text style={styles.rowCity}>{store.city}</Text> : null}
      </View>
      {multiMode ? (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Ionicons name="checkmark" size={13} color="#fff" />}
        </View>
      ) : (
        selected && <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand} />
      )}
    </TouchableOpacity>
  );
}

export function StoreSearchPicker(props: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>([]);

  const multi = isMulti(props);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.stores;
    return props.stores.filter(
      (s) =>
        storeNumber(s).toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.city?.toLowerCase().includes(q) ?? false) ||
        (s.region?.toLowerCase().includes(q) ?? false),
    );
  }, [props.stores, query]);

  const openModal = () => {
    if (multi) setDraft(props.selectedIds);
    setVisible(true);
  };

  const closeModal = () => {
    setVisible(false);
    setQuery('');
  };

  const confirmMulti = () => {
    if (multi) props.onMultiSelect(draft);
    closeModal();
  };

  // Trigger label
  let triggerLabel: string;
  if (multi) {
    const n = props.selectedIds.length;
    if (n === 0) {
      triggerLabel = t('storePicker.allStores');
    } else if (n === 1) {
      triggerLabel = props.stores.find((s) => s.id === props.selectedIds[0])?.name ?? t('storePicker.selectedStore');
    } else {
      triggerLabel = t('storePicker.storesSelected', { n });
    }
  } else {
    const s = props.stores.find((x) => x.id === (props as SingleProps).selectedId);
    triggerLabel = s ? `${storeNumber(s)} – ${s.name}` : t('storePicker.allStores');
  }

  const handleToggleDraft = useCallback((id: string) => {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (multi) {
      setDraft([]);
    } else {
      (props as SingleProps).onSelect(undefined);
      closeModal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi]);

  const handleSelectSingle = useCallback((id: string) => {
    if (!multi) {
      (props as SingleProps).onSelect(id);
      closeModal();
    } else {
      handleToggleDraft(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, handleToggleDraft]);

  const allStoreSelected = multi ? draft.length === 0 : !(props as SingleProps).selectedId;

  const sections = useMemo(() => buildSections(filtered), [filtered]);

  /** Multi-select: toggle every store in a zone at once. */
  const toggleZone = useCallback((zoneStores: DbStore[]) => {
    setDraft((prev) => {
      const ids = zoneStores.map((s) => s.id);
      const allIn = ids.every((id) => prev.includes(id));
      return allIn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
    });
  }, []);

  return (
    <>
      {/* Trigger */}
      <View style={styles.triggerWrap}>
        {props.label ? <Text style={styles.label}>{props.label}</Text> : null}
        <TouchableOpacity style={styles.trigger} onPress={openModal} activeOpacity={0.8}>
          <View style={styles.triggerLeft}>
            <Ionicons
              name={multi && (props as MultiProps).selectedIds.length > 0 ? 'business-outline' : 'earth-outline'}
              size={16}
              color={theme.colors.textSecondary}
              style={{ marginRight: theme.spacing.sm }}
            />
            <Text style={styles.triggerText} numberOfLines={1}>{triggerLabel}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Modal */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheet}
          >
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {multi ? t('storePicker.selectStoresTitle') : t('storePicker.selectStoreTitle')}
              </Text>
              <TouchableOpacity onPress={closeModal} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons name="close" size={24} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color={theme.colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('storePicker.searchPlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.countText}>
              {t('storePicker.storeCount', { count: filtered.length })}
            </Text>

            {/* List — grouped by zone (North / South / East / West) */}
            <SectionList
              sections={sections}
              keyExtractor={(s) => s.id}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled
              renderSectionHeader={({ section }) => {
                const zoneIds = section.data.map((s) => s.id);
                const allIn = multi && zoneIds.length > 0 && zoneIds.every((id) => draft.includes(id));
                return (
                  <View style={styles.zoneHeader}>
                    <Ionicons name="map-outline" size={12} color={theme.colors.brand} />
                    <Text style={styles.zoneName}>{section.zone}</Text>
                    <Text style={styles.zoneCount}>{section.data.length}</Text>
                    {multi && (
                      <TouchableOpacity onPress={() => toggleZone(section.data)} hitSlop={8}>
                        <Text style={styles.zoneAll}>{allIn ? 'Clear' : 'Select all'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
              ListHeaderComponent={
                <TouchableOpacity
                  style={[styles.row, styles.allRow, allStoreSelected && styles.allRowSelected]}
                  onPress={handleSelectAll}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowBadge, styles.allBadge]}>
                    <Ionicons name="earth" size={14} color="#fff" />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, allStoreSelected && styles.rowNameSelected]}>
                      {t('storePicker.allStores')}
                    </Text>
                    <Text style={styles.rowCity}>{t('storePicker.sendToEveryone')}</Text>
                  </View>
                  {multi ? (
                    <View style={[styles.checkbox, allStoreSelected && styles.checkboxSelected]}>
                      {allStoreSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                  ) : (
                    allStoreSelected && <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand} />
                  )}
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const selected = multi
                  ? draft.includes(item.id)
                  : (props as SingleProps).selectedId === item.id;
                return (
                  <StoreRow
                    store={item}
                    selected={selected}
                    multiMode={!!multi}
                    onPress={() => handleSelectSingle(item.id)}
                  />
                );
              }}
              ListEmptyComponent={
                query.length > 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>{t('storePicker.noMatch', { query })}</Text>
                  </View>
                ) : null
              }
              contentContainerStyle={{ paddingBottom: theme.spacing.lg }}
              initialNumToRender={25}
              maxToRenderPerBatch={30}
              windowSize={10}
            />

            {/* Multi-select confirm */}
            {multi && (
              <View style={styles.confirmRow}>
                <TouchableOpacity style={styles.confirmBtn} onPress={confirmMulti} activeOpacity={0.8}>
                  <Text style={styles.confirmBtnText}>
                    {draft.length === 0
                      ? t('storePicker.confirmAll')
                      : t('storePicker.confirmCount', { count: draft.length })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger
  triggerWrap: { marginBottom: theme.spacing.md },
  label: {
    color: theme.colors.textTertiary,
    fontSize: 12,
    marginBottom: theme.spacing.xs,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface2,
  },
  triggerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  triggerText: { flex: 1, color: theme.colors.textPrimary, fontSize: 14 },

  // Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    maxHeight: '88%',
    paddingTop: theme.spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: { fontWeight: '700', color: theme.colors.textPrimary, fontSize: 16 },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  countText: {
    color: theme.colors.textTertiary,
    fontSize: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },

  // List rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface2,
    gap: theme.spacing.md,
  },
  allRow: {
    backgroundColor: theme.colors.surface2,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },

  // Zone section header
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  zoneName: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: theme.colors.brand,
    textTransform: 'uppercase',
  },
  zoneCount: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textTertiary,
  },
  zoneAll: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.accent,
  },
  allRowSelected: { backgroundColor: theme.colors.brand + '14' },
  rowSelected: { backgroundColor: theme.colors.brand + '14' },
  rowBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allBadge: { backgroundColor: theme.colors.brand },
  rowCode: {
    color: theme.colors.brand,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  rowInfo: { flex: 1, gap: 1 },
  rowName: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '500' },
  rowNameSelected: { color: theme.colors.brand, fontWeight: '700' },
  rowCity: { color: theme.colors.textTertiary, fontSize: 12 },

  // Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },

  emptyWrap: { alignItems: 'center', paddingVertical: theme.spacing.xxl, gap: theme.spacing.sm },
  emptyText: { color: theme.colors.textTertiary, fontSize: 14 },

  // Confirm
  confirmRow: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl + theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  confirmBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
