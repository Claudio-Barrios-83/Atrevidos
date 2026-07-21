import type { Database } from '$lib/database.types';

export type AdminReportStatus = Database['public']['Enums']['report_status'];
export type AdminReportCategory = Database['public']['Enums']['report_category'];

export type AdminReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  category: AdminReportCategory;
  reason: string;
  status: AdminReportStatus | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  is_action_taken: boolean | null;
  created_at: string | null;
  reporter?: { id: string; username: string; display_name: string | null } | null;
};

export const REPORT_STATUS_LABELS: Record<AdminReportStatus, string> = {
  pending: 'Pendiente',
  under_review: 'En revisión',
  resolved: 'Resuelto',
  dismissed: 'Desestimado'
};

export const REPORT_CATEGORY_LABELS: Record<AdminReportCategory, string> = {
  spam: 'Spam o estafa',
  harassment: 'Acoso o amenazas',
  hate_speech: 'Discurso de odio',
  false_info: 'Información falsa',
  inappropriate_content: 'Contenido inapropiado',
  other: 'Otro motivo'
};

export function sortReportsByPriority(reports: AdminReportRow[]) {
  const statusPriority: Record<string, number> = { pending: 0, under_review: 1, resolved: 2, dismissed: 3 };

  return [...reports].sort((a, b) => {
    const priorityDiff = (statusPriority[a.status ?? 'pending'] ?? 0) - (statusPriority[b.status ?? 'pending'] ?? 0);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}
