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
  const nutritionBasis = result.nutritionBasis;
  const hasLabelFacts = Boolean(result.ingredientsText || result.detectedLabelText);
  const hasAiContext = Boolean(result.usedAiLabelAnalysis && result.aiSections?.length);

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

      {hasLabelFacts ? (
        <SectionBlock title="Label facts" badge="Source-backed product facts" styles={styles}>
          <Text style={styles.cardBody}>{result.ingredientsText || result.detectedLabelText}</Text>
        </SectionBlock>
      ) : null}

      {nutritionEntries.length ? (
        <SectionBlock
          title={nutritionBasis ? `Nutrition ${nutritionBasis}` : 'Nutrition'}
          badge="When available"
          styles={styles}
        >
          {nutritionEntries.map((entry) => (
            <Text key={entry.key || entry.label} style={styles.cardBody}>
              {entry.display}
            </Text>
          ))}
        </SectionBlock>
      ) : null}

      {hasAiContext ? (
        <SectionBlock title="Wellumi context" badge="AI-generated" styles={styles}>
          {result.aiSections.map((section) => (
            <View key={section.title} style={styles.resultSubsection}>
              <Text style={styles.resultSubheading}>{section.title}</Text>
              <Text style={styles.cardBody}>{section.body}</Text>
            </View>
          ))}
        </SectionBlock>
      ) : null}

      {result.sources?.length || result.source ? (
        <SectionBlock title="Sources" styles={styles}>
          {result.sources?.length ? (
            result.sources.map((source) => (
              <Text key={`${source.name}-${source.type}`} style={styles.cardBody}>
                • {source.label || source.name}
              </Text>
            ))
          ) : (
            <Text style={styles.cardBody}>• {result.source.replace(/_/g, ' ')}</Text>
          )}
        </SectionBlock>
      ) : null}

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
