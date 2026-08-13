import * as core from '@actions/core';
import * as github from '@actions/github';
import { fetchChangedFiles } from './github/fetchDiff';
import { runReviewer } from './analyzers/reviewer';
import { publishReview } from './github/publishReview';
import { fetchExistingComments, isDuplicate, resolveFixedComments } from './github/existingComments';
import { Finding } from './models/finding';

async function run(): Promise<void> {
  try {
    const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token not provided. Set github_token input or GITHUB_TOKEN environment variable.');
    }

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    
    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      console.log('Not running on a pull request event. Skipping execution.');
      return;
    }

    console.log(`PR Sentry starting. Repository: ${owner}/${repo}, PR: #${prNumber}`);

    // Fetch changed files in the Pull Request
    const changedFiles = await fetchChangedFiles(octokit, owner, repo, prNumber);
    console.log(`Fetched ${changedFiles.length} files from PR.`);

    // Run all analyzers
    const findings: Finding[] = runReviewer(changedFiles);
    console.log(`Reviewer generated ${findings.length} total findings.`);

    // Fetch existing review comments
    const existingComments = await fetchExistingComments(octokit, owner, repo, prNumber);

    // Automatically resolve conversations that have been fixed
    await resolveFixedComments(octokit, owner, repo, prNumber, findings, existingComments);

    if (findings.length === 0) {
      console.log('No findings — skipping review submission.');
      return;
    }

    // Filter out findings that already have matching comments
    const newFindings = findings.filter(finding =>
      !isDuplicate(finding.file, finding.line, finding.category, finding.message, existingComments)
    );

    const skipped = findings.length - newFindings.length;
    console.log(`Deduplication: ${skipped} duplicate(s) skipped, ${newFindings.length} new finding(s) to post.`);

    if (newFindings.length === 0) {
      console.log('All findings are duplicates of existing comments — nothing new to post.');
      return;
    }

    // Publish new findings to the PR as a single review
    await publishReview(octokit, owner, repo, prNumber, newFindings);

    console.log('PR Sentry completed execution.');
  } catch (error: any) {
    core.setFailed(`PR Sentry failed: ${error.message}`);
  }
}

run();
