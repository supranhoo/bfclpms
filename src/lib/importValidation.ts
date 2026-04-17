import { z } from 'zod';

// Valid system roles matching the app_role enum
export const VALID_ROLES = ['admin', 'manager', 'employee', 'auditor', 'management'] as const;
export type ValidRole = typeof VALID_ROLES[number];

// Normalize and validate role - defaults to 'employee' if invalid or missing
export function normalizeRole(role: string | undefined | null): ValidRole {
  if (!role) return 'employee';
  const normalized = String(role).toLowerCase().trim();
  if (VALID_ROLES.includes(normalized as ValidRole)) {
    return normalized as ValidRole;
  }
  return 'employee';
}

// Maximum limits for import
export const IMPORT_LIMITS = {
  MAX_FILE_SIZE_MB: 10,
  MAX_ROWS: 10000,
  MAX_STRING_LENGTH: 1000,
  MAX_REMARKS_LENGTH: 2000,
};

// Schema for KPI import row validation
export const KpiImportRowSchema = z.object({
  sNo: z.number().optional(),
  refCode: z.string().max(200).optional(),
  month: z.string().max(50).optional(),
  reviewStatus: z.string().max(50).optional(),
  newCode: z.string().min(1, "Employee code is required").max(50),
  fullName: z.string().min(1, "Full name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  kra: z.string().min(1, "KRA is required").max(IMPORT_LIMITS.MAX_STRING_LENGTH),
  kpi: z.string().min(1, "KPI is required").max(IMPORT_LIMITS.MAX_STRING_LENGTH),
  target: z.union([
    z.number().min(0).max(1000000),
    z.string().max(100)
  ]).optional(),
  uom: z.enum(['%', 'Number', 'Days', 'Hours', 'Minutes', 'Amount', 'Date', 'Index', 'Ratio', 'Score', 'Count', 'Rate'])
    .optional()
    .or(z.string().max(50).optional()), // Allow custom for backward compatibility
  frequency: z.enum(['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly']).optional().or(z.string().max(50).optional()),
  kpiWeightage: z.number().min(0).max(100).optional(),
  criteria: z.string().max(100).optional(),
  // Rating thresholds
  r5: z.union([z.number(), z.string().max(50)]).optional(),
  r4: z.union([z.number(), z.string().max(50)]).optional(),
  r3: z.union([z.number(), z.string().max(50)]).optional(),
  r2: z.union([z.number(), z.string().max(50)]).optional(),
  r1: z.union([z.number(), z.string().max(50)]).optional(),
  r0: z.union([z.number(), z.string().max(50)]).optional(),
  // Achievement data
  targetAchieved: z.union([z.number().min(0), z.string().max(100)]).optional(),
  achievedWeight: z.string().max(50).optional(),
  rating: z.number().min(0).max(5).optional(),
  kpiWeightageScore: z.number().min(0).max(500).optional(),
  // Organization-level KPI flag
  isOrgLevel: z.preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (typeof v === 'boolean') return v;
    const str = String(v).toLowerCase().trim();
    return str === 'true' || str === 'yes' || str === '1' || str === 'y';
  }, z.boolean().optional()),
  // Self review
  employeeTargetAchieved: z.union([z.number().min(0), z.string().max(100)]).optional(),
  employeeRating: z.number().min(0).max(5).optional(),
  employeeRemarks: z.string().max(IMPORT_LIMITS.MAX_REMARKS_LENGTH).optional(),
  // Manager review
  managerTargetAchieved: z.union([z.number().min(0), z.string().max(100)]).optional(),
  managerRating: z.number().min(0).max(5).optional(),
  managerRemarks: z.string().max(IMPORT_LIMITS.MAX_REMARKS_LENGTH).optional(),
  // Audit review
  auditTargetAchieved: z.union([z.number().min(0), z.string().max(100)]).optional(),
  auditRating: z.number().min(0).max(5).optional(),
  auditRemarks: z.string().max(IMPORT_LIMITS.MAX_REMARKS_LENGTH).optional(),
}).passthrough(); // Allow additional fields

