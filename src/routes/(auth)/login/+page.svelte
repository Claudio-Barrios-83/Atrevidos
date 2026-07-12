<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase/client';
	import { base } from '$app/paths';
	import ErrorState from '$lib/components/error-state.svelte';
	import LoadingState from '$lib/components/loading-state.svelte';

	let email = $state('');
	let password = $state('');
	let username = $state('');
	let error = $state<string>('');
	let successMessage = $state<string>('');
	let loading = $state<boolean>(false);
	let mode = $state<'login' | 'register'>('login');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		
		loading = true;
		error = '';
		successMessage = '';

		// Basic validation
		if (!email || !password || (mode === 'register' && !username)) {
			error = 'Por favor, completa todos los campos';
			loading = false;
			return;
		}

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
				successMessage = 'Registro exitoso. Por favor verifica tu correo si es necesario.';
			}
			if (mode === 'login') {
				goto(`${base}/feed`, { replaceState: true });
			}
		} catch (e: unknown) {
			const err = e as Error;
			error = err.message || 'Ocurrió un error inesperado';
			console.error('Auth error:', e);
		} finally {
			loading = false;
		}
	}
</script>

<form onsubmit={handleSubmit} class="flex flex-col space-y-4 p-4">
	<h1 class="text-2xl font-bold">{mode === 'login' ? 'Iniciar sesión' : 'Registro'}</h1>

	<input bind:value={email} type="email" placeholder="Email" class="w-full p-2 border rounded" />
	<input bind:value={password} type="password" placeholder="Contraseña" class="w-full p-2 border rounded" />

	{#if mode === 'register'}
		<input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full p-2 border rounded" />
	{/if}

	<button type="submit" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-10" disabled={loading}>
		{#if loading}
			<span class="animate-pulse">Procesando...</span>
		{:else}
			{mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
		{/if}
	</button>

	{#if successMessage}
		<div class="p-3 text-sm text-green-700 bg-green-100 rounded">
			{successMessage}
		</div>
	{/if}

	{#if error}
		<ErrorState message={error} />
	{/if}

	<button type="button" class="text-center text-sm text-blue-600 hover:underline" onclick={() => {
		error = '';
		successMessage = '';
		mode = mode === 'login' ? 'register' : 'login';
		email = '';
		password = '';
		username = '';
	}}>
		{mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
	</button>
</form>
