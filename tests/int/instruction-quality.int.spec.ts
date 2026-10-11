/**
 * @file tests/int/instruction-quality.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет structural gate на повреждённых metadata, ссылках, alias и symlink.
 */
// @vitest-environment node
import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { checkInstructionGraph } from "../../.ai/tools/quality/checkInstructionGraph.service";
import { parseInstructionMetadata } from "../../.ai/tools/quality/parseInstructionMetadata.mapper";
import {
  readMarkdownAnchors,
  readMarkdownLinks,
} from "../../.ai/tools/quality/readMarkdownLinks.util";
import { INSTRUCTION_ROOTS } from "../../.ai/tools/quality/instructionQuality.config";

describe("active instruction structural quality", () => {
  it("checks the actual active layer without semantic approval", async () => {
    const result = await checkInstructionGraph(process.cwd());
    expect(result.issues).toEqual([]);
    expect(result.files).toBeGreaterThan(150);
    expect(result.semanticReview).toBe("required");
  });
  it("accepts supported metadata identities and rejects missing or duplicate YAML keys", () => {
    const source = "```yaml\nrule_id: RULE-FIXTURE\nchecks: []\n```\n";
    expect(
      parseInstructionMetadata(".ai/rules/RULE-FIXTURE.md", source).artifactId,
    ).toBe("RULE-FIXTURE");
    expect(() =>
      parseInstructionMetadata(".ai/rules/RULE-FIXTURE.md", "# No metadata"),
    ).toThrow();
    expect(() =>
      parseInstructionMetadata(
        ".ai/rules/RULE-FIXTURE.md",
        source.replace("checks: []", "rule_id: RULE-OTHER"),
      ),
    ).toThrow("invalid_yaml");
    expect(() =>
      parseInstructionMetadata(
        ".codex/skills/example/SKILL.md",
        "---\nname: example\n---",
      ),
    ).toThrow();
  });
  it("rejects alias amplification and unknown YAML tags", () => {
    expect(() =>
      parseInstructionMetadata(
        ".ai/rules/RULE-FIXTURE.md",
        "```yaml\nrule_id: &id RULE-FIXTURE\ncopy: *id\n```\n",
      ),
    ).toThrow();
    expect(() =>
      parseInstructionMetadata(
        ".ai/rules/RULE-FIXTURE.md",
        "```yaml\nrule_id: !custom RULE-FIXTURE\n```\n",
      ),
    ).toThrow();
  });
  it("ignores links in examples and supports unicode/duplicate/explicit anchors", () => {
    expect(
      readMarkdownLinks(
        "[live](a.md#якорь)\n```md\n[example](missing.md)\n```\n`[also-example](x.md)`\n[ref]: b.md\n",
      ),
    ).toEqual(["a.md#якорь", "b.md"]);
    expect([
      ...readMarkdownAnchors(
        '# Повтор\n# Повтор\n## `Контракт` (v1)\n<a id="explicit"></a>',
      ),
    ]).toEqual(["explicit", "повтор", "повтор-1", "контракт-v1"]);
  });
  it("fails closed for broken links, duplicate IDs, anchors and symlink roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "realize-instructions-"));
    try {
      for (const path of INSTRUCTION_ROOTS) {
        if (path.endsWith(".md")) {
          await mkdir(dirname(join(root, path)), { recursive: true });
          await writeFile(
            join(root, path),
            `# Fixture\n\n\`\`\`yaml\nartifact_id: ${path.replace(/[^a-zA-Z0-9]/g, "-")}\nartifact_type: fixture\nowner_layer: .ai/\n\`\`\`\n`,
          );
        } else await mkdir(join(root, path), { recursive: true });
      }
      expect((await checkInstructionGraph(root)).status).toBe("passed");
      const content =
        "```yaml\nartifact_id: same-id\nowner_layer: .ai/system/\n```\n[missing](missing.md)\n[bad-anchor](../README.md#absent)\n";
      await writeFile(join(root, ".ai/system/one.md"), content);
      await writeFile(join(root, ".ai/system/two.md"), content);
      const codes = (await checkInstructionGraph(root)).issues.map(
        (x) => x.code,
      );
      expect(codes).toContain("duplicate_artifact_id");
      expect(codes).toContain("link_unavailable");
      expect(codes).toContain("anchor_missing");
      await symlink("/tmp", join(root, ".ai/system/outside"));
      expect(
        (await checkInstructionGraph(root)).issues.some(
          (x) => x.code === "source_unavailable",
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
