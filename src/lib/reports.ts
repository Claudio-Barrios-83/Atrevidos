import type { Database } from '$lib/database.types';

export const REPORT_CATEGORY_OPTIONS = [
  { value: 'spam', label: 'Spam o estafa' },
  { value: 'harassment', label: 'Acoso o amenazas' },
  { value: 'hate_speech', label: 'Discurso de odio' },
  { value: 'false_info', label: 'Información falsa' },
  { value: 'inappropriate_content', label: 'Contenido inapropiado' },
  { value: 'other', label: 'Otro motivo' }
] as const;

export const REPORT_TARGET_TYPES = ['user', 'post', 'message'] as const;
export const MAX_REPORT_REASON_LENGTH = 1000;

export type ReportCategory = (typeof REPORT_CATEGORY_OPTIONS)[number]['value'];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export type ReportTarget = {
  type: ReportTargetType;
  id: string;
  ownerId?: string | null;
  label?: string;
};

export type ValidateReportDraftInput = {
  reporterId: string | null | undefined;
  target: ReportTarget | null | undefined;
  category: string | null | undefined;
  reason: string | null | undefined;
};

export type ValidatedReportDraft =
  | {
      isValid: true;
      normalizedCategory: ReportCategory;
      normalizedReason: string;
    }
  | {
      isValid: false;
      error: string;
    };

function normalizeString(value: string | null | undefined) {
  return value?.trim() ?? '';
}

export function isReportCategory(value: string): value is ReportCategory {
  return REPORT_CATEGORY_OPTIONS.some((option) => option.value === value);
}

export function isReportTargetType(value: string): value is ReportTargetType {
  return REPORT_TARGET_TYPES.includes(value as ReportTargetType);
}

export function validateReportDraft({ reporterId, target, category, reason }: ValidateReportDraftInput): ValidatedReportDraft {
  const normalizedReporterId = normalizeString(reporterId);
  const normalizedTargetId = normalizeString(target?.id);
  const normalizedCategory = normalizeString(category);
  const normalizedReason = normalizeString(reason);

  if (!normalizedReporterId || !normalizedTargetId || !normalizedCategory || !normalizedReason) {
    return {
      isValid: false,
      error: 'Completa la categoría y el motivo antes de enviar el reporte.'
    };
  }

  if (!target || !isReportTargetType(target.type)) {
    return {
      isValid: false,
      error: 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.'
    };
  }

  if (!isReportCategory(normalizedCategory)) {
    return {
      isValid: false,
      error: 'Selecciona una categoría válida para el reporte.'
    };
  }

  if (normalizedReason.length > MAX_REPORT_REASON_LENGTH) {
    return {
      isValid: false,
      error: `El motivo no puede superar los ${MAX_REPORT_REASON_LENGTH} caracteres.`
    };
  }

  if (target.ownerId && normalizeString(target.ownerId) === normalizedReporterId) {
    return {
      isValid: false,
      error: 'No puedes reportarte a ti misma/o.'
    };
  }

  return {
    isValid: true,
    normalizedCategory,
    normalizedReason
  };
}

export function buildReportInsert({
  reporterId,
  target,
  category,
  reason
}: ValidateReportDraftInput): Database['public']['Tables']['reports']['Insert'] {
  const validation = validateReportDraft({ reporterId, target, category, reason });

  if (!validation.isValid || !target) {
    throw new Error(validation.isValid ? 'No pudimos preparar el reporte.' : validation.error);
  }

  return {
    reporter_id: normalizeString(reporterId),
    target_type: target.type,
    target_id: normalizeString(target.id),
    category: validation.normalizedCategory,
    reason: validation.normalizedReason
  };
}

export function toReportSubmitErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  const message = rawMessage.toLowerCase();

  if (
    rawMessage === 'Completa la categoría y el motivo antes de enviar el reporte.' ||
    rawMessage === 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.' ||
    rawMessage === 'Selecciona una categoría válida para el reporte.' ||
    rawMessage === 'No puedes reportarte a ti misma/o.' ||
    rawMessage === `El motivo no puede superar los ${MAX_REPORT_REASON_LENGTH} caracteres.`
  ) {
    return rawMessage;
  }

  if (
    message.includes('duplicate') ||
    message.includes('already') ||
    message.includes('exists') ||
    message.includes('ya has reportado este contenido')
  ) {
    return 'Ya habías enviado un reporte para este contenido. Gracias por avisarnos.';
  }

  return 'No pudimos enviar tu reporte. Inténtalo de nuevo.';
}
