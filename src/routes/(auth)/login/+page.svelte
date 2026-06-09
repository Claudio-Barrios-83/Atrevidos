<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    loading = true;
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    loading = false;
    if (err) {
      error = err.message;
      return;
    }
    goto(base, { invalidateAll: true });
  }

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      goto(base, { invalidateAll: true });
    }
  });
</script>

<form onsubmit={handleLogin} class="flex flex-col space-y-4 p-4">
  <h1 class="text-2xl font-bold">Iniciar sesión</h1>
  <input bind:value={email} type="email" placeholder="Email" class="w-full p-2 border rounded" required />
  <input bind:value={password} type="password" placeholder="Contraseña" class="w-full p-2 border rounded" required />
  <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded" disabled={loading}>
    {loading ? 'Cargando...' : 'Iniciar sesión'}
  </button>
  {#if error}
    <div class="text-red-500">{error}</div>
  {/if}
  <a href="{base}/signup" class="text-blue-500 hover:underline">¿No tienes cuenta? Regístrate</a>
</form>
