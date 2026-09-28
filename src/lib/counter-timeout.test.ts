import { describe, expect, it } from "vitest";
import {
  COMMAND_TIMEOUT_ENV,
  DEFAULT_COMMAND_TIMEOUT_MS,
  commandTimeoutMs,
} from "@/lib/fixed-window-counter";

/**
 * The deadline on one Upstash command.
 *
 * Failing open kept the site answering during the 27 Sep outage; it did not keep
 * it quick. Measured against a host that refuses connections, before this
 * existed: /api/auth/get-session took 4.34s three times running, and the paths
 * that consult two counters took 8.67s, because the client's default is five
 * attempts with an exponential backoff. Eight seconds is a user giving up, and
 * near enough a platform function timeout that a request could be cut off rather
 * than fail open — which would undo the point of failing open at all.
 */
describe("how long a command may take before it counts as unavailable", () => {
  it("defaults to 500ms, so an outage fails fast rather than slowly", () => {
    expect(DEFAULT_COMMAND_TIMEOUT_MS).toBe(500);
    expect(commandTimeoutMs(undefined)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
  });

  it("takes a configured value, because the right number is a deploy's to know", () => {
    // Too short and a working-but-slow Upstash reads as absent: the limiter
    // loses its counts and the daily ceiling refuses generation outright.
    expect(commandTimeoutMs("1500")).toBe(1500);
    expect(COMMAND_TIMEOUT_ENV).toBe("UPSTASH_COMMAND_TIMEOUT_MS");
  });

  it("falls back rather than accepting a value that would break every command", () => {
    // A timeout of zero, or a typo, would abort every command immediately — and
    // on the fail-closed side that is no generation at all, for everyone.
    for (const bad of ["0", "-1", "", "   ", "abc", "1.5", "NaN"]) {
      expect(commandTimeoutMs(bad)).toBe(DEFAULT_COMMAND_TIMEOUT_MS);
    }
  });
});
