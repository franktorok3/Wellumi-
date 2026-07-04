const { normalizeExternalDate } = require('../utils/normalizeExternalDate');
const { daysSince } = require('./sourceRelevance');

const SAFETY_ALERT_MAX_DAYS = 120;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function normalizeRecallRecord(record) {
  const raw = record.raw_payload || record.raw_source_data || {};
  const initiationDate = normalizeExternalDate(raw.recall_initiation_date || record.published_at);
  const status = String(raw.status || raw.recall_status || 'Unknown').trim();
  const productDescription = String(raw.product_description || '').trim();
  const reason = String(raw.reason_for_recall || record.title || '').trim();
  const firm = String(raw.recalling_firm || '').trim();

  return {
    ...record,
    recall_status: status,
    recall_product_description: productDescription,
    recall_reason: reason,
    recall_initiation_date: initiationDate,
    published_at: initiationDate || record.published_at,
    summary: [
      productDescription && `Product: ${productDescription}`,
      reason && `Reason: ${reason}`,
      firm && `Firm: ${firm}`,
      status && `Status: ${status}`,
      initiationDate && `Initiated: ${initiationDate.slice(0, 10)}`,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

function normalizeBrand(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractProductFamily(productName) {
  const tokens = tokenize(productName).filter((token) => token.length >= 4);
  return tokens.slice(0, 3);
}

function classifyRecallMatch(record, profile) {
  const text = `${record.recall_product_description || ''} ${record.summary || ''} ${record.title || ''}`.toLowerCase();
  const brand = normalizeBrand(profile?.brand);
  const productName = String(profile?.productName || '').toLowerCase();
  const barcode = String(profile?.barcode || profile?.productBarcode || '').trim();
  const raw = record.raw_payload || {};
  const recallCodes = [raw.code_info, raw.product_description, raw.product_quantity]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (barcode && recallCodes.includes(barcode)) {
    return {
      matchType: 'exact_product',
      confidence: 0.98,
      matchedFields: ['barcode'],
      explanation: 'Recall record references the scanned barcode or UPC.',
    };
  }

  const productTokens = extractProductFamily(productName).filter(
    (token) => !brand || !brand.split(' ').includes(token)
  );
  let productTokenHits = 0;
  for (const token of productTokens) {
    if (text.includes(token)) productTokenHits += 1;
  }

  const brandHit = brand && text.includes(brand);
  const exactProductHit =
    productName &&
    text.includes(productName) &&
    productTokenHits >= Math.min(2, productTokens.length || 1);

  const familyHit =
    brandHit &&
    productTokenHits >= 1 &&
    productTokens.some((token) => text.includes(token)) &&
    !exactProductHit;

  const categoryHit =
    profile?.productCategory === 'packaged_food' &&
    /hummus|dip|spread|chickpea/i.test(text) &&
    !brandHit;

  if (exactProductHit && brandHit) {
    return {
      matchType: 'exact_product',
      confidence: 0.9,
      matchedFields: ['brand', 'product_name'],
      explanation: 'Recall description closely matches the scanned product name.',
    };
  }
  if (familyHit) {
    return {
      matchType: 'product_family',
      confidence: 0.72,
      matchedFields: ['brand', 'product_family'],
      explanation: 'Recall appears to involve the same brand and product family.',
    };
  }
  if (brandHit) {
    return {
      matchType: 'brand_only',
      confidence: 0.55,
      matchedFields: ['brand'],
      explanation: 'Recall mentions the brand but not the exact scanned product.',
    };
  }
  if (categoryHit) {
    return {
      matchType: 'category_only',
      confidence: 0.4,
      matchedFields: ['category'],
      explanation: 'Recall is category-related, not a direct product match.',
    };
  }
  return {
    matchType: 'general',
    confidence: 0.2,
    matchedFields: [],
    explanation: 'Weak or indirect recall relationship.',
  };
}

function isRecallActive(status) {
  const normalized = String(status || '').toLowerCase();
  if (!normalized || normalized === 'unknown') return false;
  return !/(terminated|completed|closed)/i.test(normalized);
}

function evaluateSafetyEligibility(record, profile) {
  const normalized = normalizeRecallRecord(record);
  const ageDays = daysSince(normalized.published_at);
  const match = classifyRecallMatch(normalized, profile);
  const matchType = match.matchType;
  const active = isRecallActive(normalized.recall_status);

  if (ageDays != null && ageDays > SAFETY_ALERT_MAX_DAYS) {
    if (matchType === 'exact_product' && active) {
      return {
        displayEligible: true,
        showSafetyBadge: true,
        matchType,
        matchConfidence: match.confidence,
        matchedFields: match.matchedFields,
        matchExplanation: match.explanation,
        historical: true,
        ageDays,
        normalized,
        reason: null,
      };
    }
    if (matchType === 'brand_only' && active) {
      return {
        displayEligible: true,
        showSafetyBadge: false,
        matchType,
        historical: true,
        ageDays,
        normalized,
        reason: null,
      };
    }
    return {
      displayEligible: false,
      showSafetyBadge: false,
      matchType,
      historical: true,
      ageDays,
      normalized,
      reason: 'stale_safety_source',
    };
  }

  if (matchType === 'category_only' || matchType === 'general') {
    return {
      displayEligible: matchType === 'category_only' && ageDays != null && ageDays <= SAFETY_ALERT_MAX_DAYS,
      showSafetyBadge: false,
      matchType,
      historical: false,
      ageDays,
      normalized,
      reason: matchType === 'general' ? 'weak_safety_match' : null,
    };
  }

  return {
    displayEligible: true,
    showSafetyBadge: true,
    matchType,
    historical: false,
    ageDays,
    normalized,
    reason: null,
  };
}

function buildSafetyStoryTitle({ matchType, profile, record, historical = false }) {
  const brand = profile?.brand || 'this brand';
  const product = profile?.productName || record.recall_product_description || 'a product you scanned';
  const dateLabel = record.recall_initiation_date
    ? new Date(record.recall_initiation_date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  if (matchType === 'exact_product') {
    if (historical && dateLabel) {
      return `Historical recall notice involving ${product} (${dateLabel})`;
    }
    return `Recall notice involving a ${brand} product you scanned`;
  }
  if (matchType === 'product_family') {
    return `Recall update involving a ${brand} product family you scanned`;
  }
  if (matchType === 'brand_only') {
    if (historical && dateLabel) {
      return `An older ${brand} recall to be aware of (${dateLabel})`;
    }
    return `An older ${brand} recall to be aware of`;
  }
  if (matchType === 'category_only') {
    return 'A recent hummus recall update';
  }
  return 'A recent food-safety update';
}

function buildSafetyDeck({ matchType, profile, record, historical = false }) {
  const status = record.recall_status || 'Unknown status';
  const reason = record.recall_reason || record.summary;
  if (matchType === 'exact_product') {
    return historical
      ? `This FDA record from ${record.recall_initiation_date?.slice(0, 10) || 'a prior date'} describes a recall affecting ${profile?.productName || 'a product you scanned'}. Status: ${status}.`
      : `FDA reports a recall that appears to match ${profile?.productName || 'a product you scanned'}. Status: ${status}.`;
  }
  if (matchType === 'product_family') {
    return `FDA lists a recall that may involve the same ${profile?.brand || 'brand'} product family. Review the product description. Status: ${status}.`;
  }
  if (matchType === 'brand_only') {
    return `FDA lists a ${profile?.brand || 'brand'} recall. Review the product description to see whether it matches what you scanned. Status: ${status}.`;
  }
  if (matchType === 'category_only') {
    return `FDA posted a hummus-related recall update. Reason listed: ${reason}.`;
  }
  return `FDA posted a food recall update: ${reason}.`;
}

module.exports = {
  SAFETY_ALERT_MAX_DAYS,
  normalizeRecallRecord,
  classifyRecallMatch,
  evaluateSafetyEligibility,
  buildSafetyStoryTitle,
  buildSafetyDeck,
  isRecallActive,
};
