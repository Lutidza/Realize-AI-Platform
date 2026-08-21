/**
 * @file tests/int/independent-reviewer.int.spec.ts
 * @owner tests/int
 * @purpose Verifies fail-closed parsing of independent reviewer verdicts.
 */

import { describe, expect, it } from "vitest";

import {
  IndependentReviewError,
  parseIndependentReview,
} from "../../services/ai-execution-worker/src/independentReviewer";

describe("independent preview reviewer", () => {
  it("accepts one strict approved JSON verdict", () => {
    const review = parseIndependentReview(
      JSON.stringify({
        findings: [
          {
            category: "tests",
            severity: "warning",
            summary: "Add a narrow visual regression test later.",
          },
        ],
        status: "approved",
        summary:
          "The accepted diff matches its scope and has sufficient checks.",
      }),
      "codex-review-model",
    );

    expect(review.status).toBe("approved");
    expect(review.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(review.model).toBe("codex-review-model");
  });

  it("rejects prose, unsafe paths and approved blocking findings", () => {
    expect(() => parseIndependentReview("Approved.")).toThrow(
      IndependentReviewError,
    );
    expect(() =>
      parseIndependentReview(
        JSON.stringify({
          findings: [
            {
              category: "security",
              path: "../../secret",
              severity: "blocking",
              summary: "Unsafe path.",
            },
          ],
          status: "changes_requested",
          summary: "Unsafe path was returned.",
        }),
      ),
    ).toThrow("Reviewer finding path is unsafe.");
    expect(() =>
      parseIndependentReview(
        JSON.stringify({
          findings: [
            {
              category: "correctness",
              severity: "blocking",
              summary: "A regression remains.",
            },
          ],
          status: "approved",
          summary: "Contradictory verdict.",
        }),
      ),
    ).toThrow("Approved review contains a blocking finding.");
  });
});
