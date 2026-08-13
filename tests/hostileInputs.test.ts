import { shouldReviewFile, isBinaryPatch, isMinifiedPatch, runReviewer } from '../src/analyzers/reviewer';
import { parseAddedLines } from '../src/diff/lineMapper';
import { ChangedFile } from '../src/github/fetchDiff';

// ─── Helper to create a ChangedFile ──────────────────────────────────────────
function makeFile(filename: string, status: string, patch?: string): ChangedFile {
  return { filename, status, patch };
}

// ─── Scenario 1: PR touching only README ─────────────────────────────────────
describe('Scenario 1: PR touching only README', () => {
  it('should skip README.md with no findings and no crash', () => {
    const files = [makeFile('README.md', 'modified', '@@ -1,2 +1,3 @@\n+# New heading\n')];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });
});

// ─── Scenario 2: PR touching only YAML ───────────────────────────────────────
describe('Scenario 2: PR touching only YAML', () => {
  it('should skip .yml files safely', () => {
    const files = [makeFile('.github/workflows/ci.yml', 'modified', '@@ -1,1 +1,2 @@\n+  - run: echo hello\n')];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });
});

// ─── Scenario 3: PR with no C# files ─────────────────────────────────────────
describe('Scenario 3: PR with no C# files', () => {
  it('should return zero findings for a PR with only non-C# files', () => {
    const files = [
      makeFile('package.json', 'modified', '@@ -1,1 +1,2 @@\n+"version": "2.0.0"\n'),
      makeFile('styles.css',   'modified', '@@ -1,1 +1,2 @@\n+body { color: red; }\n'),
      makeFile('README.md',    'modified', '@@ -1,1 +1,2 @@\n+Updated\n')
    ];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });
});

// ─── Scenario 4: PR adding a generated file ──────────────────────────────────
describe('Scenario 4: Generated file', () => {
  it('should skip .designer.cs files', () => {
    const { review, reason } = shouldReviewFile('Form1.designer.cs', '@@ -1 +1 @@\n+// generated\n');
    expect(review).toBe(false);
    expect(reason).toContain('generated');
  });

  it('should skip .g.cs files', () => {
    const { review } = shouldReviewFile('MyApp.g.cs', '@@ -1 +1 @@\n+// generated\n');
    expect(review).toBe(false);
  });

  it('should skip .generated.cs files', () => {
    const { review } = shouldReviewFile('Protos.generated.cs', '@@ -1 +1 @@\n+// generated\n');
    expect(review).toBe(false);
  });

  it('should skip files in obj/ path', () => {
    const { review, reason } = shouldReviewFile('src/obj/Debug/MyApp.cs', '@@ -1 +1 @@\n+// obj\n');
    expect(review).toBe(false);
    expect(reason).toContain('obj/');
  });
});

// ─── Scenario 5: PR adding a minified file ───────────────────────────────────
describe('Scenario 5: Minified content', () => {
  it('should detect a very long single added line as minified', () => {
    const longLine = 'a'.repeat(6000);
    const patch = `@@ -1,1 +1,2 @@\n context\n+${longLine}\n`;
    expect(isMinifiedPatch(patch)).toBe(true);
  });

  it('should skip a minified C# file', () => {
    const longLine = 'a'.repeat(6000);
    const patch = `@@ -1,1 +1,2 @@\n+${longLine}\n`;
    const { review, reason } = shouldReviewFile('Minified.cs', patch);
    expect(review).toBe(false);
    expect(reason).toContain('minified');
  });
});

// ─── Scenario 6: PR adding binary data ───────────────────────────────────────
describe('Scenario 6: Binary data', () => {
  it('should detect null bytes as binary', () => {
    expect(isBinaryPatch('Binary files a/img.png and b/img.png differ')).toBe(true);
    expect(isBinaryPatch('GIT binary patch\nliteral 100\n')).toBe(true);
    expect(isBinaryPatch('\x00corrupted data')).toBe(true);
  });

  it('should skip a .cs file whose patch contains binary markers', () => {
    const { review, reason } = shouldReviewFile('corrupt.cs', 'Binary files a/corrupt.cs and b/corrupt.cs differ');
    expect(review).toBe(false);
    expect(reason).toContain('binary');
  });
});

// ─── Scenario 7: Deleted C# file ─────────────────────────────────────────────
describe('Scenario 7: Deleted C# file', () => {
  it('should skip a deleted file with no patch', () => {
    const files = [makeFile('src/OldService.cs', 'removed', undefined)];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });

  it('shouldReviewFile returns false for missing patch', () => {
    const { review, reason } = shouldReviewFile('src/OldService.cs', undefined);
    expect(review).toBe(false);
    expect(reason).toContain('no patch');
  });
});

// ─── Scenario 8: Zero-net-change diff ────────────────────────────────────────
describe('Scenario 8: Zero-net-change diff', () => {
  it('should produce no findings when diff has only deletions', () => {
    const patch = '@@ -1,3 +1,2 @@\n context\n-deleted line\n context\n';
    const files = [makeFile('src/Service.cs', 'modified', patch)];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });

  it('parseAddedLines returns empty array for deletion-only patch', () => {
    const patch = '@@ -5,3 +5,2 @@\n line1\n-removed line\n line2\n';
    expect(parseAddedLines(patch)).toHaveLength(0);
  });
});

