// Focus rings for keyboard users only. On the web a mouse or touch press
// also focuses a Pressable, and a ring left behind after every click reads as
// a stuck state. Tab / arrow keys turn rings on; any pointer press turns them
// off - the browser's :focus-visible rule, which react-native-web's styles
// can't express.
import { Platform } from "react-native";

let keyboard = false;

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) keyboard = true;
    },
    true
  );
  window.addEventListener("pointerdown", () => (keyboard = false), true);
}

/** True when the last focus move came from the keyboard (always true off the web). */
export const focusFromKeyboard = () => Platform.OS !== "web" || keyboard;
