import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image,
  ActivityIndicator, Modal, Pressable, Platform, KeyboardAvoidingView, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../stores/uiStore';
import { Screen } from '../components/common/Screen';
import { SoftPress } from '../components/common/SoftPress';
import { createTicket, uploadAttachment, pushTicketToSampark } from '../lib/api/tickets';
import { getTicketCategories } from '../lib/api/categories';
import { parsePriority } from '../lib/utils/chatTicketParser';
import { classifySamparkTicket } from '../lib/utils/samparkClassifier';
import { useAuthStore } from '../stores/authStore';
import { useMemberProfileStore } from '../stores/memberProfileStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ALL_PRIORITIES } from '../constants/ticket';
import { TicketPriority } from '../types';
import { theme, webNoOutline } from '../constants/theme';
import { showAlert } from '../lib/utils/alert';

// A chat-style ticket creation flow. The UI feels like the user is
// conversing with a support bot: they describe the issue, the bot suggests
// a category/subcategory, they confirm or adjust, then choose whether to
// attach files, and finally submit. All backend logic (classifier, mutation,
// uploads) is unchanged from the previous form-based version.

const MAX_ATTACHMENTS = 5;

type Attachment = {
  uri: string;
  name: string;
  kind: 'image' | 'video' | 'document';
};

type ChatItem =
  | { id: string; kind: 'bot'; text: string }
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'classify' }
  | { id: string; kind: 'attach' };

type Step = 'awaiting_input' | 'classify' | 'attach' | 'ready';

