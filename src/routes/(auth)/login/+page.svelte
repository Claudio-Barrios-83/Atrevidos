<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase/client';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	let email = $state('');
	let password = $state('');
	let username = $state('');
	let error = $state('');
	let loading = $state(false);
	let mode = $state<'login' | 'register'>('login');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		error = '';

		try {
			if (mode === 'login') {
				const { error: err } = await supabase.auth.signInWithPassword({ email, password });
				if (err) throw err;
			} else {
				const { error: err } = await supabase.auth.signUp({
					email,
					password,
					options: { data: { username } }
				});
				if (err) throw err;
			}
			goto(`${base}/feed`, { replaceState: true });
		} catch (e: any) {
			error = e.message || 'Ocurrió un error inesperado';
			console.error('Auth error:', e);
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		const { data } = await supabase.auth.getSession();
		if (data.session) {
			goto(`${base}/feed`, { replaceState: true });
		}
	});
</script>

<form onsubmit={handleSubmit} class="flex flex-col space-y-4 p-4">
	<h1 class="text-2xl font-bold">{mode === 'login' ? 'Iniciar sesión' : 'Registro'}</h1>

	<input bind:value={email} type="email" placeholder="Email" class="w-full p-2 border rounded" required />
	<input bind:value={password} type="password" placeholder="Contraseña" class="w-full p-2 border rounded" required />

	{#if mode === 'register'}
		<input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full p-2 border rounded" required />
	{/if}

	<button type="submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" disabled={loading}>
		{#if loading}
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
		{/if}
		{loading ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
	</button>

	{#if error}
		<div class="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
	{/if}

	<button type="button" class="text-center text-sm text-blue-600 hover:underline" onclick={() => mode = mode === 'login' ? 'register' : 'login'}>
		{mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
	</button>
</form>
