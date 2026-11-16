// The student's side of practice in a call (design C4, C9): the sign the
// teacher asked for in a big slab with the hold ring, what to do next in
// words with an icon, and "Show me how" (the reference photo or clip). The
// result is a moment, not a line of text, and "not yet" never says the
// child was wrong. Desktop: a card under the student's own (big) video.
// Phone: a sheet.
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import SignReference from "../../components/learn/SignReference";
import { StarRow } from "../../components/learn/Stars";
import ScoreMeter from "../../components/learn/ScoreMeter";
import { AlertCircleIcon, CheckIcon, EyeIcon, HandIcon, VideoIcon } from "../../components/icons/UiIcons";
import { fonts, kidTypography, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { getMotionHint, getSignMedia } from "../../lib/referenceMedia";
import { signName } from "../../lib/signNames";
import { accuracyStars, starReference, starsText } from "../../lib/starReference";
import { PASS_PERCENT, closerText, percent } from "../../lib/learnCopy";
import type { SignGroup, SignLanguage } from "../../lib/curriculum";
import type { PracticeResult } from "../../lib/callSignaling";
import { CallPill, HoldRing } from "./CallParts";

type Props = {
  phone: boolean;
  sign: string;
  language: SignLanguage;
  group: SignGroup;
  /** This request's attempts, newest last. */
  results: PracticeResult[];
  /** The computer is reading this student's signs right now. */
  checking: boolean;
  cameraOff: boolean;
  captionsOff: boolean;
  /** Letters: the pass check's hold, 0-1 - full exactly when the sign counts. */
  hold: number;
  reduceMotion: boolean;
};

export default function StudentAskPanel({ phone, sign, language, group, results, checking, cameraOff, captionsOff, hold, reduceMotion }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showHow, setShowHow] = useState(false);
  const media = getSignMedia(language, group, sign);
  const passed = results.find((r) => r.passed);
  const last = results[results.length - 1];
  const letters = group !== "words";
  const name = signName(language, sign);

  if (passed) {
    const stars = accuracyStars(passed.confidence, starReference(language, group, sign));
    return (
      <View style={[styles.card, styles.cardPassed, phone && styles.cardPhone]} accessibilityLiveRegion="polite">
        <View style={styles.bigCheck}>
          <CheckIcon size={phone ? 40 : 52} color={colors.successText} strokeWidth={3.4} />
        </View>
        <Text style={styles.headline}>Great signing! {percent(passed.confidence)}%</Text>
        <Text style={styles.body}>That counts. {name} is learned.</Text>
        <View accessibilityLabel={starsText(stars)}>
          <StarRow filled={stars} size={phone ? 26 : 30} gap={6} />
        </View>
        <Text style={styles.small}>Wait for your teacher to pick the next sign.</Text>
      </View>
    );
  }

  if (last) {
    const different = !!last.seen && last.seen !== sign;
    // The target's score. 0 means it wasn't measured (a word read as another
    // word, or nothing read), so no number is shown for it.
    const score = last.confidence;
    const before = results.length > 1 ? results[results.length - 2].confidence : 0;
    const scored = score > 0 ? `“${name}” scored ${percent(score)}%. ` : "";
    return (
      <ScrollView style={[styles.card, phone && styles.cardPhone]} contentContainerStyle={styles.cardContent}>
        <View style={styles.slab}>
          <Text style={[styles.slabGlyph, !letters && styles.slabWord]} numberOfLines={1} adjustsFontSizeToFit>
            {name}
          </Text>
        </View>
        <Text style={styles.headline}>{different ? "Let's try again" : score > 0 ? `Almost! ${percent(score)}%` : "Almost! Try again."}</Text>
        {score > 0 ? <ScoreMeter value={score} style={styles.meter} /> : null}
        <Text style={styles.body}>
          {different
            ? `${scored}The computer thought it looked like a different sign. Look at the picture and try once more.`
            : score > 0
              ? closerText(score, before > 0 ? before : null) ?? `You need ${PASS_PERCENT}% to pass. Try once more, a bit slower.`
              : "The computer wasn't sure. Try once more, a bit slower."}
        </Text>
        <HowTo sign={sign} media={media} language={language} group={group} show={showHow} onToggle={() => setShowHow((v) => !v)} reduceMotion={reduceMotion} />
      </ScrollView>
    );
  }

  // Waiting for the first try. The ring is the pass check's own hold, so it
  // fills only while the asked sign is held well enough to count, and full
  // means it counted.
  const holdingTarget = letters && hold > 0;
  const status = cameraOff
    ? { icon: <VideoIcon size={18} color={colors.accentCoral} off />, text: "Turn your camera on so the computer can see your sign.", sub: null }
    : captionsOff
      ? { icon: <AlertCircleIcon size={18} color={colors.accentCoral} />, text: "Turn captions on so the computer can check your sign.", sub: null }
      : !checking
        ? { icon: <HandIcon size={18} color={colors.textOnGlass} />, text: "Waiting for your teacher…", sub: null }
        : holdingTarget
          ? { icon: <HandIcon size={18} color={colors.accentCoral} />, text: "Hold it still…", sub: "Keep your hand in front of the camera until the ring is full." }
          : { icon: <HandIcon size={18} color={colors.accentCoral} />, text: "Sign it when you're ready.", sub: null };

  return (
    <ScrollView style={[styles.card, styles.cardAsked, phone && styles.cardPhone]} contentContainerStyle={styles.cardContent}>
      <Text style={styles.title}>Your teacher asks you to sign</Text>
      <View style={[styles.askRow, phone && styles.askRowPhone]} accessibilityLiveRegion="polite">
        <HoldRing
          size={phone ? 108 : 150}
          progress={holdingTarget ? hold : 0}
          done={holdingTarget && hold >= 1}
          glyph={name}
          glyphSize={letters ? (phone ? 44 : kidTypography.kidTarget.fontSize * 0.62) : phone ? 18 : 22}
        />
        <View style={styles.flex}>
          <View style={styles.statusLine}>
            {status.icon}
            <Text style={styles.statusText}>{status.text}</Text>
          </View>
          {status.sub ? <Text style={styles.small}>{status.sub}</Text> : null}
        </View>
      </View>
      <HowTo sign={sign} media={media} language={language} group={group} show={showHow} onToggle={() => setShowHow((v) => !v)} reduceMotion={reduceMotion} />
    </ScrollView>
  );
}

