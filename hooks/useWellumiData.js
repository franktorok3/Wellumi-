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

export function useWellumiData() {
  const [recentScans, setRecentScans] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [feedCards, setFeedCards] = useState([]);
  const [feedStale, setFeedStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [scans, savedProducts, feedPayload] = await Promise.all([
        fetchRecentScans(),
        fetchSavedProducts(),
        fetchFeed(),
      ]);
      setRecentScans(scans.map((scan, index) => mapScanToRecentItem(scan, index)));
      setSavedItems(savedProducts.map(mapSavedProductToLibraryItem));
      setFeedCards((feedPayload.items || []).map(mapFeedItemToCard));
      setFeedStale(Boolean(feedPayload.stale));
    } catch (hydrateError) {
      setError(hydrateError?.message || 'Could not load your Wellumi data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadFeed = useCallback(async () => {
    try {
      const feedPayload = await refreshFeed();
      setFeedCards((feedPayload.items || []).map(mapFeedItemToCard));
      setFeedStale(Boolean(feedPayload.stale));
      return feedPayload;
    } catch (feedError) {
      throw feedError;
    }
  }, []);

  return {
    recentScans,
    savedItems,
    feedCards,
    feedStale,
    loading,
    error,
    hydrate,
    reloadFeed,
    setSavedItems,
    setRecentScans,
  };
}
