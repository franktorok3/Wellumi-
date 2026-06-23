const mockResultSummary = {
  title: 'Magnesium Glycinate',
  kicker: 'Label summary',
  neutralDisclaimer:
    'General information only. Ask a qualified professional for personal guidance.',
  longDisclaimer:
    'Educational context only. No diagnosis, treatment advice, safety labels, risk scoring, supplement recommendations, dosage suggestions, or medical advice.',
  sections: [
    {
      title: 'What it is',
      body: 'A form of magnesium paired with glycine. Magnesium is an essential mineral found in foods and supplements.',
    },
    {
      title: 'What people commonly use it for',
      body: 'People often look it up in connection with sleep routines, muscle function, and general wellness.',
    },
    {
      title: 'What sources say',
      body: 'Public health and research sources describe magnesium as involved in nerve, muscle, and metabolic functions. Evidence varies by use and person.',
    },
    {
      title: 'Questions to ask a professional',
      body: 'Ask whether it fits your health history, medications, dose limits, pregnancy status, kidney health, and other products you use.',
    },
  ],
};

export function mapAnalysisToResultSummary(analysis) {
  return {
    id: analysis.productId || analysis.product?.id || null,
    analysisId: analysis.analysisId || analysis.analysis?.id || null,
    scanId: analysis.scanId || analysis.scan?.id || null,
    productId: analysis.productId || analysis.product?.id || null,
    title: analysis.product_name || analysis.product?.name || mockResultSummary.title,
    kicker: 'Label summary',
    detectedLabelText: analysis.detected_label_text || analysis.scan?.extracted_text || '',
    neutralDisclaimer:
      analysis.neutral_disclaimer ||
      analysis.analysis?.summary ||
      'This is general informational context. Ask a qualified professional for personal guidance.',
    longDisclaimer: mockResultSummary.longDisclaimer,
    source: analysis.product?.source || null,
    persisted: Boolean(analysis.persisted),
    sections: buildSections(analysis),
    product: analysis.product || null,
    analysis: analysis.analysis || null,
    scan: analysis.scan || null,
  };
}

function buildSections(analysis) {
  if (Array.isArray(analysis.analysis?.positives) && analysis.analysis.positives.length) {
    return analysis.analysis.positives.map((section) => ({
      title: section.title,
      body: section.body,
    }));
  }

  return [
    {
      title: 'What it is',
      body: analysis.what_it_is || mockResultSummary.sections[0].body,
    },
    {
      title: 'What people commonly use it for',
      body: analysis.what_people_commonly_use_it_for || mockResultSummary.sections[1].body,
    },
    {
      title: 'What sources say',
      body: analysis.what_sources_say || mockResultSummary.sections[2].body,
    },
    {
      title: 'Questions to ask a professional',
      body: Array.isArray(analysis.questions_to_ask_a_professional)
        ? analysis.questions_to_ask_a_professional.join('\n')
        : mockResultSummary.sections[3].body,
    },
  ];
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
  const labelSummary = scan.analysis?.positives?.length
    ? {
        product_name: scan.product?.name,
        detected_label_text: scan.extracted_text || '',
        what_it_is: scan.analysis.positives.find((item) => item.title === 'What it is')?.body || '',
        what_people_commonly_use_it_for:
          scan.analysis.positives.find((item) => item.title === 'What people commonly use it for')?.body || '',
        what_sources_say:
          scan.analysis.positives.find((item) => item.title === 'What sources say')?.body || '',
        questions_to_ask_a_professional: (
          scan.analysis.positives.find((item) => item.title === 'Questions to ask a professional')?.body || ''
        )
          .split('\n')
          .filter(Boolean),
        neutral_disclaimer: scan.analysis.summary || '',
      }
    : null;

  return mapAnalysisToResultSummary({
    persisted: true,
    product: scan.product,
    analysis: scan.analysis,
    scan,
    product_name: scan.product?.name,
    detected_label_text: scan.extracted_text || '',
    neutral_disclaimer: scan.analysis?.summary,
    ...(labelSummary || {}),
  });
}

export function mapSavedProductToLibraryItem(savedProduct) {
  const product = savedProduct.product;
  const result = mapAnalysisToResultSummary({
    persisted: true,
    product,
    product_name: product?.name,
    detected_label_text: product?.ingredients_text || '',
    what_it_is: product?.ingredients_text
      ? `Saved product record sourced from ${product.source || 'Wellumi'}.`
      : 'Saved product record.',
    what_people_commonly_use_it_for: 'Saved for later label review and questions.',
    what_sources_say: 'Review the original product source and label before making decisions.',
    questions_to_ask_a_professional: [
      'Does this product fit my health history and medications?',
      'What should I verify on the physical label?',
    ],
    neutral_disclaimer:
      'Saved product context only. Ask a qualified professional for personal guidance.',
  });

  return {
    id: savedProduct.id,
    productId: product?.id,
    title: product?.name || 'Saved product',
    type: 'Saved',
    description: product?.brand || product?.ingredients_text || 'Saved product context',
    savedAtLabel: 'Saved',
    result,
  };
}

export function getResultKey(result) {
  return String(result?.productId || result?.id || result?.title || 'untitled').toLowerCase();
}

export { mockResultSummary };