// Schema for Employee import row validation
export const EmployeeImportRowSchema = z.object({
  employeeCode: z.string().min(1, "Employee code is required").max(50),
  fullName: z.string().min(1, "Full name is required").max(200),
  email: z.string().email("Invalid email format").max(255).optional().or(z.literal('')),
  designation: z.string().max(100).optional(),
  division: z.string().max(100).optional(),
  businessUnit: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  pmsGrade: z.string().max(50).optional(),
  managerEmployeeId: z.string().max(50).optional(),
  managerName: z.string().max(200).optional(),
  role: z.string()
    .transform(val => val?.toLowerCase().trim())
    .refine(val => !val || VALID_ROLES.includes(val as ValidRole), {
      message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`
    })
    .optional(),
}).passthrough();

// Validate KPI import data
export function validateKpiImportData(data: unknown[]): { 
  valid: boolean; 
  errors: string[];
  warnings: string[];
  validatedData: z.infer<typeof KpiImportRowSchema>[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validatedData: z.infer<typeof KpiImportRowSchema>[] = [];

  // Check row count limit
  if (data.length > IMPORT_LIMITS.MAX_ROWS) {
    errors.push(`File contains ${data.length} rows, maximum allowed is ${IMPORT_LIMITS.MAX_ROWS}`);
    return { valid: false, errors, warnings, validatedData: [] };
  }

  for (let i = 0; i < data.length; i++) {
    try {
      const validated = KpiImportRowSchema.parse(data[i]);
      validatedData.push(validated);

      // P1: Binary KPI validation warnings
      const row = validated as Record<string, unknown>;
      const uomType = row.uomType || row.uom_type;
      if (uomType === 'binary' || uomType === 'tiered') {
        const hasThresholds = [row.r5, row.r4, row.r3, row.r2, row.r1].some(t => t !== null && t !== undefined && t !== '');
        if (!hasThresholds) {
          warnings.push(`Row ${i + 2}: Binary/Tiered KPI "${validated.kpi}" has no R5-R1 thresholds. Auto-scoring may not work correctly.`);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          errors.push(`Row ${i + 2}: ${err.path.join('.')} - ${err.message}`);
        });
      }
    }
  }

  return { 
    valid: errors.length === 0, 
    errors,
    warnings,
    validatedData: errors.length === 0 ? validatedData : []
  };
}

// Validate Employee import data
export function validateEmployeeImportData(data: unknown[]): {
  valid: boolean;
  errors: string[];
  validatedData: z.infer<typeof EmployeeImportRowSchema>[];
} {
  const errors: string[] = [];
  const validatedData: z.infer<typeof EmployeeImportRowSchema>[] = [];

  // Check row count limit
  if (data.length > IMPORT_LIMITS.MAX_ROWS) {
    errors.push(`File contains ${data.length} rows, maximum allowed is ${IMPORT_LIMITS.MAX_ROWS}`);
    return { valid: false, errors, validatedData: [] };
  }

  for (let i = 0; i < data.length; i++) {
    try {
      const validated = EmployeeImportRowSchema.parse(data[i]);
      validatedData.push(validated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          errors.push(`Row ${i + 2}: ${err.path.join('.')} - ${err.message}`);
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedData: errors.length === 0 ? validatedData : []
  };
}

// Validate file size
export function validateFileSize(file: File): { valid: boolean; error?: string } {
  const maxBytes = IMPORT_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { 
      valid: false, 
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed (${IMPORT_LIMITS.MAX_FILE_SIZE_MB} MB)` 
    };
  }
  return { valid: true };
}

/**
 * Sanitize text to prevent XSS attacks.
 * This function removes dangerous HTML content and encodes entities.
 * Note: React's JSX escaping provides additional protection for display contexts.
 * For rendering HTML content, use a proper library like DOMPurify instead.
 */
export function sanitizeText(text: string | undefined | null): string {
  if (!text) return '';
  
  let sanitized = String(text);
  
  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove dangerous tags (iframe, object, embed, form, etc.)
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|link|meta|base|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button|link|meta|base|style|img)\b[^>]*\/?>/gi, '');
  
  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: and data: URIs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');
  
  // Encode HTML entities to prevent tag injection
  sanitized = sanitized
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return sanitized.trim();
}

/**
 * Basic script tag removal without HTML encoding.
 * Use this when you need to remove dangerous scripts but preserve HTML structure.
 * For display in React components, prefer sanitizeText() or rely on JSX escaping.
 */
export function removeScriptTags(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}
