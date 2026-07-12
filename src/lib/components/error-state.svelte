<script lang="ts">
  export let message: string = 'Ocurrió un error. Inténtalo de nuevo.';
  export let retry: (() => void) | undefined = undefined;
</script>

<div class="rounded-xl bg-red-50 p-6 text-center shadow-sm dark:bg-red-950/30 border border-red-100 dark:border-red-900/50">
  <p class="text-sm text-red-700 dark:text-red-300">{message}</p>
  {#if retry}
    <button
      type="button"
      on:click={retry}
      class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700"
    >
      Reintentar
    </button>
  {/if}
</div>
