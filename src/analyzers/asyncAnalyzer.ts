import { Finding } from '../models/finding';
import { parseAddedLines } from '../diff/lineMapper';

/**
 * Analyzes a C# file patch for async/await correctness issues.
 */
export function analyzeAsync(filename: string, patch: string): Finding[] {
  const findings: Finding[] = [];
  const addedLines = parseAddedLines(patch);
  if (addedLines.length === 0) return [];

  // Group added lines by hunk to perform hunk-scoped analyses (like missing await)
  const hunkLinesMap = new Map<string, typeof addedLines>();
  for (const line of addedLines) {
    if (!hunkLinesMap.has(line.hunkHeader)) {
      hunkLinesMap.set(line.hunkHeader, []);
    }
    hunkLinesMap.get(line.hunkHeader)!.push(line);
  }

  for (const line of addedLines) {
    const text = line.content.trim();

    // Skip comment lines
    if (text.startsWith('//') || text.startsWith('/*')) {
      continue;
    }

    // 1. Detect 'async void'
    if (/\basync\s+void\b/.test(text)) {
      findings.push({
        file: filename,
        line: line.lineNumber,
        category: 'async',
        severity: 'error',
        message: `'async void' should be avoided. It prevents callers from observing completion or handling exceptions; prefer returning 'Task' or 'ValueTask'.`,
        hunk_ref: line.hunkHeader
      });
      continue;
    }

        // 2. Detect blocking on '.Result'
    // Exclude cases like ValidationResult.Result or class declarations
    if (/\.Result\b/.test(text) && !/\b(?:class|struct|enum|interface)\b/.test(text)) {
      findings.push({
        file: filename,
        line: line.lineNumber,
        category: 'async',
        severity: 'warning',
        message: `Blocking on 'Task.Result' can cause synchronous blocks or deadlocks. Prefer using 'await' to resolve tasks asynchronously.`,
        hunk_ref: line.hunkHeader
      });
      continue;
    }

    // 3. Detect blocking on '.Wait()'
    if (/\.Wait\(\s*\)/.test(text)) {
      findings.push({
        file: filename,
        line: line.lineNumber,
        category: 'async',
        severity: 'warning',
        message: `Blocking on 'Task.Wait()' can cause synchronous blocks or deadlocks. Prefer using 'await' instead.`,
        hunk_ref: line.hunkHeader
      });
      continue;
    }
  }

  // 4. Detect async methods that do not await (CS1998 equivalent)
  for (const [hunkHeader, lines] of hunkLinesMap.entries()) {
    // Find any line in this hunk that declares an async method returning Task or ValueTask
    const asyncDeclLine = lines.find(line => 
      /\basync\s+(?:Task|ValueTask)\b/.test(line.content)
    );

    if (asyncDeclLine) {
      // Check if any added line in this hunk contains the await keyword
      const hasAwait = lines.some(line => 
        /\bawait\b/.test(line.content) && !line.content.trim().startsWith('//')
      );

      if (!hasAwait) {
        findings.push({
          file: filename,
          line: asyncDeclLine.lineNumber,
          category: 'async',
          severity: 'warning',
          message: `This async method is declared but lacks 'await' operators in the modified hunk; it will run synchronously.`,
          hunk_ref: hunkHeader
        });
      }
    }
  }

  return findings;
}
