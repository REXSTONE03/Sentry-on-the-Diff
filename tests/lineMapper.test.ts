import { parseAddedLines } from '../src/diff/lineMapper';

describe('Unified Diff Parser and Line Mapper', () => {
  it('should parse a single hunk patch correctly', () => {
    const patch = `
@@ -38,3 +38,5 @@
 public Invoice Create()
 {
 var customer = GetCustomer();
+var address = customer.Address;
+Console.WriteLine(address);
 }
`.trim();

    const result = parseAddedLines(patch);
    expect(result).toHaveLength(2);
    
    expect(result[0]).toEqual({
      lineNumber: 41,
      content: 'var address = customer.Address;',
      hunkHeader: '@@ -38,3 +38,5 @@'
    });

    expect(result[1]).toEqual({
      lineNumber: 42,
      content: 'Console.WriteLine(address);',
      hunkHeader: '@@ -38,3 +38,5 @@'
    });
  });

  it('should handle multiple hunks with deletions and context lines', () => {
    const patch = `
--- a/src/Test.cs
+++ b/src/Test.cs
@@ -10,3 +10,4 @@
 old line 1
 old line 2
-old line 3
+new line 3
+new line 4
@@ -30,4 +31,5 @@
 old line 30
+new line 31
 old line 31
-old line 32
+new line 33
`.trim();

    const result = parseAddedLines(patch);
    expect(result).toHaveLength(4);

    // Hunk 1
    expect(result[0].lineNumber).toBe(12);
    expect(result[0].content).toBe('new line 3');
    expect(result[0].hunkHeader).toBe('@@ -10,3 +10,4 @@');

    expect(result[1].lineNumber).toBe(13);
    expect(result[1].content).toBe('new line 4');
    
    // Hunk 2
    expect(result[2].lineNumber).toBe(32);
    expect(result[2].content).toBe('new line 31');
    expect(result[2].hunkHeader).toBe('@@ -30,4 +31,5 @@');

    expect(result[3].lineNumber).toBe(34);
    expect(result[3].content).toBe('new line 33');
  });

  it('should handle hunk headers without explicitly specified lengths', () => {
    const patch = `
@@ -38 +38 @@
-old line
+new line
`.trim();

    const result = parseAddedLines(patch);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(38);
    expect(result[0].content).toBe('new line');
  });

  it('should skip no newline warnings', () => {
    const patch = `
@@ -1,2 +1,2 @@
 line 1
-line 2
\\ No newline at end of file
+line 2 new
\\ No newline at end of file
`.trim();

    const result = parseAddedLines(patch);
    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(2);
    expect(result[0].content).toBe('line 2 new');
  });
});
