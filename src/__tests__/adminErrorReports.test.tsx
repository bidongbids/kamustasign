// The admin's "App errors" card and drawer (AdminErrorReports.tsx), with the
// database calls faked: what it says when there are errors, none, a
// database without 0019, or a failed load - and that Delete removes a row.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { AccountRow, ErrorReportRow } from "../lib/queries";

const mockListErrorReports = jest.fn();
const mockDeleteErrorReports = jest.fn();
jest.mock("../lib/queries", () => ({
  ...jest.requireActual("../lib/queries"),
  listErrorReports: () => mockListErrorReports(),
  deleteErrorReports: (ids: number[]) => mockDeleteErrorReports(ids),
}));
// The drawer's Modal renders into a portal the test renderer can't see: inline here.
jest.mock("../screens/dashboard/Overlays", () => ({
  ...jest.requireActual("../screens/dashboard/Overlays"),
  SideDrawer: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));

// eslint-disable-next-line import/first
import ErrorReportsCard from "../screens/dashboard/AdminErrorReports";

const account = { id: "u1", full_name: "Ana Cruz", email: "ana@test.invalid", role: "student" } as AccountRow;
const row = (over: Partial<ErrorReportRow> = {}): ErrorReportRow => ({
  id: 1,
  user_id: "u1",
  happened_at: new Date().toISOString(),
  reported_at: new Date().toISOString(),
  app_version: "1.1.0",
  platform: "desktop",
  source: "console",
  message: "[word reader] model load failed TypeError: Failed to fetch\n    at load (index.js:1:2)",
  count: 3,
  before_sign_in: false,
  device: null,
  ...over,
});

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.type === "string" && n.children.some((c) => typeof c === "string"))
    .map((n) => n.children.filter((c) => typeof c === "string").join(""));

let renderer: TestRenderer.ReactTestRenderer;
async function render() {
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <ErrorReportsCard accounts={[account]} accentColor="#555" />
      </ThemeProvider>
    );
  });
  return renderer;
}
/** Presses the first Pressable with this accessibility label. */
const press = async (label: string) => {
  const node = renderer.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`no button "${label}"`);
  await act(async () => node.props.onPress());
};

beforeEach(() => {
  mockListErrorReports.mockReset();
  mockDeleteErrorReports.mockReset();
});
afterEach(() => {
  act(() => renderer?.unmount());
});

test("errors: a summary, and the drawer lists them with whose account", async () => {
  mockListErrorReports.mockResolvedValue({ data: [row(), row({ id: 2, before_sign_in: true, count: 1, platform: "android", message: "Camera not found" })], error: null, missing: false });
  await render();
  const t = texts(renderer);
  expect(t).toContain("App errors");
  expect(t).toContain("2 errors from 1 account in the last 30 days, all in the last 7 days.");
  await press("View errors");
  const all = texts(renderer);
  expect(all).toContain("[word reader] model load failed TypeError: Failed to fetch");
  expect(all).toContain("×3");
  expect(all.some((s) => s.includes("Ana Cruz (student) · Windows app 1.1.0 · reported by the app"))).toBe(true);
  expect(all.some((s) => s.includes("before sign-in, sent by Ana Cruz (student) · Android app 1.1.0"))).toBe(true);
});

test("Delete removes the row once the database has", async () => {
  mockListErrorReports.mockResolvedValue({ data: [row(), row({ id: 2, message: "Camera not found" })], error: null, missing: false });
  mockDeleteErrorReports.mockResolvedValue({ error: null });
  await render();
  await press("View errors");
  await press("Delete this error");
  expect(mockDeleteErrorReports).toHaveBeenCalledWith([1]);
  const t = texts(renderer);
  expect(t).not.toContain("[word reader] model load failed TypeError: Failed to fetch");
  expect(t).toContain("Camera not found");
  expect(t).toContain("Deleted.");
});

test("none: says so, with no button", async () => {
  mockListErrorReports.mockResolvedValue({ data: [], error: null, missing: false });
  await render();
  expect(texts(renderer)).toContain("No errors in the last 30 days.");
  expect(renderer.root.findAll((n) => n.props.accessibilityLabel === "View errors")).toHaveLength(0);
});

test("database without 0019: says which update it needs", async () => {
  mockListErrorReports.mockResolvedValue({ data: [], error: null, missing: true });
  await render();
  expect(texts(renderer).some((s) => s.includes("0019_error_reports.sql"))).toBe(true);
});

test("failed load: an error card with Try again", async () => {
  mockListErrorReports.mockResolvedValue({ data: [], error: { message: "Failed to fetch" }, missing: false });
  await render();
  expect(texts(renderer)).toContain("Couldn't load the app errors");
});
