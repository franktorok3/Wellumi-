const OPEN_FDA_BASE = 'https://api.fda.gov';

async function fetchOpenFdaEnforcement(path, { search, limit = 20 } = {}) {
  const url = new URL(`${OPEN_FDA_BASE}${path}`);
  url.searchParams.set('search', search);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`openFDA ${path} returned ${response.status}`);
  }

  const payload = await response.json();
  return payload.results || [];
}

async function fetchFoodRecalls({ search, limit = 20 }) {
  return fetchOpenFdaEnforcement('/food/enforcement.json', { search, limit });
}

async function fetchDrugRecalls({ search, limit = 20 }) {
  return fetchOpenFdaEnforcement('/drug/enforcement.json', { search, limit });
}

function mapFoodRecallToFeedItem(recall) {
  const recallNumber = recall.recall_number || recall.event_id || recall.product_description;
  return {
    source: 'openfda_food',
    source_type: 'food_recall',
    external_id: String(recallNumber),
    title: recall.reason_for_recall || recall.product_description || 'Food recall notice',
    summary: [
      recall.product_description,
      recall.reason_for_recall,
      recall.recalling_firm ? `Recalling firm: ${recall.recalling_firm}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    source_url: `https://api.fda.gov/food/enforcement.json?search=recall_number:"${encodeURIComponent(recall.recall_number || '')}"`,
    published_at: recall.recall_initiation_date
      ? new Date(recall.recall_initiation_date).toISOString()
      : null,
    raw_source_data: recall,
  };
}

function mapDrugRecallToFeedItem(recall) {
  const recallNumber = recall.recall_number || recall.event_id;
  return {
    source: 'openfda_drug',
    source_type: 'drug_recall',
    external_id: String(recallNumber),
    title: recall.reason_for_recall || recall.product_description || 'Drug recall notice',
    summary: [
      recall.product_description,
      recall.reason_for_recall,
      recall.recalling_firm ? `Recalling firm: ${recall.recalling_firm}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    source_url: `https://api.fda.gov/drug/enforcement.json?search=recall_number:"${encodeURIComponent(recall.recall_number || '')}"`,
    published_at: recall.recall_initiation_date
      ? new Date(recall.recall_initiation_date).toISOString()
      : null,
    raw_source_data: recall,
  };
}

module.exports = {
  fetchFoodRecalls,
  fetchDrugRecalls,
  mapFoodRecallToFeedItem,
  mapDrugRecallToFeedItem,
};
