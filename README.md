# PR Sentry 🛡️

**PR Sentry** is a Docker-based GitHub Action that automatically reviews C# Pull Requests for common code quality issues, posting findings as inline comments directly on the changed lines.

---

## What PR Sentry Does

PR Sentry inspects **only the changed diff hunks** of a PR — never the entire file. It detects:

| Category | What is detected |
|---|---|
| `null-handling` | Unsafe dereferences after `FirstOrDefault`/`SingleOrDefault`/`as`, explicit `null` assignment dereferences, and unsafe null-forgiving operator (`!.`) usage |
| `async` | `async void` declarations, `.Result` blocking, `.Wait()` blocking, async methods without `await` |
| `SOLID` | Single Responsibility Principle violations — classes combining 3+ unrelated responsibility domains |

PR Sentry **never approves or rejects** a PR — it only comments.

---

## Architecture

```
Pull Request (opened / synchronize)
        │
        ▼
GitHub Actions Workflow
        │
        ▼
Docker Container (Node.js 20)
        │
        ├── Fetch changed files (GitHub PR Files API)
        │
        ├── Filter C# files only, skip generated/deleted/empty
        │
        ├── Parse unified diff → map added lines to real line numbers
        │
        ├── Run analyzers:
        │     ├── nullAnalyzer  (null-handling patterns)
        │     ├── asyncAnalyzer (async/await patterns)
        │     └── solidAnalyzer (SRP violation patterns)
        │
        ├── Fetch existing PR review comments
        │
        ├── Deduplicate findings (skip already-posted comments)
        │
        └── Post remaining findings as one inline PR review (COMMENT)
```

---

## Supported Categories

### `null-handling`
- Dereference after `.FirstOrDefault()`, `.SingleOrDefault()`, `.Find()`, or `as Type` without null check
- Dereference of a variable explicitly assigned to `null`
- Unsafe null-forgiving operator: `varName!.Member`

### `async`
- `async void` method declarations
- `.Result` on a Task (synchronous blocking)
- `.Wait()` on a Task (synchronous blocking)
- `async Task` methods that lack `await` operators in their changed hunk

### `SOLID`
- Classes that combine 3 or more of: User Management, Mailing/Notifications, Persistence/DB, Billing/Invoicing, Reporting/Export

---

## Installation

### 1. Add the action to your repository

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
    name: Run PR Sentry
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run PR Sentry
        uses: YOUR_GITHUB_USERNAME/pr-sentry@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

Replace `YOUR_GITHUB_USERNAME/pr-sentry` with the actual repository path.

### 2. Required Permissions

The workflow `permissions` block is required:

```yaml
permissions:
  contents: read
  pull-requests: write
```

No additional GitHub Secrets are required. The action uses the automatically injected `GITHUB_TOKEN`.

### 3. Zero Manual Steps

After adding the workflow file, the Action runs automatically on every opened or updated Pull Request targeting C# files.

---

## Docker Usage

### Build locally

```bash
docker build -t pr-sentry .
```

### Run locally (dry-run validation)

```bash
docker run --rm pr-sentry
# Expected: Error about missing GITHUB_TOKEN — confirms the container loads correctly.
```

---

## GitHub Action Usage

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github_token` | Yes | `${{ github.token }}` | GitHub token for API access |

### Triggers

```yaml
on:
  pull_request:
    types: [opened, synchronize]
```

---

## Example PR

Given a PR that adds the following C# code:

```csharp
var customer = customers.FirstOrDefault(c => c.Id == id);
Console.WriteLine(customer.Name);   // ← added line
```

PR Sentry will post an inline comment on `Console.WriteLine(customer.Name)`:

> **[null-handling]** `customer` is dereferenced without a null check after a nullable method call.

---

## Example Inline Comments

```
src/Services/UserService.cs, Line 42:
  **[null-handling]** `customer` is dereferenced without a null check after a nullable method call.

src/Workers/DataWorker.cs, Line 17:
  **[async]** 'async void' should be avoided. Prefer returning 'Task' or 'ValueTask'.

src/Services/UserService.cs, Line 3:
  **[SOLID]** Class 'UserService' appears to violate the Single Responsibility Principle (SRP) by combining multiple unrelated responsibilities: User Management, Notification & Mailing, Persistence & Database. Consider splitting the class.
```

---

## Limitations

- Only reviews **added lines** in the diff, not pre-existing code
- SOLID detection is based on method name pattern matching — may not catch all violations
- Null check detection requires the null guard to appear within the same diff hunk
- Very short hunks may not have enough context for hunk-scoped analysis (e.g., async without await)
- Does not process deleted files or files without a patch
- Does not support `pull_request_target` for fork PRs (would require explicit setup)
- No Roslyn/semantic analysis — purely syntactic pattern matching

---

## Development

### Prerequisites

- Node.js 20
- npm
- Docker (for container testing)

### Setup

```bash
npm install
npm run build
npm run test
```

### Project Structure

```
src/
├── github/
│   ├── fetchDiff.ts         # GitHub PR Files API
│   ├── publishReview.ts     # GitHub PR Review API publisher
│   └── existingComments.ts  # Fetch and deduplicate existing comments
├── diff/
│   └── lineMapper.ts        # Unified diff parser / line mapper
├── analyzers/
│   ├── nullAnalyzer.ts      # Null safety patterns
│   ├── asyncAnalyzer.ts     # Async/await correctness patterns
│   ├── solidAnalyzer.ts     # SOLID SRP patterns
│   └── reviewer.ts          # Coordinates all analyzers
├── models/
│   └── finding.ts           # Finding data model
└── index.ts                 # Entry point

tests/
├── lineMapper.test.ts
├── nullAnalyzer.test.ts     # Also includes SOLID tests
├── asyncAnalyzer.test.ts
└── duplicateComments.test.ts
```
