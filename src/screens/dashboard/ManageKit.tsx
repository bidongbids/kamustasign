// Small building blocks shared by the teacher and admin dashboards' class /
// account management: compact buttons (AuthButton is a full-width form
// button), avatars, role badges, stat tiles, notices, an inline confirm, and
// choice pills. Everything here sits on sheer glass over the dark ground, so
// text uses textPrimary / textSecondary.
//
// Confirmation is inline rather than Alert.alert - react-native-web's Alert
// is a no-op, and a browser confirm() dialog blocks the page.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { AlertCircleIcon, CheckIcon, CloseIcon, RetryIcon, SearchIcon } from "../../components/icons/UiIcons";
import type { ProfileRole } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

// ── ActionButton ────────────────────────────────────────────────────────

type ActionVariant = "primary" | "secondary" | "danger" | "ghost";

// White on the bright violet (3.95:1) or the bright red (3.8:1) fails AA for
// a 13-16px label, so filled buttons use one darker step of each
// (design_handoff_teacher_admin_videocall, "Token additions").
export function fillFor(accent: string) {
  if (accent === colors.primaryTeal) return colors.actionPrimaryFill;
  if (accent === colors.needsPractice) return colors.callDanger;
  return accent;
}
const HEIGHT = { sm: 36, md: 44, lg: 52 } as const;

