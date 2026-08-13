import { Finding } from '../models/finding';
import { parseAddedLines } from '../diff/lineMapper';

/**
 * Analyzes a C# file patch for null-safety issues on added lines.
 */
export function analyzeNullSafety(filename: string, patch: string): Finding[] {
  const findings: Finding[] = [];
  const addedLines = parseAddedLines(patch);
  if (addedLines.length === 0) return [];

  // Track variables assigned from nullable-returning patterns in this patch.
  // Map variable name to the line number of its assignment.
  const nullableVars = new Map<string, { line: number; source: string }>();
  const nullAssignedVars = new Map<string, number>();

  // Regexes to identify assignments
  const firstOrDefaultRegex = /\bvar\s+(\w+)\s*=\s*.*(?:\.FirstOrDefault|\.SingleOrDefault|as\s+\w+|\.Find)\b/;
  const nullAssignmentRegex = /\b(\w+)\s*=\s*null\b/;
  const methodCallAssignmentRegex = /\bvar\s+(\w+)\s*=\s*[A-Z]\w*\(.*\)\s*;/;

  // First pass: scan for declarations/assignments
  for (const line of addedLines) {
    const text = line.content.trim();

    // 1. FirstOrDefault / SingleOrDefault / as / Find
    const nullableMatch = text.match(firstOrDefaultRegex);
    if (nullableMatch) {
      nullableVars.set(nullableMatch[1], { line: line.lineNumber, source: 'nullable method call' });
      continue;
    }

    // 2. Direct null assignment
    const nullMatch = text.match(nullAssignmentRegex);
    if (nullMatch) {
      nullAssignedVars.set(nullMatch[1], line.lineNumber);
      continue;
    }

    // 3. General method call assignment (potential null returning class reference)
    const methodMatch = text.match(methodCallAssignmentRegex);
    if (methodMatch) {
      nullableVars.set(methodMatch[1], { line: line.lineNumber, source: 'method call' });
      continue;
    }
  }

  // Second pass: scan for unsafe dereferences and null-forgiving usage
  for (const line of addedLines) {
    const text = line.content.trim();

    // Skip comment lines
    if (text.startsWith('//') || text.startsWith('/*')) {
      continue;
    }

    // 1. Unsafe null-forgiving operator: varName!.Member
    const nullForgivingMatch = text.match(/\b(\w+)\s*!\s*\.\s*(\w+)\b/);
    if (nullForgivingMatch) {
      const varName = nullForgivingMatch[1];
      findings.push({
        file: filename,
        line: line.lineNumber,
        category: 'null-handling',
        severity: 'warning',
        message: `Unsafe null-forgiving operator usage: '${varName}!.' is dereferenced. Ensure '${varName}' is not null before using '!.' to suppress warnings.`,
        hunk_ref: line.hunkHeader
      });
      continue;
    }

    // 2. Dereferencing variables that were assigned to null
    for (const [varName, assignLine] of nullAssignedVars.entries()) {
      if (line.lineNumber > assignLine) {
        // Look for varName.Member
        const derefRegex = new RegExp(`\\b${varName}\\.(?!\\b(?:Equals|GetType|ToString)\\b)\\w+`);
        if (derefRegex.test(text)) {
          findings.push({
            file: filename,
            line: line.lineNumber,
            category: 'null-handling',
            severity: 'error',
            message: `Variable '${varName}' is dereferenced after being explicitly assigned to 'null'.`,
            hunk_ref: line.hunkHeader
          });
        }
      }
    }

    // 3. Dereferencing nullable variables (from FirstOrDefault, etc.)
    for (const [varName, info] of nullableVars.entries()) {
      if (line.lineNumber > info.line) {
        const derefRegex = new RegExp(`\\b${varName}\\.(?!\\b(?:Equals|GetType|ToString)\\b)\\w+`);
        if (derefRegex.test(text)) {
          // Check if there is a null check in the same hunk, or same line ?. / ??
          const isCheckedInHunk = addedLines.some(l => {
            if (l.hunkHeader !== line.hunkHeader) return false;
            const lText = l.content;
            return (
              lText.includes(`${varName} != null`) ||
              lText.includes(`null != ${varName}`) ||
              lText.includes(`${varName} is not null`) ||
              lText.includes(`if (${varName} != null)`) ||
              lText.includes(`if (null != ${varName})`)
            );
          });

          const hasNullCheck = isCheckedInHunk || text.includes(`${varName}?.`) || text.includes(`${varName} ??`);

          if (!hasNullCheck) {
            findings.push({
              file: filename,
              line: line.lineNumber,
              category: 'null-handling',
              severity: 'warning',
              message: `'${varName}' is dereferenced without a null check after a ${info.source}.`,
              hunk_ref: line.hunkHeader
            });
          }
        }
      }
    }
  }

  return findings;
}
