// Two-tone "LC" + "Sign" logotype treatment — used on the role-select
// header, the desktop brand panel, and the auth screens, so the wordmark
// reads consistently everywhere instead of being redrawn per screen.
import React from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";

type Props = {
  style?: StyleProp<TextStyle>;
  accentColor?: string;
};

export default function Wordmark({ style, accentColor: accentColorProp }: Props) {
  const { colors } = useTheme();
  const accentColor = accentColorProp ?? colors.accentCoral;
  return (
    <Text style={style}>
      LC<Text style={{ color: accentColor }}>Sign</Text>
    </Text>
  );
}
