import { probeServer } from "../lib/connectivity";

const URL = "https://example.supabase.co";

describe("probeServer", () => {
  it("any answer from the server is online, and it asks the health endpoint without CORS", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ type: "opaque" });
    await expect(probeServer(URL + "/", fetchImpl, 1000, "anon key")).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/auth/v1/health?apikey=anon%20key`, expect.objectContaining({ mode: "no-cors", cache: "no-store" }));
  });

  it("a failed fetch is offline", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(probeServer(URL, fetchImpl, 1000)).resolves.toBe(false);
  });

  it("no answer in time is offline", async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(() => new Promise(() => {}));
      const result = probeServer(URL, fetchImpl, 3000);
      jest.advanceTimersByTime(3000);
      await expect(result).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("no server configured is offline, without a request", async () => {
    const fetchImpl = jest.fn();
    await expect(probeServer(undefined, fetchImpl, 1000)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the browser saying offline is offline, without a request", async () => {
    const spy = jest.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    try {
      const fetchImpl = jest.fn();
      await expect(probeServer(URL, fetchImpl, 1000)).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
