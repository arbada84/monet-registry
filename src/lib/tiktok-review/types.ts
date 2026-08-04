export type ReviewStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ReviewVideoInfo {
  name: string;
  size: number;
  type: string;
  durationSeconds: number;
  width: number;
  height: number;
}

export interface ReviewMetadata {
  title: string;
  caption: string;
  hashtags: string;
  language: string;
  internalNote: string;
}

export interface ReviewContentChecks {
  rightsConfirmed: boolean;
  noCopiedWatermark: boolean;
  privacyReviewed: boolean;
  guidelinesReviewed: boolean;
  aiContent: "" | "yes" | "no";
  commercialContent: "" | "yes" | "no";
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

