const { getSupabaseAdmin } = require('./supabase');
const { deriveUserInterests } = require('./interestTerms');
const { fetchFoodRecalls, fetchDrugRecalls, mapFoodRecallToFeedItem, mapDrugRecallToFeedItem } = require('./openFda');
const { searchPubMed } = require('./pubmed');
const { listUserScans, listSavedProducts } = require('./scanWorkflow');

const { hasSuccessfulProvider, isCompleteProviderFailure } = require('../utils/feedRefreshPolicy');
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const GENERAL_RECALL_LIMIT = 6;
const IS_DEV = process.env.NODE_ENV !== 'production';

function scoreMatch(item, interests) {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  let score = 0;
  const matched = [];

  for (const interest of interests) {
    if (haystack.includes(interest.term)) {
      score += interest.weight;
      matched.push(interest.term);
    }
  }

  return { score, matched: [...new Set(matched)] };
}

function logProviderResult({ name, success, candidateCount, error = null }) {
  if (!IS_DEV) {
    return;
  }
  console.log('[wellumi-feed] provider', {
    provider: name,
    success,
    candidateCount,
    error,
  });
}

function recordProviderResult(results, name, success, candidateCount, error = null) {
  results.push({ name, success, candidateCount, error });
  logProviderResult({ name, success, candidateCount, error });
}

async function upsertFeedItem(item) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('feed_items')
    .upsert(
      {
        source: item.source,
        source_type: item.source_type,
        external_id: item.external_id,
        title: item.title,
        summary: item.summary,
        source_url: item.source_url,
        published_at: item.published_at,
        raw_source_data: item.raw_source_data,
      },
      { onConflict: 'source,external_id' }
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not upsert feed item: ${error.message}`);
  }

  return data;
}

async function upsertUserFeedMatch({ userId, feedItemId, reason, matchedTerms, relevanceScore }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_feed_items')
    .upsert(
      {
        user_id: userId,
        feed_item_id: feedItemId,
        reason,
        matched_terms: matchedTerms,
        relevance_score: relevanceScore,
      },
      { onConflict: 'user_id,feed_item_id' }
    )
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not upsert user feed match: ${error.message}`);
  }

  return data;
}

async function shouldRefreshFeed(userId) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_feed_refresh')
    .select('last_refreshed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data?.last_refreshed_at) return true;
  const elapsed = Date.now() - new Date(data.last_refreshed_at).getTime();
  return elapsed >= REFRESH_INTERVAL_MS;
}

async function markFeedRefreshed(userId) {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_feed_refresh').upsert({
    user_id: userId,
    last_refreshed_at: new Date().toISOString(),
  });
}

