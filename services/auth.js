import { getSupabaseClient } from './supabase';

let initPromise = null;
let cachedSession = null;
let cachedUserId = null;

function logDevUserId(userId) {
  if (__DEV__ && userId) {
    console.log('[wellumi-auth] user id:', userId);
  }
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
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Could not refresh session: ${error.message}`);
  }
  cachedSession = data.session;
  cachedUserId = data.session?.user?.id || null;
  logDevUserId(cachedUserId);
  return {
    session: cachedSession,
    userId: cachedUserId,
  };
}

export async function initializeAuth() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(`Could not restore session: ${sessionError.message}`);
    }

    if (sessionData.session) {
      cachedSession = sessionData.session;
      cachedUserId = sessionData.session.user.id;
      logDevUserId(cachedUserId);
      return sessionData.session;
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(`Could not start anonymous session: ${error.message}`);
    }

    cachedSession = data.session;
    cachedUserId = data.session?.user?.id || null;
    logDevUserId(cachedUserId);
    return data.session;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
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
