import { analyzeAsync } from '../src/analyzers/asyncAnalyzer';

describe('Async/Await Analyzer', () => {
  it('should flag async void methods', () => {
    const patch = `
@@ -5,3 +5,4 @@
 public class Worker {
+    public async void Process() {}
 }
`.trim();

    const findings = analyzeAsync('Worker.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('async');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('async void');
  });

  it('should flag blocking on Task.Result', () => {
    const patch = `
@@ -10,3 +10,4 @@
 public void Run() {
+    var result = CalculateAsync().Result;
 }
`.trim();

    const findings = analyzeAsync('Worker.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('Task.Result');
  });

  it('should flag blocking on Task.Wait()', () => {
    const patch = `
@@ -10,3 +10,4 @@
 public void Run() {
+    CalculateAsync().Wait();
 }
`.trim();

    const findings = analyzeAsync('Worker.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('Task.Wait()');
  });

  it('should flag async methods without await operators in the hunk', () => {
    const patch = `
@@ -15,5 +15,5 @@
+public async Task FetchData()
+{
+    var data = FetchLocal();
+    Console.WriteLine(data);
+}
`.trim();

    const findings = analyzeAsync('Worker.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('lacks \'await\' operators');
  });

  it('should not flag async methods if await is present', () => {
    const patch = `
@@ -15,5 +15,5 @@
+public async Task FetchData()
+{
+    var data = await FetchRemoteAsync();
+    Console.WriteLine(data);
+}
`.trim();

    const findings = analyzeAsync('Worker.cs', patch);
    expect(findings).toHaveLength(0);
  });
});
