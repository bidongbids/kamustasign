// One Back for the whole app (design_handoff_classroom_theming B1): the
// on-screen Back button, the browser's back button and Android's hardware
// back all run the handler of the innermost screen that registered one.
// Back follows the app's own hierarchy, not the browser history, so it does
// the same thing in the desktop app, the web app and on phones.
//
// Web: while any handler is registered, one extra history entry (same URL)
// sits on top. Pressing the browser's back pops it; we put it back and run
// the handler, so the browser never leaves the app from a screen with Back.
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

type Entry = { run: () => void };

const stack: Entry[] = [];
const MARK = { lcsignBack: true };
let listening = false;

const web = () => Platform.OS === "web" && typeof window !== "undefined" && !!window.history;

function pushMark() {
  if (web() && stack.length && !window.history.state?.lcsignBack) window.history.pushState(MARK, "");
}

function onPopState() {
  const top = stack[stack.length - 1];
  if (!top) return;
  top.run();
  // The handler may have left this screen (its handler is gone) or stayed
  // (a "Leave without saving?" question): either way, re-arm once React has
  // committed, if anything is still listening.
  setTimeout(pushMark, 50);
}

/**
 * Registers `handler` as Back for as long as the calling screen is mounted
 * (pass null to register nothing). The latest registration wins.
 */
export function useBackHandler(handler: (() => void) | null) {
  const ref = useRef(handler);
  ref.current = handler;
  const enabled = handler !== null;
  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { run: () => ref.current?.() };
    stack.push(entry);
    if (web()) {
      if (!listening) {
        window.addEventListener("popstate", onPopState);
        listening = true;
      }
      pushMark();
    }
    const sub =
      Platform.OS === "android"
        ? BackHandler.addEventListener("hardwareBackPress", () => {
            entry.run();
            return true;
          })
        : null;
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      sub?.remove();
    };
  }, [enabled]);
}
