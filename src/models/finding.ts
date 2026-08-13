export interface Finding {
  file: string;
  line: number;
  category: "SOLID" | "null-handling" | "async";
  severity: "warning" | "error";
  message: string;
  hunk_ref: string;
}
