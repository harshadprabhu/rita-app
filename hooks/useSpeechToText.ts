import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import i18n from '../lib/i18n';

// Map the app's UI language to a BCP-47 tag the speech engine knows, biased
// to Indian locales since that's the user base.
const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN',
  kn: 'kn-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN',
};

function getWebSpeechRecognition(): (new () => any) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

const NATIVE_ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it and try again.',
  'no-speech': "Didn't catch that — try speaking again.",
  'audio-capture': 'No microphone found.',
  'service-not-allowed': 'Voice input is not available on this device.',
  'language-not-supported': 'This language is not supported for voice input.',
};

interface UseSpeechToText {
  /** True while actively listening. */
  listening: boolean;
  /** Whether dictation is available in this environment at all. */
  supported: boolean;
  /** A human-readable error (mic denied, no speech, etc.), or ''. */
  error: string;
  /** Begin listening; recognised phrases are delivered to onTranscript. */
  start: () => void;
  /** Stop listening. */
  stop: () => void;
}

/**
 * Voice-to-text dictation. Web uses the browser's Web Speech API directly;
 * native (iOS/Android) uses `expo-speech-recognition`'s on-device recognizer.
 * `onTranscript` fires once per finalised phrase with the recognised text;
 * the caller decides how to append it (e.g. into a description field).
 */
export function useSpeechToText(onTranscript: (text: string) => void): UseSpeechToText {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const isNative = Platform.OS !== 'web';
  const webSupported = getWebSpeechRecognition() !== null;
  const supported = isNative || webSupported;

  // ---- Native (iOS/Android) events — registered unconditionally per the
  // Rules of Hooks; each handler no-ops on web, which still runs its own
  // Web Speech API implementation below rather than this module's web polyfill.
  useSpeechRecognitionEvent('start', () => { if (isNative) setListening(true); });
  useSpeechRecognitionEvent('end', () => { if (isNative) setListening(false); });
  useSpeechRecognitionEvent('result', (event) => {
    if (!isNative || !event.isFinal) return;
    const text = event.results?.[0]?.transcript?.trim();
    if (text) onTranscriptRef.current(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (!isNative) return;
    setError(NATIVE_ERROR_MESSAGES[event.error] ?? `Voice input error: ${event.error}`);
    setListening(false);
  });

  const stop = useCallback(() => {
    if (isNative) {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* already stopped */ }
      setListening(false);
      return;
    }
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, [isNative]);

  const start = useCallback(() => {
    setError('');

    if (isNative) {
      ExpoSpeechRecognitionModule.requestPermissionsAsync()
        .then((result) => {
          if (!result.granted) {
            setError('Microphone access was blocked. Allow it and try again.');
            return;
          }
          ExpoSpeechRecognitionModule.start({
            lang: LANG_TO_BCP47[i18n.language] ?? 'en-IN',
            continuous: true,
            interimResults: false,
          });
        })
        .catch(() => setError('Could not start voice input.'));
      return;
    }

    const SR = getWebSpeechRecognition();
    if (!SR) { setError('Voice input is not supported in this browser.'); return; }

    const recognition = new SR();
    recognition.lang = LANG_TO_BCP47[i18n.language] ?? 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = false; // only deliver finalised phrases

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript?.trim();
          if (text) onTranscriptRef.current(text);
        }
      }
    };
    recognition.onerror = (event: any) => {
      const map: Record<string, string> = {
        'not-allowed': 'Microphone access was blocked. Allow it and try again.',
        'no-speech': "Didn't catch that — try speaking again.",
        'audio-capture': 'No microphone found.',
      };
      setError(map[event.error] ?? `Voice input error: ${event.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if called while already running — ignore.
    }
  }, [isNative]);

  // Stop dictation if the component unmounts mid-listen.
  useEffect(() => () => stop(), [stop]);

  return { listening, supported, error, start, stop };
}
