import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

export type UploadFileType = 'image' | 'video' | 'document';

export function getMimeType(fileName: string, fileType: UploadFileType): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (fileType === 'image') {
    const map: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    };
    return map[ext] ?? 'image/jpeg';
  }
  if (fileType === 'video') {
    const map: Record<string, string> = {
      mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
      mkv: 'video/x-matroska', webm: 'video/webm',
    };
    return map[ext] ?? 'video/mp4';
  }
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  // On web the picker yields a blob:/data: URL that expo-file-system can't
  // read — fetch it straight into bytes instead. This is why photo upload
  // silently failed in the browser.
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }

  let fileUri = uri;
  if (!uri.startsWith('file://')) {
    const dest = FileSystem.cacheDirectory + `upload_${Date.now()}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    fileUri = dest;
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_QUALITY = 0.7;

/**
 * Downscale + recompress large images client-side before they hit Storage
 * transit. Skips non-image attachments untouched.
 */
export async function compressIfImage(uri: string, fileType: UploadFileType): Promise<string> {
  if (fileType !== 'image') return uri;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { compress: IMAGE_COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    // If manipulation fails (e.g. unsupported format), fall back to the original.
    return uri;
  }
}
