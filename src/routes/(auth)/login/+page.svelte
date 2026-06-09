<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';

  let isLogin = $state(true);
  let email = $state('');
  let password = $state('');
  let username = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    if (isLogin) {
      loading = true;
      const { data, error: err } = await supabase.auth.signInWithPassword({
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
  }

  async function handleRegister() {
    if (!isLogin) {
      loading = true;
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
        return;
      }
      // On success, redirect to login
      goto(base, { invalidateAll: true });
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  }

  function toggleForm() {
    isLogin = !isLogin;
  }

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      goto(base, { invalidateAll: true });
    }
  });
</script>

<form onsubmit={handleSubmit} class="flex flex-col space-y-4 p-4">
  <h1 class="text-2xl font-bold">Bienvenido a Atrevidos</h1>
  <div class="flex justify-center space-x-4">
    <button class="px-4 py-2 bg-blue-500 text-white rounded" onclick={toggleForm}>
      {isLogin ? 'Cambiar a Registro' : 'Cambiar a Inicio de sesión'}
    </button>
  </div>

  <div class="space-y-4">
    <div class="space-y-2">
      <input
        bind:value={email}
        type="text"
        placeholder="Email"
        class="w-full p-2 border rounded"
      />
      <input
        bind:value={password}
        type="password"
        placeholder="Contraseña"
        class="w-full p-2 border rounded"
      />
    </div>
    {#if !isLogin}
      <div class="space-y-2">
        <input
          bind:value={username}
          type="text"
          placeholder="Nombre de usuario"
          class="w-full p-2 border rounded"
        />
      </div>
    {/if}
    <button type="submit" class="px-4 py-2 bg-green-500 text-white rounded">
      {isLogin ? 'Iniciar sesión' : 'Registrarse'}
    </button>
  </div>

  {#if error}
    <div class="text-red-500">{error}</div>
  {/if}
</form>