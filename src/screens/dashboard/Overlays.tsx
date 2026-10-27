// Overlays shared by the teacher and admin dashboards
// (design_handoff_teacher_admin_videocall, "New components"):
//  - RowMenu: a ⋯ button that opens a small menu anchored to it, 44px items,
//    destructive items last;
//  - SideDrawer: a panel from the right (600 wide) over a scrim - a full
//    screen page on a phone. "sheer" holds gold / green (student detail);
//    "frosted" is for forms (module editor), with textOnFrosted only;
//  - Dialog: a centred frosted card (Modules by category).
// All are RN Modals: Esc / the back button close them, and so does a tap on
// the scrim. Drawers slide in, or just appear with reduced motion.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import GlassCard from "../../components/GlassCard";
import { CloseIcon, MoreIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";
import { useReduceMotion } from "../../hooks/useReduceMotion";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

// ── RowMenu ─────────────────────────────────────────────────────────────

export type MenuItem = {
  key: string;
  label: string;
  icon?: (color: string) => React.ReactNode;
  onPress: () => void;
  /** Shown in needsPracticeText, after a divider. */
  destructive?: boolean;
  /** Grey words at the end of the row ("offline"). */
  detail?: string;
  disabled?: boolean;
};

const MENU_W = 240;

export function RowMenu({ items, label, size = 38, tone = "raised" }: { items: MenuItem[]; label: string; size?: number; tone?: "raised" | "ghost" }) {
  const ref = useRef<View>(null);
  const { width: W, height: H } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const close = () => setAnchor(null);
  const plain = items.filter((i) => !i.destructive);
  const danger = items.filter((i) => i.destructive);
  const menuH = items.length * 44 + (danger.length && plain.length ? 9 : 0) + 12;
  const below = anchor ? anchor.y + anchor.h + 6 + menuH < H : true;
  const pos = anchor
    ? {
        top: below ? anchor.y + anchor.h + 6 : Math.max(8, anchor.y - menuH - 6),
        left: Math.max(8, Math.min(W - MENU_W - 8, anchor.x + anchor.w - MENU_W)),
      }
    : null;

  const row = (i: MenuItem) => {
    const color = i.destructive ? colors.needsPracticeText : colors.textPrimary;
    return (
      <Pressable
        key={i.key}
        disabled={i.disabled}
        onPress={() => {
          close();
          i.onPress();
        }}
        accessibilityRole="menuitem"
        accessibilityLabel={i.detail ? `${i.label}, ${i.detail}` : i.label}
        style={({ hovered, pressed }: any) => [styles.item, (hovered || pressed) && styles.itemHover, i.disabled && styles.disabled, webCursor]}
      >
        {i.icon ? i.icon(color) : null}
        <Text style={[styles.itemText, { color }]} numberOfLines={1}>
          {i.label}
        </Text>
        {i.detail ? <Text style={styles.itemDetail}>{i.detail}</Text> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: !!anchor }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.trigger,
          { width: size, height: size, borderRadius: size / 2 },
          tone === "raised" ? [styles.triggerRaised, neuRaised("sm")] : null,
          anchor && styles.triggerOpen,
          pressed && { opacity: 0.8 },
          webCursor,
        ]}
      >
        <MoreIcon size={18} color={colors.textPrimary} />
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
        {pos ? (
          <View style={[styles.menu, neuRaised("md"), pos]} accessibilityRole="menu">
            {plain.map(row)}
            {plain.length && danger.length ? <View style={styles.divider} /> : null}
            {danger.map(row)}
          </View>
        ) : null}
      </Modal>
    </>
  );
}

// ── SideDrawer ──────────────────────────────────────────────────────────

export function SideDrawer({
  visible,
  onClose,
  width = 600,
  tint = "sheer",
  children,
  footer,
  bare,
}: {
  visible: boolean;
  onClose: () => void;
  width?: number;
  tint?: "sheer" | "frosted";
  children: React.ReactNode;
  /** Pinned under the scrolling body (a form's Cancel / Save). */
  footer?: React.ReactNode;
  /** The children fill the panel and do their own scrolling (a form with a pinned footer). */
  bare?: boolean;
}) {
  const { width: W } = useWindowDimensions();
  const phone = W < 768;
  const panelW = phone ? W : Math.min(width, W - 48);
  const reduceMotion = useReduceMotion();
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    slide.setValue(reduceMotion ? 0 : 1);
    if (!reduceMotion) Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, reduceMotion, slide]);

  const body = bare ? (
    <View style={styles.flex}>{children}</View>
  ) : (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.drawerBody, phone && styles.drawerBodyPhone]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={[styles.drawerFooter, tint === "frosted" && styles.drawerFooterFrosted]}>{footer}</View> : null}
    </>
  );
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[
            styles.drawer,
            { width: panelW },
            !phone && styles.drawerRounded,
            { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, panelW] }) }] },
          ]}
          accessibilityViewIsModal
        >
          {tint === "frosted" ? (
            <GlassCard tint="frosted" radius={phone ? 0 : 24} padding={0} style={styles.flex} contentStyle={styles.flex}>
              {body}
            </GlassCard>
          ) : (
            <View style={[styles.flex, styles.sheerPanel, !phone && styles.drawerRounded]}>{body}</View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The round × in a drawer or dialog header. */
export function CloseButton({ onPress, label = "Close", onFrosted }: { onPress: () => void; label?: string; onFrosted?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.close, onFrosted ? styles.closeFrosted : [styles.closeSheer, neuRaised("sm")], pressed && { opacity: 0.8 }, webCursor]}
    >
      <CloseIcon size={16} color={onFrosted ? colors.textOnFrosted : colors.textPrimary} />
    </Pressable>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────

export function Dialog({ visible, onClose, width = 640, children }: { visible: boolean; onClose: () => void; width?: number; children: React.ReactNode }) {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.flex, styles.dialogRoot]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityLabel="Close" />
        <GlassCard tint="frosted" dropShadow radius={radii.lg} padding={0} style={{ width: Math.min(width, W - 32), maxHeight: H - 48 }}>
          <ScrollView contentContainerStyle={styles.dialogBody}>{children}</ScrollView>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.45 },
  trigger: { alignItems: "center", justifyContent: "center" },
  triggerRaised: { backgroundColor: colors.neuBase },
  triggerOpen: { borderWidth: 2, borderColor: colors.focusRing },
  menu: {
    position: "absolute",
    width: MENU_W,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingHorizontal: 16 },
  itemHover: { backgroundColor: "rgba(255,255,255,0.06)" },
  itemText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14 },
  itemDetail: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass },
  divider: { height: 1, marginVertical: 4, marginHorizontal: 12, backgroundColor: "rgba(255,255,255,0.1)" },
  scrim: { backgroundColor: colors.overlay },
  drawer: { position: "absolute", top: 0, right: 0, bottom: 0 },
  drawerRounded: { borderTopLeftRadius: 24, borderBottomLeftRadius: 24, overflow: "hidden" },
  sheerPanel: { backgroundColor: "rgba(48,54,68,0.98)", borderLeftWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  drawerBody: { padding: 28, paddingBottom: 40 },
  drawerBodyPhone: { padding: 16, paddingTop: 20 },
  drawerFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  drawerFooterFrosted: { borderTopColor: "rgba(30,31,38,0.14)" },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  closeSheer: { backgroundColor: colors.neuBase },
  closeFrosted: { borderWidth: 1.5, borderColor: "rgba(30,31,38,0.35)" },
  dialogRoot: { alignItems: "center", justifyContent: "center", padding: 16 },
  dialogBody: { padding: 28 },
});
