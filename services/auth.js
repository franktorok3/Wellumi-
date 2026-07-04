import { getSupabaseClient } from './supabase';
import { AUTH_INIT_TIMEOUT_MS } from './config';

let initPromise = null;
let cachedSession = null;
let cachedUserId = null;
let authListenerAttached = false;

function logDev(...args) {
  if (__DEV__) {
    console.log('[wellumi-auth]', ...args);
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s. Check Supabase connectivity and env vars.`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function attachAuthListener(supabase) {
  if (authListenerAttached || !supabase) return;
  authListenerAttached = true;
  supabase.auth.onAuthStateChange((event, session) => {
    cachedSession = session;
    cachedUserId = session?.user?.id || null;
    logDev('auth state changed:', event, cachedUserId ? 'user present' : 'signed out');
  });
}

export function getAuthState() {
  return {
    userId: cachedUserId,
    isReady: Boolean(cachedSession),
  };
}

export async function clearAuthCache() {
  cachedSession = null;
  cachedUserId = null;
  initPromise = null;
}

export async function refreshAuthState() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    AUTH_INIT_TIMEOUT_MS,
    'Session refresh'
  );
  if (error) {
    throw new Error(`Could not refresh session: ${error.message}`);
  }
  cachedSession = data.session;
  cachedUserId = data.session?.user?.id || null;
  logDev('session refreshed', cachedUserId ? 'user present' : 'no session');
  return {
    session: cachedSession,
    userId: cachedUserId,
  };
}

export async function initializeAuth() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    logDev('initializing auth');
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error(
        'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
      );
    }

    attachAuthListener(supabase);

    const { data: sessionData, error: sessionError } = await withTimeout(
      supabase.auth.getSession(),
      AUTH_INIT_TIMEOUT_MS,
      'Session restore'
    );
    if (sessionError) {
      throw new Error(`Could not restore session: ${sessionError.message}`);
    }

    if (sessionData.session) {
      cachedSession = sessionData.session;
      cachedUserId = sessionData.session.user.id;
      logDev('restored existing session', cachedUserId);
      return sessionData.session;
    }

    logDev('no stored session, signing in anonymously');
    const { data, error } = await withTimeout(
      supabase.auth.signInAnonymously(),
      AUTH_INIT_TIMEOUT_MS,
      'Anonymous sign-in'
    );
    if (error) {
      throw new Error(`Could not start anonymous session: ${error.message}`);
    }

    cachedSession = data.session;
    cachedUserId = data.session?.user?.id || null;
    logDev('anonymous session ready', cachedUserId);
    return data.session;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    logDev('auth init failed', error?.message);
    throw error;
  }
}

export async function ensureAnonymousSession() {
  return initializeAuth();
}

export async function getAccessToken() {
  await initializeAuth();
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  cachedSession = data.session;
  cachedUserId = data.session?.user?.id || cachedUserId;
  return data.session?.access_token || null;
}

export async function getCurrentUserId() {
  await initializeAuth();
  return cachedUserId;
}

export async function sendEmailCode(email) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: String(email).trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function verifyEmailCode(email, token) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: String(email).trim(),
    token: String(token).trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
  cachedSession = data.session;
  cachedUserId = data.session?.user?.id || null;
  logDev('email verified', cachedUserId);
  return data.session;
}

export async function signOutAndReset() {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  await clearAuthCache();
  return initializeAuth();
}
