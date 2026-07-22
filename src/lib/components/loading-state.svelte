<script lang="ts">
  export let message: string = 'Cargando...';
</script>

<div class="flex flex-col items-center justify-center py-12">
  <div class="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
  <p class="mt-4 text-sm text-gray-400">{message}</p>
</div>
