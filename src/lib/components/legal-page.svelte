<script lang="ts">
  import type { LegalPage } from '$lib/legal';

  export let page: LegalPage;
</script>

<svelte:head>
  <title>{page.title} · Atrevidos</title>
  <meta name="description" content={page.summary} />
</svelte:head>

<main class="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-900">
  <div class="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-lg dark:bg-gray-800 sm:p-8">
    <p class="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">{page.eyebrow}</p>
    <h1 class="mt-3 text-3xl font-bold text-gray-900 dark:text-white">{page.title}</h1>
    <p class="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{page.summary}</p>

    <div class="mt-8 space-y-6">
      {#each page.sections as section}
        <section class="rounded-2xl bg-gray-50 p-5 dark:bg-gray-900">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{section.title}</h2>
          <div class="mt-3 space-y-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {#each section.body as paragraph}
              <p>{paragraph}</p>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
</main>
