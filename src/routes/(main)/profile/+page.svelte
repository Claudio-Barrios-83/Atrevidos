<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase/client';
  import { auth } from '$lib';

  let profile: any = null;
  let loading = true;
  let error = '';

  onMount(async () => {
    if (!$auth.user) return;
    
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', $auth.user.id)
      .single();

    if (fetchError) {
      error = 'No pudimos cargar tu perfil.';
    } else {
      profile = data;
    }
    loading = false;
  });
</script>

<div class="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
  {#if loading}
    <p>Cargando perfil...</p>
  {:else if error}
    <p class="text-red-500">{error}</p>
  {:else if profile}
    <div class="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow dark:bg-gray-800">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{profile.display_name}</h1>
      <p class="text-gray-600 dark:text-gray-400">@{profile.username}</p>
      <p class="mt-4 text-gray-800 dark:text-gray-200">{profile.bio}</p>
      <div class="mt-4">
        <h2 class="font-semibold text-gray-900 dark:text-white">Ubicación</h2>
        <p class="text-gray-600 dark:text-gray-400">{profile.location}</p>
      </div>
      <div class="mt-4">
        <h2 class="font-semibold text-gray-900 dark:text-white">Intereses</h2>
        <p class="text-gray-600 dark:text-gray-400">{profile.interests?.join(', ')}</p>
      </div>
    </div>
  {:else}
    <p>Perfil no encontrado.</p>
  {/if}
</div>
