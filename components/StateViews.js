import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

export function LoadingState({ message = 'Loading...', styles }) {
  return (
    <View style={styles?.centerState || defaultStyles.centerState}>
      <ActivityIndicator color={colors.green} />
      <Text style={styles?.stateBody || defaultStyles.stateBody}>{message}</Text>
    </View>
  );
}

export function ErrorState({ title, message, onRetry, styles }) {
  return (
    <View style={styles?.centerState || defaultStyles.centerState}>
      <Text style={styles?.stateTitle || defaultStyles.stateTitle}>{title}</Text>
      <Text style={styles?.stateBody || defaultStyles.stateBody}>{message}</Text>
      {!!onRetry && (
        <Pressable style={styles?.retryButton || defaultStyles.retryButton} onPress={onRetry}>
          <Text style={styles?.retryButtonText || defaultStyles.retryButtonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ title, message, styles }) {
  return (
    <View style={styles?.emptyStateCard}>
      <Text style={styles?.emptyStateTitle}>{title}</Text>
      <Text style={styles?.emptyStateBody}>{message}</Text>
    </View>
  );
}

const defaultStyles = {
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  stateTitle: {
    color: colors.greenDark,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.green,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: colors.white,
    fontWeight: '800',
  },
};
