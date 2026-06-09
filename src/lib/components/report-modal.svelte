<script lang="ts">
  import { tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import {
    MAX_REPORT_REASON_LENGTH,
    buildReportInsert,
    REPORT_CATEGORY_OPTIONS,
    toReportSubmitErrorMessage,
    validateReportDraft,
    type ReportTarget
  } from '$lib/reports';
  import { supabase } from '$lib/supabase';

  export let open = false;
  export let reporterId: string | null = null;
  export let target: ReportTarget | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    submitted: { message: string; target: ReportTarget };
  }>();

  let category = '';
  let reason = '';
  let submitting = false;
  let submitError = '';
  let dialogElement: HTMLDivElement | null = null;
  let categorySelect: HTMLSelectElement | null = null;
  let previouslyFocusedElement: HTMLElement | null = null;

  $: reportDraftValidation = validateReportDraft({
    reporterId,
    target,
    category,
    reason
  });
  $: canSubmit = reportDraftValidation.isValid && !submitting;

  function resetForm() {
    category = '';
    reason = '';
    submitting = false;
    submitError = '';
  }

  function closeModal() {
    if (submitting) {
      return;
    }

    const elementToFocus = previouslyFocusedElement;
    resetForm();
    dispatch('close');
    elementToFocus?.focus();
    previouslyFocusedElement = null;
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab' || !dialogElement) {
      return;
    }

    const focusableElements = Array.from(
      dialogElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === firstElement || activeElement === dialogElement) {
        event.preventDefault();
        lastElement.focus();
      }

      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  async function focusDialog() {
    if (!open) {
      return;
    }

    await tick();
    categorySelect?.focus();
  }

  async function submitReport() {
    if (!target || submitting) {
      return;
    }

    if (!reportDraftValidation.isValid) {
      submitError = reportDraftValidation.error;
      return;
    }

    submitting = true;
    submitError = '';

    try {
      const payload = buildReportInsert({
        reporterId,
        target,
        category,
        reason
      });
      const { error } = await supabase.from('reports').insert(payload);

      if (error) {
        throw error;
      }

      const submittedTarget = target;
      const elementToFocus = previouslyFocusedElement;
      resetForm();
      dispatch('submitted', {
        message: `Gracias. Revisaremos el reporte sobre ${submittedTarget.label || 'este contenido'} lo antes posible.`,
        target: submittedTarget
      });
      elementToFocus?.focus();
      previouslyFocusedElement = null;
    } catch (error) {
      console.error('Error submitting report:', error);
      submitError = toReportSubmitErrorMessage(error);
      submitting = false;
    }
  }

  $: if (open && target) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void focusDialog();
  }

  $: if (!open) {
    resetForm();
  }
</script>

{#if open && target}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 px-4 py-6"
    role="presentation"
    on:click={(event) => {
      if (event.target === event.currentTarget) {
        closeModal();
      }
    }}
  >
    <div
      bind:this={dialogElement}
      class="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      on:keydown={handleDialogKeydown}
      tabindex="-1"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-rose-600 dark:text-rose-300">Seguridad de la comunidad</p>
          <h2 id="report-modal-title" class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            Reportar {target.label || 'contenido'}
          </h2>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Cuéntanos qué pasó. Tu reporte se enviará para revisión.
          </p>
        </div>

        <button
          type="button"
          on:click={closeModal}
          disabled={submitting}
          class="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <form class="mt-6 space-y-4" on:submit|preventDefault={submitReport}>
        <div>
          <label for="report-category" class="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Motivo del reporte
          </label>
          <select
            id="report-category"
            bind:this={categorySelect}
            bind:value={category}
            disabled={submitting}
            required
            aria-invalid={submitError && !category ? 'true' : undefined}
            class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value="">Selecciona una opción</option>
            {#each REPORT_CATEGORY_OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="report-reason" class="mb-2 block text-sm font-semibold text-gray-900 dark:text-white">
            Cuéntanos un poco más
          </label>
          <textarea
            id="report-reason"
            bind:value={reason}
            rows="5"
            maxlength={MAX_REPORT_REASON_LENGTH}
            disabled={submitting}
            required
            aria-invalid={submitError && !reason.trim() ? 'true' : undefined}
            placeholder="Ej. Está enviando insultos o compartiendo contenido ofensivo."
            class="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          ></textarea>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">{reason.trim().length}/{MAX_REPORT_REASON_LENGTH} caracteres</p>
        </div>

        {#if submitError}
          <p
            class="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300"
            role="alert"
            aria-live="polite"
          >
            {submitError}
          </p>
        {/if}

        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            on:click={closeModal}
            disabled={submitting}
            class="inline-flex items-center justify-center rounded-2xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            class="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {#if submitting}Enviando reporte…{:else}Enviar reporte{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
