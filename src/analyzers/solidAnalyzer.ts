import { Finding } from '../models/finding';
import { parseAddedLines } from '../diff/lineMapper';

interface ClassInfo {
  name: string;
  lineNumber: number;
  hunkHeader: string;
  methods: { name: string; lineNumber: number }[];
}

const RESPONSIBILITY_DOMAINS = [
  {
    name: 'User Management',
    keywords: ['user', 'register', 'login', 'signup', 'authenticate', 'profile', 'logout']
  },
  {
    name: 'Notification & Mailing',
    keywords: ['email', 'mail', 'sms', 'notification', 'smtp', 'send', 'message']
  },
  {
    name: 'Persistence & Database',
    keywords: ['save', 'persist', 'db', 'database', 'repository', 'sql', 'insert', 'update', 'delete', 'query', 'store']
  },
  {
    name: 'Billing & Invoicing',
    keywords: ['invoice', 'payment', 'billing', 'charge', 'pay', 'transaction', 'receipt', 'card']
  },
  {
    name: 'Reporting & Exporting',
    keywords: ['report', 'pdf', 'export', 'csv', 'print', 'document', 'excel']
  }
];

const CONTROL_FLOW_KEYWORDS = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'using', 'catch', 'lock', 
  'typeof', 'nameof', 'await', 'when', 'delegate', 'new', 'return'
]);

/**
 * Analyzes a C# file patch for SOLID violations, focusing on SRP.
 */
export function analyzeSOLID(filename: string, patch: string): Finding[] {
  const findings: Finding[] = [];
  const addedLines = parseAddedLines(patch);
  if (addedLines.length === 0) return [];

  const classes: ClassInfo[] = [];
  let currentClass: ClassInfo | null = null;

  for (const line of addedLines) {
    const text = line.content.trim();

    // Skip comment lines
    if (text.startsWith('//') || text.startsWith('/*')) {
      continue;
    }

    // 1. Detect Class declaration
    const classMatch = text.match(/\bclass\s+([A-Za-z0-9_]+)\b/);
    if (classMatch) {
      if (currentClass) {
        classes.push(currentClass);
      }
      currentClass = {
        name: classMatch[1],
        lineNumber: line.lineNumber,
        hunkHeader: line.hunkHeader,
        methods: []
      };
      continue;
    }

    // 2. Detect Method declarations
    // Matches patterns like: public void MyMethod( or async Task<int> ProcessAsync(
    // Group 1 catches the method name
    const methodMatch = text.match(/\b([a-zA-Z0-9_]+)\s*\(/);
    if (methodMatch && currentClass) {
      const methodName = methodMatch[1];
      
      // Ignore control keywords, constructors, and common methods
      if (
        !CONTROL_FLOW_KEYWORDS.has(methodName) && 
        methodName !== currentClass.name &&
        !/^[0-9]/.test(methodName)
      ) {
        currentClass.methods.push({
          name: methodName,
          lineNumber: line.lineNumber
        });
      }
    }
  }

  if (currentClass) {
    classes.push(currentClass);
  }

  // Evaluate each class for SRP violation
  for (const cls of classes) {
    if (cls.methods.length < 3) {
      continue; // Not enough methods to confidently flag SRP
    }

    const matchedDomains = new Set<string>();

    for (const method of cls.methods) {
      const lowerMethod = method.name.toLowerCase();

      for (const domain of RESPONSIBILITY_DOMAINS) {
        const matchesKeyword = domain.keywords.some(keyword => {
          // Check if method name contains the keyword as a substring/word
          return lowerMethod.includes(keyword);
        });

        if (matchesKeyword) {
          matchedDomains.add(domain.name);
        }
      }
    }

    // If a class spans 3 or more distinct domains, flag it as a God Class/SRP violation
    if (matchedDomains.size >= 3) {
      const domainsList = Array.from(matchedDomains);
      findings.push({
        file: filename,
        line: cls.lineNumber,
        category: 'SOLID',
        severity: 'warning',
        message: `Class '${cls.name}' appears to violate the Single Responsibility Principle (SRP) by combining multiple unrelated responsibilities: ${domainsList.join(', ')}. Consider splitting the class.`,
        hunk_ref: cls.hunkHeader
      });
    }
  }

  return findings;
}
