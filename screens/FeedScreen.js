import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorState, LoadingState } from '../components/StateViews';

const STORY_SECTION_LABELS = {
  why_this_matters_now: 'Why this matters now',
  everyday_explanation: 'The everyday explanation',
  what_people_commonly_use_it_for: 'What people commonly use it for',
  what_product_labels_commonly_say: 'What product labels commonly say',
  what_reliable_sources_say: 'What reliable sources say',
  what_remains_uncertain: 'What remains uncertain',
  what_to_check_on_the_label: 'What to check on the label',
  questions_worth_asking: 'Questions worth asking',
  sources: 'Sources',
};

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
        title="Wellumi feed"
        subtitle="Lifestyle-oriented stories grounded in real sources."
      />
      <Pressable style={styles.feedRefreshButton} onPress={onRefresh}>
        <Text style={styles.feedRefreshText}>Refresh feed</Text>
      </Pressable>
      {stale ? (
        <Text style={styles.feedStaleNote}>
          Some sources were temporarily unavailable. Showing the best available stories.
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
          <Text style={styles.emptyStateTitle}>No stories yet</Text>
          <Text style={styles.emptyStateBody}>
            Wellumi will build a lifestyle feed here. Scan a product to unlock more personalized stories.
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

  const sections = item.sections || {};

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.resultHero}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{item.updateType || 'Wellumi story'}</Text>
        </View>
        {item.safetyFlag ? (
          <View style={styles.feedSafetyBadge}>
            <Text style={styles.feedSafetyBadgeText}>Safety update</Text>
          </View>
        ) : null}
        <Text style={styles.resultTitle}>{item.title}</Text>
        {!!item.deck && <Text style={styles.resultBody}>{item.deck}</Text>}
        <Text style={styles.resultMeta}>{item.date}</Text>
        <Text style={styles.feedReasonDetail}>{item.reasonLabel}</Text>
        {!!item.sourceStrengthLabel && (
          <Text style={styles.resultMeta}>Source strength: {item.sourceStrengthLabel}</Text>
        )}
        {__DEV__ && !!item.generationMode ? (
          <Text style={styles.feedDevMeta}>
            generation_mode: {item.generationMode}
            {item.fallbackReason ? ` · ${item.fallbackReason}` : ''}
          </Text>
        ) : null}
      </View>

      {Object.entries(STORY_SECTION_LABELS).map(([key, label]) => {
        const body = sections[key];
        if (!body || key === 'sources') return null;
        return (
          <View key={key} style={styles.infoCard}>
            <Text style={styles.cardTitle}>{label}</Text>
            <Text style={styles.cardBody}>{body}</Text>
          </View>
        );
      })}

      {item.sources?.length ? (
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Sources</Text>
          {item.sources.map((source) => (
            <Pressable key={source.id || source.url} onPress={() => onOpenSource(source.url)}>
              <Text style={styles.feedSourceLink}>
                • {source.title || source.name}
                {source.provider ? ` (${source.provider.replace(/_/g, ' ')})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
