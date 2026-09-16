// @vitest-environment node
/**
 * @file tests/int/mediaArchitectureNative.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Opt-in проверка реального Payload upload/Jobs на отдельной одноразовой БД.
 */
import { describe, expect, it } from "vitest";
import { runIsolatedMediaArchitectureProof } from "./support/mediaArchitecture/runIsolatedMediaArchitectureProof.service";

const enabled = process.env.MEDIA_ARCHITECTURE_PROOF === "1";

describe.skipIf(!enabled)("isolated native Media architecture", () => {
  it("preserves original bytes, pins two recipes and retries native Jobs safely", async () => {
    const workingConnectionString =
      process.env.MEDIA_ARCHITECTURE_SOURCE_DATABASE_URI ||
      process.env.DATABASE_URI ||
      process.env.DATABASE_URL;
    if (!workingConnectionString)
      throw new Error(
        "Explicit MEDIA_ARCHITECTURE_SOURCE_DATABASE_URI is required",
      );
    const result = await runIsolatedMediaArchitectureProof({
      workingConnectionString,
    });
    expect(result.status).toBe("passed");
    expect(result.readySets).toHaveLength(2);
    expect(result.readySets[0].variantSetID).not.toBe(
      result.readySets[1].variantSetID,
    );
    expect(result.checks.variantCount).toBe(6);
  }, 240_000);
});
