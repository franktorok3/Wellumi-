const { getSupabaseAdmin } = require('./supabase');

const USER_OWNED_TABLES = [
  { table: 'user_story_feedback', column: 'user_id' },
  { table: 'user_interest_signals', column: 'user_id' },
  { table: 'user_preferences', column: 'user_id' },
  { table: 'user_story_matches', column: 'user_id' },
  { table: 'product_interest_profiles', column: 'user_id' },
  { table: 'user_feed_refresh', column: 'user_id' },
  { table: 'saved_products', column: 'user_id' },
  { table: 'scans', column: 'user_id' },
  { table: 'analyses', column: 'user_id' },
  { table: 'profiles', column: 'id' },
];

async function countUserRows(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('count_user_owned_rows', { p_user_id: userId });
  if (error) {
    const counts = {};
    for (const entry of USER_OWNED_TABLES) {
      const { count, countError } = await supabase
        .from(entry.table)
        .select('*', { count: 'exact', head: true })
        .eq(entry.column, userId);
      if (countError) throw new Error(`Could not count ${entry.table}: ${countError.message}`);
      counts[entry.table] = count || 0;
    }
    return counts;
  }
  return data;
}

async function deleteAccount(userId, { confirm = false } = {}) {
  if (!confirm) {
    const error = new Error('Account deletion requires explicit confirmation.');
    error.statusCode = 400;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  for (const entry of [...USER_OWNED_TABLES].reverse()) {
    const { error } = await supabase.from(entry.table).delete().eq(entry.column, userId);
    if (error) throw new Error(`Could not delete from ${entry.table}: ${error.message}`);
  }

  await supabase.from('guest_migration_tokens').delete().eq('guest_user_id', userId);

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`Could not delete auth user: ${authError.message}`);
  return { deleted: true };
}

async function markAccountUpgraded(userId, accountType) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      account_type: accountType,
      last_profile_sync_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw new Error(`Could not update account type: ${error.message}`);
  return data;
}

module.exports = {
  countUserRows,
  deleteAccount,
  markAccountUpgraded,
  USER_OWNED_TABLES,
};
