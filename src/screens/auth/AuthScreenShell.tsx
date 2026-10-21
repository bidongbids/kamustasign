// Shared frame for Login / Register / Verify2FA / Setup2FA: brand mark,
// elevated card, soft role-tinted background. Keeps the auth flow feeling
// like part of LCSign instead of a bare form, on both desktop and mobile.
import React, { useEffect, useRef } from "react";
import { Animated, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import { colors, fonts, spacing, radii } from "../../theme/theme";
import { useResponsive } from "../../theme/responsive";

type Props = {
  accentColor: string;
  onBack?: () => void;
  backLabel?: string;
  children: React.ReactNode;
};

export default function AuthScreenShell({ accentColor, onBack, backLabel = "Back", children }: Props) {
  const { isDesktop } = useResponsive();

  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [entrance]);

  return (
    <GradientBackground style={styles.root}>
      <View style={[styles.blobLarge, { backgroundColor: accentColor }]} />
      <View style={[styles.blobSmall, { backgroundColor: accentColor }]} />
      <ScrollView contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}>
        <Animated.View
          style={[
            isDesktop ? styles.cardSizingDesktop : styles.cardSizingMobile,
            {
              opacity: entrance,
              transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          <GlassCard
            tint="frosted"
            dropShadow
            radius={radii.lg}
            padding={isDesktop ? spacing.xl : spacing.lg}
          >
            <View style={styles.brandRow}>
              <HandLandmarkMark size={26} color={accentColor} dotColor={colors.accentCoral} />
              <Text style={[styles.brandWordmark, { color: accentColor }]}>LCSign</Text>
            </View>

            {onBack && (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ alignSelf: "flex-start" }}
              >
                <Text style={styles.backLink}>‹ {backLabel}</Text>
              </Pressable>
            )}

            {children}
          </GlassCard>
        </Animated.View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
  },
  blobLarge: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.16,
    top: -140,
    right: -120,
  },
  blobSmall: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.14,
    bottom: -100,
    left: -80,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  scrollDesktop: {
    padding: spacing.xxl,
  },
  cardSizingMobile: {
    width: "100%",
    maxWidth: 420,
  },
  cardSizingDesktop: {
    width: "100%",
    maxWidth: 460,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  brandWordmark: {
    fontFamily: fonts.heading,
    fontSize: 18,
    marginLeft: spacing.sm,
  },
  backLink: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textOnFrostedMuted,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
  },
});
