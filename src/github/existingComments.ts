import * as github from '@actions/github';

export interface ExistingComment {
  path: string;
  line: number | null;
  body: string;
}

/** Normalize message text for reliable comparison: lowercase and strip whitespace. */
export function normalizeMessage(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Extract the category tag from a comment body, e.g. "[null-handling]" → "null-handling". */
function extractCategory(body: string): string | null {
  const match = body.match(/\*\*\[([^\]]+)\]\*\*/);
  return match ? match[1].toLowerCase() : null;
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

    // Compare a meaningful substring of the message — the first 80 chars
    const commentNorm = normalizeMessage(comment.body);
    const findingSnippet = normalizedFinding.slice(0, 80);
    if (commentNorm.includes(findingSnippet)) {
      return true;
    }
  }

  return false;
}