export function ActionButton({
  label,
  icon,
  onPress,
  variant = "secondary",
  accentColor = colors.primaryTeal,
  loading,
  disabled,
  iconOnly,
  size,
  onFrosted,
  style,
}: {
  label: string;
  icon?: (color: string) => React.ReactNode;
  onPress: () => void;
  variant?: ActionVariant;
  /** 36 / 44 / 52 tall; without it, the compact 38 the admin lists use. */
  size?: "sm" | "md" | "lg";
  /** On frosted glass (a form drawer or dialog): dark labels for ghost / secondary. */
  onFrosted?: boolean;
  accentColor?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Show only the icon; `label` becomes the accessibility label. */
  iconOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [hovered, setHovered] = useState(false);
  const inactive = Boolean(disabled || loading);
  const fg =
    variant === "primary"
      ? colors.textOnPrimary
      : variant === "danger"
        ? colors.needsPractice
        : onFrosted && variant === "ghost"
          ? colors.textOnFrosted
          : variant === "ghost"
            ? colors.textSecondary
            : colors.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      style={({ pressed }) => [
        styles.btn,
        size && { minHeight: HEIGHT[size], paddingHorizontal: size === "lg" ? 20 : size === "md" ? 16 : 12 },
        iconOnly && styles.btnIconOnly,
        iconOnly && size && { width: HEIGHT[size] },
        variant === "primary" && { backgroundColor: fillFor(accentColor) },
        variant === "secondary" && [styles.btnSecondary, neuRaised("sm")],
        variant === "danger" && styles.btnDanger,
        variant === "ghost" && styles.btnGhost,
        hovered && !inactive && styles.btnHover,
        pressed && !inactive && styles.btnPressed,
        inactive && styles.btnDisabled,
        webCursor,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? icon(fg) : null}
          {iconOnly ? null : <Text style={[styles.btnLabel, { color: fg }]}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

// ── Avatar / RoleBadge ──────────────────────────────────────────────────

export const ROLE_COLORS: Record<ProfileRole, string> = {
  student: colors.accentCoral,
  teacher: colors.primaryTealLight,
  admin: colors.adminGrayLight,
};

export function initials(name: string) {
  // "Teresa Gomez (you)" -> "TG", not "T(".
  const parts = name.replace(/\s*\(you\)\s*$/i, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, color = colors.primaryTealLight, size = 38 }: { name: string; color?: string; size?: number }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor: color + "66" }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.avatarText, { color, fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

export function RoleBadge({ role }: { role: ProfileRole }) {
  const color = ROLE_COLORS[role];
  return (
    <View style={[styles.badge, { borderColor: color + "88", backgroundColor: color + "1F" }]}>
      <Text style={[styles.badgeText, { color }]}>{role}</Text>
    </View>
  );
}

// ── StatTile ────────────────────────────────────────────────────────────

export function StatTile({ label, value, color = colors.textPrimary }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={[styles.stat, neuInset("sm")]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Notice ──────────────────────────────────────────────────────────────

export type NoticeState = {
  kind: "error" | "success";
  message: string;
  /** A bold first line ("Couldn't load your students"); `message` is then the body. */
  title?: string;
  /** Errors: a "Try again" button that runs this. */
  retry?: () => void;
} | null;

/** Success notices fade after 6 s; errors stay until dismissed. */
const SUCCESS_MS = 6000;

export function Notice({ notice, onDismiss }: { notice: NoticeState; onDismiss: () => void }) {
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const id = setTimeout(onDismiss, SUCCESS_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);
  if (!notice) return null;
  const isError = notice.kind === "error";
  const color = isError ? colors.needsPractice : colors.success;
  const retry = notice.retry;
  return (
    <View
      style={[styles.notice, { borderColor: color + "80", backgroundColor: color + "1A" }]}
      accessibilityRole={isError ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      {isError ? <AlertCircleIcon size={18} color={colors.needsPracticeText} /> : <CheckIcon size={16} color={colors.successText} />}
      <View style={styles.noticeBody}>
        {notice.title ? <Text style={styles.noticeTitle}>{notice.title}</Text> : null}
        <Text style={notice.title ? styles.noticeSub : styles.noticeText}>{notice.message}</Text>
      </View>
      {isError && retry ? (
        <ActionButton
          label="Try again"
          size="sm"
          icon={(c) => <RetryIcon size={14} color={c} />}
          onPress={() => {
            onDismiss();
            retry();
          }}
        />
      ) : null}
      <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss" style={webCursor}>
        <CloseIcon size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

// ── ConfirmInline ───────────────────────────────────────────────────────

export function ConfirmInline({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  details,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** What will happen, one sentence each, listed under the message. */
  details?: string[];
}) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmText}>{message}</Text>
      {details?.length ? (
        <View style={styles.confirmList}>
          {details.map((d) => (
            <Text key={d} style={styles.confirmText}>
              {"•  "}
              {d}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.row8}>
        <ActionButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
        <ActionButton
          label={confirmLabel}
          variant="primary"
          accentColor={colors.needsPractice}
          onPress={onConfirm}
          loading={busy}
        />
      </View>
    </View>
  );
}

// ── ChoicePills ─────────────────────────────────────────────────────────

export function ChoicePills<K extends string>({
  options,
  value,
  onChange,
  accentColor = colors.primaryTeal,
}: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  accentColor?: string;
}) {
  return (
    <View style={styles.pills} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            style={[
              styles.pill,
              active ? [{ backgroundColor: accentColor, borderColor: accentColor }] : styles.pillIdle,
              webCursor,
            ]}
          >
            <Text style={[styles.pillText, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Fields ──────────────────────────────────────────────────────────────

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <View style={[styles.search, neuInset("sm")]}>
      <SearchIcon size={16} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} accessibilityLabel="Clear search" style={webCursor}>
          <CloseIcon size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// A labelled single-line input with its submit button beside it - "add a
// student by email", "rename class". Enter submits.
export function InlineField({
  label,
  value,
  onChangeText,
  placeholder,
  actionLabel,
  onSubmit,
  busy,
  accentColor,
  keyboardType,
  autoFocus,
  onCancel,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  actionLabel: string;
  onSubmit: () => void;
  busy?: boolean;
  accentColor?: string;
  keyboardType?: "default" | "email-address";
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => !busy && value.trim() && onSubmit()}
          style={[styles.fieldInput, focused && styles.fieldInputFocused]}
        />
        <ActionButton
          label={actionLabel}
          variant="primary"
          accentColor={accentColor}
          onPress={onSubmit}
          loading={busy}
          disabled={!value.trim()}
        />
        {onCancel ? <ActionButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} /> : null}
      </View>
    </View>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// ── CheckRow ────────────────────────────────────────────────────────────
// A whole-row checkbox (the row is the hit target) for picking several
// items from a list - students to invite, signs for a module.

export function CheckBox({
  checked,
  accentColor = colors.primaryTeal,
  size = 20,
  indeterminate,
}: {
  checked: boolean;
  accentColor?: string;
  size?: number;
  /** Some but not all (a category with some words picked): a bar instead of a tick. */
  indeterminate?: boolean;
}) {
  const fill = fillFor(accentColor);
  return (
    <View
      style={[
        styles.checkbox,
        { width: size, height: size, borderRadius: size * 0.28 },
        checked || indeterminate ? { backgroundColor: fill, borderColor: fill } : null,
      ]}
    >
      {checked ? (
        <CheckIcon size={size * 0.7} color={colors.textOnPrimary} strokeWidth={3.4} />
      ) : indeterminate ? (
        <View style={[styles.checkBar, { width: size * 0.5 }]} />
      ) : null}
    </View>
  );
}

export function CheckRow({
  checked,
  onToggle,
  label,
  children,
  accentColor,
  disabled,
  style,
}: {
  checked: boolean;
  onToggle: () => void;
  /** Accessibility label. */
  label: string;
  children: React.ReactNode;
  accentColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.checkRow, pressed && styles.btnPressed, disabled && styles.btnDisabled, webCursor, style]}
    >
      <CheckBox checked={checked} accentColor={accentColor} />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row8: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  btnIconOnly: { width: 38, paddingHorizontal: 0 },
  btnSecondary: { backgroundColor: colors.neuBase },
  btnDanger: { borderWidth: 1.5, borderColor: colors.needsPractice + "99", backgroundColor: "transparent" },
  btnGhost: { backgroundColor: "transparent" },
  btnHover: { opacity: 0.88 },
  btnPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.45 },
  btnLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13 },

  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuWell,
    borderWidth: 1.5,
  },
  avatarText: { fontFamily: fonts.bodySemiBold },

  badge: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, textTransform: "capitalize" },

  stat: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.neuWell,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statValue: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32 },
  statLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
  },
  noticeText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  noticeBody: { flex: 1, minWidth: 0, gap: 2 },
  noticeTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  noticeSub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textOnGlass },

  confirm: {
    marginTop: spacing.sm,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.needsPractice + "66",
    backgroundColor: colors.needsPractice + "14",
    gap: 10,
  },
  confirmText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textPrimary },
  confirmList: { gap: 4 },

  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1.5, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 12 },
  pillIdle: { borderColor: colors.border, backgroundColor: colors.neuWell },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13 },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.neuWell,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },

  fieldWrap: { width: "100%" },
  fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  fieldInput: {
    flex: 1,
    minWidth: 180,
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  fieldInputFocused: { borderColor: colors.focusRing },

  checkbox: {
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuWell,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  checkBar: { height: 2.6, borderRadius: 2, backgroundColor: colors.textOnPrimary },
});