// ─── Scenario 9: File with missing patch ─────────────────────────────────────
describe('Scenario 9: File with missing patch', () => {
  it('should skip gracefully when patch is undefined', () => {
    const files = [makeFile('src/Something.cs', 'modified', undefined)];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });

  it('should skip gracefully when patch is empty string', () => {
    const files = [makeFile('src/Something.cs', 'modified', '')];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });
});

// ─── Scenario 10: Very large / truncated patch ───────────────────────────────
describe('Scenario 10: Very large / truncated patch', () => {
  it('parseAddedLines returns empty for patches exceeding 512KB limit', () => {
    const hugePatch = '+' + 'x'.repeat(600_000);
    const result = parseAddedLines(hugePatch);
    expect(result).toHaveLength(0);
  });

  it('should not crash when patch is large', () => {
    const largePatch = '@@ -1,1 +1,2 @@\n context\n' + '+line\n'.repeat(1000);
    expect(() => parseAddedLines(largePatch)).not.toThrow();
  });
});

// ─── Scenario 11: Clean C# PR ────────────────────────────────────────────────
describe('Scenario 11: Clean C# PR (no issues)', () => {
  it('should produce zero findings for clean code', () => {
    const patch = `@@ -1,5 +1,8 @@
 public class Calculator
 {
+    public int Add(int a, int b)
+    {
+        return a + b;
+    }
 }`.trim();
    const files = [makeFile('src/Calculator.cs', 'modified', patch)];
    const findings = runReviewer(files);
    expect(findings).toHaveLength(0);
  });
});

// ─── Scenario 12: PR with null issue ─────────────────────────────────────────
describe('Scenario 12: PR with null-handling issue', () => {
  it('should produce a null-handling finding', () => {
    const patch = `@@ -10,4 +10,6 @@
 public class Service {
 public void Process() {
+    var customer = list.FirstOrDefault(x => x.Id == 1);
+    Console.WriteLine(customer.Name);
 }
 }`.trim();
    const files = [makeFile('src/Service.cs', 'modified', patch)];
    const findings = runReviewer(files);
    expect(findings.some(f => f.category === 'null-handling')).toBe(true);
  });
});

// ─── Scenario 13: PR with async issue ────────────────────────────────────────
describe('Scenario 13: PR with async issue', () => {
  it('should produce an async finding for async void', () => {
    const patch = `@@ -5,3 +5,4 @@
 public class Worker {
+    public async void Run() {}
 }`.trim();
    const files = [makeFile('src/Worker.cs', 'modified', patch)];
    const findings = runReviewer(files);
    expect(findings.some(f => f.category === 'async')).toBe(true);
  });
});

// ─── Scenario 14: PR with SOLID issue ────────────────────────────────────────
describe('Scenario 14: PR with SOLID issue', () => {
  it('should detect SRP violation in a God Class', () => {
    const patch = `@@ -1,10 +1,10 @@
+public class UserService
+{
+    public void RegisterUser() {}
+    public void SendEmail() {}
+    public void GenerateInvoice() {}
+    public void SaveToDatabase() {}
+    public void GenerateReport() {}
+}`.trim();
    const files = [makeFile('src/UserService.cs', 'added', patch)];
    const findings = runReviewer(files);
    expect(findings.some(f => f.category === 'SOLID')).toBe(true);
  });
});

// ─── Scenario 15: Repeated synchronize event ─────────────────────────────────
describe('Scenario 15: Repeated synchronize (duplicate prevention)', () => {
  it('runReviewer is deterministic — same input produces same output', () => {
    const patch = `@@ -10,4 +10,5 @@
 public class Service {
 public void Run() {
+    var x = items.FirstOrDefault();
+    Console.WriteLine(x.Name);
 }
 }`.trim();
    const files = [makeFile('src/Service.cs', 'modified', patch)];

    const run1 = runReviewer(files);
    const run2 = runReviewer(files);

    // Same findings on every run — deduplication in index.ts prevents double-posting
    expect(run1.length).toBe(run2.length);
    expect(run1.map(f => f.message)).toEqual(run2.map(f => f.message));
  });
});

// ─── Edge: Empty PR (no changed files) ───────────────────────────────────────
describe('Edge: Empty changed files list', () => {
  it('should return zero findings without crashing', () => {
    expect(runReviewer([])).toHaveLength(0);
  });
});

// ─── Edge: Analyzer throws internally ────────────────────────────────────────
describe('Edge: Per-file error boundary', () => {
  it('should not crash the whole run if one file errors', () => {
    // A patch with a valid hunk header but null content to stress-test the parsers
    const badPatch = '@@ -1,1 +1,1 @@\n+\x01\x02\x03'; // control chars
    const goodPatch = '@@ -1,1 +1,2 @@\n context\n+var x = 1;\n';
    const files = [
      makeFile('src/Bad.cs',   'modified', badPatch),
      makeFile('src/Good.cs',  'modified', goodPatch)
    ];
    expect(() => runReviewer(files)).not.toThrow();
  });
});
