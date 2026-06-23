const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'product', 'supplement',
  'tablets', 'capsules', 'softgels', 'gummies', 'liquid', 'powder', 'daily', 'dietary',
  'unknown', 'label', 'facts', 'serving', 'size', 'amount', 'per', 'other', 'ingredients',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function extractIngredientTerms(ingredientsText) {
  const chunks = String(ingredientsText || '')
    .split(/[,;()]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const terms = [];
  for (const chunk of chunks.slice(0, 12)) {
    const words = tokenize(chunk);
    if (words.length === 1) {
      terms.push(words[0]);
    } else if (words.length >= 2) {
      terms.push(words.slice(0, 3).join(' '));
    }
  }
  return terms;
}

function deriveUserInterests({ scans = [], savedProducts = [] }) {
  const termWeights = new Map();

  function addTerm(term, weight) {
    const cleaned = String(term || '').trim().toLowerCase();
    if (!cleaned || cleaned.length < 3) return;
    termWeights.set(cleaned, (termWeights.get(cleaned) || 0) + weight);
  }

  for (const scan of scans) {
    const product = scan.product;
    if (!product) continue;
    addTerm(product.name, 3);
    addTerm(product.brand, 4);
    for (const term of extractIngredientTerms(product.ingredients_text)) {
      addTerm(term, 5);
    }
  }

  for (const saved of savedProducts) {
    const product = saved.product;
    if (!product) continue;
    addTerm(product.name, 4);
    addTerm(product.brand, 5);
    for (const term of extractIngredientTerms(product.ingredients_text)) {
      addTerm(term, 6);
    }
  }

  return [...termWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, weight]) => ({ term, weight }));
}

module.exports = {
  deriveUserInterests,
  extractIngredientTerms,
  tokenize,
};
