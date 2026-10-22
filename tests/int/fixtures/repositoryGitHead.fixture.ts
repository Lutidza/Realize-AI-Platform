/**
 * @file tests/int/fixtures/repositoryGitHead.fixture.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Создаёт Git HEAD только внутри переданного disposable репозитория теста.
 * @see documentation/architecture/repository-search.md
 */
import { disposableGitFixture } from "./disposableGit.fixture";

const identity = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

/** Не использует рабочий checkout, пользовательскую identity, templates или commit hooks. */
export async function createRepositoryGitHeadFixture(root: string) {
  const git = disposableGitFixture(root);
  await git.run(["init", "--initial-branch=main", "--template="]);
  const commit = async (path: string) => {
    await git.run(["add", "--", path]);
    await git.run(
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--message",
        "Isolated HEAD fixture",
      ],
      { env: identity },
    );
    return (await git.run(["rev-parse", "HEAD"])).trim();
  };
  return { git, commit };
}
