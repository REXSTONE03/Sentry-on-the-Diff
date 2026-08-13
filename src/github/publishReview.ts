import * as github from '@actions/github';
import { Finding } from '../models/finding';

export async function publishReview(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  findings: Finding[]
): Promise<void> {
  if (findings.length === 0) {
    console.log('No findings to publish.');
    return;
  }

  console.log(`Publishing review with ${findings.length} findings...`);

  const comments = findings.map(finding => ({
    path: finding.file,
    line: finding.line,
    side: 'RIGHT' as const,
    body: `**[${finding.category}]** ${finding.message}`
  }));

  try {
    const response = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'COMMENT',
      comments
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`GitHub API returned unexpected status code: ${response.status}`);
    }

    console.log('Review posted successfully. Response ID:', response.data.id);
  } catch (error: any) {
    console.error('Failed to post PR review:', error);
    if (error.response) {
      console.error('API Response Data:', JSON.stringify(error.response.data, null, 2));
      console.error('API Response Status:', error.response.status);
    }
    throw error;
  }
}
