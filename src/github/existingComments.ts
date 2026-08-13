import * as github from '@actions/github';

export interface ExistingComment {
  id: number;
  path: string;
  line: number | null;
  body: string;
}

/** Normalize message text for reliable comparison: lowercase and strip whitespace. */
export function normalizeMessage(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Extract the category tag from a comment body, e.g. "[null-handling]" → "null-handling". */
export function extractCategory(body: string): string | null {
  const match = body.match(/\*\*\[([^\]]+)\]\*\*/);
  return match ? match[1].toLowerCase() : null;
}

/** Returns true if the comment was posted by PR Sentry. */
export function isPrSentryComment(body: string): boolean {
  return (
    body.includes('**[null-handling]**') ||
    body.includes('**[async]**') ||
    body.includes('**[SOLID]**')
  );
}

/** Returns true if the comment has already been struck out or marked resolved. */
export function isAlreadyResolved(body: string): boolean {
  return body.includes('~~') || body.includes('Resolved in a subsequent commit');
}

export async function fetchExistingComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ExistingComment[]> {
  const allComments: ExistingComment[] = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page
    });

    if (data.length === 0) break;

    for (const comment of data) {
      allComments.push({
        id: comment.id,
        path: comment.path,
        line: comment.line ?? comment.original_line ?? null,
        body: comment.body
      });
    }

    if (data.length < 100) break;
    page++;
  }

  console.log(`Fetched ${allComments.length} existing PR review comments.`);
  return allComments;
}

/**
 * Returns true if a finding is already represented by an existing comment.
 * Compares by: file path, line number, category, and normalized message snippet.
 */
export function isDuplicate(
  findingFile: string,
  findingLine: number,
  findingCategory: string,
  findingMessage: string,
  existingComments: ExistingComment[]
): boolean {
  const normalizedFinding = normalizeMessage(findingMessage);

  for (const comment of existingComments) {
    if (comment.path !== findingFile) continue;
    if (comment.line !== findingLine) continue;

    const commentCategory = extractCategory(comment.body);
    if (commentCategory !== findingCategory.toLowerCase()) continue;

    const commentNorm = normalizeMessage(comment.body);
    const findingSnippet = normalizedFinding.slice(0, 80);
    if (commentNorm.includes(findingSnippet)) {
      return true;
    }
  }

  return false;
}

/**
 * Scans existing PR comments and resolves any conversations that are no longer present
 * in the active findings (i.e. the developer fixed the issue).
 */
export async function resolveFixedComments(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  activeFindings: { file: string; line: number; category: string }[],
  existingComments: ExistingComment[]
): Promise<void> {
  const prSentryComments = existingComments.filter(
    comment => isPrSentryComment(comment.body) && !isAlreadyResolved(comment.body)
  );

  for (const comment of prSentryComments) {
    const category = extractCategory(comment.body);
    if (!category) continue;

    // Check if there is still a finding matching this comment's location and category
    const stillExists = activeFindings.some(
      finding =>
        finding.file === comment.path &&
        finding.line === comment.line &&
        finding.category.toLowerCase() === category
    );

    if (!stillExists) {
      console.log(`Resolving fixed conversation on ${comment.path} line ${comment.line} (Comment ID: ${comment.id}).`);
      try {
        await octokit.rest.pulls.updateReviewComment({
          owner,
          repo,
          comment_id: comment.id,
          body: `~~${comment.body}~~\n\n🛡️ **PR Sentry:** Resolved in a subsequent commit.`
        });
      } catch (error: any) {
        console.error(`Failed to update comment ${comment.id} to resolved:`, error.message);
      }
    }
  }
}
