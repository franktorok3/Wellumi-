const { normalizeExternalDate } = require('../utils/normalizeExternalDate');

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Wellumi/1.0 (awareness feed)',
    },
  });

  if (!response.ok) {
    throw new Error(`NCBI request failed: ${response.status}`);
  }

  return response.json();
}

async function searchPubMed(term, { retmax = 5 } = {}) {
  const searchUrl = new URL(`${NCBI_BASE}/esearch.fcgi`);
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(retmax));
  searchUrl.searchParams.set('sort', 'pub+date');
  searchUrl.searchParams.set('term', `${term}[Title/Abstract]`);

  const searchPayload = await fetchJson(searchUrl);
  const ids = searchPayload?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryUrl = new URL(`${NCBI_BASE}/esummary.fcgi`);
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('retmode', 'json');
  summaryUrl.searchParams.set('id', ids.join(','));

  const summaryPayload = await fetchJson(summaryUrl);
  const result = summaryPayload?.result || {};

  return ids
    .map((id) => result[id])
    .filter(Boolean)
    .map((item) => mapPubMedSummaryToFeedItem(item));
}

function mapPubMedSummaryToFeedItem(item) {
  const pubDate =
    normalizeExternalDate(item.pubdate) ||
    normalizeExternalDate(item.epubdate) ||
    normalizeExternalDate(item.sortpubdate);
  return {
    source: 'pubmed',
    source_type: 'research_update',
    external_id: String(item.uid || item.id),
    title: item.title || 'PubMed research mention',
    summary: item.source
      ? `${item.source}${item.epubdate ? ` · ${item.epubdate}` : ''}`
      : 'Recent research mention from PubMed.',
    source_url: `https://pubmed.ncbi.nlm.nih.gov/${item.uid || item.id}/`,
    published_at: pubDate,
    raw_source_data: item,
  };
}

module.exports = {
  searchPubMed,
  mapPubMedSummaryToFeedItem,
};
