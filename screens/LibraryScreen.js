import { Pressable, ScrollView, Text, View } from 'react-native';
import { ErrorState, LoadingState } from '../components/StateViews';

export default function LibraryScreen({
  styles,
  ScreenHeader,
  Icon,
  items,
  loading,
  error,
  onRetry,
  onOpen,
  colors,
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.screenScroll}>
      <ScreenHeader title="My library" subtitle="Saved scans with the exact analysis you saved." />
      {loading ? <LoadingState message="Loading saved items..." styles={styles} /> : null}
      {!loading && error ? (
        <ErrorState title="Could not load library" message={error} onRetry={onRetry} styles={styles} />
      ) : null}
      {!loading && !error && items.length ? (
        items.map((item) => (
          <Pressable key={item.id} style={styles.libraryCard} onPress={() => onOpen(item)}>
            <View style={styles.libraryTypeBadge}>
              <Text style={styles.libraryTypeText} numberOfLines={1}>
                {item.type}
              </Text>
            </View>
            <View style={styles.libraryText}>
              <Text style={styles.libraryTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.libraryDescription} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={styles.librarySavedAt}>
                Saved {item.savedAtLabel}
                {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
              </Text>
            </View>
            <Icon name="bookmark" color={colors.green} size={22} />
          </Pressable>
        ))
      ) : null}
      {!loading && !error && !items.length ? (
        <View style={styles.emptyStateCard}>
          <Text style={styles.emptyStateTitle}>Nothing saved yet</Text>
          <Text style={styles.emptyStateBody}>
            Scan a product and save the result to build your library.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
