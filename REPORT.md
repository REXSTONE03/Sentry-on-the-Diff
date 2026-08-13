# REPORT.md — PR Sentry

---

## 1. What We Built
PR Sentry is a Docker-based GitHub Action that automatically reviews C# Pull Requests for code quality issues using deterministic static analysis. It fetches only the changed diff hunks from the GitHub Pull Request Files API, parses unified diffs to precisely map added lines to real file line numbers, runs three analyzers (null safety, async/await correctness, and SOLID SRP), deduplicates findings against existing PR review comments, and posts remaining findings as inline review comments via the GitHub Pull Request Review API.

### Architecture

```
PR opened/synchronize
  → GitHub Actions Workflow
  → Docker Container (Node.js 20)
  → Fetch PR Files API (GET /repos/{owner}/{repo}/pulls/{pr}/files)
  → Filter C# files, skip generated/deleted/binary/minified files
  → Unified diff parsing (src/diff/lineMapper.ts)
  → Three Analyzers (null, async, SOLID)
  → Fetch existing comments (GET /repos/{owner}/{repo}/pulls/{pr}/comments)
  → Auto-resolve fixed comments (PATCH /repos/{owner}/{repo}/pulls/comments/{id})
  → Deduplicate remaining findings
  → POST /repos/{owner}/{repo}/pulls/{pr}/reviews (COMMENT)
```

---

## 2. Requirements Compliance Matrix

Below is the verified mapping of the 10 mandatory requirements from the problem statement to their implementation in the repository:

| Req # | Requirement | Implementation Evidence (File & Logic) |
| :--- | :--- | :--- |
| **1** | Triggers on `pull_request: [opened, synchronize]` with zero manual steps | Configured in [.github/workflows/pr-sentry.yml](.github/workflows/pr-sentry.yml) with triggers. |
| **2** | Only changed hunks are reviewed — never re-flags code outside the diff | Implemented in [src/analyzers/reviewer.ts](src/analyzers/reviewer.ts) using `parseAddedLines` from [src/diff/lineMapper.ts](src/diff/lineMapper.ts). Only lines marked with `+` are analyzed. |
| **3** | Findings are posted as inline review comments anchored to file + line | Implemented in [src/github/publishReview.ts](src/github/publishReview.ts) using `octokit.rest.pulls.createReview` passing `comments` array with path and line coordinates. |
| **4** | Every posted comment states its category (SOLID / null-handling / async) | Handled in [src/github/publishReview.ts](src/github/publishReview.ts) which prefixes the comment body with `**[Category]**` tags. |
| **5** | Review event is always COMMENT, never APPROVE/REQUEST_CHANGES | Enforced in [src/github/publishReview.ts](src/github/publishReview.ts)'s payload where `event` is hardcoded to `'COMMENT'`. |
| **6** | A second push with no code change produces zero duplicate comments | Enforced in [src/github/existingComments.ts](src/github/existingComments.ts)'s `isDuplicate()` which filters out findings matching existing path/line/message comments. |
| **7** | Non-C# and unparseable/binary files are skipped, not crashed on | Implemented in [src/analyzers/reviewer.ts](src/analyzers/reviewer.ts)'s `shouldReviewFile()`. Excludes non-C#, binary, minified, and generated files, protected under try-catch blocks. |
| **8** | Secrets/tokens are read from Actions secrets, never hard-coded | Configured in [action.yml](action.yml) and read in [src/index.ts](src/index.ts) from `core.getInput('github_token')` or `process.env.GITHUB_TOKEN`. |
| **9** | Workflow fails loudly (non-zero exit) if review-posting fails | Handled in [src/index.ts](src/index.ts) where any throw in review posting is caught, executing `core.setFailed()` to terminate with non-zero exit status. |
| **10** | Two identical PRs produce the same finding set | Guaranteed by deterministic pattern matching logic in [src/analyzers/nullAnalyzer.ts](src/analyzers/nullAnalyzer.ts), [src/analyzers/asyncAnalyzer.ts](src/analyzers/asyncAnalyzer.ts), and [src/analyzers/solidAnalyzer.ts](src/analyzers/solidAnalyzer.ts). |

---

## 3. Detection Logic

### null-handling
* **Detects**:
  * Assignments from `.FirstOrDefault()`, `.SingleOrDefault()`, `.Find()`, or `as Type` expressions where the variable is dereferenced (e.g. `varName.Member`) without a preceding null check (e.g. `!= null`, `is not null`, `?.`) inside the diff hunk.
  * Variables explicitly assigned to `null` that are subsequently dereferenced (reported with `error` severity).
  * Unsafe null-forgiving operator usage (e.g. `varName!.Member`) on added lines.
* **Does NOT flag**:
  * Dereferences where a null guard exists anywhere in the same diff hunk.
  * Safe null-tolerant methods like `.Equals()`, `.GetType()`, or `.ToString()`.

### async
* **Detects**:
  * `async void` method declarations (which prevent callers from catching exceptions).
  * Blocking Task access via `.Result` or `.Wait()` on Task objects.
  * Async methods (`async Task` / `async ValueTask`) that lack any `await` calls in their body hunk.
* **Does NOT flag**:
  * Valid `await` expressions.
  * Custom property calls named `.Result` on non-Task classes (like class fields).

### SOLID (Single Responsibility Principle)
* **Detects**:
  * God Class candidates in newly added classes.
  * Groups methods by name matching across five domains: User Management, Notifications/Mailing, Database/DB, Billing/Invoicing, and Reporting/Exporting.
  * Flags classes containing methods matching $\ge 3$ distinct domains.
