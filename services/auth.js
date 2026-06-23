import { getSupabaseClient } from './supabase';

export async function ensureAnonymousSession() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    return sessionData.session;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Could not start anonymous session: ${error.message}`);
  }

  return data.session;
}

export async function getAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}
