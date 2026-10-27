// The call's one caption area (design C2/C3/C9): the signs being read, as
// big text below the video - never over it, so it can't cover hands - with
// the letter hold ring, the reader's status chip and the transcript tools.
// With "Read signs from: Both" a second, smaller row shows "You: …".
// Phone: a card floating above the control bar on captionScrim.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BackspaceIcon, ExpandIcon, HandIcon, SpeakerIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import type { useCallSignReader } from "../../hooks/useCallSignReader";
import type { useTranslateAndSpeak } from "../../hooks/useTranslateAndSpeak";
import { CallPill, HoldRing, PhaseChip } from "./CallParts";

type Reader = ReturnType<typeof useCallSignReader>;
type Speech = ReturnType<typeof useTranslateAndSpeak>;

export type CaptionSource = {
  /** "Ana is signing", "You". */
  label: string;
  reader: Reader;
  active: boolean;
  /** What the strip says when this side's signs aren't being read. */
  pausedText: string;
  placeholder: string;
};

type Props = {
  role: "teacher" | "student";
  phone: boolean;
  compact?: boolean;
  /** Letters model: show the hold ring and the Space key. */
  letters: boolean;
  primary: CaptionSource;
  /** Reading both people: the second row. */
  secondary?: CaptionSource | null;
  speech: Speech;
  onShowBig: () => void;
  showBigLabel: string;
  /** Student: opens the sheet with their own caption and its tools. */
  onYourSigns?: () => void;
  /** Screen-reader context, e.g. "Reading ASL Letters, chosen by your teacher". */
  readingNote: string;
  /** Width available for the transcript, to keep its last words in view. */
  width: number;
};

/** The end of the text that fits on one line at this size. */
function tail(text: string, chars: number) {
  return text.length <= chars ? text : `…${text.slice(-(chars - 1))}`;
}

export default function CaptionStrip({
  role,
  phone,
  compact,
  letters,
  primary,
  secondary,
  speech,
  onShowBig,
  showBigLabel,
  onYourSigns,
  readingNote,
  width,
}: Props) {
  const student = role === "student";
  const size = phone ? (student ? 34 : 28) : student ? (compact ? 36 : 44) : compact ? 30 : 36;
  const text = primary.reader.text.trim();
  const hasText = text.length > 0;
  const speakLabel =
    speech.status === "speaking" ? "Speaking…" : speech.status === "translating" ? "Translating…" : "Speak aloud";
  const ring = letters && primary.active && !phone;
  const guess = primary.reader.guess.label;
  const showGuess = ring && guess && primary.reader.phase !== "no-hand";
  // Tools on the right (desktop): the transcript gets the rest.
  const toolsW = phone ? 0 : student ? 360 : letters ? 500 : 440;
  const chars = Math.max(10, Math.floor((width - toolsW - (ring ? 96 : 40)) / (size * 0.62)));

  return (
    <View
      style={[styles.strip, phone ? styles.stripPhone : null]}
      accessibilityLabel={readingNote}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        {ring ? (
          <HoldRing
            size={compact ? 56 : 64}
            progress={primary.reader.hold}
            done={primary.reader.phase === "added"}
            glyph={showGuess ? (guess.length > 2 ? guess.slice(0, 3) : guess) : "?"}
            dim={!showGuess}
          />
        ) : null}
        <View style={styles.textCol}>
          <View style={styles.headRow}>
            <Text style={[styles.label, student && styles.labelStudent]} numberOfLines={1}>
              {student && !phone ? primary.label : primary.label.toUpperCase()}
            </Text>
            <PhaseChip phase={primary.active ? primary.reader.phase : "off"} compact={phone} />
          </View>
          {primary.active || hasText ? (
            <Text
              style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.15) }, !hasText && styles.placeholder]}
              numberOfLines={1}
            >
              {hasText ? tail(text.toUpperCase(), chars) : primary.placeholder}
            </Text>
          ) : (
            <Text style={styles.paused}>{primary.pausedText}</Text>
          )}
        </View>
        {!phone ? (
          <View style={styles.tools}>
            <CallPill
              size="md"
              label={speakLabel}
              onPress={() => speech.speak(text)}
              disabled={!hasText}
              icon={(c) => <SpeakerIcon size={16} color={c} />}
            />
            {student ? (
              onYourSigns ? <CallPill size="md" label="Your signs" onPress={onYourSigns} icon={(c) => <HandIcon size={17} color={c} />} /> : null
            ) : (
              <>
                <CallPill size="md" label={showBigLabel} onPress={onShowBig} disabled={!hasText} icon={(c) => <ExpandIcon size={15} color={c} />} />
                {letters ? <CallPill size="md" label="␣" accessibilityLabel="Add a space" onPress={primary.reader.addSpace} /> : null}
                <CallPill
                  size="md"
                  label=""
                  accessibilityLabel={letters ? "Delete last letter" : "Delete last word"}
                  onPress={primary.reader.backspace}
                  disabled={!hasText}
                  icon={(c) => <BackspaceIcon size={18} color={c} />}
                />
                <CallPill size="md" variant="ghost" label="Clear" onPress={primary.reader.clear} disabled={!hasText} />
              </>
            )}
          </View>
        ) : null}
      </View>
      {secondary ? (
        <View style={styles.secondRow}>
          <PhaseChip phase={secondary.active ? secondary.reader.phase : "off"} compact />
          <Text style={styles.secondText} numberOfLines={1}>
            <Text style={styles.secondLabel}>{secondary.label}: </Text>
            {secondary.active && secondary.reader.text.trim() ? (
              tail(secondary.reader.text.trim().toUpperCase(), 80)
            ) : (
              <Text style={styles.secondMuted}>{secondary.active ? secondary.placeholder : secondary.pausedText}</Text>
            )}
          </Text>
        </View>
      ) : null}
      {speech.error && !phone ? <Text style={styles.error}>{speech.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flex: 1,
    backgroundColor: "rgba(12,14,19,0.92)",
    borderRadius: radii.md + 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: "center",
    gap: 8,
  },
  stripPhone: { backgroundColor: colors.captionScrim, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  textCol: { flex: 1, minWidth: 0, gap: 4 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1, color: colors.textOnGlass },
  labelStudent: { fontSize: 15, letterSpacing: 0 },
  text: { fontFamily: fonts.heading, color: colors.textPrimary },
  placeholder: { color: colors.textTertiary, fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 24 },
  paused: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textOnGlass },
  tools: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  secondRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 8,
  },
  secondText: { flex: 1, fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
  secondLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textOnGlass },
  secondMuted: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textTertiary },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.needsPracticeText },
});
