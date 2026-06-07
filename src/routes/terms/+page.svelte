<script lang="ts">
  import LegalPage from '$lib/components/legal-page.svelte';
  import { getLegalPage } from '$lib/legal';

  const page = getLegalPage('terms');
</script>

<LegalPage {page} />
