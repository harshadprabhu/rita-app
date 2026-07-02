import React, { useState } from 'react';
import {
  View, StyleSheet, Image, TouchableOpacity, Modal,
  Dimensions, Linking, Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DbTicketAttachment } from '../../types';
import { getAttachmentUrl } from '../../lib/api/tickets';
import { theme } from '../../constants/theme';

interface Props {
  attachments: DbTicketAttachment[];
}

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 48) / 3;

function getFileIcon(fileType: DbTicketAttachment['file_type']): keyof typeof Ionicons.glyphMap {
  if (fileType === 'video') return 'videocam';
  if (fileType === 'document') return 'document-text';
  return 'image';
}

function getFileColor(fileType: DbTicketAttachment['file_type']): string {
  if (fileType === 'video') return '#7C3AED';
  if (fileType === 'document') return '#D97706';
  return theme.colors.brand;
}

function AttachmentThumb({
  att,
  onPress,
}: {
  att: DbTicketAttachment;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const url = getAttachmentUrl(att.storage_path);
  const isImage = !att.file_type || att.file_type === 'image';

  if (isImage) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.thumbWrap}>
        <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  const icon = getFileIcon(att.file_type);
  const color = getFileColor(att.file_type);
  const label =
    att.file_type === 'video'
      ? t('createTicket.video')
      : att.file_name?.split('.').pop()?.toUpperCase() ?? 'DOC';

  return (
    <TouchableOpacity onPress={onPress} style={[styles.thumbWrap, styles.fileTile]}>
      <Ionicons name={icon} size={28} color={color} />
      <Text style={[styles.fileLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function AttachmentGrid({ attachments }: Props) {
  const { t } = useTranslation();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (!attachments.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('ticketDetail.noAttachments')}</Text>
      </View>
    );
  }

  const handlePress = (att: DbTicketAttachment) => {
    const url = getAttachmentUrl(att.storage_path);
    const isImage = !att.file_type || att.file_type === 'image';
    if (isImage) {
      setLightboxUrl(url);
    } else {
      Linking.openURL(url).catch(() => null);
    }
  };

  return (
    <>
      <View style={styles.grid}>
        {attachments.map((att) => (
          <AttachmentThumb key={att.id} att={att} onPress={() => handlePress(att)} />
        ))}
      </View>

      <Modal
        visible={!!lightboxUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUrl(null)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {lightboxUrl && (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm - 2,
  },
  thumbWrap: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  fileTile: {
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  fileLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  empty: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 24,
    zIndex: 10,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
});
