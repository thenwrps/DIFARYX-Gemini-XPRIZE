/**
 * ============================================================================
 * DIFARYX — Export Sanitizer: Validation-Aware Document Export Guardrails
 * ============================================================================
 *
 * Ensures exported notebook documents strictly adhere to validation-aware
 * phrasing guidelines. Scans exported text for forbidden definitive phrases
 * (e.g., "confirmed phase", "proven composition") and replaces them with
 * safe, evidence-based alternatives.
 *
 * Collects descriptive warning strings for UI display so researchers are
 * informed about any terminology adjustments applied during export.
 *
 * @module utils/exportSanitizer
 * ============================================================================
 */

import {
  FORBIDDEN_PHRASES,
  enforceLanguageRules,
} from '../engines/reasoningEngine/persistenceSync';

// ---------------------------------------------------------------------------
// Replacement Map — Forbidden Phrase → Validation-Aware Alternative
// ---------------------------------------------------------------------------

/**
 * Maps lowercase-normalized forbidden phrase patterns to their
 * validation-aware replacement alternatives.
 */
const REPLACEMENT_MAP: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bconfirmed\s+phase\b/gi, replacement: 'reference-supported indication of phase' },
  { pattern: /\bconfirmed\s+composition\b/gi, replacement: 'reference-supported indication of composition' },
  { pattern: /\bproven\s+phase\b/gi, replacement: 'evidence-consistent phase indication' },
  { pattern: /\bproven\s+composition\b/gi, replacement: 'evidence-consistent composition indication' },
  { pattern: /\bproven\s+structure\b/gi, replacement: 'evidence-consistent structural indication' },
  { pattern: /\bdefinitive\s+identification\b/gi, replacement: 'preliminary identification supported by reference evidence' },
  { pattern: /\babsolute\s+certainty\b/gi, replacement: 'reference-supported confidence within validation limits' },
  { pattern: /\bconclusively\s+(identified|determined|established|confirmed)\b/gi, replacement: 'indicated by available evidence (requires further validation)' },
  { pattern: /\bproven\s+(to\s+be|that|the)\b/gi, replacement: 'evidence suggests' },
  { pattern: /\bconfirmed\s+(to\s+be|that|the\s+presence)\b/gi, replacement: 'evidence indicates' },
  { pattern: /\bwithout\s+(any\s+)?doubt\b/gi, replacement: 'within current validation limits' },
  { pattern: /\bindisputable\b/gi, replacement: 'reference-supported' },
];

// ---------------------------------------------------------------------------
// Sanitize Export Content
// ---------------------------------------------------------------------------

/**
 * Scan a markdown string for forbidden definitive phrases, replace them
 * with validation-aware alternatives, and collect warning descriptions.
 *
 * @param markdown - The full markdown export content to sanitize.
 * @returns An object containing the sanitized content and an array of
 *          descriptive warning strings for UI display.
 */
export function sanitizeExportContent(markdown: string): {
  content: string;
  warnings: string[];
} {
  let content = markdown;
  const warnings: string[] = [];

  for (const { pattern, replacement } of REPLACEMENT_MAP) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const original = match[0];
      warnings.push(
        `Sanitization applied: "${original}" replaced with "${replacement}" to comply with validation-aware language rules.`,
      );
    }

    // Reset and apply the replacement globally
    pattern.lastIndex = 0;
    content = content.replace(pattern, replacement);
  }

  return { content, warnings };
}

// ---------------------------------------------------------------------------
// Sanitize Plain Text
// ---------------------------------------------------------------------------

/**
 * Sanitize a plain text string (for single-line or short content).
 * Returns the sanitized text and any warnings.
 *
 * @param text - The text to sanitize.
 * @returns Sanitized text with warnings.
 */
export function sanitizeExportText(text: string): {
  text: string;
  warnings: string[];
} {
  const result = sanitizeExportContent(text);
  return { text: result.content, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// Validate Export Sections
// ---------------------------------------------------------------------------

/**
 * Validate an array of export sections (as used by `exportDemoArtifact`).
 * Sanitizes each line in each section and collects all warnings.
 *
 * @param sections - Array of export sections with heading and lines.
 * @returns An object with the sanitized sections, a validity flag, and warnings.
 */
export function validateExportSections<
  T extends { heading: string; lines: Array<string | number | boolean | undefined | null> },
>(sections: T[]): {
  sections: T[];
  valid: boolean;
  warnings: string[];
} {
  const allWarnings: string[] = [];

  const sanitizedSections = sections.map((section) => {
    const sanitizedLines = section.lines.map((line) => {
      if (typeof line !== 'string') return line;
      const result = sanitizeExportContent(line);
      allWarnings.push(...result.warnings);
      return result.content;
    });
    return { ...section, lines: sanitizedLines } as T;
  });

  return {
    sections: sanitizedSections,
    valid: allWarnings.length === 0,
    warnings: allWarnings,
  };
}

// ---------------------------------------------------------------------------
// Validate Export Content (Throw-Based)
// ---------------------------------------------------------------------------

/**
 * Strict validation: runs `enforceLanguageRules` on the full export content.
 * Throws if any forbidden phrase is detected, halting the export.
 * Use this as a pre-export compilation guard.
 *
 * @param markdown - The export content to validate.
 * @throws {Error} If any forbidden definitive phrase is found.
 */
export function enforceExportLanguageRules(markdown: string): void {
  enforceLanguageRules(markdown);
}