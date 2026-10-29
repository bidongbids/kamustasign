// "What they learn" (design T4, T5): the learning plan and the modules as one
// section with two numbered steps, under one sentence that says how they
// differ. The step cards act as two tabs and each shows its own summary, so
// both are visible at a glance.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton, type NoticeState } from "./ManageKit";
import ClassPlanEditor, { type SaveBarState } from "./ClassPlanEditor";
import TeacherModules, { type ModuleEditorState } from "./TeacherModules";
import { ArrowRightIcon, CheckIcon, GridIcon, PlusIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { CURRICULUM, getGroup, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { dueInfo } from "../../lib/teacherInsights";
import type { ClassRow, ModuleRow, ProgressEmbed, StudentProgressSummary } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

export type LearnStep = "plan" | "modules";

type Props = {
  klass: ClassRow;
  plan: ClassPlan;
  onPlanSaved: (plan: ClassPlan) => void;
  step: LearnStep;
  onStep: (s: LearnStep) => void;
  modules: ModuleRow[];
  modulesLoading: boolean;
  reloadModules: () => void;
  setModules: (next: ModuleRow[]) => void;
  students: StudentProgressSummary[];
  rowsFor: (language: SignLanguage, group: SignGroup) => Map<string, ProgressEmbed[]> | null;
  ensureGroup: (language: SignLanguage, group: SignGroup) => void;
  setNotice: (n: NoticeState) => void;
  onSaveBar: (bar: SaveBarState) => void;
  editor: ModuleEditorState | null;
  setEditor: (e: ModuleEditorState | null) => void;
  planning: boolean;
  setPlanning: (open: boolean) => void;
  accentColor: string;
  phone: boolean;
  wide: boolean;
};

export function planSummary(plan: ClassPlan): string {
  return CURRICULUM.filter((l) => getGroup(l.language, "words").available)
    .map((l) => {
      const total = getGroup(l.language, "words").signs.length;
      const n = planSigns(l.language, "words", plan).length;
      return n === total ? `${l.label} all ${total}` : `${l.label} ${n} of ${total}`;
    })
    .join(" · ");
}

export default function TeacherLearn(props: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { klass, plan, step, onStep, modules, phone, wide } = props;
  const dueThisWeek = modules.filter((m) => {
    const d = dueInfo(m.due_date);
    return d.days !== null && d.days >= 0 && d.days <= 7;
  }).length;
  const modulesSummary = `${modules.length} module${modules.length === 1 ? "" : "s"}${dueThisWeek ? ` · ${dueThisWeek} due this week` : ""}`;
  const planHasWords = CURRICULUM.some((l) => getGroup(l.language, "words").available && planSigns(l.language, "words", plan).length > 0);

  return (
    <View>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
            What they learn
          </Text>
          <Text style={styles.lede}>
            {step === "plan"
              ? "Two steps. The plan is every word the class can practise. Modules take words from the plan, put them in order and give them a due date."
              : "Students see modules on their dashboard in this order."}
          </Text>
        </View>
        {step === "modules" && !phone ? (
          <View style={styles.headActions}>
            <ActionButton label="Modules by category…" size="lg" icon={(c) => <GridIcon size={16} color={c} />} onPress={() => props.setPlanning(true)} />
            <ActionButton label="New module" variant="primary" size="lg" icon={(c) => <PlusIcon size={16} color={c} />} onPress={() => props.setEditor({ module: null })} />
          </View>
        ) : null}
      </View>

      <View style={[styles.steps, phone && styles.stepsPhone]} accessibilityRole="tablist">
        <StepCard
          n={1}
          title="Words in the plan"
          sub={planSummary(plan)}
          active={step === "plan"}
          done={step !== "plan" && planHasWords}
          onPress={() => onStep("plan")}
        />
        {!phone ? <ArrowRightIcon size={16} color={colors.textOnGlass} /> : null}
        <StepCard n={2} title="Modules" sub={modulesSummary} active={step === "modules"} onPress={() => onStep("modules")} />
      </View>

      {step === "modules" && phone ? (
        <View style={styles.phoneActions}>
          <ActionButton label="New module" variant="primary" size="md" icon={(c) => <PlusIcon size={14} color={c} />} onPress={() => props.setEditor({ module: null })} />
          <ActionButton label="Modules by category…" size="md" onPress={() => props.setPlanning(true)} />
        </View>
      ) : null}

      {step === "plan" ? (
        <ClassPlanEditor
          klass={klass}
          plan={plan}
          accentColor={props.accentColor}
          setNotice={props.setNotice}
          onSaved={props.onPlanSaved}
          onSaveBar={props.onSaveBar}
          wide={wide}
        />
      ) : (
        <TeacherModules
          klass={klass}
          modules={modules}
          loading={props.modulesLoading}
          reload={props.reloadModules}
          setModules={props.setModules}
          students={props.students}
          plan={plan}
          onPlanSaved={props.onPlanSaved}
          rowsFor={props.rowsFor}
          ensureGroup={props.ensureGroup}
          setNotice={props.setNotice}
          editor={props.editor}
          setEditor={props.setEditor}
          planning={props.planning}
          setPlanning={props.setPlanning}
          phone={phone}
        />
      )}
    </View>
  );
}

function StepCard({ n, title, sub, active, done, onPress }: { n: number; title: string; sub: string; active: boolean; done?: boolean; onPress: () => void }) {
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Step ${n}: ${title}. ${sub}`}
      style={({ hovered }: any) => [styles.step, active ? [styles.stepActive, shadows.neuRaised("sm")] : styles.stepIdle, hovered && !active && styles.stepHover, webCursor]}
    >
      <View style={[styles.stepNo, active ? styles.stepNoActive : done ? styles.stepNoDone : styles.stepNoIdle]}>
        {done && !active ? <CheckIcon size={16} color="#FFFFFF" strokeWidth={3} /> : <Text style={[styles.stepNoText, active && styles.stepNoTextActive]}>{n}</Text>}
      </View>
      <View style={styles.flexShrink}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginBottom: 18 },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  titlePhone: { fontSize: 26, lineHeight: 32 },
  lede: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.textOnGlass, marginTop: 6, maxWidth: 860 },
  headActions: { flexDirection: "row", gap: 10 },
  steps: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  stepsPhone: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1.5 },
  stepActive: { backgroundColor: colors.neuBase, borderColor: colors.primaryTealLight },
  stepIdle: { borderColor: theme.name === "dark" ? "rgba(255,255,255,0.14)" : colors.border },
  stepHover: { backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.04)" : colors.surfacePressed },
  stepNo: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  stepNoActive: { backgroundColor: colors.actionPrimaryFill },
  stepNoDone: { backgroundColor: colors.success },
  stepNoIdle: { backgroundColor: colors.neuWell },
  stepNoText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textOnGlass },
  stepNoTextActive: { color: "#FFFFFF" },
  stepTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, color: colors.textPrimary },
  stepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass, marginTop: 2 },
  phoneActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
});
