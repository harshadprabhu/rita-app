import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Modal, Pressable, FlatList } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/common/Screen';
import { AppHeader } from '../components/common/AppHeader';
import { createTicket, uploadAttachment, pushTicketToSampark } from '../lib/api/tickets';
import { getTicketCategories } from '../lib/api/categories';
import { parseCategory, parsePriority } from '../lib/utils/chatTicketParser';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useAuthStore } from '../stores/authStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ALL_PRIORITIES } from '../constants/ticket';
import { TicketPriority } from '../types';
import { webNoOutline, theme } from '../constants/theme';

const MAX_ATTACHMENTS = 5;

export default function CreateTicket() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  // Priority + category are auto-assigned from the description by the local
  // keyword parser. Priority stays overridable; once the user taps a pill,
  // `priorityOverride` takes over and auto-sync stops.
  const [priorityOverride, setPriorityOverride] = useState<TicketPriority | null>(null);
  const [images, setImages] = useState<{ uri: string; name: string }[]>([]);

  // Category is auto-detected but fully overridable; subcategory is chosen from
  // the picker. Both are Sampark taxonomy values (from ticket_categories).
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [subcategoryOverride, setSubcategoryOverride] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'category' | 'subcategory'>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const { data: allCategories } = useQuery({ queryKey: ['ticketCategories'], queryFn: getTicketCategories });
  const categories = useMemo(() => (allCategories ?? []).filter((c) => !c.is_subcategory), [allCategories]);

  // Voice-to-text: append each recognised phrase to the description.
  const speech = useSpeechToText((text) => {
    setDescription((prev) => (prev ? `${prev.trim()} ${text}` : text));
  });

  const autoCategory = useMemo(() => parseCategory(description), [description]);
  const autoPriority = useMemo(() => parsePriority(description), [description]);
  const priority = priorityOverride ?? autoPriority;
  const category = categoryOverride ?? autoCategory;

  // Subcategories belonging to the currently-selected category.
  const subcategories = useMemo(() => {
    const parent = categories.find((c) => c.name === category);
    if (!parent) return [];
    return (allCategories ?? []).filter((c) => c.is_subcategory && c.parent_id === parent.id);
  }, [allCategories, categories, category]);

  // Auto-parse the subcategory: pick the one whose name words best match the
  // description (e.g. "coupon not showing" → "Coupon Creation"). Overridable.
  const autoSubcategory = useMemo(() => {
    const text = description.toLowerCase();
    if (!text.trim() || !subcategories.length) return null;
    let best: { name: string; hits: number } | null = null;
    for (const sub of subcategories) {
      const words = sub.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      const hits = words.filter((w) => text.includes(w)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { name: sub.name, hits };
    }
    return best?.name ?? null;
  }, [description, subcategories]);

  const subcategory = subcategoryOverride ?? autoSubcategory;

  // Can submit once there's a description and — when the category has
  // subcategories — a subcategory is chosen (auto-parsed or picked).
  const canSubmit = !!description.trim() && (subcategories.length === 0 || !!subcategory);
  const subcategoryMissing = subcategories.length > 0 && !subcategory;

  // The list shown in the picker modal, filtered by the search box.
  const pickerItems = useMemo(() => {
    const source = picker === 'category' ? categories : subcategories;
    const q = pickerSearch.trim().toLowerCase();
    const names = source.map((c) => c.name);
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [picker, categories, subcategories, pickerSearch]);

  const openPicker = (mode: 'category' | 'subcategory') => { setPickerSearch(''); setPicker(mode); };
  const selectPicked = (name: string) => {
    if (picker === 'category') { setCategoryOverride(name); setSubcategoryOverride(null); }
    else setSubcategoryOverride(name);
    setPicker(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned to your account');
      const ticket = await createTicket({
        requester_id: profile.id,
        store_id: profile.store_id,
        description,
        priority,
        category,
        subcategory,
        source: 'form',
      });
      for (const img of images) {
        await uploadAttachment(ticket.id, img.uri, img.name, 'image');
      }
      // Mirror into Sampark (creates the incident + pushes photos). Non-fatal:
      // the ticket is already saved; a failed push retries later.
      await pushTicketToSampark(ticket.id);
      return ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
      router.replace(`/tickets/${ticket.id}`);
    },
  });

  const pickImage = async () => {
    if (images.length >= MAX_ATTACHMENTS) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImages((prev) => [...prev, { uri: asset.uri, name: asset.fileName ?? `photo_${Date.now()}.jpg` }]);
    }
  };

  return (
    <Screen>
      <AppHeader title="Report an Issue" showBack />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="always">
        <View style={styles.labelRow}>
          <Text style={styles.label}>Describe the issue</Text>
          {speech.supported && (
            <TouchableOpacity
              style={[styles.micBtn, speech.listening && styles.micBtnActive]}
              onPress={() => (speech.listening ? speech.stop() : speech.start())}
              activeOpacity={0.7}
            >
              <Ionicons
                name={speech.listening ? 'stop' : 'mic'}
                size={14}
                color={speech.listening ? '#fff' : theme.colors.brand}
              />
              <Text style={[styles.micBtnText, speech.listening && styles.micBtnTextActive]}>
                {speech.listening ? 'Listening… tap to stop' : 'Speak'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? Be as specific as possible…"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          numberOfLines={5}
        />
        {speech.error ? <Text style={styles.micError}>{speech.error}</Text> : null}

        <Text style={[styles.label, styles.spaced]}>
          Category {categoryOverride ? '' : '(auto-detected)'}
        </Text>
        <TouchableOpacity style={styles.selectRow} onPress={() => openPicker('category')} activeOpacity={0.7}>
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.selectValue}>{category}</Text>
          <Text style={styles.selectChange}>Change</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        <Text style={[styles.label, styles.spaced]}>
          Subcategory {subcategories.length > 0 ? '(required)' : ''}
        </Text>
        <TouchableOpacity
          style={[styles.selectRow, subcategoryMissing && styles.selectRowError]}
          onPress={() => openPicker('subcategory')}
          activeOpacity={0.7}
          disabled={subcategories.length === 0}
        >
          <Ionicons name="git-branch-outline" size={16} color={subcategories.length ? theme.colors.brand : theme.colors.textTertiary} />
          <Text style={[styles.selectValue, !subcategory && styles.selectPlaceholder]}>
            {subcategory ?? (subcategories.length ? 'Select a subcategory' : 'None available')}
          </Text>
          {subcategories.length > 0 && <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />}
        </TouchableOpacity>
        {subcategoryMissing && <Text style={styles.micError}>Please choose a subcategory.</Text>}

        <Text style={[styles.label, styles.spaced]}>Priority</Text>
        <View style={styles.pillRow}>
          {ALL_PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.pill, priority === p && { backgroundColor: theme.priorityColors[p] + '22', borderColor: theme.priorityColors[p] }]}
              onPress={() => setPriorityOverride(p)}
            >
              <Text style={[styles.pillText, priority === p && { color: theme.priorityColors[p] }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>
          {priorityOverride ? 'Manually set — tap to change.' : 'Auto-detected from your description. Tap to override.'}
        </Text>

        <Text style={[styles.label, styles.spaced]}>Photos ({images.length}/{MAX_ATTACHMENTS})</Text>
        <View style={styles.imagesRow}>
          {images.map((img, i) => (
            <Image key={i} source={{ uri: img.uri }} style={styles.thumb} />
          ))}
          {images.length < MAX_ATTACHMENTS && (
            <TouchableOpacity style={styles.addThumb} onPress={pickImage}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.brand} />
            </TouchableOpacity>
          )}
        </View>

        {/* Subcategory is required whenever the chosen category has any. */}
        {subcategories.length > 0 && !subcategory && (
          <Text style={styles.requiredHint}>Please select a subcategory to continue.</Text>
        )}
        <TouchableOpacity
          style={[styles.submitBtn, theme.shadows.md, (!canSubmit || submit.isPending) && styles.submitBtnDisabled]}
          onPress={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
        >
          {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Ticket</Text>}
        </TouchableOpacity>
        {submit.isError && <Text style={styles.error}>{String(submit.error)}</Text>}
      </ScrollView>

      {/* Searchable category / subcategory picker */}
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {picker === 'category' ? 'Select category' : 'Select subcategory'}
              </Text>
              <TouchableOpacity onPress={() => setPicker(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.pickerSearchBox}>
              <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
              <TextInput
                style={[styles.pickerSearchInput, webNoOutline]}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="Search…"
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={pickerItems}
              keyExtractor={(name) => name}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const selected = (picker === 'category' ? category : subcategory) === item;
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => selectPicked(item)} activeOpacity={0.7}>
                    <Text style={[styles.pickerRowText, selected && styles.pickerRowTextSel]}>{item}</Text>
                    {selected && <Ionicons name="checkmark" size={18} color={theme.colors.brand} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>No matches</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 2 },
  label: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  micBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.colors.brand + '14', borderWidth: 1, borderColor: theme.colors.brand + '33',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.sm + 2, paddingVertical: 5,
    marginBottom: theme.spacing.xs,
  },
  micBtnActive: { backgroundColor: theme.colors.error, borderColor: theme.colors.error },
  micBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.brand },
  micBtnTextActive: { color: '#fff' },
  micError: { fontSize: 12, color: theme.colors.error, marginTop: theme.spacing.xs },
  spaced: { marginTop: theme.spacing.lg },
  textArea: {
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing.md, color: theme.colors.textPrimary,
    fontSize: 14, minHeight: 110, textAlignVertical: 'top',
  },
  pillRow: { flexDirection: 'row', gap: theme.spacing.sm },
  pill: {
    flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm,
    borderWidth: 1.5, backgroundColor: theme.colors.surface2, borderColor: theme.colors.border,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary, textTransform: 'capitalize' },
  selectRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 48,
  },
  selectRowError: { borderColor: theme.colors.error },
  selectValue: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary },
  selectPlaceholder: { color: theme.colors.textTertiary, fontWeight: '500' },
  selectChange: { fontSize: 12, fontWeight: '700', color: theme.colors.brand },
  hint: { fontSize: 11, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl,
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.md },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  pickerSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 44, marginBottom: theme.spacing.sm,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, color: theme.colors.textPrimary, padding: 0 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  pickerRowText: { fontSize: 15, color: theme.colors.textPrimary, flex: 1 },
  pickerRowTextSel: { color: theme.colors.brand, fontWeight: '700' },
  pickerEmpty: { textAlign: 'center', color: theme.colors.textTertiary, paddingVertical: theme.spacing.xl },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  addThumb: {
    width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1.5, borderColor: theme.colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface2,
  },
  submitBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.md, textAlign: 'center' },
  requiredHint: { color: theme.colors.error, fontSize: 12, marginTop: theme.spacing.md, textAlign: 'center', fontWeight: '600' },
});
