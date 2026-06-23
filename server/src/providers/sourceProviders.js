const { normalizeExternalDate } = require('../utils/normalizeExternalDate');
const {
  fetchFoodRecalls,
  fetchDrugRecalls,
  mapFoodRecallToFeedItem,
  mapDrugRecallToFeedItem,
} = require('../services/openFda');
const { searchPubMed } = require('../services/pubmed');
const { scoreSourceRecord } = require('../content/sourceRelevance');

function normalizeProviderRecord(record, provider) {
  return {
    provider,
    source_type: record.source_type,
    external_id: String(record.external_id),
    title: record.title,
    summary: record.summary || '',
    abstract: record.abstract || record.summary || '',
    published_at: normalizeExternalDate(record.published_at),
    source_url: record.source_url,
    topics: record.topics || [],
    raw_payload: record.raw_source_data || record.raw_payload || record,
  };
}

async function searchOpenFdaFood(query, { limit = 5, context = {} } = {}) {
  const recalls = await fetchFoodRecalls({ search: query, limit });
  return recalls.map((recall) => {
    const mapped = mapFoodRecallToFeedItem(recall);
    const normalized = normalizeProviderRecord(mapped, 'openfda_food');
    const scores = scoreSourceRecord(normalized, context);
    return { ...normalized, ...scores, consumer_relevance: scores.consumerRelevance ?? scores.consumer_relevance };
  });
}

async function searchOpenFdaDrug(query, { limit = 5, context = {} } = {}) {
  const recalls = await fetchDrugRecalls({ search: query, limit });
  return recalls.map((recall) => {
    const mapped = mapDrugRecallToFeedItem(recall);
    const normalized = normalizeProviderRecord(mapped, 'openfda_drug');
    const scores = scoreSourceRecord(normalized, context);
    return { ...normalized, ...scores, consumer_relevance: scores.consumerRelevance ?? scores.consumer_relevance };
  });
}

async function searchPubMedProvider(term, { retmax = 3, context = {} } = {}) {
  const records = await searchPubMed(term, { retmax });
  return records.map((record) => {
    const normalized = normalizeProviderRecord(record, 'pubmed');
    const scores = scoreSourceRecord(normalized, context);
    return { ...normalized, ...scores, consumer_relevance: scores.consumerRelevance ?? scores.consumer_relevance };
  });
}

async function searchProvider(providerName, query, options = {}) {
  if (!query || !String(query).trim()) return [];
  if (providerName === 'openfda_food') return searchOpenFdaFood(query, options);
  if (providerName === 'openfda_drug') return searchOpenFdaDrug(query, options);
  if (providerName === 'pubmed') return searchPubMedProvider(query, options);
  return [];
}

async function collectSourcesForTopic(topic, context = {}) {
  const records = [];
  const providerResults = [];

  for (const concept of topic.searchConcepts || []) {
    for (const providerName of topic.preferredSourceTypes || []) {
      try {
        const results = await searchProvider(providerName, concept, {
          limit: providerName === 'pubmed' ? 2 : 3,
          context: {
            ...context,
            searchConcepts: topic.searchConcepts,
            excludedConcepts: topic.excludedConcepts,
            freshnessWindowDays: topic.freshnessWindowDays,
          },
        });
        const filtered = results.filter(
          (record) => (record.consumer_relevance || 0) >= (topic.minimumSourceQuality || 0.45)
        );
        records.push(...filtered);
        providerResults.push({
          provider: `${providerName}:${topic.id}`,
          success: true,
          candidateCount: filtered.length,
        });
      } catch (error) {
        providerResults.push({
          provider: `${providerName}:${topic.id}`,
          success: false,
          candidateCount: 0,
          error: error.message,
        });
      }
    }
  }

  const deduped = new Map();
  for (const record of records) {
    const key = `${record.provider}:${record.external_id}`;
    if (!deduped.has(key)) deduped.set(key, record);
  }

  return { records: [...deduped.values()], providerResults };
}

async function collectSourcesForProfile(profile, context = {}) {
  const records = [];
  const providerResults = [];

  for (const query of profile.searchConcepts?.fda || []) {
    try {
      const providerName = profile.productCategory === 'otc_medication' ? 'openfda_drug' : 'openfda_food';
      const results = await searchProvider(providerName, query, {
        limit: 3,
        context: { ...context, brand: profile.brand, productCategory: profile.productCategory },
      });
      records.push(...results);
      providerResults.push({ provider: `${providerName}:${query}`, success: true, candidateCount: results.length });
    } catch (error) {
      providerResults.push({ provider: `openfda:${query}`, success: false, candidateCount: 0, error: error.message });
    }
  }

  for (const concept of profile.searchConcepts?.pubmed || []) {
    try {
      const results = await searchProvider('pubmed', concept, {
        retmax: 2,
        context: { searchConcepts: [concept], excludedConcepts: ['hydrogel', 'nanoclay', 'polycyclic aromatic'] },
      });
      const filtered = results.filter((record) => (record.consumer_relevance || 0) >= 0.5);
      records.push(...filtered);
      providerResults.push({ provider: `pubmed:${concept}`, success: true, candidateCount: filtered.length });
    } catch (error) {
      providerResults.push({ provider: `pubmed:${concept}`, success: false, candidateCount: 0, error: error.message });
    }
  }

  const deduped = new Map();
  for (const record of records) {
    deduped.set(`${record.provider}:${record.external_id}`, record);
  }

  return { records: [...deduped.values()], providerResults };
}

module.exports = {
  normalizeProviderRecord,
  searchProvider,
  collectSourcesForTopic,
  collectSourcesForProfile,
};
