import React, { useState } from 'react';
import { View, Text as RNText, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';
import { Caption } from './Typography';
import { QuoteEngine } from '../../services/quotes/QuoteEngine';

export interface AscendMentalityProps {
  initialQuote?: string;
  allowRefresh?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const AscendMentality: React.FC<AscendMentalityProps> = ({
  initialQuote,
  allowRefresh = false,
  style,
}) => {
  const [quoteText, setQuoteText] = useState<string>(
    initialQuote || QuoteEngine.getDailyQuote().text
  );
  const [refreshSeed, setRefreshSeed] = useState(1);

  const handleRefresh = () => {
    if (!allowRefresh) return;
    const nextQuote = QuoteEngine.getQuote('DAILY', refreshSeed + Math.random() * 100);
    setQuoteText(nextQuote.text);
    setRefreshSeed(s => s + 1);
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.topRow}>
        <View style={styles.labelGroup}>
          <View style={styles.indicator} />
          <Caption upper style={styles.label}>ASCEND MENTALITY</Caption>
        </View>

        {allowRefresh && (
          <TouchableOpacity
            onPress={handleRefresh}
            activeOpacity={0.6}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <RNText style={styles.refreshIcon}>↻</RNText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.contentWrap}>
        <RNText style={styles.quoteText}>"{quoteText}"</RNText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
    marginVertical: THEME.spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indicator: {
    width: 3,
    height: 8,
    backgroundColor: THEME.colors.cyan,
    borderRadius: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: THEME.colors.textMuted,
  },
  refreshIcon: {
    fontSize: 13,
    color: THEME.colors.textMuted,
    fontWeight: 'bold',
  },
  contentWrap: {
    paddingTop: 2,
  },
  quoteText: {
    fontSize: 13,
    lineHeight: 18,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
    fontStyle: 'normal',
    letterSpacing: 0.2,
  },
});
