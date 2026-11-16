// Interaction states for every control on the web/desktop app, in one place
// instead of per component (Material Design's "state layers"):
//
//   hover    - a light tint over the control (mouse only, not touch)
//   pressed  - a stronger tint while the pointer is held down
//   focused  - a ring in the theme's focus colour, for keyboard users only
//              (the browser's :focus-visible: Tab shows it, a click doesn't)
//   disabled - no tint, and a "not allowed" pointer
//
// Selected, toggled and error states stay in each component, since they
// mean something different on every control.
//
// It keys off the ARIA role react-native-web writes for accessibilityRole,
// so a Pressable gets the states by having a role. Opt-outs, via `dataSet`:
//   dataSet={{ stateLayer: "off" }}   no tint (backdrops, full-screen video)
//   dataSet={{ focusRing: "own" }}    the component draws its own focus mark
//   dataSet={{ focusRing: "frame" }}  a field's frame (a View around an
//                                      input) takes the ring while typing
import { Platform } from "react-native";
import type { ThemeColors, ThemeName } from "./theme";

const CONTROLS = [
  "button",
  "link",
  "tab",
  "switch",
  "checkbox",
  "radio",
  "menuitem",
  "option",
]
  .map((r) => `[role="${r}"]`)
  .join(",");

const LIVE = `:is(${CONTROLS}):not([aria-disabled="true"]):not([data-state-layer="off"])`;

const CSS = `
${LIVE} { cursor: pointer; }
:is(${CONTROLS})[aria-disabled="true"] { cursor: not-allowed; }
@media (hover: hover) {
  ${LIVE}:hover::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: var(--lc-state-hover); pointer-events: none;
  }
}
${LIVE}:active::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: var(--lc-state-press); pointer-events: none;
}
:focus-visible { outline: 2px solid var(--lc-focus); outline-offset: 2px; }
[tabindex="-1"]:focus-visible { outline: none; }
[data-focus-ring="own"]:focus-visible { outline: none; }
[data-focus-ring="frame"] :focus-visible { outline: none; }
[data-focus-ring="frame"]:focus-within { outline: 2px solid var(--lc-focus); outline-offset: 2px; }
`;

let injected = false;

function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.id = "lcsign-interaction-states";
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Puts the current theme's state colours where the stylesheet reads them. */
export function applyInteractionStates(name: ThemeName, colors: ThemeColors) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  inject();
  const root = document.documentElement.style;
  const dark = name === "dark";
  // White over dark surfaces, ink over light ones; the same tint also reads
  // on a filled (coloured) button in either mode.
  root.setProperty("--lc-state-hover", dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)");
  root.setProperty("--lc-state-press", dark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)");
  root.setProperty("--lc-focus", colors.focusRing);
}

/**
 * The opt-outs above as props to spread on a Pressable, View or TextInput:
 *   <Pressable {...stateHints({ stateLayer: "off" })} ... />
 * (`dataSet` becomes data-* attributes on the web; it isn't in RN's types.)
 */
export function stateHints(hints: { stateLayer?: "off"; focusRing?: "own" | "frame" }): object {
  return Platform.OS === "web" ? { dataSet: hints } : {};
}
