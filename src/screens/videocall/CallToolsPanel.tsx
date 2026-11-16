// The teacher's call panels (design C2, C4, C8, C9): a drawer beside the
// video on desktop, a bottom sheet on a phone. Two panels, each opened by its
// own button in the call's bar - no "Tools" menu with tabs in between:
//  - Practice: ask the student for a letter (a 7-column grid) or a word
//    from the class plan (search); letters the student has tried but not
//    learned get a gold ring. While a request is up: the result, the tries
//    for this sign, Ask again / Next / Stop. Below: what was practiced
//    earlier in the call.
//  - Reader: which model reads the signs, and whose signs are read. On a
//    phone, the text tools (Speak, Show big, Clear…) sit at its top.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SegmentedToggle from "../../components/SegmentedToggle";
import { AlertCircleIcon, CheckIcon, ClockIcon, CloseIcon, EyeIcon, HandIcon, RetryIcon, SearchIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { getLessonProgress } from "../../lib/queries";
import { MASTERY_PASSES, PASS_CONFIDENCE } from "../../lib/curriculum";
import { callModelScope, summarizePractice } from "../../lib/callPractice";
import { signMatches, signName } from "../../lib/signNames";
import type { CallModelKey, CallSettings, PracticeResult } from "../../lib/callSignaling";
import { CallPill } from "./CallParts";
import { CALL_MODEL_ORDER, MODEL_HINTS, MODEL_NAMES, firstName, pct, tries, type ReadFrom } from "./callUi";

export type CallPanel = "practice" | "reading";

type Props = {
  phone: boolean;
  panel: CallPanel;
  onPanel: (panel: CallPanel) => void;
  onClose: () => void;
  peer: { id: string; name: string };
  modelKey: CallModelKey;
  onModel: (key: CallModelKey) => void;
  readFrom: ReadFrom;
  onReadFrom: (r: ReadFrom) => void;
  autoSpeak: { on: boolean; toggle: () => void } | null;
  /** The signs that can be asked for with this model (class plan's words, or the letters). */
  signs: string[];
  practice: CallSettings["practice"];
  /** Every result this call, all requests. */
  results: PracticeResult[];
  /** Which model each request was made with, for "Earlier in this call". */
  modelOf: (r: PracticeResult) => CallModelKey;
  onAsk: (sign: string | null) => void;
  /** The student's signs are being read (else no result can arrive). */
  reading: boolean;
  /** Turns reading the student back on: captions on, and their signs read. */
  onFixReading: () => void;
  /** Phone: the text tools sit at the top of the Reader sheet. */
  transcriptTools?: React.ReactNode;
};

const GRID_GAP = 8;
const PASS_PCT = Math.round(PASS_CONFIDENCE * 100);

type TryKind = "passed" | "notYet" | "close" | "unsure";
function tryKind(r: PracticeResult): TryKind {
  if (r.passed) return "passed";
  if (r.seen && r.seen !== r.sign) return "notYet";
  return r.confidence > 0 ? "close" : "unsure";
}
const TRY_WORDS: Record<TryKind, string> = { passed: "Correct", notYet: "Not yet", close: "Close", unsure: "Not sure" };

function TryIcon({ kind, size = 16 }: { kind: TryKind; size?: number }) {
  const { colors } = useTheme();
  if (kind === "passed") return <CheckIcon size={size} color={colors.successText} />;
  if (kind === "unsure") return <AlertCircleIcon size={size} color={colors.textOnGlass} />;
  return <RetryIcon size={size} color={colors.accentCoral} />;
}

export default function CallToolsPanel(props: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { phone, panel, onClose, peer, practice } = props;
  const first = firstName(peer.name);
  const title = panel === "practice" ? (practice ? `Practice with ${first}` : `Ask ${first} to sign`) : "Sign reader";
  return (
    <View style={[styles.panel, phone && styles.panelPhone]}>
      {phone ? <View style={styles.grabber} /> : null}
      <View style={styles.head}>
        <View style={[styles.headIcon, shadows.neuRaised("sm")]}>
          {panel === "practice" ? <HandIcon size={20} color={colors.accentCoral} /> : <EyeIcon size={20} color={colors.primaryTealLight} />}
        </View>
        <Text style={styles.headTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.close, shadows.neuRaised("sm"), pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={panel === "practice" ? "Close Practice" : "Close Sign reader"}
          hitSlop={6}
        >
          <CloseIcon size={17} color={colors.textPrimary} />
        </Pressable>
      </View>
      {phone && panel === "reading" && props.transcriptTools ? (
        <View style={styles.transcriptBlock}>
          <Text style={styles.eyebrow}>{`${first.toUpperCase()}'S SIGNS AS TEXT`}</Text>
          <View style={styles.transcriptTools}>{props.transcriptTools}</View>
        </View>
      ) : null}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {panel === "practice" ? <PracticeBody {...props} /> : <ReadingBody {...props} />}
      </ScrollView>
    </View>
  );
}

/** "Ana's signs aren't being read" with the one-tap fix, instead of directions to another panel. */
function NotReading({ first, onFix }: { first: string; onFix: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.warnBox} accessibilityLiveRegion="polite">
      <AlertCircleIcon size={18} color={colors.accentCoralText} />
      <Text style={[styles.warn, styles.flex]}>{first}'s signs aren't being read, so nothing can be checked.</Text>
      <CallPill size="md" variant="gold" label="Read them" accessibilityLabel={`Read ${first}'s signs`} onPress={onFix} />
    </View>
  );
}

function PracticeBody({ peer, modelKey, signs, practice, results, modelOf, onAsk, reading, onFixReading, onPanel }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const first = firstName(peer.name);
  const scope = callModelScope(modelKey);
  const letters = scope.group !== "words"; // letters and numbers: one still handshape each, shown as a grid
  const name = (s: string) => signName(scope.language, s);
  const [search, setSearch] = useState("");
  // Seven letters to a row (design C2): the tiles grow with the drawer.
  const [gridW, setGridW] = useState(0);
  const tile = gridW ? Math.min(58, Math.floor((gridW - 6 * GRID_GAP) / 7)) : 48;
  // Letters this student has tried but not learned: a gold ring in the grid.
  const [tried, setTried] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    getLessonProgress(peer.id, scope.language, scope.group).then(({ data }) => {
      if (cancelled || !data) return;
      setTried(new Set((data as { sign: string; attempts: number; passes: number }[]).filter((r) => r.attempts > 0 && r.passes < MASTERY_PASSES).map((r) => r.sign)));
    });
    return () => {
      cancelled = true;
    };
  }, [peer.id, scope.language, scope.group]);

  const earlier = useMemo(
    () => summarizePractice(results.filter((r) => r.practiceId !== practice?.id), modelOf),
    [results, practice?.id, modelOf]
  );

  if (practice) {
    const current = results.filter((r) => r.practiceId === practice.id);
    const passed = current.find((r) => r.passed);
    const last = current[current.length - 1];
    const best = current.reduce((m, r) => Math.max(m, r.confidence), 0);
    const state: "waiting" | "passed" | "notYet" = passed ? "passed" : last ? "notYet" : "waiting";
    const next = signs[(signs.indexOf(practice.sign) + 1) % Math.max(1, signs.length)];
    const ringColor = state === "passed" ? colors.success : state === "notYet" ? colors.accentCoral : colors.border;
    return (
      <View style={styles.section}>
        <View style={styles.askRow} accessibilityLiveRegion="polite">
          <View style={[styles.askTile, shadows.neuRaised("sm"), { borderColor: ringColor }]}>
            <Text style={[styles.askGlyph, practice.sign.length > 2 && styles.askGlyphWord]} numberOfLines={1} adjustsFontSizeToFit>
              {name(practice.sign)}
            </Text>
          </View>
          <View style={styles.flex}>
            {state === "waiting" ? (
              <>
                <View style={styles.statusLine}>
                  <ClockIcon size={18} color={colors.textPrimary} />
                  <Text style={styles.statusTitle}>Waiting for {first}…</Text>
                </View>
                <Text style={styles.small}>
                  {first}'s screen shows the sign and how to make it. It counts at {PASS_PCT}% or more{letters ? ", held still" : ""}.
                </Text>
              </>
            ) : state === "passed" ? (
              <>
                <View style={styles.statusLine}>
                  <CheckIcon size={20} color={colors.successText} />
                  <Text style={[styles.statusTitle, { color: colors.successText }]}>Correct!</Text>
                </View>
                <Text style={styles.statusMain}>
                  {pct(passed!.confidence)} sure · {tries(current.length)}
                </Text>
                <Text style={styles.small}>Counted toward {first}'s plan.</Text>
              </>
            ) : (
              <>
                <View style={styles.statusLine}>
                  <RetryIcon size={18} color={colors.accentCoral} />
                  <Text style={[styles.statusTitle, { color: colors.accentCoralText }]}>Not yet</Text>
                </View>
                <Text style={styles.statusMain}>
                  {last!.seen && last!.seen !== practice.sign ? `The computer saw “${name(last!.seen)}”` : "Not clear enough yet"}
                </Text>
                <Text style={styles.small}>
                  Best so far {pct(best)} · needs {PASS_PCT}%
                </Text>
              </>
            )}
          </View>
        </View>
        {!reading ? <NotReading first={first} onFix={onFixReading} /> : null}
        <View style={styles.askActions}>
          {next && next !== practice.sign ? (
            <CallPill
              size="lg"
              label={`Next: ${name(next)}`}
              variant={state === "passed" ? "gold" : "raised"}
              onPress={() => onAsk(next)}
              accessibilityLabel={`Ask for the next sign, ${name(next)}`}
            />
          ) : null}
          <CallPill size="lg" label="Ask again" variant={state === "notYet" ? "gold" : "raised"} onPress={() => onAsk(practice.sign)} icon={(c) => <RetryIcon size={16} color={c} />} />
          <CallPill size="lg" label="Stop" variant="ghost" onPress={() => onAsk(null)} accessibilityLabel="Stop asking" icon={(c) => <CloseIcon size={14} color={c} />} />
        </View>
        {current.length > 0 ? (
          <View style={styles.triesBlock}>
            <Text style={styles.eyebrow}>TRIES FOR THIS SIGN</Text>
            {current.map((r, i) => {
              const k = tryKind(r);
              return (
                <View key={i} style={[styles.tryRow, shadows.neuInset("sm")]}>
                  <Text style={styles.tryNo}>Try {i + 1}</Text>
                  <TryIcon kind={k} size={15} />
                  <Text style={[styles.tryWord, { color: k === "passed" ? colors.successText : k === "unsure" ? colors.textOnGlass : colors.accentCoral }]}>
                    {TRY_WORDS[k]}
                  </Text>
                  <Text style={styles.tryDetail} numberOfLines={1}>
                    {k === "notYet" ? `saw “${name(r.seen ?? "")}”${r.confidence > 0 ? ` · ${pct(r.confidence)}` : ""}` : k === "unsure" ? "—" : `${name(r.sign)} · ${pct(r.confidence)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {earlier.length > 0 ? <Earlier entries={earlier} /> : null}
      </View>
    );
  }

  const shown = letters ? signs : signs.filter((s) => signMatches(scope.language, s, search)).slice(0, 40);
  return (
    <View style={styles.section}>
      <Text style={styles.body2}>
        Tap a sign. {first}'s screen shows it with how to make it, and it's marked correct at {PASS_PCT}% or more.
      </Text>
      <Pressable
        onPress={() => onPanel("reading")}
        accessibilityRole="button"
        accessibilityLabel={`Signs from ${MODEL_NAMES[modelKey]}. Change in Sign reader`}
        style={({ pressed }) => [styles.fromRow, pressed && styles.pressed]}
      >
        <Text style={styles.small}>
          Signs from <Text style={styles.bold}>{MODEL_NAMES[modelKey]}</Text>
        </Text>
        <Text style={styles.link}>Change</Text>
      </Pressable>
      {!reading ? <NotReading first={first} onFix={onFixReading} /> : null}
      {letters ? (
        <>
          <View style={styles.grid} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
            {shown.map((s) => (
              <Pressable
                key={s}
                onPress={() => onAsk(s)}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${peer.name} to sign ${s}${tried.has(s) ? ", tried but not learned yet" : ""}`}
                style={({ pressed }) => [styles.letter, { width: tile, height: tile }, shadows.neuRaised("sm"), tried.has(s) && styles.letterTried, pressed && styles.pressed]}
              >
                <Text style={[styles.letterText, { fontSize: Math.max(17, Math.round(tile * 0.42)) }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
          {tried.size > 0 ? (
            <View style={styles.legend}>
              <View style={styles.legendBox} />
              <Text style={styles.small}>Gold outline: tried but not learned yet</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <View style={[styles.search, shadows.neuInset("sm")]}>
            <SearchIcon size={17} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search the plan's words"
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              accessibilityLabel="Search signs to practice"
            />
          </View>
          <View style={styles.chips}>
            {shown.map((s) => (
              <Pressable
                key={s}
                onPress={() => onAsk(s)}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${peer.name} to sign ${name(s)}`}
                style={({ pressed }) => [styles.chip, shadows.neuRaised("sm"), tried.has(s) && styles.letterTried, pressed && styles.pressed]}
              >
                <Text style={styles.chipText}>{name(s)}</Text>
              </Pressable>
            ))}
            {shown.length === 0 ? <Text style={styles.small}>No signs match.</Text> : null}
          </View>
        </>
      )}
      {earlier.length > 0 ? <Earlier entries={earlier} /> : null}
    </View>
  );
}

function Earlier({ entries }: { entries: ReturnType<typeof summarizePractice> }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.triesBlock}>
      <Text style={styles.eyebrow}>EARLIER IN THIS CALL</Text>
      {entries.map((e, i) => (
        <View key={`${e.sign}-${i}`} style={[styles.tryRow, shadows.neuInset("sm")]}>
          <Text style={styles.earlierSign}>{signName(e.language, e.sign)}</Text>
          {e.passed ? <CheckIcon size={15} color={colors.successText} /> : <RetryIcon size={15} color={colors.accentCoral} />}
          <Text style={[styles.tryWord, { color: e.passed ? colors.successText : colors.accentCoral }]}>{e.passed ? "Correct" : "Not yet"}</Text>
          <Text style={styles.tryDetail} numberOfLines={1}>
            {e.confidence > 0 ? `${pct(e.confidence)} · ` : ""}
            {tries(e.tries)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReadingBody({ peer, modelKey, onModel, readFrom, onReadFrom, autoSpeak }: Props) {
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const first = firstName(peer.name);
  const models = CALL_MODEL_ORDER.map((key) => ({ key, name: MODEL_NAMES[key], hint: MODEL_HINTS[key] }));
  return (
    <View style={styles.section}>
      <Text style={styles.body2}>The computer turns signs into text on your screen and {first}'s. Choose whose signs, and which kind.</Text>
      <Text style={styles.subTitle}>Read signs from</Text>
      <SegmentedToggle
        options={[
          { key: "them", label: first },
          { key: "me", label: "Me" },
          { key: "both", label: "Both of us" },
        ]}
        value={readFrom}
        onChange={onReadFrom}
      />
      <Text style={styles.small}>Reading both uses twice the computer's effort. Pick one if the call feels slow.</Text>
      <Text style={styles.subTitle}>Kind of signs</Text>
      <View style={styles.radioList} accessibilityRole="radiogroup">
        {models.map((m) => {
          const selected = m.key === modelKey;
          return (
            <Pressable
              key={m.key}
              onPress={() => onModel(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${m.name}. ${m.hint}`}
              style={({ pressed }) => [styles.radio, selected ? [styles.radioOn, shadows.neuRaised("sm")] : styles.radioIdle, pressed && styles.pressed]}
            >
              <View style={[styles.radioDot, selected && styles.radioDotOn]}>{selected ? <View style={styles.radioDotInner} /> : null}</View>
              <View style={styles.flex}>
                <Text style={styles.radioName}>{m.name}</Text>
                <Text style={styles.radioHint}>{m.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {autoSpeak ? (
        <Pressable onPress={autoSpeak.toggle} style={styles.switchRow} accessibilityRole="switch" accessibilityState={{ checked: autoSpeak.on }}>
          <View style={[styles.switchTrack, autoSpeak.on && styles.switchOn]}>
            <View style={[styles.switchKnob, autoSpeak.on && styles.switchKnobOn]} />
          </View>
          <Text style={[styles.body2, styles.flex]}>Speak each new word {first} signs aloud</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8 },
  panel: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(48,54,68,0.96)",
    padding: 20,
    gap: 16,
  },
  panelPhone: { borderRadius: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 16 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  headTitle: { flex: 1, minWidth: 0, fontFamily: fonts.heading, fontSize: 21, lineHeight: 27, color: colors.textPrimary },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  transcriptBlock: { gap: 8 },
  transcriptTools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 12 },
  section: { gap: 14 },
  subTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary, marginTop: 6 },
  body2: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textOnGlass },
  bold: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  small: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.primaryTealLight },
  fromRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 36 },
  warnBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242,178,62,0.45)",
    backgroundColor: "rgba(242,178,62,0.08)",
  },
  warn: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.accentCoralText },
  eyebrow: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1.1, color: colors.textOnGlass, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  letter: { borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, borderWidth: 2, borderColor: "transparent" },
  letterTried: { borderColor: colors.accentCoral },
  letterText: { fontFamily: fonts.heading, color: colors.textPrimary },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendBox: { width: 16, height: 16, borderRadius: 5, borderWidth: 2, borderColor: colors.accentCoral },
  search: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 48, borderRadius: radii.pill, backgroundColor: colors.neuWell },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, paddingVertical: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuBase,
    borderWidth: 2,
    borderColor: "transparent",
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  askRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  askTile: { width: 100, height: 100, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, borderWidth: 2.5, paddingHorizontal: 6 },
  askGlyph: { fontFamily: fonts.heading, fontSize: 54, lineHeight: 60, color: colors.textPrimary },
  askGlyphWord: { fontSize: 22, lineHeight: 26 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary },
  statusMain: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary, marginTop: 4 },
  triesBlock: { gap: 8 },
  tryRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.neuWell },
  tryNo: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textOnGlass, width: 48 },
  tryWord: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  tryDetail: { flex: 1, textAlign: "right", fontFamily: fonts.body, fontSize: 14, color: colors.textOnGlass },
  earlierSign: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary, minWidth: 30 },
  askActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  radioList: { gap: 8 },
  radio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  radioOn: { backgroundColor: colors.neuBase, borderColor: colors.primaryTealLight },
  radioIdle: { backgroundColor: "transparent" },
  radioDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textOnGlass, alignItems: "center", justifyContent: "center" },
  radioDotOn: { borderColor: colors.primaryTealLight },
  radioDotInner: { width: 11, height: 11, borderRadius: 5.5, backgroundColor: colors.primaryTealLight },
  radioName: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  radioHint: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6, minHeight: 44 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.neuWell, padding: 3 },
  switchOn: { backgroundColor: colors.actionPrimaryFill },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textOnGlass },
  switchKnobOn: { transform: [{ translateX: 18 }], backgroundColor: "#FFFFFF" },
});
