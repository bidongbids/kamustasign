// Two-tone "LC" + "Sign" logotype treatment — used on the role-select
// header, the desktop brand panel, and the auth screens, so the wordmark
// reads consistently everywhere instead of being redrawn per screen.
import React from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { colors } from "../theme/theme";

type Props = {
  style?: StyleProp<TextStyle>;
  accentColor?: string;
};

export default function Wordmark({ style, accentColor = colors.accentCoral }: Props) {
  return (
    <Text style={style}>
      LC<Text style={{ color: accentColor }}>Sign</Text>
    </Text>
  );
}
