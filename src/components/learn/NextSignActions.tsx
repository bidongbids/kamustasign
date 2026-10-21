// P9: keep going without the dashboard. Shown under the feedback after a
// pass. The next sign is the first one after this, in curriculum order, that
// isn't learned and isn't resting (practiceFlow.nextPracticeSign).
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import KidButton from "./KidButton";
import { ArrowRightIcon, ChevronLeftIcon } from "../icons/UiIcons";
import { colors, kidTypography } from "../../theme/theme";

type Props = {
  sign: string;
  nextSign: string | null;
  groupWord: string; // "letter" / "number" / "word"
  onNext: () => void;
  onRepeat: () => void;
  onBack: () => void;
  compact?: boolean;
};

export default function NextSignActions({ sign, nextSign, groupWord, onNext, onRepeat, onBack, compact }: Props) {
  if (!nextSign) {
    return (
      <View style={styles.col}>
        <Text style={[kidTypography.kidBody, { color: colors.textPrimary }]}>You learned every {groupWord}!</Text>
        <KidButton variant="primary" label="Back to my plan" onPress={onBack} iconLeft={<ChevronLeftIcon size={18} color={colors.textOnAccent} />} />
      </View>
    );
  }
  return (
    <View style={[styles.col, !compact && styles.row]}>
      <KidButton
        variant="primary"
        label={`Next sign: ${nextSign}`}
        onPress={onNext}
        iconRight={<ArrowRightIcon size={20} color={colors.textOnAccent} />}
        style={styles.grow}
      />
      <KidButton label={`Practise ${sign} again`} onPress={onRepeat} style={styles.grow} />
      {compact ? (
        <KidButton variant="ghost" label="Back to my plan" onPress={onBack} iconLeft={<ChevronLeftIcon size={18} color={colors.textPrimary} />} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  grow: { flexGrow: 1 },
});
