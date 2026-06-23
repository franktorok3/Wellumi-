export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.68.66:3001';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

export const LABEL_ANALYSIS_TIMEOUT_MS = 60000;

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
