import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

function SectionBlock({ title, badge, children, styles }) {
  if (!children) return null;
  return (
    <View style={styles.infoCard}>
      <View style={styles.resultSectionHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {!!badge && <Text style={styles.resultBadge}>{badge}</Text>}
      </View>
      {children}
    </View>
  );
}

function MissingLine({ styles }) {
  return <Text style={styles.missingLine}>Not available from this source.</Text>;
}

export default function ResultScreen({
  styles,
  InfoCard,
  PrimaryButton,
  GuardrailNote,
  result,
  isSaved,
  onBack,
  onSave,
}) {
  const nutritionEntries = result.nutritionEntries || [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultScroll}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.resultHero}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{result.kicker || 'Label summary'}</Text>
        </View>
        <Text style={styles.resultTitle}>{result.title}</Text>
        {!!result.brand && <Text style={styles.resultMeta}>Brand: {result.brand}</Text>}
        {!!result.barcode && <Text style={styles.resultMeta}>Barcode: {result.barcode}</Text>}
        {!!result.analysisDate && <Text style={styles.resultMeta}>Analyzed: {result.analysisDate}</Text>}
        <Text style={styles.resultBody}>{result.neutralDisclaimer}</Text>
      </View>

      {!!result.imageUrl && (
        <Image source={{ uri: result.imageUrl }} style={styles.resultImage} resizeMode="cover" />
      )}

      <SectionBlock title="Label facts" badge="External / visible" styles={styles}>
        {result.ingredientsText ? (
          <Text style={styles.cardBody}>{result.ingredientsText}</Text>
        ) : result.detectedLabelText ? (
          <Text style={styles.cardBody}>{result.detectedLabelText}</Text>
        ) : (
          <MissingLine styles={styles} />
        )}
      </SectionBlock>

      <SectionBlock title="Nutrition data" badge="When available" styles={styles}>
        {nutritionEntries.length ? (
          nutritionEntries.map((entry) => (
            <Text key={entry.key || entry.label} style={styles.cardBody}>
              {entry.display}
            </Text>
          ))
        ) : (
          <MissingLine styles={styles} />
        )}
      </SectionBlock>

      <SectionBlock title="Wellumi context" badge="AI-generated" styles={styles}>
        {result.aiSections?.length ? (
          result.aiSections.map((section) => (
            <View key={section.title} style={styles.resultSubsection}>
              <Text style={styles.resultSubheading}>{section.title}</Text>
              <Text style={styles.cardBody}>{section.body}</Text>
            </View>
          ))
        ) : (
          <MissingLine styles={styles} />
        )}
      </SectionBlock>

      <SectionBlock title="Sources" styles={styles}>
        {result.sources?.length ? (
          result.sources.map((source) => (
            <Text key={`${source.name}-${source.type}`} style={styles.cardBody}>
              • {source.label || source.name}
            </Text>
          ))
        ) : result.source ? (
          <Text style={styles.cardBody}>• {result.source.replace(/_/g, ' ')}</Text>
        ) : (
          <MissingLine styles={styles} />
        )}
      </SectionBlock>

      <InfoCard compact title="Important note" body={result.longDisclaimer} />
      <PrimaryButton
        title={isSaved ? 'Saved to library' : 'Save to library'}
        onPress={onSave}
        disabled={isSaved}
      />
      <GuardrailNote />
    </ScrollView>
  );
}
