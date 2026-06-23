import { API_BASE_URL, LABEL_ANALYSIS_TIMEOUT_MS } from './config';
import { getAccessToken } from './auth';
import { mapAnalysisToResultSummary } from './mappers';

async function apiRequest(path, { method = 'GET', body } = {}) {
  const accessToken = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

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
      throw new Error(`The request took too long after ${LABEL_ANALYSIS_TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`Fetch failed: ${error.message}`);
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
    throw new Error(
      `Backend returned ${response.status}: ${responseText || payload.error || 'No response body'}`
    );
  }

  return payload;
}

export async function analyzeLabelImage(photo, { barcode } = {}) {
  if (!photo?.base64 && !barcode) {
    throw new Error('A captured image or barcode is required.');
  }

  const payload = await apiRequest('/analyze-label', {
    method: 'POST',
    body: {
      imageBase64: photo?.base64,
      mimeType: 'image/jpeg',
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

export async function saveProduct(productId) {
  const payload = await apiRequest('/saved-products', {
    method: 'POST',
    body: { productId },
  });
  return payload.savedProduct;
}

export async function checkApiHealth() {
  const payload = await apiRequest('/health');
  return payload;
}
