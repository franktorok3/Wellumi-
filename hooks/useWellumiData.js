import { useCallback, useState } from 'react';
import {
  fetchFeed,
  fetchRecentScans,
  fetchSavedProducts,
  refreshFeed,
} from '../services/api';
import {
  mapFeedItemToCard,
  mapSavedProductToLibraryItem,
  mapScanToRecentItem,
} from '../services/mappers';

function settleSection(result, fallbackMessage) {
  if (result.status === 'fulfilled') {
    return { data: result.value, error: '' };
  }
  return {
    data: null,
    error: result.reason?.message || fallbackMessage,
  };
}

export function useWellumiData() {
  const [recentScans, setRecentScans] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [feedCards, setFeedCards] = useState([]);
  const [feedStale, setFeedStale] = useState(false);

  const [scansLoading, setScansLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);

  const [scansError, setScansError] = useState('');
  const [savedError, setSavedError] = useState('');
  const [feedError, setFeedError] = useState('');

  const clear = useCallback(() => {
    setRecentScans([]);
    setSavedItems([]);
    setFeedCards([]);
    setFeedStale(false);
    setScansLoading(false);
    setSavedLoading(false);
    setFeedLoading(false);
    setScansError('');
    setSavedError('');
    setFeedError('');
  }, []);

  const hydrate = useCallback(async () => {
    setScansLoading(true);
    setSavedLoading(true);
    setFeedLoading(true);
    setScansError('');
    setSavedError('');
    setFeedError('');

    const [scansResult, savedResult, feedResult] = await Promise.allSettled([
      fetchRecentScans(),
      fetchSavedProducts(),
      fetchFeed(),
    ]);

    const scans = settleSection(scansResult, 'Could not load recent scans.');
    const saved = settleSection(savedResult, 'Could not load saved products.');
    const feed = settleSection(feedResult, 'Could not load feed.');

    if (scans.data) {
      setRecentScans(scans.data.map((scan, index) => mapScanToRecentItem(scan, index)));
    }
    setScansError(scans.error);

    if (saved.data) {
      setSavedItems(saved.data.map(mapSavedProductToLibraryItem));
    }
    setSavedError(saved.error);

    if (feed.data) {
      setFeedCards((feed.data.items || []).map(mapFeedItemToCard));
      setFeedStale(Boolean(feed.data.stale));
    }
    setFeedError(feed.error);

    setScansLoading(false);
    setSavedLoading(false);
    setFeedLoading(false);
  }, []);

  const reloadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError('');
    try {
      const feedPayload = await refreshFeed();
      setFeedCards((feedPayload.items || []).map(mapFeedItemToCard));
      setFeedStale(Boolean(feedPayload.stale));
      return feedPayload;
    } catch (feedError) {
      const message = feedError?.message || 'Could not refresh feed.';
      setFeedError(message);
      throw feedError;
    } finally {
      setFeedLoading(false);
    }
  }, []);

  return {
    recentScans,
    savedItems,
    feedCards,
    feedStale,
    scansLoading,
    savedLoading,
    feedLoading,
    scansError,
    savedError,
    feedError,
    hydrate,
    reloadFeed,
    clear,
    setSavedItems,
    setRecentScans,
  };
}
