<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { supabase } from '$lib/supabase/client';
  import { onMount } from 'svelte';

  let email = $state('');
  let password = $state('');
  let username = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleRegister(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = '';
    
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        }
      }
    });
    
    loading = false;
    
    if (err) {
      error = err.message;
      loading = false;
      return;
    }
    
    alert('Registro exitoso. Por favor, revisa tu correo electrónico para confirmar tu cuenta.');
    goto(`${base}/login`);
  }

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      goto(`${base}/feed`, { replaceState: true });
    }
  });
</script>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-dark-900 via-dark-900 to-primary-900 px-4 py-12">
  <div class="w-full max-w-md">
    <a href="/welcome" class="mb-8 flex items-center justify-center gap-2">
      <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-xl font-bold text-white">A</span>
      <span class="text-2xl font-extrabold tracking-tight text-white">Atrevidos</span>
    </a>

    <form onsubmit={handleRegister} class="flex flex-col space-y-4 rounded-3xl bg-white p-8 shadow-2xl dark:bg-dark-800">
      <h1 class="text-center text-2xl font-bold text-gray-900 dark:text-white">Crear tu cuenta</h1>
      <p class="text-center text-sm text-gray-500 dark:text-gray-400">Solo para personas mayores de 18 años</p>

      <input bind:value={email} type="email" placeholder="Email" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" required />
      <input bind:value={password} type="password" placeholder="Contraseña" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" required />
      <input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" required />

      <button type="submit" class="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading}>
        {#if loading}
          <div class="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
        {/if}
        {loading ? 'Cargando...' : 'Registrarse'}
      </button>

      {#if error}
        <div class="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</div>
      {/if}

      <a href="{base}/login" class="text-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
        ¿Ya tienes cuenta? Inicia sesión
      </a>
    </form>
  </div>
</div>
