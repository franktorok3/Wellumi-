import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorState, LoadingState } from '../components/StateViews';

export default function FeedScreen({
  styles,
  ScreenHeader,
  FeedCard,
  cards,
  loading,
  error,
  stale,
  onRetry,
  onRefresh,
  onOpen,
  GuardrailNote,
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader
        title="Awareness feed"
        subtitle="Real source updates based on your scans and saved products."
      />
      <Pressable style={styles.feedRefreshButton} onPress={onRefresh}>
        <Text style={styles.feedRefreshText}>Refresh feed</Text>
      </Pressable>
      {stale ? (
        <Text style={styles.feedStaleNote}>
          Some sources were temporarily unavailable. Showing cached or partial results.
        </Text>
      ) : null}
      {loading ? <LoadingState message="Loading your feed..." styles={styles} /> : null}
      {!loading && error ? (
        <ErrorState title="Feed unavailable" message={error} onRetry={onRetry} styles={styles} />
      ) : null}
      {!loading && !error && cards.length ? (
        cards.map((card) => <FeedCard key={card.id} card={card} onPress={() => onOpen(card)} />)
      ) : null}
      {!loading && !error && !cards.length ? (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>No feed items yet</Text>
          <Text style={styles.emptyStateBody}>
            Scan a product to start receiving personalized awareness updates.
          </Text>
        </View>
      ) : null}
      <GuardrailNote />
    </ScrollView>
  );
}

export function FeedDetailScreen({
  styles,
  item,
  onBack,
  onOpenSource,
  GuardrailNote,
}) {
  if (!item) return null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.resultHero}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{item.sourceLabel}</Text>
        </View>
        <Text style={styles.resultTitle}>{item.title}</Text>
        <Text style={styles.resultMeta}>{item.date}</Text>
        <Text style={styles.resultBody}>{item.reasonLabel}</Text>
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Text style={styles.cardBody}>{item.summary || 'No summary available.'}</Text>
      </View>
      {!!item.matchedTerm && (
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Matched term</Text>
          <Text style={styles.cardBody}>{item.matchedTerm}</Text>
        </View>
      )}
      {!!item.sourceUrl && (
        <Pressable style={styles.primaryButton} onPress={() => onOpenSource(item.sourceUrl)}>
          <Text style={styles.primaryButtonText}>Open original source</Text>
        </Pressable>
      )}
      <GuardrailNote />
    </ScrollView>
  );
}

export async function openFeedSource(url) {
  if (!url) return;
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}
