// A crash below CrashBoundary shows "Something went wrong" with Reload,
// instead of a blank window - both the themed screen and the plain fallback.
import React from "react";
import { Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import CrashBoundary from "../components/CrashBoundary";
import { ThemeProvider } from "../theme/ThemeProvider";

function Broken(): React.ReactElement {
  throw new Error("boom");
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.type === "string" && n.children.some((c) => typeof c === "string")).flatMap((n) => n.children.filter((c) => typeof c === "string"));

let renderer: TestRenderer.ReactTestRenderer;
const render = (el: React.ReactElement) => {
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer;
};

beforeEach(() => {
  // React logs every caught error; the boundary logs it again.
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
});

test("shows the screens when nothing breaks", () => {
  const r = render(
    <CrashBoundary plain>
      <Text>Dashboard</Text>
    </CrashBoundary>
  );
  expect(texts(r)).toEqual(["Dashboard"]);
});

test("the plain fallback replaces a crashed screen", () => {
  const r = render(
    <CrashBoundary plain>
      <Broken />
    </CrashBoundary>
  );
  expect(texts(r)).toEqual(expect.arrayContaining(["Something went wrong", "Reload LCSign"]));
  expect(console.error).toHaveBeenCalledWith("[crash]", expect.objectContaining({ message: "boom" }), expect.any(String));
});

test("the themed fallback replaces a crashed screen inside the theme", () => {
  const r = render(
    <ThemeProvider>
      <CrashBoundary>
        <Broken />
      </CrashBoundary>
    </ThemeProvider>
  );
  expect(texts(r)).toEqual(expect.arrayContaining(["Something went wrong", "Reload LCSign"]));
});

test("if the themed fallback itself breaks, the plain one still shows", () => {
  const r = render(
    <CrashBoundary plain>
      {/* No ThemeProvider: the themed fallback can't render. */}
      <CrashBoundary>
        <Broken />
      </CrashBoundary>
    </CrashBoundary>
  );
  expect(texts(r)).toEqual(expect.arrayContaining(["Something went wrong", "Reload LCSign"]));
});