export default function CreateTicket() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const showToast = useUiStore((s) => s.showToast);

  // Description + all downstream classification state — same shape as before
  // so the mutation, classifier, and Sampark upload paths are untouched.
  const [description, setDescription] = useState('');
  const [priorityOverride, setPriorityOverride] = useState<TicketPriority | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);
  const [subcategoryOverride, setSubcategoryOverride] = useState<string | null>(null);
  const [itemOverride, setItemOverride] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Contact number is strictly 10 digits, digits-only. Strip anything the
  // user types that isn't 0-9 (paste from a formatted string, accidental
  // dashes, etc.) and cap at 10. Prevents junk like "99##99###" that broke
  // the earlier Sampark push retries.
  const sanitizePhone = (s: string) => s.replace(/\D/g, '').slice(0, 10);
  // Contact number comes from the active member profile ("Netflix profile")
  // when there is one, else the shared account's own phone. Auto-filled — the
  // user is never asked for it in the chat any more.
  const activeMember = useMemberProfileStore((s) => s.active);
  const [contactNumber, setContactNumber] = useState(sanitizePhone(activeMember?.phone ?? profile?.phone ?? ''));
  const isPhoneValid = contactNumber.length === 10;

  // Keep the contact number in sync if the active profile changes while this
  // screen is mounted (e.g. user switched profile then came back).
  useEffect(() => {
    if (activeMember?.phone) setContactNumber(sanitizePhone(activeMember.phone));
  }, [activeMember?.id]);

  // Store users share one AD login, so a ticket must be attributed to the
  // person raising it. If no member profile is active yet, send them to pick
  // one (Netflix-style) before composing — its phone then auto-fills below.
  const needsProfile = (profile?.role === 'user' || profile?.role === 'in_store_manager') && !activeMember;
  useEffect(() => {
    // replace (not push) so the composer isn't left in history behind the
    // picker — back from the picker returns home, picking returns here.
    if (needsProfile) router.replace({ pathname: '/select-profile', params: { next: 'create-ticket' } } as never);
  }, [needsProfile]);

  // Chat flow state — drives which inline card appears under the latest bot
  // message. Every user tap that advances the flow appends a new bot bubble +
  // switches step, so the transcript reads top-down like a real conversation.
  const [step, setStep] = useState<Step>('awaiting_input');
  const [draft, setDraft] = useState('');
  // Searchable picker modal — mirrors what the original form had, so the
  // three-level taxonomy stays browsable when the auto-parse is wrong. The
  // dropdown rows themselves just show the current value + a chevron; tapping
  // opens this modal, which is scrollable and search-filtered.
  const [picker, setPicker] = useState<null | 'category' | 'subcategory' | 'item'>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    { id: 'greet', kind: 'bot', text: 'Describe your issue.' },
  ]);

  const { data: allCategories } = useQuery({ queryKey: ['ticketCategories'], queryFn: getTicketCategories });
  const categories = useMemo(() => (allCategories ?? []).filter((c) => !c.is_subcategory), [allCategories]);

  // Live classification of the (possibly-multiple-turn) description.
  const classified = useMemo(() => classifySamparkTicket(description, allCategories ?? []), [description, allCategories]);
  const autoPriority = useMemo(() => parsePriority(description), [description]);
  const priority = priorityOverride ?? autoPriority;
  const category = categoryOverride ?? classified.category;

  const subcategories = useMemo(() => {
    const parent = categories.find((c) => c.name === category);
    if (!parent) return [];
    return (allCategories ?? []).filter((c) => c.is_subcategory && !c.is_item && c.parent_id === parent.id);
  }, [allCategories, categories, category]);

  const autoSubcategory = !categoryOverride || classified.category === categoryOverride ? classified.subcategory : null;
  const subcategory = subcategoryOverride ?? autoSubcategory;

  const items = useMemo(() => {
    const parent = subcategories.find((c) => c.name === subcategory);
    if (!parent) return [];
    return (allCategories ?? []).filter((c) => c.is_item && c.parent_id === parent.id);
  }, [allCategories, subcategories, subcategory]);
  const autoItem = !subcategoryOverride && (!categoryOverride || classified.category === categoryOverride) ? classified.item : null;
  const item = itemOverride ?? autoItem;

  // Auto-scroll to the bottom whenever new messages/cards land.
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages.length, step, attachments.length]);

  // Idempotency + double-tap guard — same rationale as the previous form.
  const createdTicketIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned to your account');

      let ticketId = createdTicketIdRef.current;
      if (!ticketId) {
        const ticket = await createTicket({
          requester_id: profile.id,
          store_id: profile.store_id,
          description,
          priority,
          category,
          subcategory,
          item,
          contact_number: contactNumber.trim() || null,
          member_profile_id: activeMember?.id ?? null,
          member_profile_name: activeMember?.name ?? null,
          source: 'form',
        });
        ticketId = ticket.id;
        createdTicketIdRef.current = ticketId;
        for (const a of attachments) {
          await uploadAttachment(ticketId, a.uri, a.name, a.kind);
        }
      }

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
      createdTicketIdRef.current = null;
      const idLabel = samparkDisplayId ? `#${samparkDisplayId}` : 'created';
      showToast(`Ticket ${idLabel}`, 'success');
      showAlert(
        'Ticket created',
        samparkDisplayId
          ? `Your ticket #${samparkDisplayId} has been created and registered at Sampark.`
          : 'Your ticket has been created. The Sampark sync will complete in the background.',
        [{ text: 'OK', onPress: () => router.replace(`/tickets/${ticketId}`) }],
      );
    },
    onError: (err) => {
      inFlightRef.current = false;
      // Summary step is gone, so surface failures inline as a bot bubble +
      // toast; the attach card stays so the user can tap Skip to retry.
      showToast(err instanceof Error ? err.message : 'Could not create ticket', 'error');
    },
  });

  // ── Chat step transitions ────────────────────────────────────────────────

  const sendDraft = () => {
    const text = draft.trim();
    if (!text || step !== 'awaiting_input') return;
    setDescription(text);
    setDraft('');
    // Bot reply is added asynchronously so classified props settle first.
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, kind: 'user', text },
    ]);
    setStep('classify');
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: `b-classify-${Date.now()}`,
          kind: 'bot',
          text: 'Select category.',
        },
        { id: 'card-classify', kind: 'classify' },
      ]);
    }, 250);
  };

  const confirmClassification = () => {
    if (!category) {
      showToast('Please choose a category first', 'error');
      return;
    }
    // Require sub-category and item when the taxonomy has them — matches the
    // original form's `canSubmit` check so we never submit an "under-specified"
    // ticket that Sampark would reject or auto-file wrongly.
    if (subcategories.length > 0 && !subcategory) {
      showToast('Please choose a sub-category', 'error');
      return;
    }
    if (items.length > 0 && !item) {
      showToast('Please choose an item', 'error');
      return;
    }
    // Remove the classify card, keep prior bubbles; append attach card.
    setMessages((m) => [
      ...m.filter((x) => x.kind !== 'classify'),
      { id: `b-attach-${Date.now()}`, kind: 'bot', text: 'Add files? (optional)' },
      { id: 'card-attach', kind: 'attach' },
    ]);
    setStep('attach');
  };

  // Skip / Continue on the attach card submits the ticket directly. The
  // contact number comes from the active profile (auto-filled), so there is
  // no separate contact or summary step any more — one tap files the ticket.
  const finishAttachStep = () => {
    doSubmit();
  };

  const doSubmit = () => {
    if (inFlightRef.current || submit.isPending) return;
    if (!description.trim() || !category) return;
    // Contact number is optional at the API level, but if the user supplied
    // anything at all it must be exactly 10 digits — block submit rather than
    // ship "99##99###"-style junk to Sampark (which rejects it silently).
    if (contactNumber.length > 0 && !isPhoneValid) {
      showToast('Enter a valid 10-digit phone number', 'error');
      return;
    }
    inFlightRef.current = true;
    submit.mutate();
  };

  // ── Attachment picking ───────────────────────────────────────────────────

  const remainingSlots = MAX_ATTACHMENTS - attachments.length;

  const addAttachment = (a: Attachment) => setAttachments((prev) => [...prev, a]);
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  const pickPhoto = async () => {
    if (remainingSlots <= 0) return;
    if (Platform.OS === 'web') {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!r.canceled && r.assets[0]) addAttachment({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? `photo_${Date.now()}.jpg`, kind: 'image' });
      return;
    }
    showAlert('Add photo', 'Take a new photo or choose from your gallery.', [
      { text: 'Camera', onPress: async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (!r.canceled && r.assets[0]) addAttachment({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? `photo_${Date.now()}.jpg`, kind: 'image' });
      } },
      { text: 'Gallery', onPress: async () => {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
        if (!r.canceled && r.assets[0]) addAttachment({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? `photo_${Date.now()}.jpg`, kind: 'image' });
      } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickVideo = async () => {
    if (remainingSlots <= 0) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8 });
    if (!r.canceled && r.assets[0]) addAttachment({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? `video_${Date.now()}.mp4`, kind: 'video' });
  };

  const pickDocument = async () => {
    if (remainingSlots <= 0) return;
    const r = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) addAttachment({ uri: r.assets[0].uri, name: r.assets[0].name ?? `document_${Date.now()}`, kind: 'document' });
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderMessage = (msg: ChatItem) => {
    if (msg.kind === 'bot') {
      return (
        <View key={msg.id} style={styles.botRow}>
          <View style={styles.botAvatar}><Ionicons name="hardware-chip-outline" size={16} color={theme.colors.brand} /></View>
          <View style={styles.botBubble}><Text style={styles.botText}>{msg.text}</Text></View>
        </View>
      );
    }
    if (msg.kind === 'user') {
      return (
        <View key={msg.id} style={styles.userRow}>
          <View style={styles.userBubble}><Text style={styles.userText}>{msg.text}</Text></View>
        </View>
      );
    }
    if (msg.kind === 'classify') return <React.Fragment key={msg.id}>{renderClassifyCard()}</React.Fragment>;
    if (msg.kind === 'attach') return <React.Fragment key={msg.id}>{renderAttachCard()}</React.Fragment>;
    return null;
  };

  // ── Inline cards — plain JSX-returning functions, NOT nested React
  // components. A nested component's identity is fresh on every parent
  // re-render, which unmounts + remounts every child on every keystroke —
  // that's why the phone-number TextInput kept losing focus and the numpad
  // closed after each digit. Returning JSX keeps the same element instances
  // across renders, so the TextInput stays mounted and focused.

  const renderClassifyCard = () => (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>PRIORITY</Text>
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

        {/* Dropdown-style select rows. The auto-parsed classifier picks
            populate the selected value by default; the user only opens the
            picker if they think the auto-parse is wrong. Same modal used at
            all three levels (see renderPickerModal below). */}
        <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>CATEGORY</Text>
        <TouchableOpacity
          style={styles.selectRow}
          onPress={() => { setPickerSearch(''); setPicker('category'); }}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectValue, !category && styles.selectPlaceholder]} numberOfLines={1}>
            {category ?? 'Select a category'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>

        {subcategories.length > 0 && (
          <>
            <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>SUB-CATEGORY</Text>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => { setPickerSearch(''); setPicker('subcategory'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectValue, !subcategory && styles.selectPlaceholder]} numberOfLines={1}>
                {subcategory ?? 'Select a sub-category'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </>
        )}

        {items.length > 0 && (
          <>
            <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>ITEM</Text>
            <TouchableOpacity
              style={styles.selectRow}
              onPress={() => { setPickerSearch(''); setPicker('item'); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.selectValue, !item && styles.selectPlaceholder]} numberOfLines={1}>
                {item ?? 'Select an item'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </>
        )}

        <SoftPress
          style={[
            styles.primaryBtn,
            (!category || (subcategories.length > 0 && !subcategory) || (items.length > 0 && !item)) && styles.primaryBtnDisabled,
          ]}
          onPress={confirmClassification}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Confirm</Text>
        </SoftPress>
      </View>
  );

  const renderAttachCard = () => (
      <View style={styles.card}>
        <View style={styles.attachRow}>
          <SoftPress style={styles.attachBtn} onPress={pickPhoto} disabled={remainingSlots <= 0}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.brand} />
            <Text style={styles.attachBtnText}>Photo</Text>
          </SoftPress>
          <SoftPress style={styles.attachBtn} onPress={pickVideo} disabled={remainingSlots <= 0}>
            <Ionicons name="videocam-outline" size={20} color="#7C3AED" />
            <Text style={[styles.attachBtnText, { color: '#7C3AED' }]}>Video</Text>
          </SoftPress>
          <SoftPress style={styles.attachBtn} onPress={pickDocument} disabled={remainingSlots <= 0}>
            <Ionicons name="document-outline" size={20} color="#F59E0B" />
            <Text style={[styles.attachBtnText, { color: '#F59E0B' }]}>Document</Text>
          </SoftPress>
        </View>

        {attachments.length > 0 && (
          <View style={styles.attachedList}>
            {attachments.map((a, i) => (
              <View key={i} style={styles.attachedRow}>
                {a.kind === 'image' ? (
                  <Image source={{ uri: a.uri }} style={styles.attachedThumb} />
                ) : (
                  <View style={[styles.attachedThumb, styles.attachedIconThumb]}>
                    <Ionicons name={a.kind === 'video' ? 'videocam' : 'document'} size={18} color={theme.colors.brand} />
                  </View>
                )}
                <Text style={styles.attachedName} numberOfLines={1}>{a.name}</Text>
                <TouchableOpacity onPress={() => removeAttachment(i)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.attachFooter}>
          <Text style={styles.attachCount}>{attachments.length}/{MAX_ATTACHMENTS} files attached</Text>
          <SoftPress style={styles.skipBtn} onPress={finishAttachStep}>
            <Text style={styles.skipBtnText}>{attachments.length ? 'Continue' : 'Skip'}</Text>
          </SoftPress>
        </View>
      </View>
  );

  // ── Header discard confirmation ──────────────────────────────────────────

  const discard = () => {
    if (step === 'awaiting_input' && !draft) { router.back(); return; }
    showAlert('Discard ticket?', 'Your draft will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* Custom chat-style header — not the standard AppHeader, so the trash
          "Discard" affordance can sit on the right at the same visual weight
          as the back arrow. */}
      <View style={styles.header}>
        <TouchableOpacity onPress={discard} hitSlop={10} style={styles.headerSide}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Ticket</Text>
        <TouchableOpacity onPress={discard} hitSlop={10} style={[styles.headerSide, styles.headerSideRight]}>
          <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.85)" />
          <Text style={styles.headerDiscardText}>Discard</Text>
        </TouchableOpacity>
      </View>

      {/* padding on BOTH platforms — behavior=undefined on Android relies on
          windowSoftInputMode=adjustResize and fails when a fixed-height header
          sits above the scroller (composer stays hidden behind the keyboard).
          Offset 0 lines up with the ticket-detail chat fix. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(renderMessage)}
        </ScrollView>

        {/* Bottom composer — only in the initial step. All other steps use the
            inline card CTAs so the user has a single unambiguous next action. */}
        {step === 'awaiting_input' && (
          <View style={styles.composer}>
            <TextInput
              style={[styles.composerInput, webNoOutline]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Describe your issue"
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              onSubmitEditing={sendDraft}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={sendDraft}
              disabled={!draft.trim()}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Searchable category / subcategory / item picker — same UX as the
          original form. Choosing category resets sub/item; choosing sub
          resets item; each pick becomes the corresponding override so the
          classifier's suggestion is only ever a starting point. */}
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {picker === 'category' ? 'Select category' : picker === 'subcategory' ? 'Select sub-category' : 'Select item'}
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
              data={(() => {
                const source = picker === 'category' ? categories : picker === 'subcategory' ? subcategories : items;
                const q = pickerSearch.trim().toLowerCase();
                const names = source.map((c) => c.name);
                return q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
              })()}
              keyExtractor={(name) => name}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item: rowName }) => {
                const selectedValue = picker === 'category' ? category : picker === 'subcategory' ? subcategory : item;
                const selected = selectedValue === rowName;
                return (
                  <TouchableOpacity
                    style={styles.pickerRow}
                    onPress={() => {
                      if (picker === 'category') {
                        setCategoryOverride(rowName);
                        setSubcategoryOverride(null);
                        setItemOverride(null);
                      } else if (picker === 'subcategory') {
                        setSubcategoryOverride(rowName);
                        setItemOverride(null);
                      } else {
                        setItemOverride(rowName);
                      }
                      setPicker(null);
                    }}
                    activeOpacity={0.7}
                  >
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

      {/* Full-screen loader while ticket is being registered + pushed. Same
          gazelle GIF as before — blocks input to prevent a duplicate. */}
      <Modal visible={submit.isPending} transparent animationType="fade">
        <View style={styles.loaderBackdrop}>
          <Image source={require('../assets/Footer Gazelle.gif')} style={styles.loaderGazelle} resizeMode="contain" />
          <Text style={styles.loaderTitle}>Registering your ticket…</Text>
          <Text style={styles.loaderSubtitle}>
            {createdTicketIdRef.current ? 'Retrying Sampark sync' : 'Saving and syncing with Sampark'}
          </Text>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── Header ─────────────────────────────────────────────────────────────
  header: {
    backgroundColor: theme.colors.brand,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 80 },
  headerSideRight: { justifyContent: 'flex-end' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  headerDiscardText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },

  // ── Chat scroll ────────────────────────────────────────────────────────
  chat: { flex: 1, backgroundColor: '#F5F6FA' },
  chatContent: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl },

  // ── Bot bubble ─────────────────────────────────────────────────────────
  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, maxWidth: '92%' },
  botAvatar: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: theme.colors.brand + '15', borderWidth: 1, borderColor: theme.colors.brand + '30',
    alignItems: 'center', justifyContent: 'center',
  },
  botBubble: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2,
    ...theme.shadows.xs,
  },
  botText: { fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20 },

  // ── User bubble ────────────────────────────────────────────────────────
  userRow: { alignSelf: 'flex-end', maxWidth: '80%' },
  userBubble: {
    backgroundColor: theme.colors.brand, borderRadius: 14,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2,
    ...theme.shadows.xs,
  },
  userText: { fontSize: 14, color: '#fff', lineHeight: 20 },

  // ── Inline cards under a bot bubble ────────────────────────────────────
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing.md, gap: theme.spacing.sm, ...theme.shadows.xs,
  },
  cardLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.8 },
  cardLabelSpaced: { marginTop: theme.spacing.sm },

  pillRow: { flexDirection: 'row', gap: 6 },
  pill: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, backgroundColor: '#fff', borderColor: theme.colors.border,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary, textTransform: 'capitalize' },

  // Dropdown-style select row shown for each taxonomy level. Chevron on the
  // right hints the whole row is tappable → opens the searchable modal.
  selectRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10, paddingHorizontal: theme.spacing.md, height: 44,
  },
  selectValue: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary },
  selectPlaceholder: { color: theme.colors.textTertiary, fontWeight: '500' },

  // Bottom-sheet picker modal styles.
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary },
  pickerSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10, paddingHorizontal: theme.spacing.md, height: 44,
    marginBottom: theme.spacing.sm,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, color: theme.colors.textPrimary, padding: 0 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  pickerRowText: { fontSize: 15, color: theme.colors.textPrimary, flex: 1 },
  pickerRowTextSel: { color: theme.colors.brand, fontWeight: '700' },
  pickerEmpty: { textAlign: 'center', color: theme.colors.textTertiary, paddingVertical: theme.spacing.xl },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.brand, borderRadius: 10, paddingVertical: 12, marginTop: theme.spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Attach card ────────────────────────────────────────────────────────
  attachRow: { flexDirection: 'row', gap: 8 },
  attachBtn: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: theme.spacing.md,
    borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#F8FAFC',
  },
  attachBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.brand },
  attachedList: { gap: 8, marginTop: theme.spacing.sm },
  attachedRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    padding: theme.spacing.sm, backgroundColor: '#F8FAFC', borderRadius: 8,
  },
  attachedThumb: {
    width: 36, height: 36, borderRadius: 6, backgroundColor: theme.colors.border,
  },
  attachedIconThumb: { alignItems: 'center', justifyContent: 'center' },
  attachedName: { flex: 1, fontSize: 12, color: theme.colors.textPrimary },
  attachFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.sm },
  attachCount: { fontSize: 12, color: theme.colors.textTertiary },
  skipBtn: {
    paddingHorizontal: theme.spacing.lg, paddingVertical: 8,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: '#fff',
  },
  skipBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },

  // ── Contact card ───────────────────────────────────────────────────────
  contactInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 10, paddingHorizontal: theme.spacing.md, height: 44,
    color: theme.colors.textPrimary, fontSize: 14,
  },
  contactInputError: { borderColor: theme.colors.error },
  contactHint: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 4 },
  contactHintError: { fontSize: 11, color: theme.colors.error, marginTop: 4, fontWeight: '600' },

  // ── Summary card ───────────────────────────────────────────────────────
  summaryBox: {
    backgroundColor: '#EEF2FF', borderRadius: 10, padding: theme.spacing.md, gap: 6,
  },
  summaryHeading: { fontSize: 13, fontWeight: '800', color: theme.colors.brand, marginBottom: 4 },
  summaryDescription: { fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { fontSize: 12, color: theme.colors.textSecondary },
  summaryVal: { fontSize: 12, fontWeight: '700', color: theme.colors.textPrimary, maxWidth: '65%', textAlign: 'right' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.brand, borderRadius: 10, paddingVertical: 14, marginTop: theme.spacing.sm,
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  error: { color: theme.colors.error, fontSize: 12, marginTop: theme.spacing.sm, textAlign: 'center' },

  // ── Bottom composer ────────────────────────────────────────────────────
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm,
    padding: theme.spacing.md, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  composerInput: {
    flex: 1, backgroundColor: '#F5F6FA', borderRadius: 22,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    fontSize: 14, color: theme.colors.textPrimary, maxHeight: 120,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: theme.colors.textTertiary },

  // ── Loader ─────────────────────────────────────────────────────────────
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
