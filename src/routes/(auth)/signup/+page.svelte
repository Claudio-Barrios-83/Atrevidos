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

<form onsubmit={handleRegister} class="flex flex-col space-y-4 p-4">
  <h1 class="text-2xl font-bold">Registro</h1>
  <input bind:value={email} type="email" placeholder="Email" class="w-full p-2 border rounded" required />
  <input bind:value={password} type="password" placeholder="Contraseña" class="w-full p-2 border rounded" required />
  <input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full p-2 border rounded" required />
  
  <button type="submit" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" disabled={loading}>
    {#if loading}
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
    {/if}
    {loading ? 'Cargando...' : 'Registrarse'}
  </button>
  
  {#if error}
    <div class="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
  {/if}
  
  <a href="{base}/login" class="text-center text-sm text-blue-600 hover:underline">
    ¿Ya tienes cuenta? Inicia sesión
  </a>
</form>
