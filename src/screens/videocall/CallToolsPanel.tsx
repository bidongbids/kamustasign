// The teacher's Tools (design C2, C4, C8, C9): a drawer beside the video on
// desktop, a bottom sheet on a phone, with two tabs.
//  - Practice: ask the student for a letter (a 7-column grid) or a word
//    from the class plan (search); letters the student has tried but not
//    learned get a gold ring. While a request is up: the result, the tries
//    for this sign, Ask again / Next. Below: what was practised earlier in
//    the call.
//  - Reading: which model reads the signs, and whose signs are read.
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SegmentedToggle from "../../components/SegmentedToggle";
import { AlertCircleIcon, CheckIcon, ClockIcon, CloseIcon, RetryIcon, SearchIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { getLessonProgress } from "../../lib/queries";
import { MASTERY_PASSES } from "../../lib/curriculum";
import { callModelScope, summarizePractice } from "../../lib/callPractice";
import type { CallModelKey, CallSettings, PracticeResult } from "../../lib/callSignaling";
import { CallPill } from "./CallParts";
import { MODEL_HINTS, MODEL_NAMES, firstName, pct, tries, type ReadFrom } from "./callUi";

export type ToolsTab = "practice" | "reading";

type Props = {
  phone: boolean;
  tab: ToolsTab;
  onTab: (tab: ToolsTab) => void;
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
  /** Phone: the transcript tools sit at the top of the sheet. */
  transcriptTools?: React.ReactNode;
};

const GRID_GAP = 6;

type TryKind = "passed" | "notYet" | "close" | "unsure";
function tryKind(r: PracticeResult): TryKind {
  if (r.passed) return "passed";
  if (r.seen && r.seen !== r.sign) return "notYet";
  return r.confidence > 0 ? "close" : "unsure";
}
const TRY_WORDS: Record<TryKind, string> = { passed: "Got it", notYet: "Not yet", close: "Close", unsure: "Not sure" };

function TryIcon({ kind, size = 16 }: { kind: TryKind; size?: number }) {
  if (kind === "passed") return <CheckIcon size={size} color={colors.successText} />;
  if (kind === "unsure") return <AlertCircleIcon size={size} color={colors.textOnGlass} />;
  return <RetryIcon size={size} color={colors.accentCoral} />;
}

export default function CallToolsPanel(props: Props) {
  const { phone, tab, onTab, onClose, modelKey } = props;
  return (
    <View style={[styles.panel, phone && styles.panelPhone]}>
      {phone ? <View style={styles.grabber} /> : null}
      <View style={styles.head}>
        <SegmentedToggle
          options={[
            { key: "practice", label: "Practice" },
            { key: "reading", label: "Reading" },
          ]}
          value={tab}
          onChange={onTab}
        />
        {phone ? (
          <Text style={styles.headModel}>{MODEL_NAMES[modelKey]}</Text>
        ) : props.practice && tab === "practice" ? (
          <CallPill size="sm" label="Stop" onPress={() => props.onAsk(null)} icon={(c) => <CloseIcon size={13} color={c} />} />
        ) : (
          <Pressable onPress={onClose} style={[styles.close, neuRaised("sm")]} accessibilityRole="button" accessibilityLabel="Close Tools" hitSlop={6}>
            <CloseIcon size={15} color={colors.textPrimary} />
          </Pressable>
        )}
      </View>
      {phone && props.transcriptTools ? <View style={styles.transcriptTools}>{props.transcriptTools}</View> : null}
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        {tab === "practice" ? <PracticeTab {...props} /> : <ReadingTab {...props} />}
      </ScrollView>
    </View>
  );
}

function PracticeTab({ peer, modelKey, signs, practice, results, modelOf, onAsk, reading, phone }: Props) {
  const first = firstName(peer.name);
  const scope = callModelScope(modelKey);
  const letters = scope.group === "letters";
  const [search, setSearch] = useState("");
  // Seven letters to a row (design C2): the tiles shrink a little in a narrow drawer.
  const [gridW, setGridW] = useState(0);
  const tile = gridW ? Math.min(44, Math.floor((gridW - 6 * GRID_GAP) / 7)) : 44;
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
        <Text style={styles.small}>Asked {first} to sign</Text>
        <View style={styles.askRow} accessibilityLiveRegion="polite">
          <View style={[styles.askTile, neuRaised("sm"), { borderColor: ringColor }]}>
            <Text style={[styles.askGlyph, practice.sign.length > 2 && styles.askGlyphWord]} numberOfLines={1} adjustsFontSizeToFit>
              {practice.sign}
            </Text>
          </View>
          <View style={styles.flex}>
            {state === "waiting" ? (
              <>
                <View style={styles.statusLine}>
                  <ClockIcon size={16} color={colors.textPrimary} />
                  <Text style={styles.statusTitle}>Waiting for a try…</Text>
                </View>
                <Text style={styles.small}>{first}'s screen shows the sign and how to make it.</Text>
              </>
            ) : state === "passed" ? (
              <>
                <View style={styles.statusLine}>
                  <CheckIcon size={18} color={colors.successText} />
                  <Text style={[styles.statusTitle, { color: colors.successText }]}>Got it!</Text>
                </View>
                <Text style={styles.statusMain}>
                  {pct(passed!.confidence)} sure · {tries(current.length)}
                </Text>
                <Text style={styles.small}>Counted toward {first}'s plan.</Text>
              </>
            ) : (
              <>
                <View style={styles.statusLine}>
                  <RetryIcon size={16} color={colors.accentCoral} />
                  <Text style={[styles.statusTitle, { color: colors.accentCoral }]}>Not yet</Text>
                </View>
                <Text style={styles.statusMain}>
                  {last!.seen && last!.seen !== practice.sign ? `The computer saw “${last!.seen}”` : "Not clear enough yet"}
                </Text>
                <Text style={styles.small}>Best so far {pct(best)} · needs 80%</Text>
              </>
            )}
          </View>
        </View>
        {!reading ? (
          <Text style={styles.warn}>{first}'s signs aren't being read. In Reading, choose {first} or Both of us, with captions on.</Text>
        ) : null}
        {current.length > 0 ? (
          <View style={styles.triesBlock}>
            <Text style={styles.eyebrow}>TRIES FOR THIS SIGN</Text>
            {current.map((r, i) => {
              const k = tryKind(r);
              return (
                <View key={i} style={[styles.tryRow, neuInset("sm")]}>
                  <Text style={styles.tryNo}>Try {i + 1}</Text>
                  <TryIcon kind={k} size={14} />
                  <Text style={[styles.tryWord, { color: k === "passed" ? colors.successText : k === "unsure" ? colors.textOnGlass : colors.accentCoral }]}>
                    {TRY_WORDS[k]}
                  </Text>
                  <Text style={styles.tryDetail} numberOfLines={1}>
                    {k === "notYet" ? `saw “${r.seen}”${r.confidence > 0 ? ` · ${pct(r.confidence)}` : ""}` : k === "unsure" ? "—" : `${r.sign} · ${pct(r.confidence)}`}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <View style={styles.askActions}>
          <CallPill label="Ask again" variant={state === "notYet" ? "gold" : "raised"} onPress={() => onAsk(practice.sign)} />
          {next && next !== practice.sign ? (
            <CallPill
              label={`Next: ${next}`}
              variant={state === "passed" ? "gold" : "raised"}
              onPress={() => onAsk(next)}
              icon={undefined}
              accessibilityLabel={`Ask for the next sign, ${next}`}
            />
          ) : null}
          {phone ? <CallPill label="Stop" variant="ghost" onPress={() => onAsk(null)} icon={(c) => <CloseIcon size={13} color={c} />} /> : null}
        </View>
        {earlier.length > 0 ? <Earlier entries={earlier} /> : null}
      </View>
    );
  }

  const q = search.trim().toLowerCase();
  const shown = letters ? signs : (q ? signs.filter((s) => s.toLowerCase().includes(q)) : signs).slice(0, 40);
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Ask {first} to sign</Text>
      <Text style={styles.body2}>
        Their device checks it and counts it toward their plan. Signs from <Text style={styles.bold}>{MODEL_NAMES[modelKey]}</Text>.
      </Text>
      {!reading ? <Text style={styles.warn}>{first}'s signs aren't being read. In Reading, choose {first} or Both of us, with captions on.</Text> : null}
      {letters ? (
        <>
          <View style={styles.grid} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
            {shown.map((s) => (
              <Pressable
                key={s}
                onPress={() => onAsk(s)}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${peer.name} to sign ${s}${tried.has(s) ? ", tried but not learned yet" : ""}`}
                style={({ pressed }) => [styles.letter, { width: tile, height: tile }, neuRaised("sm"), tried.has(s) && styles.letterTried, pressed && styles.letterPressed]}
              >
                <Text style={styles.letterText}>{s}</Text>
              </Pressable>
            ))}
          </View>
          {tried.size > 0 ? (
            <View style={styles.legend}>
              <View style={styles.legendBox} />
              <Text style={styles.small}>Gold outline: letters {first} has tried but not learned yet</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <View style={[styles.search, neuInset("sm")]}>
            <SearchIcon size={16} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search the plan's words"
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              accessibilityLabel="Search signs to practise"
            />
          </View>
          <View style={styles.chips}>
            {shown.map((s) => (
              <Pressable
                key={s}
                onPress={() => onAsk(s)}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${peer.name} to sign ${s}`}
                style={({ pressed }) => [styles.chip, neuRaised("sm"), tried.has(s) && styles.letterTried, pressed && styles.letterPressed]}
              >
                <Text style={styles.chipText}>{s}</Text>
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
  return (
    <View style={styles.triesBlock}>
      <Text style={styles.eyebrow}>EARLIER IN THIS CALL</Text>
      {entries.map((e, i) => (
        <View key={`${e.sign}-${i}`} style={[styles.tryRow, neuInset("sm")]}>
          <Text style={styles.earlierSign}>{e.sign}</Text>
          {e.passed ? <CheckIcon size={14} color={colors.successText} /> : <RetryIcon size={14} color={colors.accentCoral} />}
          <Text style={[styles.tryWord, { color: e.passed ? colors.successText : colors.accentCoral }]}>{e.passed ? "Got it" : "Not yet"}</Text>
          <Text style={styles.tryDetail} numberOfLines={1}>
            {e.confidence > 0 ? `${pct(e.confidence)} · ` : ""}
            {tries(e.tries)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReadingTab({ peer, modelKey, onModel, readFrom, onReadFrom, autoSpeak }: Props) {
  const first = firstName(peer.name);
  const models: { key: CallModelKey | "asl-numbers"; name: string; hint: string; soon?: boolean }[] = [
    { key: "asl-letters", name: MODEL_NAMES["asl-letters"], hint: MODEL_HINTS["asl-letters"] },
    { key: "asl-words", name: MODEL_NAMES["asl-words"], hint: MODEL_HINTS["asl-words"] },
    { key: "fsl-words", name: MODEL_NAMES["fsl-words"], hint: MODEL_HINTS["fsl-words"] },
    { key: "asl-numbers", name: "ASL Numbers", hint: "Soon · no model yet", soon: true },
  ];
  return (
    <View style={styles.section}>
      <Text style={styles.subTitle}>Which signs to read</Text>
      <View style={styles.radioList} accessibilityRole="radiogroup">
        {models.map((m) => {
          const selected = m.key === modelKey;
          return (
            <Pressable
              key={m.key}
              disabled={m.soon}
              onPress={() => !m.soon && onModel(m.key as CallModelKey)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !!m.soon }}
              accessibilityLabel={`${m.name}. ${m.hint}`}
              style={[styles.radio, selected ? neuRaised("sm") : styles.radioIdle, m.soon && styles.radioSoon]}
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
      {autoSpeak ? (
        <Pressable onPress={autoSpeak.toggle} style={styles.switchRow} accessibilityRole="switch" accessibilityState={{ checked: autoSpeak.on }}>
          <View style={[styles.switchTrack, autoSpeak.on && styles.switchOn]}>
            <View style={[styles.switchKnob, autoSpeak.on && styles.switchKnobOn]} />
          </View>
          <Text style={styles.body2}>Speak each new word {first} signs aloud</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  panel: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(48,54,68,0.96)",
    padding: 18,
    gap: 14,
  },
  panelPhone: { borderRadius: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headModel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textOnGlass },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  transcriptTools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 12 },
  section: { gap: 12 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
  subTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary, marginTop: 4 },
  body2: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass },
  bold: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textOnGlass },
  warn: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.accentCoral },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.1, color: colors.textOnGlass, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  letter: { borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, borderWidth: 1.5, borderColor: "transparent" },
  letterTried: { borderColor: colors.accentCoral },
  letterPressed: { opacity: 0.8 },
  letterText: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendBox: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5, borderColor: colors.accentCoral },
  search: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: radii.pill, backgroundColor: colors.neuWell },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, paddingVertical: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, borderWidth: 1.5, borderColor: "transparent" },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  askRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  askTile: { width: 84, height: 84, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, borderWidth: 2, paddingHorizontal: 6 },
  askGlyph: { fontFamily: fonts.heading, fontSize: 46, lineHeight: 50, color: colors.textPrimary },
  askGlyphWord: { fontSize: 20, lineHeight: 24 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusTitle: { fontFamily: fonts.heading, fontSize: 19, color: colors.textPrimary },
  statusMain: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  triesBlock: { gap: 8 },
  tryRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.neuWell },
  tryNo: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass, width: 44 },
  tryWord: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  tryDetail: { flex: 1, textAlign: "right", fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },
  earlierSign: { fontFamily: fonts.heading, fontSize: 16, color: colors.textPrimary, minWidth: 28 },
  askActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  radioList: { gap: 8 },
  radio: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.neuBase, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  radioIdle: { backgroundColor: "transparent" },
  radioSoon: { opacity: 0.55 },
  radioDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textOnGlass, alignItems: "center", justifyContent: "center" },
  radioDotOn: { borderColor: colors.primaryTealLight },
  radioDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryTealLight },
  radioName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  radioHint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  switchTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: colors.neuWell, padding: 3 },
  switchOn: { backgroundColor: colors.actionPrimaryFill },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textOnGlass },
  switchKnobOn: { transform: [{ translateX: 16 }], backgroundColor: "#FFFFFF" },
});
