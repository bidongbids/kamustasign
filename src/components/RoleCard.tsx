// src/components/RoleCard.tsx
// Role-select row: sheer glass panel + neumorphic medallion + a Continue
// action. Per design_handoff_kamustasign_material_pass/README.md ("1. Role
// Select"), there is no icon glyph anymore — the medallion holds a plain
// glowing accent dot, not an icon. `isPrimary` (the first/Student card by
// default) carries the accent-tinted border and the one solid, saturated
// Continue button on the screen; the other two get a neumorphic raised
// Continue. Hovering/focusing ANY card independently raises its glass fill
// and tints its border to the role accent — that's the ordinary interactive
// feedback layered on top of the static primary/secondary distinction.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View, StyleSheet, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, typography } from "../theme/theme";
import { neuRaised } from "../theme/shadows";

type Props = {
  label: string;
  description: string;
  accentColor: string;
  onPress: () => void;
  // First/default card in the list — gets the accent-tinted border baseline
  // and the one solid-fill Continue button on the screen.
  isPrimary?: boolean;
  // Mobile: no Continue button, smaller medallion, the whole row is the
  // target, description is a shorter truncated variant passed in by the
  // caller.
  isMobile?: boolean;
  // Stagger index for the mount-in animation.
  index?: number;
};

const webTransition =
  Platform.OS === "web"
    ? ({ transitionProperty: "box-shadow, border-color, background-color", transitionDuration: "160ms" } as any)
    : null;

export default function RoleCard({
  label,
  description,
  accentColor,
  onPress,
  isPrimary = false,
  isMobile = false,
  index = 0,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const lifted = hovered || focused;

  const entrance = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 420, delay: index * 90, useNativeDriver: true }).start();
  }, [entrance, index]);

  const animateScale = (toValue: number) => {
    Animated.spring(scaleAnim, { toValue, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  const showsAccentBorder = lifted || isPrimary;
  const medallionSize = isMobile ? 44 : 54;
  const dotSize = isMobile ? 16 : 20;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        setHovered(true);
        animateScale(1.01);
      }}
      onHoverOut={() => {
        setHovered(false);
        animateScale(1);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => animateScale(0.99)}
      onPressOut={() => animateScale(hovered ? 1.01 : 1)}
      style={styles.pressable}
      accessibilityRole="button"
      accessibilityLabel={`Continue as ${label}`}
    >
      <Animated.View
        style={[
          styles.card,
          isMobile ? styles.cardMobile : styles.cardDesktop,
          {
            borderColor: showsAccentBorder ? accentColor + "57" : colors.glassBorder,
            backgroundColor: hovered ? "rgba(255,255,255,0.13)" : "transparent",
          },
          focused && styles.focusRing,
          {
            opacity: entrance,
            transform: [
              { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
              { scale: scaleAnim },
            ],
          },
          webTransition,
        ]}
      >
        <BlurView intensity={16} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={["rgba(255,255,255,0.13)", "rgba(255,255,255,0.035)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.55, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.medallion,
            { width: medallionSize, height: medallionSize, borderRadius: isMobile ? 14 : 16 },
            neuRaised("sm"),
          ]}
        >
          <View
            style={[
              styles.medallionDot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: accentColor,
                boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: accentColor + "99" }],
              } as ViewStyle,
            ]}
          />
        </View>

        <View style={styles.textWrap}>
          <Text style={[typography.h2, isMobile && styles.titleMobile, styles.title]}>{label}</Text>
          <Text style={[typography.bodySm, isMobile && styles.descriptionMobile, styles.description]} numberOfLines={isMobile ? 1 : 2}>
            {description}
          </Text>
        </View>

        {!isMobile && (
          <View
            style={[
              styles.continueBtn,
              isPrimary
                ? {
                    backgroundColor: accentColor,
                    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: accentColor + "47" }],
                  }
                : [styles.continueBtnNeu, neuRaised("sm")],
            ]}
          >
            <Text style={[typography.labelSm, { color: isPrimary ? colors.textOnAccent : colors.textPrimary }]}>
              Continue
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
  },
  cardDesktop: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 24,
    gap: 20,
  },
  cardMobile: {
    borderRadius: 18,
    padding: 18,
    gap: 14,
    minHeight: 80,
  },
  focusRing: {
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: colors.focusRing }],
  } as ViewStyle,
  medallion: {
    flex: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuBase,
  },
  medallionDot: {},
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: 4,
  },
  titleMobile: {
    fontSize: 19,
    lineHeight: 21,
  },
  description: {
    color: "rgba(255,255,255,0.60)",
  },
  descriptionMobile: {
    fontSize: 12,
    lineHeight: 16,
  },
  continueBtn: {
    flexShrink: 0,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnNeu: {
    backgroundColor: colors.neuBase,
  },
});
