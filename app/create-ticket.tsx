import React, { useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Modal, Pressable, FlatList, Platform } from 'react-native';
import { useUiStore } from '../stores/uiStore';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/common/Screen';
import { AppHeader } from '../components/common/AppHeader';
import { SoftPress } from '../components/common/SoftPress';
import { createTicket, uploadAttachment, pushTicketToSampark } from '../lib/api/tickets';
import { getTicketCategories } from '../lib/api/categories';
import { parsePriority } from '../lib/utils/chatTicketParser';
import { classifySamparkTicket } from '../lib/utils/samparkClassifier';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useAuthStore } from '../stores/authStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ALL_PRIORITIES } from '../constants/ticket';
import { TicketPriority } from '../types';
import { webNoOutline, theme } from '../constants/theme';
import { showAlert } from '../lib/utils/alert';

const MAX_ATTACHMENTS = 10;

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
  // Validation warnings only appear once the user has tried to submit.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [contactNumber, setContactNumber] = useState('');

  // Category / subcategory / item are auto-detected but fully overridable —
  // all three are Sampark taxonomy values (from ticket_categories), matched by
  // the samparkClassifier engine below.
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [subcategoryOverride, setSubcategoryOverride] = useState<string | null>(null);
  const [itemOverride, setItemOverride] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'category' | 'subcategory' | 'item'>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const { data: allCategories } = useQuery({ queryKey: ['ticketCategories'], queryFn: getTicketCategories });
  const categories = useMemo(() => (allCategories ?? []).filter((c) => !c.is_subcategory), [allCategories]);

  // Voice-to-text: append each recognised phrase to the description.
  const speech = useSpeechToText((text) => {
    setDescription((prev) => (prev ? `${prev.trim()} ${text}` : text));
  });

  // A single classifier pass over the live Sampark taxonomy drives all three
  // auto-detected fields — it's data-driven (learned from real historical
  // tickets), so it re-scores category, subcategory, and item together rather
  // than three independent heuristics that could disagree with each other.
  const classified = useMemo(() => classifySamparkTicket(description, allCategories ?? []), [description, allCategories]);
  const autoPriority = useMemo(() => parsePriority(description), [description]);
  const priority = priorityOverride ?? autoPriority;
  // No silent default to the first category anymore — if the classifier
  // didn't confidently detect one, it stays unset and becomes a required
  // manual pick (see canSubmit below), rather than quietly filing under
  // whichever category happens to sort first.
  const category = categoryOverride ?? classified.category;

  // Subcategories belonging to the currently-selected category.
  const subcategories = useMemo(() => {
    const parent = categories.find((c) => c.name === category);
    if (!parent) return [];
    return (allCategories ?? []).filter((c) => c.is_subcategory && !c.is_item && c.parent_id === parent.id);
  }, [allCategories, categories, category]);

  // Only trust the classifier's auto-subcategory when it's for the same
  // category currently in effect (it may differ once the user overrides
  // category manually, at which point the picker takes over).
  const autoSubcategory = !categoryOverride || classified.category === categoryOverride ? classified.subcategory : null;
  const subcategory = subcategoryOverride ?? autoSubcategory;

  // Items belonging to the currently-selected subcategory (Sampark's finest
  // classification level — e.g. Subcategory "POS" → Item "MPOS").
  const items = useMemo(() => {
    const parent = subcategories.find((c) => c.name === subcategory);
    if (!parent) return [];
    return (allCategories ?? []).filter((c) => c.is_item && c.parent_id === parent.id);
  }, [allCategories, subcategories, subcategory]);
  const autoItem = !subcategoryOverride && (!categoryOverride || classified.category === categoryOverride) ? classified.item : null;
  const item = itemOverride ?? autoItem;

  // Category, subcategory, item, and contact number are all mandatory —
  // either auto-parsed with confidence or manually picked/typed. A field only
  // stays optional when there's genuinely nothing to pick from (no
  // subcategories/items under the current category).
  const categoryMissing = !category;
  const subcategoryMissing = subcategories.length > 0 && !subcategory;
  const itemMissing = items.length > 0 && !item;
  const contactMissing = !contactNumber.trim();
  const canSubmit =
    !!description.trim() && !categoryMissing && !subcategoryMissing && !itemMissing && !contactMissing;

  // The list shown in the picker modal, filtered by the search box.
  const pickerItems = useMemo(() => {
    const source = picker === 'category' ? categories : picker === 'subcategory' ? subcategories : items;
    const q = pickerSearch.trim().toLowerCase();
    const names = source.map((c) => c.name);
    return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
  }, [picker, categories, subcategories, items, pickerSearch]);

  const openPicker = (mode: 'category' | 'subcategory' | 'item') => { setPickerSearch(''); setPicker(mode); };
  const selectPicked = (name: string) => {
    if (picker === 'category') { setCategoryOverride(name); setSubcategoryOverride(null); setItemOverride(null); }
    else if (picker === 'subcategory') { setSubcategoryOverride(name); setItemOverride(null); }
    else setItemOverride(name);
    setPicker(null);
  };

  // If a prior submit created the DB row but Sampark push failed and the
  // user retries, we must NOT insert a second ticket. Remembering the id
  // across retries makes the mutation idempotent — a retry only re-attempts
  // the Sampark push.
  const createdTicketIdRef = useRef<string | null>(null);
  // Belt-and-braces double-tap guard. The button already disables on
  // isPending, but a rapid double-tap in the same JS tick has been observed
  // to sneak past that check and create duplicate tickets.
  const inFlightRef = useRef(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned to your account');

      let ticketId = createdTicketIdRef.current;
      let ticket: Awaited<ReturnType<typeof createTicket>> | null = null;
      if (!ticketId) {
        ticket = await createTicket({
          requester_id: profile.id,
          store_id: profile.store_id,
          description,
          priority,
          category,
          subcategory,
          item,
          contact_number: contactNumber.trim() || null,
          source: 'form',
        });
        ticketId = ticket.id;
        createdTicketIdRef.current = ticketId;
        for (const img of images) {
          await uploadAttachment(ticketId, img.uri, img.name, 'image');
        }
      }

      // Sampark push happens after the DB row exists. On failure, we want to
      // surface the error so the user can retry — but the retry uses the
      // ref above so it never creates a second RITA row. sampark-poll's
      // backstop poller is a secondary safety net.
      let samparkDisplayId: string | null = null;
      try {
        const res = await pushTicketToSampark(ticketId);
        samparkDisplayId = res.display_id;
      } catch (samparkErr) {
        console.warn('[create-ticket] Sampark sync deferred, backstop poller will retry:', samparkErr);
      }
      return { ticketId, samparkDisplayId };
    },
    onSuccess: ({ ticketId, samparkDisplayId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
      inFlightRef.current = false;
      // Clear the idempotency ref so navigating away and creating a NEW
      // ticket later isn't blocked by the previous one.
      createdTicketIdRef.current = null;

      const idLabel = samparkDisplayId ? `#${samparkDisplayId}` : 'Ticket created (Sampark sync pending)';
      const alertBody = samparkDisplayId
        ? `Your ticket ${idLabel} has been created and registered at Sampark.`
        : 'Your ticket has been created. The Sampark sync will complete in the background.';
      useUiStore.getState().showToast(`Ticket created ${samparkDisplayId ? idLabel : ''}`.trim(), 'success');
      showAlert('Ticket created', alertBody, [
        { text: 'OK', onPress: () => router.replace(`/tickets/${ticketId}`) },
      ]);
    },
    onError: () => {
      inFlightRef.current = false;
    },
  });

  const addAsset = (asset: ImagePicker.ImagePickerAsset) => {
    setImages((prev) => [...prev, { uri: asset.uri, name: asset.fileName ?? `photo_${Date.now()}.jpg` }]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) addAsset(result.assets[0]);
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) addAsset(result.assets[0]);
  };

  // Let the user choose the camera or the gallery. On web there's no camera
  // picker, so go straight to file selection.
  const pickImage = () => {
    if (images.length >= MAX_ATTACHMENTS) return;
    if (Platform.OS === 'web') { openGallery(); return; }
    showAlert('Add photo', 'Take a new photo or choose from your gallery.', [
      { text: 'Camera', onPress: openCamera },
      { text: 'Gallery', onPress: openGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
          Category (required) {categoryOverride ? '' : classified.category ? '· auto-detected' : ''}
        </Text>
        <TouchableOpacity
          style={[styles.selectRow, submitAttempted && categoryMissing && styles.selectRowError]}
          onPress={() => openPicker('category')}
          activeOpacity={0.7}
        >
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.brand} />
          <Text style={[styles.selectValue, !category && styles.selectPlaceholder]}>
            {category ?? 'Select a category'}
          </Text>
          <Text style={styles.selectChange}>{category ? 'Change' : ''}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        {submitAttempted && categoryMissing && <Text style={styles.micError}>Please choose a category.</Text>}

        <Text style={[styles.label, styles.spaced]}>
          Subcategory {subcategories.length > 0 ? '(required)' : ''}
        </Text>
        <TouchableOpacity
          style={[styles.selectRow, submitAttempted && subcategoryMissing && styles.selectRowError]}
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
        {submitAttempted && subcategoryMissing && <Text style={styles.micError}>Please choose a subcategory.</Text>}

        <Text style={[styles.label, styles.spaced]}>
          Item {items.length > 0 ? '(required)' : ''}
        </Text>
        <TouchableOpacity
          style={[styles.selectRow, submitAttempted && itemMissing && styles.selectRowError]}
          onPress={() => openPicker('item')}
          activeOpacity={0.7}
          disabled={items.length === 0}
        >
          <Ionicons name="pricetags-outline" size={16} color={items.length ? theme.colors.brand : theme.colors.textTertiary} />
          <Text style={[styles.selectValue, !item && styles.selectPlaceholder]}>
            {item ?? (items.length ? 'Select an item' : 'None available')}
          </Text>
          {items.length > 0 && <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />}
        </TouchableOpacity>
        {submitAttempted && itemMissing && <Text style={styles.micError}>Please choose an item.</Text>}

        <Text style={[styles.label, styles.spaced]}>Contact Number (required)</Text>
        <TextInput
          style={[styles.contactInput, submitAttempted && contactMissing && styles.selectRowError]}
          value={contactNumber}
          onChangeText={setContactNumber}
          placeholder="Phone number for this ticket"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        {submitAttempted && contactMissing && <Text style={styles.micError}>Please enter a contact number.</Text>}

        <Text style={[styles.label, styles.spaced]}>Priority</Text>
        <View style={styles.pillRow}>
          {ALL_PRIORITIES.map((p) => (
            <SoftPress
              key={p}
              style={[styles.pill, priority === p && { backgroundColor: theme.priorityColors[p] + '22', borderColor: theme.priorityColors[p] }]}
              onPress={() => setPriorityOverride(p)}
            >
              <Text style={[styles.pillText, priority === p && { color: theme.priorityColors[p] }]}>{p}</Text>
            </SoftPress>
          ))}
        </View>
        <Text style={styles.hint}>
          {priorityOverride ? 'Manually set — tap to change.' : 'Auto-detected from your description. Tap to override.'}
        </Text>

        <Text style={[styles.label, styles.spaced]}>Photos ({images.length}/{MAX_ATTACHMENTS})</Text>
        <View style={styles.imagesRow}>
          {images.map((img, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri: img.uri }} style={styles.thumb} />
              <TouchableOpacity style={styles.removeThumbBtn} onPress={() => removeImage(i)} hitSlop={8}>
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {images.length < MAX_ATTACHMENTS && (
            <TouchableOpacity style={styles.addThumb} onPress={pickImage}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.brand} />
            </TouchableOpacity>
          )}
        </View>

        <SoftPress
          style={[styles.submitBtn, theme.shadows.md, submit.isPending && styles.submitBtnDisabled]}
          onPress={() => {
            if (inFlightRef.current || submit.isPending) return;
            if (!canSubmit) { setSubmitAttempted(true); return; }
            inFlightRef.current = true;
            submit.mutate();
          }}
          disabled={submit.isPending || inFlightRef.current}
        >
          <LinearGradient colors={theme.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submitBtnInner}>
            {submit.isPending ? <ActivityIndicator color={theme.colors.textPrimary} /> : (
              <>
                <Ionicons name="send" size={15} color={theme.colors.textPrimary} />
                <Text style={styles.submitBtnText}>Submit Ticket</Text>
              </>
            )}
          </LinearGradient>
        </SoftPress>
        {submit.isError && (
          <Text style={styles.error}>
            {String(submit.error)}
            {createdTicketIdRef.current
              ? '\n\nYour ticket was saved locally but the Sampark sync failed. Tap Submit again to retry — a duplicate ticket will NOT be created.'
              : ''}
          </Text>
        )}
      </ScrollView>

      {/* Full-screen loader with the Indriya gazelle running while the ticket
        * is being created + pushed to Sampark. Blocks all input so a second
        * tap can't sneak in and create a duplicate. */}
      <Modal visible={submit.isPending} transparent animationType="fade">
        <View style={styles.loaderBackdrop}>
          <Image source={require('../assets/Footer Gazelle.gif')} style={styles.loaderGazelle} resizeMode="contain" />
          <Text style={styles.loaderTitle}>Registering your ticket…</Text>
          <Text style={styles.loaderSubtitle}>
            {createdTicketIdRef.current ? 'Retrying Sampark sync' : 'Saving and syncing with Sampark'}
          </Text>
        </View>
      </Modal>

      {/* Searchable category / subcategory picker */}
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {picker === 'category' ? 'Select category' : picker === 'subcategory' ? 'Select subcategory' : 'Select item'}
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
              renderItem={({ item: rowName }) => {
                const selectedValue = picker === 'category' ? category : picker === 'subcategory' ? subcategory : item;
                const selected = selectedValue === rowName;
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => selectPicked(rowName)} activeOpacity={0.7}>
                    <Text style={[styles.pickerRowText, selected && styles.pickerRowTextSel]}>{rowName}</Text>
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
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, backgroundColor: theme.colors.surface, borderColor: theme.colors.border,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary, textTransform: 'capitalize' },
  contactInput: {
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 48,
    color: theme.colors.textPrimary, fontSize: 14,
  },
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
  thumbWrap: { width: 72, height: 72 },
  thumb: { width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  removeThumbBtn: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.error, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff', zIndex: 1,
  },
  addThumb: {
    width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1.5, borderColor: theme.colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface2,
  },
  submitBtn: {
    borderRadius: theme.radius.md, overflow: 'hidden', marginTop: theme.spacing.xl,
  },
  submitBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, height: 52,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '800' },
  error: { color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.md, textAlign: 'center' },
  requiredHint: { color: theme.colors.error, fontSize: 12, marginTop: theme.spacing.md, textAlign: 'center', fontWeight: '600' },
  loaderBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl,
  },
  loaderGazelle: { width: 200, height: 140 },
  loaderTitle: {
    color: '#fff', fontSize: 18, fontWeight: '800',
    marginTop: theme.spacing.lg, letterSpacing: 0.3,
  },
  loaderSubtitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500',
    marginTop: theme.spacing.xs, textAlign: 'center',
  },
});
