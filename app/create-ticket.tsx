import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image,
  ActivityIndicator, Modal, Pressable, Platform, KeyboardAvoidingView,
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
  | { id: string; kind: 'attach' }
  | { id: string; kind: 'contact' }
  | { id: string; kind: 'summary' };

type Step = 'awaiting_input' | 'classify' | 'attach' | 'contact' | 'ready';

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
  const [contactNumber, setContactNumber] = useState(profile?.phone ?? '');

  // Chat flow state — drives which inline card appears under the latest bot
  // message. Every user tap that advances the flow appends a new bot bubble +
  // switches step, so the transcript reads top-down like a real conversation.
  const [step, setStep] = useState<Step>('awaiting_input');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    { id: 'greet', kind: 'bot', text: "Hello! Describe your issue and I'll raise a ticket for you." },
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
    onError: () => { inFlightRef.current = false; },
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
          text: "I've classified your issue. Does that look right? Adjust below if needed, then tap Confirm.",
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
    const suggested = [category, subcategory].filter(Boolean).join(' > ');
    // Remove the classify card, keep prior bubbles; append confirmation +
    // attach card. Filtering the card is safer than tracking indices.
    setMessages((m) => [
      ...m.filter((x) => x.kind !== 'classify'),
      { id: `b-attach-${Date.now()}`, kind: 'bot', text: `Got it — ${suggested}. Would you like to attach any files? (photos, videos, or documents — up to ${MAX_ATTACHMENTS})` },
      { id: 'card-attach', kind: 'attach' },
    ]);
    setStep('attach');
  };

  const finishAttachStep = () => {
    // If we don't have a contact number, ask for one before summary.
    if (!contactNumber.trim()) {
      setMessages((m) => [
        ...m.filter((x) => x.kind !== 'attach'),
        { id: `b-contact-${Date.now()}`, kind: 'bot', text: 'One more thing — what phone number should we use for follow-up on this ticket?' },
        { id: 'card-contact', kind: 'contact' },
      ]);
      setStep('contact');
      return;
    }
    proceedToSummary();
  };

  const proceedToSummary = () => {
    setMessages((m) => [
      ...m.filter((x) => x.kind !== 'attach' && x.kind !== 'contact'),
      { id: `b-ready-${Date.now()}`, kind: 'bot', text: 'Ready to submit your ticket!' },
      { id: 'card-summary', kind: 'summary' },
    ]);
    setStep('ready');
  };

  const doSubmit = () => {
    if (inFlightRef.current || submit.isPending) return;
    if (!description.trim() || !category) return;
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
    if (msg.kind === 'classify') return <ClassifyCard key={msg.id} />;
    if (msg.kind === 'attach') return <AttachCard key={msg.id} />;
    if (msg.kind === 'contact') return <ContactCard key={msg.id} />;
    if (msg.kind === 'summary') return <SummaryCard key={msg.id} />;
    return null;
  };

  // ── Inline cards — declared inline so they close over the create-ticket state
  // without a Context/prop-drilling ceremony. Each renders directly under the
  // latest bot bubble that anchors it.

  function ClassifyCard() {
    return (
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

        <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((c) => {
            const selected = category === c.name;
            return (
              <SoftPress
                key={c.id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  setCategoryOverride(c.name);
                  setSubcategoryOverride(null);
                  setItemOverride(null);
                }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{c.name}</Text>
              </SoftPress>
            );
          })}
        </ScrollView>

        {subcategories.length > 0 && (
          <>
            <Text style={[styles.cardLabel, styles.cardLabelSpaced]}>SUB-CATEGORY</Text>
            <View style={styles.chipWrap}>
              {subcategories.map((c) => {
                const selected = subcategory === c.name;
                return (
                  <SoftPress
                    key={c.id}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => {
                      setSubcategoryOverride(c.name);
                      setItemOverride(null);
                    }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{c.name}</Text>
                  </SoftPress>
                );
              })}
            </View>
          </>
        )}

        <SoftPress style={[styles.primaryBtn, !category && styles.primaryBtnDisabled]} onPress={confirmClassification}>
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Confirm</Text>
        </SoftPress>
      </View>
    );
  }

  function AttachCard() {
    return (
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
  }

  function ContactCard() {
    return (
      <View style={styles.card}>
        <TextInput
          style={styles.contactInput}
          value={contactNumber}
          onChangeText={setContactNumber}
          placeholder="Phone number"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <SoftPress
          style={[styles.primaryBtn, !contactNumber.trim() && styles.primaryBtnDisabled]}
          onPress={() => contactNumber.trim() && proceedToSummary()}
        >
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Continue</Text>
        </SoftPress>
      </View>
    );
  }

  function SummaryCard() {
    const suggested = [category, subcategory, item].filter(Boolean).join(' > ');
    return (
      <View style={styles.card}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryHeading}>Summary</Text>
          <Text style={styles.summaryDescription} numberOfLines={3}>{description}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Category</Text>
            <Text style={styles.summaryVal} numberOfLines={1}>{suggested || '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Priority</Text>
            <Text style={[styles.summaryVal, { color: theme.priorityColors[priority] }]}>{priority}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryKey}>Attachments</Text>
            <Text style={styles.summaryVal}>{attachments.length}</Text>
          </View>
        </View>
        <SoftPress style={styles.submitBtn} onPress={doSubmit}>
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.submitBtnText}>Submit Ticket</Text>
        </SoftPress>
        {submit.isError && (
          <Text style={styles.error}>
            {String(submit.error)}
            {createdTicketIdRef.current ? '\n\nTap Submit again to retry — no duplicate will be created.' : ''}
          </Text>
        )}
      </View>
    );
  }

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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
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

  chipRow: { gap: 6, paddingRight: theme.spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff',
    maxWidth: 220,
  },
  chipSelected: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextSelected: { color: '#fff' },

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
