const { containsIndustrialContext, isGenericTerm, PUBMED_PREFERRED_TYPES } = require('./genericTerms');
const { normalizeExternalDate } = require('../utils/normalizeExternalDate');

function daysSince(dateValue) {
  const iso = normalizeExternalDate(dateValue);
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function scoreFreshness(publishedAt, freshnessWindowDays = 730) {
  const ageDays = daysSince(publishedAt);
  if (ageDays == null) return 0.35;
  if (ageDays <= 30) return 1;
  if (ageDays <= 180) return 0.85;
  if (ageDays <= freshnessWindowDays) return 0.65;
  if (ageDays <= freshnessWindowDays * 2) return 0.35;
  return 0.15;
}

function scorePubMedRecord(record, { searchConcepts = [], excludedConcepts = [] } = {}) {
  const text = `${record.title || ''} ${record.summary || ''} ${record.abstract || ''}`.toLowerCase();
  let score = 0.35;

  if (containsIndustrialContext(text)) score -= 0.55;
  for (const excluded of excludedConcepts) {
    if (text.includes(String(excluded).toLowerCase())) score -= 0.35;
  }

  for (const preferred of PUBMED_PREFERRED_TYPES) {
    if (text.includes(preferred)) score += 0.15;
  }

  for (const concept of searchConcepts) {
    const tokens = String(concept).toLowerCase().split(/\s+/).filter((token) => token.length >= 4);
    const meaningfulTokens = tokens.filter((token) => !isGenericTerm(token));
    const hits = meaningfulTokens.filter((token) => text.includes(token)).length;
    if (meaningfulTokens.length) {
      score += (hits / meaningfulTokens.length) * 0.35;
    }
  }

  const genericOnly = searchConcepts.every((concept) =>
    String(concept)
      .toLowerCase()
      .split(/\s+/)
      .every((token) => isGenericTerm(token))
  );
  if (genericOnly) score -= 0.5;

  const ageDays = daysSince(record.published_at);
  if (ageDays != null && ageDays > 730) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

function scoreFdaRecord(record, { brand = null, productCategory = null } = {}) {
  const text = `${record.title || ''} ${record.summary || ''}`.toLowerCase();
  let score = 0.55;
  let safety = 0.7;

  if (brand && text.includes(String(brand).toLowerCase())) {
    score += 0.35;
    safety = 1;
  }
  if (productCategory === 'bottled_water' && text.includes('water')) {
    score += 0.05;
  }
  if (text.includes('undeclared allergen')) safety = Math.max(safety, 0.9);
  if (text.includes('recall')) safety = Math.max(safety, 0.85);

  return {
    consumerRelevance: Math.max(0, Math.min(1, score)),
    safetyRelevance: Math.max(0, Math.min(1, safety)),
    sourceStrength: brand && text.includes(String(brand).toLowerCase()) ? 0.95 : 0.75,
    freshnessScore: scoreFreshness(record.published_at, 120),
  };
}

function scoreSourceRecord(record, context = {}) {
  if (record.provider === 'pubmed') {
    const consumerRelevance = scorePubMedRecord(record, context);
    return {
      consumerRelevance,
      safetyRelevance: 0.1,
      sourceStrength: consumerRelevance >= 0.7 ? 0.8 : 0.55,
      freshnessScore: scoreFreshness(record.published_at, context.freshnessWindowDays || 730),
    };
  }

  if (record.provider === 'openfda_food' || record.provider === 'openfda_drug') {
    const scored = scoreFdaRecord(record, context);
    return {
      consumerRelevance: scored.consumerRelevance,
      safetyRelevance: scored.safetyRelevance,
      sourceStrength: scored.sourceStrength,
      freshnessScore: scored.freshnessScore,
    };
  }

  return {
    consumerRelevance: 0.5,
    safetyRelevance: 0.2,
    sourceStrength: 0.5,
    freshnessScore: scoreFreshness(record.published_at, context.freshnessWindowDays || 365),
  };
}

function filterRelevantSources(records, { minimumSourceQuality = 0.45, excludedConcepts = [] } = {}) {
  return records.filter((record) => {
    const text = `${record.title || ''} ${record.summary || ''}`.toLowerCase();
    if (containsIndustrialContext(text)) return false;
    for (const excluded of excludedConcepts) {
      if (text.includes(String(excluded).toLowerCase())) return false;
    }
    let relevance = record.consumer_relevance ?? record.consumerRelevance;
    if (relevance == null) {
      const scored = scoreSourceRecord(record, {
        searchConcepts: record.topics || [],
        excludedConcepts,
      });
      relevance = scored.consumerRelevance;
    }
    return relevance >= minimumSourceQuality;
  });
}

module.exports = {
  scoreSourceRecord,
  scorePubMedRecord,
  scoreFdaRecord,
  scoreFreshness,
  filterRelevantSources,
  daysSince,
};
