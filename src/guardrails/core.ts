export type GuardrailResult = {
  allowed: boolean;
  code?: string;
  message?: string;
  matchedPatternIds?: string[];
  meta?: Record<string, unknown>;
};

export type GuardrailError = Error & {
  code?: string;
  reason?: string;
  guardrail?: GuardrailResult;
};

export const VD_GUARDRAILS_VERSION = '0.0.1';

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

export function allow(meta?: Record<string, unknown>): GuardrailResult {
  return meta ? { allowed: true, meta } : { allowed: true };
}

export function block(params: {
  code: string;
  message: string;
  matchedPatternIds?: string[];
  meta?: Record<string, unknown>;
}): GuardrailResult {
  const { code, message, matchedPatternIds, meta } = params;
  return {
    allowed: false,
    code,
    message,
    ...(matchedPatternIds ? { matchedPatternIds } : {}),
    ...(meta ? { meta } : {}),
  };
}

export function toGuardrailError(
  result: GuardrailResult,
  fallbackMessage = 'Request blocked by deterministic guardrails.',
): GuardrailError {
  const err = new Error(result?.message || fallbackMessage) as GuardrailError;
  err.name = 'GuardrailError';
  err.code = result?.code || 'guardrail.blocked';
  err.reason = err.message;
  err.guardrail = result;
  return err;
}
