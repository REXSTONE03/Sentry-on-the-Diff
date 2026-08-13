import { analyzeNullSafety } from '../src/analyzers/nullAnalyzer';
import { analyzeSOLID } from '../src/analyzers/solidAnalyzer';

describe('Null Analyzer', () => {
  it('should detect dereference after FirstOrDefault without a null check', () => {
    const patch = `
@@ -10,4 +10,6 @@
 public void Process()
 {
+    var customer = customers.FirstOrDefault(c => c.Id == 1);
+    Console.WriteLine(customer.Name);
 }
`.trim();

    const findings = analyzeNullSafety('Test.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      file: 'Test.cs',
      line: 13,
      category: 'null-handling',
      severity: 'warning',
      message: `'customer' is dereferenced without a null check after a nullable method call.`,
      hunk_ref: '@@ -10,4 +10,6 @@'
    });
  });

  it('should not flag dereference if protected by a null check', () => {
    const patch = `
@@ -10,4 +10,7 @@
 public void Process()
 {
+    var customer = customers.FirstOrDefault(c => c.Id == 1);
+    if (customer != null) {
+        Console.WriteLine(customer.Name);
+    }
 }
`.trim();

    const findings = analyzeNullSafety('Test.cs', patch);
    expect(findings).toHaveLength(0);
  });

  it('should detect unsafe null-forgiving operator usage', () => {
    const patch = `
@@ -10,3 +10,4 @@
 public void Process()
 {
+    var name = customer!.Name;
 }
`.trim();

    const findings = analyzeNullSafety('Test.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Unsafe null-forgiving operator");
  });

  it('should detect dereference of explicitly null assigned variables', () => {
    const patch = `
@@ -10,4 +10,6 @@
 public void Process()
 {
+    string name = null;
+    Console.WriteLine(name.Length);
 }
`.trim();

    const findings = analyzeNullSafety('Test.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('explicitly assigned to \'null\'');
  });
});

describe('SOLID SRP Analyzer', () => {
  it('should flag a class with mixed responsibilities (User, Invoice, Email, Database)', () => {
    const patch = `
@@ -1,15 +1,15 @@
+public class UserService
+{
+    public void RegisterUser() {}
+    public void SendEmail() {}
+    public void GenerateInvoice() {}
+    public void SaveToDatabase() {}
+    public void GenerateReport() {}
+}
`.trim();

    const findings = analyzeSOLID('UserService.cs', patch);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('SOLID');
    expect(findings[0].message).toContain('violate the Single Responsibility Principle');
  });

  it('should not flag a class with cohesive responsibilities', () => {
    const patch = `
@@ -1,10 +1,10 @@
+public class UserRepository
+{
+    public void Save(User u) {}
+    public User GetById(int id) {}
+    public void Delete(int id) {}
+}
`.trim();

    const findings = analyzeSOLID('UserRepository.cs', patch);
    expect(findings).toHaveLength(0);
  });
});
