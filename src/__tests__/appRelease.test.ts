import { compareVersions, appPlatform, APP_VERSION } from "../lib/appVersion";
import { updateNeed, fetchAppRelease, type AppRelease } from "../lib/appRelease";
import appJson from "../../app.json";

const mockResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockFrom = jest.fn();
jest.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      const chain: any = {
        select: () => chain,
        eq: (col: string, value: string) => {
          mockFrom(`${col}=${value}`);
          return chain;
        },
        maybeSingle: () => Promise.resolve(mockResult),
      };
      return chain;
    },
  },
}));

const release = (latest: string, min: string): AppRelease => ({
  platform: "desktop",
  latest_version: latest,
  min_version: min,
  download_url: null,
  notes: null,
});

describe("compareVersions", () => {
  it("orders by major, then minor, then patch - as numbers, not text", () => {
    expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.1.1", "1.1.1")).toBe(0);
  });

  it("missing parts count as 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
  });

  it("anything that isn't a version compares as equal (a typo can't lock everyone out)", () => {
    expect(compareVersions("1.0.0", "v2")).toBe(0);
    expect(compareVersions("", "9.9.9")).toBe(0);
  });
});

describe("updateNeed", () => {
  it("older than min_version must update", () => {
    expect(updateNeed("1.0.0", release("1.2.0", "1.1.0"))).toBe("required");
  });
  it("older than latest_version only hears about it", () => {
    expect(updateNeed("1.1.0", release("1.2.0", "1.1.0"))).toBe("available");
  });
  it("current, newer (a test build), or no answer from the server: carry on", () => {
    expect(updateNeed("1.2.0", release("1.2.0", "1.1.0"))).toBe("none");
    expect(updateNeed("1.3.0", release("1.2.0", "1.1.0"))).toBe("none");
    expect(updateNeed("1.0.0", null)).toBe("none");
  });
});

describe("fetchAppRelease", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockResult.data = null;
    mockResult.error = null;
  });

  it("reads this platform's row", async () => {
    mockResult.data = release("1.2.0", "1.1.0");
    await expect(fetchAppRelease("desktop")).resolves.toEqual(release("1.2.0", "1.1.0"));
    expect(mockFrom).toHaveBeenCalledWith("app_release");
    expect(mockFrom).toHaveBeenCalledWith("platform=desktop");
  });

  it("an error (offline, table not created yet) is no answer, not a block", async () => {
    mockResult.error = { message: "relation does not exist" };
    await expect(fetchAppRelease("android")).resolves.toBeNull();
  });

  it("the browser version is always current, so it isn't checked", async () => {
    await expect(fetchAppRelease("web")).resolves.toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("appPlatform / APP_VERSION", () => {
  afterEach(() => {
    delete (window as any).lcsignDesktop;
    delete (window as any).Capacitor;
  });

  it("the version is app.json's", () => {
    expect(APP_VERSION).toBe(appJson.expo.version);
  });

  it("tells the desktop app, the Android app and a browser apart", () => {
    expect(appPlatform()).toBe("web");
    (window as any).lcsignDesktop = {};
    expect(appPlatform()).toBe("desktop");
    delete (window as any).lcsignDesktop;
    (window as any).Capacitor = { isNativePlatform: () => true };
    expect(appPlatform()).toBe("android");
  });
});
