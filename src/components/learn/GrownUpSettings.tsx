// "For grown-ups": the exact numbers and engineering controls, out of the
// child's way (part of P2). Frosted glass - adult chrome, dark text.
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import KidButton from "./KidButton";
import HandednessPicker, { useHandedness } from "../HandednessPicker";
import { GearIcon } from "../icons/UiIcons";
import { colors, fonts, radii, typography } from "../../theme/theme";
import { MASTERY_PASSES, PROGRESS_RULES_TEXT } from "../../lib/curriculum";

type Props = {
  best: number;
  passes: number;
  nextPassAt: Date | null;
  saveErrorDetail: string | null;
  instrumentView: boolean;
  onToggleInstrumentView: () => void;
  compact?: boolean;
};

const clock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function GrownUpSettings({
  best,
  passes,
  nextPassAt,
  saveErrorDetail,
  instrumentView,
  onToggleInstrumentView,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [handedness, setHandedness] = useHandedness();

  return (
    <View>
      <KidButton
        small
        iconOnly={compact}
        label="For grown-ups"
        accessibilityLabel={open ? "Close grown-up settings" : "For grown-ups"}
        onPress={() => setOpen((o) => !o)}
        iconLeft={<GearIcon size={18} color={colors.textPrimary} />}
      />
      {open && (
        <>
          <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close grown-up settings" />
          <GlassCard tint="frosted" radius={radii.md} padding={18} dropShadow style={[styles.panel, compact && styles.panelCompact]}>
            <Text style={[typography.meta, styles.eyebrow]}>GROWN-UP SETTINGS</Text>
            <Row label="Signing hand">
              <View style={{ width: 170 }}>
                <HandednessPicker value={handedness} onChange={setHandedness} compact />
              </View>
            </Row>
            <Row label="Best this session" value={`${Math.round(best * 100)}% · pass needs 80%`} />
            <Row
              label="Counted passes"
              value={`${Math.min(passes, MASTERY_PASSES)} of ${MASTERY_PASSES}${nextPassAt ? ` · next counts after ${clock(nextPassAt)}` : ""}`}
            />
            <Row label="Rules" value={PROGRESS_RULES_TEXT} />
            {saveErrorDetail ? <Row label="Last error" value={saveErrorDetail} /> : null}
            <Row label="Instrument view">
              <Pressable
                onPress={onToggleInstrumentView}
                accessibilityRole="switch"
                accessibilityState={{ checked: instrumentView }}
                style={[styles.switch, instrumentView && styles.switchOn]}
              >
                <Text style={[styles.switchText, instrumentView && { color: colors.textOnAccent }]}>
                  {instrumentView ? "On" : "Off"}
                </Text>
              </Pressable>
            </Row>
            <Text style={[typography.caption, styles.note]}>
              Instrument view shows the full translator: confidence dial, commit speed and holding meter.
            </Text>
          </GlassCard>
        </>
      )}
    </View>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{label}</Text>
      {children ?? <Text style={styles.v}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  panel: { position: "absolute", top: 56, right: 0, width: 420, zIndex: 41 },
  panelCompact: { width: 330 },
  eyebrow: { color: colors.textOnFrostedMuted, marginBottom: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  k: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textOnFrosted },
  v: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.textOnFrosted, flexShrink: 1, textAlign: "right" },
  switch: {
    minHeight: 36,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  switchOn: { backgroundColor: colors.accentCoral },
  switchText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textOnFrosted },
  note: { color: colors.textOnFrosted, marginTop: 6 },
});
