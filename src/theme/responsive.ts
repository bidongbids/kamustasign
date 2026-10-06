// One codebase, three targets (web desktop, web mobile, iOS/Android) — this
// hook is how screens tell those apart instead of hardcoding pixel widths.
import { useWindowDimensions } from "react-native";
import { breakpoints } from "./theme";

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= breakpoints.desktop;
  const isTablet = width >= breakpoints.tablet && width < breakpoints.desktop;
  const isMobile = width < breakpoints.tablet;
  return { width, height, isDesktop, isTablet, isMobile };
}
