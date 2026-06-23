const GENERIC_TERMS = new Set([
  'water',
  'natural',
  'spring',
  'daily',
  'wellness',
  'health',
  'product',
  'supplement',
  'food',
  'drink',
  'organic',
  'original',
  'premium',
  'fresh',
  'pure',
  'classic',
  'original',
  'value',
  'family',
  'everyday',
  'essential',
  'select',
  'choice',
  'brand',
  'label',
  'bottle',
  'pack',
  'size',
  'flavor',
  'flavour',
  'original',
  'variety',
]);

const INDUSTRIAL_CONTEXT_TERMS = [
  'hydrogel',
  'nanoclay',
  'polycyclic aromatic',
  'aromatic hydrocarbon',
  'materials science',
  'polymer',
  'spectroscopy',
  'chromatography',
  'wastewater treatment',
  'industrial',
  'laboratory',
  'synthesis',
  'nanoparticle',
  'catalyst',
  'adsorption',
];

const PUBMED_PREFERRED_TYPES = ['systematic review', 'review', 'meta-analysis', 'guideline', 'clinical trial'];

function isGenericTerm(term) {
  const normalized = String(term || '')
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (GENERIC_TERMS.has(normalized)) return true;
  const words = normalized.split(/\s+/);
  if (words.length === 1 && GENERIC_TERMS.has(words[0])) return true;
  return false;
}

function isMeaningfulTerm(term, context = {}) {
  const normalized = String(term || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized.length < 3) return false;
  if (!isGenericTerm(normalized)) return true;
  if (context.category && !isGenericTerm(context.category)) return true;
  if (context.brand && normalized.includes(context.brand.toLowerCase())) return true;
  if (context.activeIngredient && normalized.includes(context.activeIngredient.toLowerCase())) return true;
  return false;
}

function containsIndustrialContext(text) {
  const haystack = String(text || '').toLowerCase();
  return INDUSTRIAL_CONTEXT_TERMS.some((term) => haystack.includes(term));
}

module.exports = {
  GENERIC_TERMS,
  INDUSTRIAL_CONTEXT_TERMS,
  PUBMED_PREFERRED_TYPES,
  isGenericTerm,
  isMeaningfulTerm,
  containsIndustrialContext,
};
