import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import i18n from '../lib/i18n';

// Map the app's UI language to a BCP-47 tag the browser's speech engine knows,
// biased to Indian locales since that's the user base.
const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', ta: 'ta-IN', te: 'te-IN',
  kn: 'kn-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN',
};

function getSpeechRecognition(): (new () => any) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

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
 * Voice-to-text dictation via the browser Web Speech API. Web-only; returns
 * `supported: false` on native (Expo has no built-in speech recognition), so
 * callers can hide the mic button there.
 *
 * `onTranscript` fires once per finalised phrase with the recognised text; the
 * caller decides how to append it (e.g. into a description field).
 */
export function useSpeechToText(onTranscript: (text: string) => void): UseSpeechToText {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const supported = getSpeechRecognition() !== null;

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) { setError('Voice input is not supported in this browser.'); return; }
    setError('');

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
  }, []);

  // Stop dictation if the component unmounts mid-listen.
  useEffect(() => () => stop(), [stop]);

  return { listening, supported, error, start, stop };
}
