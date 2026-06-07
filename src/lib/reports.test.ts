import { describe, expect, it } from 'vitest';
import {
  MAX_REPORT_REASON_LENGTH,
  REPORT_CATEGORY_OPTIONS,
  buildReportInsert,
  toReportSubmitErrorMessage,
  validateReportDraft,
  type ReportTarget
} from './reports';

const baseTarget = (overrides: Partial<ReportTarget> = {}): ReportTarget => ({
  type: 'post',
  id: 'post-1',
  ownerId: 'author-1',
  label: 'esta publicación',
  ...overrides
});

describe('REPORT_CATEGORY_OPTIONS', () => {
  it('exposes the supported report categories for the MVP modal', () => {
    expect(REPORT_CATEGORY_OPTIONS.map((option) => option.value)).toEqual([
      'spam',
      'harassment',
      'hate_speech',
      'false_info',
      'inappropriate_content',
      'other'
    ]);
  });
});

describe('validateReportDraft', () => {
  it('normalizes a valid report draft', () => {
    expect(
      validateReportDraft({
        reporterId: 'reporter-1',
        target: baseTarget(),
        category: 'spam',
        reason: '  Mensajes repetidos y enlaces sospechosos.  '
      })
    ).toEqual({
      isValid: true,
      normalizedCategory: 'spam',
      normalizedReason: 'Mensajes repetidos y enlaces sospechosos.'
    });
  });

  it('rejects missing reporter, target, category, or reason', () => {
    expect(
      validateReportDraft({
        reporterId: '',
        target: baseTarget({ id: '' }),
        category: '',
        reason: ' '
      })
    ).toEqual({
      isValid: false,
      error: 'Completa la categoría y el motivo antes de enviar el reporte.'
    });
  });

  it('rejects self-reports when the target owner matches the trimmed reporter id', () => {
    expect(
      validateReportDraft({
        reporterId: ' me ',
        target: baseTarget({ type: 'user', id: 'me', ownerId: '  me  ' }),
        category: 'other',
        reason: 'No debería poder reportarme.'
      })
    ).toEqual({
      isValid: false,
      error: 'No puedes reportarte a ti misma/o.'
    });
  });

  it('rejects unsupported target types', () => {
    expect(
      validateReportDraft({
        reporterId: 'reporter-1',
        target: { ...baseTarget(), type: 'comment' as ReportTarget['type'] },
        category: 'other',
        reason: 'Texto válido'
      })
    ).toEqual({
      isValid: false,
      error: 'No pudimos identificar qué quieres reportar. Inténtalo de nuevo.'
    });
  });

  it('rejects unsupported categories', () => {
    expect(
      validateReportDraft({
        reporterId: 'reporter-1',
        target: baseTarget(),
        category: 'fake-category',
        reason: 'Texto válido'
      })
    ).toEqual({
      isValid: false,
      error: 'Selecciona una categoría válida para el reporte.'
    });
  });

  it('rejects reasons longer than the modal limit', () => {
    expect(
      validateReportDraft({
        reporterId: 'reporter-1',
        target: baseTarget(),
        category: 'other',
        reason: 'x'.repeat(MAX_REPORT_REASON_LENGTH + 1)
      })
    ).toEqual({
      isValid: false,
      error: `El motivo no puede superar los ${MAX_REPORT_REASON_LENGTH} caracteres.`
    });
  });
});

describe('buildReportInsert', () => {
  it('creates the reports row payload with normalized target metadata', () => {
    expect(
      buildReportInsert({
        reporterId: 'reporter-1',
        target: baseTarget({ type: 'message', id: 'message-9', ownerId: 'author-9' }),
        category: 'harassment',
        reason: '  Insultos directos en el chat  '
      })
    ).toEqual({
      reporter_id: 'reporter-1',
      target_type: 'message',
      target_id: 'message-9',
      category: 'harassment',
      reason: 'Insultos directos en el chat'
    });
  });

  it('throws when asked to build an invalid report payload', () => {
    expect(() =>
      buildReportInsert({
        reporterId: 'reporter-1',
        target: baseTarget(),
        category: '',
        reason: ''
      })
    ).toThrow('Completa la categoría y el motivo antes de enviar el reporte.');
  });
});

describe('toReportSubmitErrorMessage', () => {
  it('preserves specific client-side validation errors', () => {
    expect(toReportSubmitErrorMessage(new Error('No puedes reportarte a ti misma/o.'))).toBe(
      'No puedes reportarte a ti misma/o.'
    );
  });

  it('maps Supabase duplicate-report errors from plain objects', () => {
    expect(
      toReportSubmitErrorMessage({
        message: 'Ya has reportado este contenido en las últimas 24 horas.'
      })
    ).toBe('Ya habías enviado un reporte para este contenido. Gracias por avisarnos.');
  });

  it('falls back to the generic submission error for unknown failures', () => {
    expect(toReportSubmitErrorMessage({ message: 'unexpected gateway timeout' })).toBe(
      'No pudimos enviar tu reporte. Inténtalo de nuevo.'
    );
  });
});
