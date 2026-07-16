import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import i18n from '../lib/i18n';

// Map the app's UI language to a BCP-47 tag the OS speech engine knows, biased
// to Indian locales since that's the user base.
const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN',
  kn: 'kn-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN',
};

interface UseSpeechToText {
  listening: boolean;
  supported: boolean;
  error: string;
  start: () => void;
  stop: () => void;
}

/**
 * Native voice-to-text via expo-speech-recognition (the OS speech engine).
 * The web build resolves useSpeechToText.ts instead, which uses the browser's
 * Web Speech API — so the native module never enters the web bundle.
 */
export function useSpeechToText(onTranscript: (text: string) => void): UseSpeechToText {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useSpeechRecognitionEvent('result', (event) => {
    // Only deliver finalised phrases, matching the web behaviour.
    if (!event.isFinal) return;
    const text = event.results?.[0]?.transcript?.trim();
    if (text) onTranscriptRef.current(text);
  });

  useSpeechRecognitionEvent('error', (event) => {
    const map: Record<string, string> = {
      'not-allowed': 'Microphone access was blocked. Allow it and try again.',
      'no-speech': "Didn't catch that — try speaking again.",
      'audio-capture': 'No microphone found.',
      'service-not-allowed': 'Speech recognition is unavailable on this device.',
    };
    setError(map[event.error] ?? `Voice input error: ${event.error}`);
    setListening(false);
  });

  useSpeechRecognitionEvent('end', () => setListening(false));

  const stop = useCallback(() => {
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    void (async () => {
      setError('');
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          setError('Microphone access was blocked. Allow it and try again.');
          return;
        }
        ExpoSpeechRecognitionModule.start({
          lang: LANG_TO_BCP47[i18n.language] ?? 'en-IN',
          interimResults: false, // only finalised phrases
          continuous: true,
        });
        setListening(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Voice input is unavailable on this device.');
        setListening(false);
      }
    })();
  }, []);

  // Stop dictation if the component unmounts mid-listen.
  useEffect(() => () => stop(), [stop]);

  return { listening, supported: true, error, start, stop };
}