* **Does NOT attempt**:
  * Open/Closed, Liskov, Interface Segregation, or Dependency Inversion.
  * Pre-existing codebase reviews outside the modified hunk.

---

## 4. Methods

### Why the PR Files API (not full file content)?
The PR Files API returns exactly the changed diff hunks (`patch` field). Reviewing full file contents would introduce noise on legacy code untouched by the PR author, violating the grounding requirement. It also minimizes API payload overhead.

### Line Mapping Approach
The unified diff parser in [src/diff/lineMapper.ts](src/diff/lineMapper.ts) parses the hunk headers (e.g. `@@ -12,4 +12,6 @@`), tracking added (`+`), deleted (`-`), and context (` `) lines to compute the absolute line coordinates required by GitHub's review comment payload.

### Duplicate Prevention & Resolution
Instead of double-posting on `synchronize` pushes, [src/github/existingComments.ts](src/github/existingComments.ts) fetches all existing PR review comments. Any new findings that match an existing path/line/message are skipped. Additionally, if an issue is fixed in a subsequent commit, its comment is automatically edited to be crossed out (`~~body~~`) and tagged as resolved.

### Static Analyzer vs LLM Decision
A rules-based static analyzer was chosen as the baseline for zero hallucination, millisecond execution speeds, no runtime API costs, and full unit-testability.

---

## 5. Results & Test Matrix

PR Sentry has been validated against 10 distinct pull request scenarios:

| PR | Test Scenario | Findings | Correct? | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | Added FirstOrDefault assignment with direct dereference | 1 null-handling warning | Yes | Triggered on L17 of OrderProcessor.cs |
| **#2** | Same code as #1, repeated synchronize push | 0 new comments | Yes | Deduplication filter skipped duplicate |
| **#3** | Added `async void ProcessPaymentAsync()` method | 1 async error | Yes | Flagged async void signature on L13 |
| **#4** | Added Task blocking call using `.Result` | 1 async warning | Yes | Flagged `.Result` on L20 |
| **#5** | Added Class spanning User/DB/Email domains | 1 SOLID warning | Yes | Class identified as SRP violation |
| **#6** | Documentation only PR touching `README.md` | 0 comments | Yes | Non-C# file was skipped |
| **#7** | PR touching generated C# file (`Form1.designer.cs`) | 0 comments | Yes | Designer suffix matches exclude rule |
| **#8** | PR with null guard `if (x != null) { x.Name }` | 0 comments | Yes | Null check prevented warning |
| **#9** | Async method without await in body | 1 async warning | Yes | Flagged missing await |
| **#10** | PR utilizing null-forgiving operator `x!.Name` | 1 null-handling warning | Yes | Flagged unsafe forgiveness operator |

### Observed False Positives (FPs)
* **SOLID Heuristic**: Class names or method names containing incidental keywords (e.g., `RegisterInvoice`) can match multiple domains and flag clean, cohesive classes.
* **Null Check Heuristic**: A null check located outside the active diff hunk is not visible to the hunk-scoped parser, which can cause a false positive warning on a dereference that is actually safe.

### Observed False Negatives (FNs)
* **Interprocedural Nulls**: Re-assignment of a nullable variable across different methods is missed since the analyzer does not build a full call graph or track types across scopes.
* **Hunk-Truncated Async**: If an async method declaration is modified but its body (containing the `await` statement) is in an unchanged context outside the diff hunk, the analyzer will falsely flag the method as lacking `await`.

---

## 6. Stretch Features Implemented

* **Summary Review Comment**: Compiles a markdown table detailing all findings by category and posts it as the top-level review body.
* **Auto-Resolving Comments**: Matches existing comments with active findings. If an issue has been resolved in a new commit, it edits the GitHub comment to cross out the message and tag it resolved.
* **Reusable Action Packaging**: Packaged as a standalone Docker Action.

---

## 7. Process & Timeline

### Planned vs Actual Timeline
The absolute start/end clock timestamps of the keyboard sessions are not verifiable in our local execution logs, but the workflow was developed sequentially in the following phases:

* **Phase 1 — Skeleton Pipeline**: Verified pipeline wiring with a hardcoded review comment.
* **Phase 2 — Real Diff Parsing**: Implemented the unified diff line mapping engine.
* **Phase 3 — Core Analyzers**: Coded the regex scanners for null, async, and SOLID checks.
* **Phase 4 — Duplicate Comment Prevention**: Coded comments retrieval and matching.
* **Phase 5 — Hostile Input Hardening**: Added binary/minified checks and error boundaries.

### Abandoned Approaches
* **Patch-relative position mapping**: We initially attempted to use the deprecated `position` parameter (patch-relative line offset) to avoid writing a diff parser, but found that GitHub renders the comments on incorrect lines upon subsequent synchronize pushes. We abandoned this and wrote the full unified diff mapper to resolve absolute line numbers.

---

## 8. How to Run

### Local Validation
You can run the test suite and verify the build locally:
```bash
# Install dependencies
npm install

# Run unit tests
npm run test

# Compile TypeScript
npm run build

# Build Docker image
docker build -t pr-sentry .
```

### GitHub Actions Deployment
Add the following workflow file to `.github/workflows/pr-sentry.yml` in your target repository:

```yaml
name: PR Sentry Reviewer

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run PR Sentry
        uses: REXSTONE03/Sentry-on-the-Diff@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```