function HowTo({
  sign,
  media,
  language,
  group,
  show,
  onToggle,
  reduceMotion,
}: {
  sign: string;
  media: ReturnType<typeof getSignMedia>;
  language: SignLanguage;
  group: SignGroup;
  show: boolean;
  onToggle: () => void;
  reduceMotion: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  if (!media) return <Text style={styles.small}>No picture for this sign yet.</Text>;
  // The toggle stays above the picture, so hiding it never needs a scroll.
  return (
    <View style={styles.howTo}>
      <CallPill
        size="lg"
        label={show ? "Hide how to make it" : "Show me how"}
        accessibilityLabel={show ? "Hide how to make it" : `Show me how to make ${signName(language, sign)}`}
        onPress={onToggle}
        icon={(c) => <EyeIcon size={18} color={c} />}
        style={styles.howButton}
      />
      {show ? <SignReference sign={signName(language, sign)} media={media} motionHint={getMotionHint(language, group, sign)} reduceMotion={reduceMotion} /> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(242,178,62,0.45)",
    backgroundColor: "rgba(48,54,68,0.96)",
  },
  cardContent: { padding: 20, gap: 14 },
  cardAsked: {},
  cardPassed: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12, borderColor: "rgba(63,181,106,0.55)" },
  cardPhone: { borderRadius: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  title: { fontFamily: fonts.heading, fontSize: 21, color: colors.textPrimary },
  askRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  askRowPhone: { gap: 14 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass, textAlign: "left" },
  headline: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.textPrimary, textAlign: "center" },
  body: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 25, color: colors.textPrimary, textAlign: "center" },
  meter: { alignSelf: "center", width: "100%", maxWidth: 320 },
  bigCheck: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 3,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  slab: {
    alignSelf: "center",
    minWidth: 104,
    height: 104,
    borderRadius: 24,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuBase,
  },
  slabGlyph: { fontFamily: fonts.heading, fontSize: 64, lineHeight: 70, color: colors.accentCoralText },
  slabWord: { fontSize: 28, lineHeight: 32 },
  howTo: { gap: 12 },
  howButton: { alignSelf: "flex-start" },
});
