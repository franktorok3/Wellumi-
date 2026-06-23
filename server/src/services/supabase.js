const { createClient } = require('@supabase/supabase-js');
const { config, hasSupabaseConfig } = require('../config');

let adminClient;

function getSupabaseAdmin() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}

async function getUserFromAccessToken(accessToken) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !accessToken) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

module.exports = {
  getSupabaseAdmin,
  getUserFromAccessToken,
};
