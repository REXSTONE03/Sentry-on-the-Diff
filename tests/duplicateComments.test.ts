import { isDuplicate, normalizeMessage, ExistingComment } from '../src/github/existingComments';

describe('Duplicate Comment Detection', () => {
  const existingComments: ExistingComment[] = [
    {
      path: 'src/UserService.cs',
      line: 42,
      body: '**[null-handling]** `customer` is dereferenced without a null check after a nullable method call.'
    },
    {
      path: 'src/Worker.cs',
      line: 10,
      body: "**[async]** 'async void' should be avoided."
    }
  ];

  it('should detect an exact duplicate (same file, line, category, and message)', () => {
    const result = isDuplicate(
      'src/UserService.cs',
      42,
      'null-handling',
      "`customer` is dereferenced without a null check after a nullable method call.",
      existingComments
    );
    expect(result).toBe(true);
  });

  it('should not flag as duplicate if file differs', () => {
    const result = isDuplicate(
      'src/OtherService.cs',
      42,
      'null-handling',
      "`customer` is dereferenced without a null check after a nullable method call.",
      existingComments
    );
    expect(result).toBe(false);
  });

  it('should not flag as duplicate if line number differs', () => {
    const result = isDuplicate(
      'src/UserService.cs',
      99,
      'null-handling',
      "`customer` is dereferenced without a null check after a nullable method call.",
      existingComments
    );
    expect(result).toBe(false);
  });

  it('should not flag as duplicate if category differs', () => {
    const result = isDuplicate(
      'src/UserService.cs',
      42,
      'async',
      "`customer` is dereferenced without a null check after a nullable method call.",
      existingComments
    );
    expect(result).toBe(false);
  });

  it('should not flag as duplicate if message is substantially different', () => {
    const result = isDuplicate(
      'src/UserService.cs',
      42,
      'null-handling',
      'This is a completely unrelated message about something else.',
      existingComments
    );
    expect(result).toBe(false);
  });

  it('should return false when existingComments is empty', () => {
    const result = isDuplicate('src/Test.cs', 1, 'SOLID', 'Some finding', []);
    expect(result).toBe(false);
  });

  it('should simulate second PR run returning zero new comments', () => {
    // Simulate first run findings
    const runOneFindings = [
      {
        file: 'src/UserService.cs',
        line: 42,
        category: 'null-handling' as const,
        message: '`customer` is dereferenced without a null check after a nullable method call.'
      },
      {
        file: 'src/Worker.cs',
        line: 10,
        category: 'async' as const,
        message: "'async void' should be avoided."
      }
    ];

    // Simulate re-run: each finding from run 1 is now a duplicate
    const newFindings = runOneFindings.filter(f =>
      !isDuplicate(f.file, f.line, f.category, f.message, existingComments)
    );

    // Zero new findings should be posted on a second synchronize event
    expect(newFindings).toHaveLength(0);
  });

  it('should post a new finding when line number has changed', () => {
    const finding = {
      file: 'src/UserService.cs',
      line: 55, // Different line — code was edited
      category: 'null-handling' as const,
      message: '`customer` is dereferenced without a null check after a nullable method call.'
    };

    const result = isDuplicate(finding.file, finding.line, finding.category, finding.message, existingComments);
    expect(result).toBe(false);
  });
});

describe('normalizeMessage', () => {
  it('should lowercase and collapse whitespace', () => {
    const result = normalizeMessage('  Hello   WORLD  ');
    expect(result).toBe('hello world');
  });

  it('should strip leading/trailing whitespace', () => {
    const result = normalizeMessage('  some text  ');
    expect(result).toBe('some text');
  });
});
