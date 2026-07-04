#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { getSupabaseAdmin } = require('../src/services/supabase');

async function main() {
  const userId = process.argv[2];
  const resetPreferences = process.argv.includes('--reset-preferences');
  const allowProduction = process.argv.includes('--allow-production');

  if (!userId) {
    console.error('Usage: npm run reset:user-feed -- <user-id> [--reset-preferences] [--allow-production]');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    console.error('Refusing to reset feed in production without --allow-production');
    process.exit(1);
  }

  const supabase = getSupabaseAdmin();

  const { data: deactivatedMatches, error: matchError } = await supabase
    .from('user_story_matches')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .select('id');

  if (matchError) throw new Error(matchError.message);

  if (resetPreferences) {
    await supabase.from('user_interest_signals').delete().eq('user_id', userId);
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        selected_interests: [],
        selected_use_cases: [],
        content_balance: {},
        limited_topics: [],
        preferred_feed_mix: {},
        notifications: {},
      });
  }

  console.log(
    JSON.stringify(
      {
        userId,
        deactivatedMatches: deactivatedMatches?.length || 0,
        resetPreferences,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
