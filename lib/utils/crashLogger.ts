import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent crash catcher + breadcrumb tracer.
 *
 * Motivation: on the standalone Android build the app has been crashing
 * after login with zero surviving output — no red-box (release build), no
 * visible error message, no way to see WHERE it crashed without adb logcat.
 *
 * Two layers:
 * 1) A global JS error handler that writes the caught error to AsyncStorage
 *    for the NEXT launch to display. Catches JS-visible errors and
 *    unhandled promise rejections.
 * 2) A breadcrumb tracer: each named phase writes an entry to a rolling
 *    breadcrumb list. Even if the app dies natively — where the JS error
 *    handler can't catch anything — the LAST breadcrumb tells us where
 *    the process was when it crashed. That's the diagnostic we've been
 *    missing every time the app crashed with no banner shown afterwards.
 */

const KEY = '@rita:last_crash';
const CRUMBS_KEY = '@rita:breadcrumbs';
const MAX_CRUMBS = 40;

export interface PersistedCrash {
  message: string;
  stack: string;
  when: string;
  route: string | null;
  kind: 'jsError' | 'unhandledRejection';
}

/** Install as early as possible in the app boot path. Idempotent. */
export function installCrashLogger(getRoute: () => string | null): void {
  const persist = (kind: PersistedCrash['kind'], err: unknown) => {
    try {
      const e = err instanceof Error ? err : new Error(String(err));
      const payload: PersistedCrash = {
        message: e.message || String(err),
        stack: (e.stack || '').slice(0, 4000),
        when: new Date().toISOString(),
        route: getRoute(),
        kind,
      };
      // Fire-and-forget — AsyncStorage.setItem returns a promise but we can't
      // await here (the process is about to die), and the write is fast
      // enough to typically complete before the JVM tears down.
      AsyncStorage.setItem(KEY, JSON.stringify(payload)).catch(() => null);
    } catch {
      // Never let the crash logger itself crash the crash path.
    }
  };

  // Global uncaught JS error hook — ErrorUtils is a React Native runtime
  // global (typed loosely; not in @types).
  const GEU = (globalThis as unknown as { ErrorUtils?: { setGlobalHandler: (h: (e: Error, isFatal?: boolean) => void) => void; getGlobalHandler: () => (e: Error, isFatal?: boolean) => void } }).ErrorUtils;
  if (GEU) {
    const prior = GEU.getGlobalHandler();
    GEU.setGlobalHandler((error, isFatal) => {
      persist('jsError', error);
      // Preserve the original behavior (usually: throw → RN's default handler
      // shows the red-box in dev / crashes the JS engine in release).
      prior?.(error, isFatal);
    });
  }

  // Unhandled promise rejections (a common way a bad await in a mount effect
  // slips past every try/catch and takes the app down).
  const p = (globalThis as unknown as { process?: { on?: (ev: string, cb: (r: unknown) => void) => void } }).process;
  if (p && typeof p.on === 'function') {
    p.on('unhandledRejection', (reason) => persist('unhandledRejection', reason));
  }
}

export async function readAndClearPersistedCrash(): Promise<PersistedCrash | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    return JSON.parse(raw) as PersistedCrash;
  } catch {
    return null;
  }
}

// ---- Breadcrumb trail (survives even a hard native crash) ----

// In-memory ring buffer, mirrored to AsyncStorage on every write so the
// trail is on disk within milliseconds of each step. On next launch,
// readBreadcrumbs() returns whatever was captured before the process died.
let inMem: { at: string; label: string }[] = [];

/** Emit a named checkpoint. Cheap; safe to call on every mount / phase. */
export function breadcrumb(label: string): void {
  try {
    inMem.push({ at: new Date().toISOString().slice(11, 23), label });
    if (inMem.length > MAX_CRUMBS) inMem = inMem.slice(-MAX_CRUMBS);
    // Fire-and-forget write of the whole buffer — AsyncStorage batches
    // efficiently on native, and even a hard native crash usually gives
    // the JVM enough microseconds to flush the pending write.
    AsyncStorage.setItem(CRUMBS_KEY, JSON.stringify(inMem)).catch(() => null);
  } catch {
    /* never let logging crash the app */
  }
}

export async function readAndClearBreadcrumbs(): Promise<{ at: string; label: string }[]> {
  try {
    const raw = await AsyncStorage.getItem(CRUMBS_KEY);
    if (!raw) return [];
    await AsyncStorage.removeItem(CRUMBS_KEY);
    inMem = [];
    return JSON.parse(raw) as { at: string; label: string }[];
  } catch {
    return [];
  }
}
