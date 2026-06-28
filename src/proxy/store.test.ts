import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import {
  loadSessionState,
  saveSessionState,
  putOriginal,
  getOriginal,
  getCached,
  shortHash,
} from "./store.js";

// os.homedir() honors $HOME on POSIX, and store paths resolve it lazily, so we
// can sandbox all on-disk state into a temp dir per test run.
let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  prevHome = process.env.HOME;
  home = mkdtempSync(resolve(tmpdir(), "dietcode-store-"));
  process.env.HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("session state", () => {
  it("returns an empty state when none is saved", () => {
    expect(loadSessionState("nope")).toEqual({
      runningSummary: "",
      agedThrough: 0,
      updatedAt: "",
    });
  });

  it("round-trips a saved state and stamps updatedAt", () => {
    saveSessionState("sess-1", { runningSummary: "S1", agedThrough: 6, updatedAt: "" });
    const loaded = loadSessionState("sess-1");
    expect(loaded.runningSummary).toBe("S1");
    expect(loaded.agedThrough).toBe(6);
    expect(loaded.updatedAt).not.toBe("");
  });

  it("isolates state by session id", () => {
    saveSessionState("a", { runningSummary: "A", agedThrough: 2, updatedAt: "" });
    saveSessionState("b", { runningSummary: "B", agedThrough: 4, updatedAt: "" });
    expect(loadSessionState("a").runningSummary).toBe("A");
    expect(loadSessionState("b").runningSummary).toBe("B");
  });
});

describe("content cache (reversibility)", () => {
  it("stores originals under a deterministic id and retrieves them", () => {
    const id = putOriginal("the full original text", "short");
    expect(id).toBe(shortHash("the full original text"));
    expect(getOriginal(id)).toBe("the full original text");
    expect(getCached(id)).toEqual({ original: "the full original text", compressed: "short" });
  });

  it("returns null for unknown ids", () => {
    expect(getOriginal("deadbeef")).toBeNull();
    expect(getCached("deadbeef")).toBeNull();
  });

  it("is idempotent for the same content", () => {
    const a = putOriginal("same", "x");
    const b = putOriginal("same", "y");
    expect(a).toBe(b);
    // First write wins; the second is a no-op (id is content-addressed).
    expect(getCached(a)?.compressed).toBe("x");
  });
});
