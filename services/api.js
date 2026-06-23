import { API_BASE_URL, LABEL_ANALYSIS_TIMEOUT_MS } from './config';
import { getAccessToken, initializeAuth } from './auth';
import { mapAnalysisToResultSummary } from './mappers';

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  if (auth) {
    await initializeAuth();
  }

  const accessToken = auth ? await getAccessToken() : null;
  if (auth && !accessToken) {
    throw new ApiError('Authentication is not ready yet. Please wait a moment and try again.', {
      status: 401,
      code: 'AUTH_NOT_READY',
    });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LABEL_ANALYSIS_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError(`The request took too long after ${LABEL_ANALYSIS_TIMEOUT_MS / 1000} seconds.`, {
        code: 'TIMEOUT',
      });
    }
    throw new ApiError(`Network error: ${error.message}`, { code: 'NETWORK' });
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new ApiError(payload.error || `Backend returned ${response.status}`, {
      status: response.status,
      code: payload.code || null,
    });
  }

  return payload;
}

export async function submitScan({ photo, barcode, mimeType = 'image/jpeg' }) {
  if (!photo?.base64 && !barcode) {
    throw new ApiError('A barcode or label photo is required.', { code: 'MISSING_INPUT' });
  }

  const payload = await apiRequest('/analyze-label', {
    method: 'POST',
    body: {
      imageBase64: photo?.base64,
      mimeType: photo?.mimeType || mimeType,
      barcode,
    },
  });

  return mapAnalysisToResultSummary(payload);
}

export async function fetchRecentScans() {
  const payload = await apiRequest('/scans');
  return payload.scans || [];
}

export async function fetchSavedProducts() {
  const payload = await apiRequest('/saved-products');
  return payload.savedProducts || [];
}

export async function saveProduct({ productId, analysisId, scanId }) {
  const payload = await apiRequest('/saved-products', {
    method: 'POST',
    body: { productId, analysisId, scanId },
  });
  return payload.savedProduct;
}

export async function fetchFeed() {
  const payload = await apiRequest('/feed');
  return {
    items: payload.items || [],
    stale: Boolean(payload.stale),
    refreshed: Boolean(payload.refreshed),
  };
}

export async function refreshFeed() {
  const payload = await apiRequest('/feed/refresh', { method: 'POST' });
  return {
    items: payload.items || [],
    stale: Boolean(payload.stale),
    refreshed: Boolean(payload.refreshed),
    errors: payload.errors || [],
  };
}

export async function markFeedRead(feedMatchId) {
  return apiRequest(`/feed/${feedMatchId}/read`, { method: 'PATCH' });
}

export async function dismissFeedItem(feedMatchId) {
  return apiRequest(`/feed/${feedMatchId}/dismiss`, { method: 'PATCH' });
}

export async function checkApiHealth() {
  return apiRequest('/health', { auth: false });
}

// Backward-compatible alias
export const analyzeLabelImage = submitScan;
