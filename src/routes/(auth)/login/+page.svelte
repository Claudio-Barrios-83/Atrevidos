<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase/index';

  let isLogin = $state(true);
  let email = $state('');
  let password = $state('');
  let username = $state('');
  let error = $state('');
  let loading = $state(false);

  function toggleMode(event: Event) {
      event.preventDefault();
      isLogin = !isLogin;
      error = '';
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    loading = true;
    error = '';
    
    if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        loading = false;
        if (err) { error = err.message; return; }
        goto('/feed', { replaceState: true });
    } else {
        const { error: err } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });
        loading = false;
        if (err) { error = err.message; return; }
        // Success message instead of auto-login or resetting
        alert('Registro exitoso. Por favor, revisa tu correo electrónico para confirmar tu cuenta.');
        isLogin = true;
        email = '';
        password = '';
        username = '';
    }
  }
</script>

<form onsubmit={handleSubmit} class="flex flex-col space-y-4 p-4">
  <h1 class="text-2xl font-bold">{isLogin ? 'Iniciar sesión' : 'Registro'}</h1>
  <input bind:value={email} type="email" placeholder="Email" class="w-full p-2 border rounded" required />
  <input bind:value={password} type="password" placeholder="Contraseña" class="w-full p-2 border rounded" required />
  {#if !isLogin}
    <input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full p-2 border rounded" required />
  {/if}
  <button type="submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition" disabled={loading}>
    {loading ? 'Cargando...' : (isLogin ? 'Iniciar sesión' : 'Registrarse')}
  </button>
  {#if error}
    <div class="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
  {/if}
  <button type="button" onclick={(e) => toggleMode(e)} class="text-center text-sm text-blue-600 hover:underline">
    {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
  </button>
</form>
