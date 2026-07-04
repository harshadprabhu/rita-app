import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import mr from '../locales/mr.json';
import ta from '../locales/ta.json';
import te from '../locales/te.json';
import kn from '../locales/kn.json';
import bn from '../locales/bn.json';
import gu from '../locales/gu.json';
import pa from '../locales/pa.json';

export const SUPPORTED_LANGUAGES = ['en', 'hi', 'mr', 'ta', 'te', 'kn', 'bn', 'gu', 'pa'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'app.language';

// Display names shown in the language switcher (each in its own script).
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  hi: 'हिंदी',
  mr: 'मराठी',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  bn: 'বাংলা',
  gu: 'ગુજરાતી',
  pa: 'ਪੰਜਾਬੀ',
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    mr: { translation: mr },
    ta: { translation: ta },
    te: { translation: te },
    kn: { translation: kn },
    bn: { translation: bn },
    gu: { translation: gu },
    pa: { translation: pa },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

function isSupported(lng: string | undefined | null): lng is AppLanguage {
  return !!lng && (SUPPORTED_LANGUAGES as readonly string[]).includes(lng);
}

/**
 * Resolve and apply the startup language: a previously saved choice wins;
 * otherwise fall back to the device locale if it is Hindi/Marathi, else English.
 * Called once during app bootstrap (app/_layout.tsx).
 */
export async function loadSavedLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupported(saved)) {
      await i18n.changeLanguage(saved);
      return;
    }
    const deviceCode = getLocales()[0]?.languageCode;
    if (isSupported(deviceCode)) {
      await i18n.changeLanguage(deviceCode);
    }
  } catch {
    // Non-critical — fall back to the default English already set above.
  }
}

/** Change the active language app-wide and persist the choice on-device. */
export async function setLanguage(lng: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lng);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // Persistence failure is non-fatal; the change still applies for this session.
  }
}

export default i18n;
