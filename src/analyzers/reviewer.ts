import { Finding } from '../models/finding';
import { ChangedFile } from '../github/fetchDiff';
import { parseAddedLines } from '../diff/lineMapper';
import { analyzeNullSafety } from './nullAnalyzer';
import { analyzeAsync } from './asyncAnalyzer';
import { analyzeSOLID } from './solidAnalyzer';

/** Maximum length of a single line before we consider it minified. */
const MAX_LINE_LENGTH = 5000;

/**
 * Returns true if the patch content looks like binary data
 * (contains null bytes or a Git binary patch marker).
 */
export function isBinaryPatch(patch: string): boolean {
  if (patch.includes('\x00')) return true;
  if (patch.includes('Binary files ')) return true;
  if (patch.includes('GIT binary patch')) return true;
  return false;
}

/**
 * Returns true if the patch content appears to be minified
 * (single very long line in the +additions).
 */
export function isMinifiedPatch(patch: string): boolean {
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (line.length > MAX_LINE_LENGTH) return true;
    }
  }
  return false;
}

/**
 * Checks if a file should be reviewed by PR Sentry.
 */
export function shouldReviewFile(filename: string, patch?: string): { review: boolean; reason: string } {
  if (!patch || patch.trim() === '') {
    return { review: false, reason: 'no patch / empty patch' };
  }

  const lower = filename.toLowerCase();

  // Accept only C# files
  if (!lower.endsWith('.cs')) {
    return { review: false, reason: 'not a C# file' };
  }

  // Skip generated, designer, and metadata files
  if (
    lower.endsWith('.designer.cs') ||
    lower.endsWith('.g.cs') ||
    lower.endsWith('.generated.cs') ||
    lower.endsWith('.assemblyinfo.cs')
  ) {
    return { review: false, reason: 'generated C# file' };
  }

  // Skip build-artifact paths
  if (
    lower.includes('/obj/') || lower.includes('/bin/') ||
    lower.includes('\\obj\\') || lower.includes('\\bin\\')
  ) {
    return { review: false, reason: 'build artifact path (obj/ or bin/)' };
  }

  // Skip binary patches
  if (isBinaryPatch(patch)) {
    return { review: false, reason: 'binary data in patch' };
  }

  // Skip minified patches
  if (isMinifiedPatch(patch)) {
    return { review: false, reason: 'minified content detected (very long single line)' };
  }

  return { review: true, reason: '' };
}

export function runReviewer(changedFiles: ChangedFile[]): Finding[] {
  const findings: Finding[] = [];

  if (!changedFiles || changedFiles.length === 0) {
    console.log('No changed files in this PR.');
    return [];
  }

  for (const file of changedFiles) {
    try {
      const { review, reason } = shouldReviewFile(file.filename, file.patch);

      if (!review) {
        console.log(`Skipping: ${file.filename} — ${reason}`);
        continue;
      }

      console.log(`Processing: ${file.filename}`);
      const patch = file.patch!;
      const addedLines = parseAddedLines(patch);

      if (addedLines.length === 0) {
        console.log(`Skipping: ${file.filename} — zero added lines (zero-net-change or deletion-only diff)`);
        continue;
      }

      // Phase 2 debug output
      for (const addedLine of addedLines) {
        console.log(`  File: ${file.filename} | Hunk: ${addedLine.hunkHeader} | Line ${addedLine.lineNumber}: ${addedLine.content.trim()}`);
      }

      // Run analyzers
      const nullFindings   = analyzeNullSafety(file.filename, patch);
      const asyncFindings  = analyzeAsync(file.filename, patch);
      const solidFindings  = analyzeSOLID(file.filename, patch);

      const fileFindings = [...nullFindings, ...asyncFindings, ...solidFindings];
      console.log(`  → ${fileFindings.length} finding(s) in ${file.filename}`);

      findings.push(...fileFindings);
    } catch (err: any) {
      // Per-file error boundary: log and continue — never crash the whole run
      console.error(`Error processing ${file.filename}: ${err?.message ?? err}`);
    }
  }

  return findings;
}
