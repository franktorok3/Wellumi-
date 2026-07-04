const { containsFiller, acceptsStoryForDisplay } = require('../content/feedQuality');

async function retireIneligibleStories(supabase) {
  const { data: stories, error } = await supabase
    .from('wellness_stories')
    .select('id, title, deck, body, generation_mode, prompt_version, display_eligible, is_active')
    .eq('display_eligible', true);

  if (error) throw new Error(`Could not load stories for cleanup: ${error.message}`);
  if (!stories?.length) return { retired: 0 };

  const toRetire = [];
  for (const story of stories) {
    const bodyText = JSON.stringify(story.body || {});
    if (containsFiller(story.title) || containsFiller(story.deck) || containsFiller(bodyText)) {
      toRetire.push(story.id);
      continue;
    }
    if (
      story.generation_mode === 'fallback' &&
      story.prompt_version &&
      story.prompt_version !== 'wellumi_story_v2'
    ) {
      toRetire.push(story.id);
    }
  }

  if (!toRetire.length) return { retired: 0 };

  const { error: updateError } = await supabase
    .from('wellness_stories')
    .update({
      display_eligible: false,
      is_active: false,
      last_verified_at: new Date().toISOString(),
    })
    .in('id', toRetire);

  if (updateError) throw new Error(`Could not retire stories: ${updateError.message}`);
  return { retired: toRetire.length };
}

async function deactivateOrphanMatches(supabase, userId) {
  const { data: matches, error } = await supabase
    .from('user_story_matches')
    .select('id, story:wellness_stories(id, is_active, display_eligible)')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw new Error(`Could not load matches: ${error.message}`);

  const inactiveIds = (matches || [])
    .filter(
      (match) =>
        !match.story ||
        match.story.is_active === false ||
        match.story.display_eligible === false
    )
    .map((match) => match.id);

  if (!inactiveIds.length) return 0;

  const { error: updateError } = await supabase
    .from('user_story_matches')
    .update({ is_active: false })
    .in('id', inactiveIds);

  if (updateError) throw new Error(`Could not deactivate matches: ${updateError.message}`);
  return inactiveIds.length;
}

function createRefreshToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  retireIneligibleStories,
  deactivateOrphanMatches,
  createRefreshToken,
  acceptsStoryForDisplay,
};
