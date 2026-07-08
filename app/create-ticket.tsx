import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/common/Screen';
import { AppHeader } from '../components/common/AppHeader';
import { createTicket, uploadAttachment } from '../lib/api/tickets';
import { parseCategory, parsePriority } from '../lib/utils/chatTicketParser';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useAuthStore } from '../stores/authStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ALL_PRIORITIES } from '../constants/ticket';
import { TicketPriority } from '../types';
import { theme } from '../constants/theme';

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

  // Voice-to-text: append each recognised phrase to the description.
  const speech = useSpeechToText((text) => {
    setDescription((prev) => (prev ? `${prev.trim()} ${text}` : text));
  });

  const autoCategory = useMemo(() => parseCategory(description), [description]);
  const autoPriority = useMemo(() => parsePriority(description), [description]);
  const priority = priorityOverride ?? autoPriority;

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned to your account');
      const ticket = await createTicket({
        requester_id: profile.id,
        store_id: profile.store_id,
        description,
        priority,
        category: parseCategory(description),
        subcategory: null,
        source: 'form',
      });
      for (const img of images) {
        await uploadAttachment(ticket.id, img.uri, img.name, 'image');
      }
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

        <Text style={[styles.label, styles.spaced]}>Category (auto-detected)</Text>
        <View style={styles.categoryChip}>
          <Ionicons name="pricetag-outline" size={14} color={theme.colors.brand} />
          <Text style={styles.categoryChipText}>{autoCategory}</Text>
        </View>

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

        <TouchableOpacity
          style={[styles.submitBtn, theme.shadows.md, (!description.trim() || submit.isPending) && styles.submitBtnDisabled]}
          onPress={() => submit.mutate()}
          disabled={!description.trim() || submit.isPending}
        >
          {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Ticket</Text>}
        </TouchableOpacity>
        {submit.isError && <Text style={styles.error}>{String(submit.error)}</Text>}
      </ScrollView>
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
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, alignSelf: 'flex-start',
    backgroundColor: theme.colors.brand + '14', borderWidth: 1, borderColor: theme.colors.brand + '33',
    borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs + 1,
  },
  categoryChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.brand },
  hint: { fontSize: 11, color: theme.colors.textTertiary, marginTop: theme.spacing.xs },
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
});
