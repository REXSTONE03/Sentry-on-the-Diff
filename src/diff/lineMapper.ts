export interface AddedLine {
  lineNumber: number;
  content: string;
  hunkHeader: string;
}

/**
 * Maximum patch size (bytes) we will attempt to parse.
 * GitHub truncates patches beyond ~1MB. We set a conservative cap.
 */
const MAX_PATCH_BYTES = 512_000;

/**
 * Parses a unified diff patch string and returns all added lines
 * mapped to their actual new-file line numbers.
 * Handles truncated patches, malformed headers, and no-newline markers safely.
 */
export function parseAddedLines(patch: string): AddedLine[] {
  if (!patch || patch.length === 0) return [];

  // Guard: refuse to process extremely large patches (truncation guard)
  if (patch.length > MAX_PATCH_BYTES) {
    console.warn(`Patch exceeds ${MAX_PATCH_BYTES} byte limit (${patch.length} bytes). Skipping to avoid OOM.`);
    return [];
  }

  const addedLines: AddedLine[] = [];
  const lines = patch.split('\n');

  let currentNewLine = 0;
  let currentHunkHeader = '';

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('@@')) {
      currentHunkHeader = line;
      // Parse header: @@ -oldStart,oldLength +newStart,newLength @@
      // Note that length is optional and defaults to 1 if omitted.
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        // Guard against malformed line numbers
        if (!isNaN(parsed) && parsed > 0) {
          currentNewLine = parsed;
        }
      }
    } else if (line.startsWith('+')) {
      addedLines.push({
        lineNumber: currentNewLine,
        content: line.slice(1),
        hunkHeader: currentHunkHeader
      });
      currentNewLine++;
    } else if (line.startsWith('-')) {
      // deleted line: old-file line increases, new-file line does not.
    } else if (line.startsWith('\\')) {
      // \ No newline at end of file: not a source line.
    } else {
      // context line: both old and new file lines increase.
      currentNewLine++;
    }
  }

  return addedLines;
}

/**
 * Retained for backwards compatibility if needed, otherwise delegates to parseAddedLines.
 */
export function mapDiffLineToRealLine(patch: string, patchLineIndex: number): number | null {
  const addedLines = parseAddedLines(patch);
  if (patchLineIndex >= 0 && patchLineIndex < addedLines.length) {
    return addedLines[patchLineIndex].lineNumber;
  }
  return null;
}
