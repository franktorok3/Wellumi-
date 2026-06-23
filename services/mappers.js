import { LONG_DISCLAIMER } from '../theme/tokens';
import { formatNutritionEntries } from './formatNutrition';

function formatDateLabel(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (error) {
    return null;
  }
}

function formatStoryCategory(category) {
  return String(category || 'wellness')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSectionsFromPayload(analysis) {
  if (Array.isArray(analysis?.analysis?.positives) && analysis.analysis.positives.length) {
    return analysis.analysis.positives
      .filter((section) => section?.body)
      .map((section) => ({
        title: section.title,
        body: section.body,
        kind: section.kind || 'ai_context',
      }));
  }

  const sections = [];
  if (analysis.what_it_is) sections.push({ title: 'What it is', body: analysis.what_it_is, kind: 'ai_context' });
  if (analysis.what_people_commonly_use_it_for) {
    sections.push({
      title: 'What people commonly use it for',
      body: analysis.what_people_commonly_use_it_for,
      kind: 'ai_context',
    });
  }
  if (analysis.what_sources_say) {
    sections.push({ title: 'What sources say', body: analysis.what_sources_say, kind: 'ai_context' });
  }
  if (Array.isArray(analysis.questions_to_ask_a_professional) && analysis.questions_to_ask_a_professional.length) {
    sections.push({
      title: 'Questions to ask a professional',
      body: analysis.questions_to_ask_a_professional.join('\n'),
      kind: 'ai_context',
    });
  }
  return sections;
}

export function mapAnalysisToResultSummary(analysis) {
  const product = analysis.product || null;
  const scan = analysis.scan || null;
  const analysisRecord = analysis.analysis || null;
  const nutritionData = analysis.label_facts?.nutrition_data || product?.nutrition_data || null;

  return {
    productId: product?.id || analysis.productId || null,
    analysisId: analysisRecord?.id || analysis.analysisId || null,
    scanId: scan?.id || analysis.scanId || null,
    title: product?.name || analysis.product_name || 'Product result',
    brand: product?.brand || null,
    barcode: product?.barcode || null,
    kicker: 'Label summary',
    detectedLabelText:
      analysis.label_facts?.extracted_text ||
      analysis.detected_label_text ||
      scan?.extracted_text ||
      product?.ingredients_text ||
      '',
    ingredientsText: analysis.label_facts?.ingredients_text || product?.ingredients_text || null,
    nutritionData,
    nutritionEntries: formatNutritionEntries(nutritionData),
    imageUrl: scan?.image_signed_url || product?.product_image_url || null,
    neutralDisclaimer:
      analysis.ai_context?.disclaimer ||
      analysis.neutral_disclaimer ||
      analysisRecord?.summary ||
      'General information only. Ask a qualified professional for personal guidance.',
    longDisclaimer: LONG_DISCLAIMER,
    source: product?.source || null,
    sources: analysis.sources || [],
    persisted: Boolean(analysis.persisted),
    sections: buildSectionsFromPayload(analysis),
    aiSections: buildSectionsFromPayload(analysis).filter((section) => section.kind === 'ai_context'),
    analysisDate: formatDateLabel(analysisRecord?.created_at || scan?.created_at),
    product,
    analysis: analysisRecord,
    scan,
  };
}

export function mapScanToRecentItem(scan, index = 0) {
  const result = mapPersistedScanToResult(scan);
  return {
    id: scan.id || `scan-${index}`,
    title: scan.product?.name || result.title,
    subtitle: 'Scanned',
    color: '#7E8B62',
    bottle: '#243329',
    result,
    createdAt: scan.created_at,
  };
}

export function mapPersistedScanToResult(scan) {
  return mapAnalysisToResultSummary({
    persisted: true,
    product: scan.product,
    analysis: scan.analysis,
    scan,
    label_facts: {
      ingredients_text: scan.product?.ingredients_text,
      extracted_text: scan.extracted_text,
      nutrition_data: scan.product?.nutrition_data,
    },
    sources: buildSourcesFromProduct(scan.product, scan.analysis),
  });
}

function buildSourcesFromProduct(product, analysis) {
  const sources = [];
  if (product?.source === 'open_food_facts' || product?.raw_source_data?.open_food_facts) {
    sources.push({ name: 'Open Food Facts', type: 'product_facts', label: 'Product facts from Open Food Facts' });
  }
  if (product?.raw_source_data?.usda_fdc) {
    sources.push({ name: 'USDA FoodData Central', type: 'nutrition_facts', label: 'Nutrition context from USDA' });
  }
  if (analysis?.model) {
    sources.push({
      name: 'OpenAI label analysis',
      type: 'ai_context',
      label: 'AI-generated informational context',
    });
  }
  return sources;
}

export function mapSavedProductToLibraryItem(savedProduct) {
  const product = savedProduct.product;
  const analysis = savedProduct.analysis;
  const scan = savedProduct.scan;

  const result = mapAnalysisToResultSummary({
    persisted: true,
    product,
    analysis,
    scan,
    label_facts: {
      ingredients_text: product?.ingredients_text,
      extracted_text: scan?.extracted_text || product?.ingredients_text,
      nutrition_data: product?.nutrition_data,
    },
    sources: buildSourcesFromProduct(product, analysis),
  });

  return {
    id: savedProduct.id,
    productId: product?.id,
    analysisId: analysis?.id,
    scanId: scan?.id,
    title: product?.name || 'Saved product',
    type: 'Saved',
    description: product?.brand || product?.ingredients_text || 'Saved analysis',
    savedAtLabel: formatDateLabel(savedProduct.created_at) || 'Saved',
    sourceLabel: product?.source?.replace(/_/g, ' ') || 'Wellumi',
    result,
  };
}

function mapSourcesFromStory(story) {
  const links = story?.wellness_story_sources || story?.sources || [];
  return links
    .sort((a, b) => (a.citation_order || 0) - (b.citation_order || 0))
    .map((entry) => entry.source_record || entry)
    .filter(Boolean)
    .map((source) => ({
      id: source.id,
      name: source.provider?.replace(/_/g, ' ') || 'Source',
      title: source.title,
      url: source.source_url,
      provider: source.provider,
      publishedAt: source.published_at,
    }));
}

export function mapWellnessStoryToCard(item) {
  const story = item.story || item;
  const sources = mapSourcesFromStory(story);

  return {
    id: item.id,
    storyId: story.id,
    updateType: formatStoryCategory(story.story_category),
    title: story.title || 'Wellumi story',
    deck: story.deck || '',
    summary: story.deck || story.body?.everyday_explanation || '',
    reasonLabel: item.personalization_reason || 'Wellumi wellness story',
    date: formatDateLabel(story.freshness_date || story.generated_at || item.created_at) || 'Recent',
    sourceLabel: story.source_strength_label
      ? `${story.source_strength_label} evidence`
      : 'Source-backed',
    sourceUrl: sources[0]?.url || null,
    sourceType: story.story_category,
    storyCategory: story.story_category,
    lifestyleCategory: story.lifestyle_category,
    isPersonalized: Boolean(item.is_personalized),
    isGeneral: Boolean(story.is_general),
    safetyFlag: Boolean(story.safety_flag),
    sourceStrengthLabel: story.source_strength_label,
    isRead: item.is_read,
    sections: story.body || {},
    sources,
    raw: item,
  };
}

export function mapFeedItemToCard(item) {
  if (item?.story) {
    return mapWellnessStoryToCard(item);
  }

  const feedItem = item.feed_item;
  const matchedTerm = Array.isArray(item.matched_terms) ? item.matched_terms[0] : null;
  return {
    id: item.id,
    feedItemId: feedItem?.id,
    updateType: feedItem?.source_type?.replace(/_/g, ' ') || 'Update',
    title: feedItem?.title || 'Awareness update',
    summary: feedItem?.summary || '',
    reasonLabel: item.reason || 'Awareness update',
    date: formatDateLabel(feedItem?.published_at || item.created_at) || 'Recent',
    sourceLabel: feedItem?.source?.replace(/_/g, ' ') || 'Source',
    sourceUrl: feedItem?.source_url,
    sourceType: feedItem?.source_type,
    matchedTerm,
    isRead: item.is_read,
    raw: item,
  };
}

export function getResultKey(result) {
  return String(result?.analysisId || result?.productId || result?.id || result?.title || 'untitled').toLowerCase();
}

export { formatNutritionEntries } from './formatNutrition';