async function fetchExternalCandidates(interests) {
  const candidates = [];
  const providerResults = [];

  if (interests.length) {
    for (const interest of interests.slice(0, 5)) {
      const term = interest.term.replace(/"/g, '');
      const providerPrefix = term || 'interest';

      try {
        const foodRecalls = await fetchFoodRecalls({
          search: `product_description:"${term}" OR reason_for_recall:"${term}"`,
          limit: 3,
        });
        const items = foodRecalls.map(mapFoodRecallToFeedItem);
        candidates.push(...items);
        recordProviderResult(providerResults, `openfda_food:${providerPrefix}`, true, items.length);
      } catch (error) {
        recordProviderResult(
          providerResults,
          `openfda_food:${providerPrefix}`,
          false,
          0,
          error.message
        );
      }

      try {
        const drugRecalls = await fetchDrugRecalls({
          search: `product_description:"${term}" OR reason_for_recall:"${term}"`,
          limit: 2,
        });
        const items = drugRecalls.map(mapDrugRecallToFeedItem);
        candidates.push(...items);
        recordProviderResult(providerResults, `openfda_drug:${providerPrefix}`, true, items.length);
      } catch (error) {
        recordProviderResult(
          providerResults,
          `openfda_drug:${providerPrefix}`,
          false,
          0,
          error.message
        );
      }

      try {
        const pubmedItems = await searchPubMed(term, { retmax: 2 });
        candidates.push(...pubmedItems);
        recordProviderResult(providerResults, `pubmed:${providerPrefix}`, true, pubmedItems.length);
      } catch (error) {
        recordProviderResult(providerResults, `pubmed:${providerPrefix}`, false, 0, error.message);
      }
    }
  } else {
    try {
      const generalFood = await fetchFoodRecalls({
        search: 'report_date:[NOW-30DAYS TO NOW]',
        limit: GENERAL_RECALL_LIMIT,
      });
      const items = generalFood.map(mapFoodRecallToFeedItem);
      candidates.push(...items);
      recordProviderResult(providerResults, 'openfda_food:general', true, items.length);
    } catch (error) {
      recordProviderResult(providerResults, 'openfda_food:general', false, 0, error.message);
    }
  }

  return { candidates, providerResults };
}

async function refreshUserFeed(userId, { force = false } = {}) {
  if (!force && !(await shouldRefreshFeed(userId))) {
    return { refreshed: false, stale: false };
  }

  const [scans, savedProducts] = await Promise.all([
    listUserScans(userId, { limit: 20 }),
    listSavedProducts(userId, { limit: 20 }),
  ]);

  const interests = deriveUserInterests({ scans, savedProducts });
  const { candidates, providerResults } = await fetchExternalCandidates(interests);
  const successfulProviders = providerResults.filter((result) => result.success);
  const failedProviders = providerResults.filter((result) => !result.success);
  const anyProviderSucceeded = hasSuccessfulProvider(providerResults);
  const allProvidersFailed = isCompleteProviderFailure(providerResults);

  if (allProvidersFailed) {
    if (IS_DEV) {
      console.log('[wellumi-feed] refresh aborted', {
        reason: 'all_providers_failed',
        providerCount: providerResults.length,
        cachedCount: 0,
      });
    }
    return {
      refreshed: false,
      stale: true,
      matchedCount: 0,
      cachedCount: 0,
      errors: failedProviders.map((result) => result.error).filter(Boolean),
      providerResults,
    };
  }

  const deduped = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.external_id}`;
    if (!deduped.has(key)) deduped.set(key, candidate);
  }

  let cachedCount = 0;
  const upsertErrors = [];

  for (const candidate of deduped.values()) {
    try {
      const feedItem = await upsertFeedItem(candidate);
      const { score, matched } = scoreMatch(candidate, interests);

      const reason =
        interests.length && matched.length
          ? `Because you scanned or saved items related to ${matched[0]}`
          : 'General FDA awareness update (not personalized yet)';

      await upsertUserFeedMatch({
        userId,
        feedItemId: feedItem.id,
        reason,
        matchedTerms: matched,
        relevanceScore: interests.length ? score : 1,
      });
      cachedCount += 1;
    } catch (error) {
      upsertErrors.push(error.message);
    }
  }

  if (anyProviderSucceeded) {
    await markFeedRefreshed(userId);
  }

  if (IS_DEV) {
    console.log('[wellumi-feed] refresh complete', {
      successfulProviders: successfulProviders.length,
      failedProviders: failedProviders.length,
      candidateCount: deduped.size,
      cachedCount,
      upsertErrors: upsertErrors.length,
    });
  }

  return {
    refreshed: true,
    stale: failedProviders.length > 0 || upsertErrors.length > 0,
    matchedCount: deduped.size,
    cachedCount,
    errors: [
      ...failedProviders.map((result) => result.error).filter(Boolean),
      ...upsertErrors,
    ],
    providerResults,
  };
}

async function listUserFeed(userId, { limit = 30 } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_feed_items')
    .select(
      `
      id,
      reason,
      matched_terms,
      relevance_score,
      is_read,
      is_dismissed,
      created_at,
      feed_item:feed_items (
        id,
        source,
        source_type,
        external_id,
        title,
        summary,
        source_url,
        published_at
      )
    `
    )
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load feed: ${error.message}`);
  }

  return data || [];
}

async function markFeedRead(userId, userFeedItemId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_feed_items')
    .update({ is_read: true })
    .eq('id', userFeedItemId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not mark feed item read: ${error.message}`);
  }

  return data;
}

async function dismissFeedItem(userId, userFeedItemId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_feed_items')
    .update({ is_dismissed: true })
    .eq('id', userFeedItemId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Could not dismiss feed item: ${error.message}`);
  }

  return data;
}

module.exports = {
  refreshUserFeed,
  listUserFeed,
  markFeedRead,
  dismissFeedItem,
  fetchExternalCandidates,
};
