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

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-dark-900 via-dark-900 to-primary-900 px-4 py-12">
	<div class="w-full max-w-md">
		<a href="/welcome" class="mb-8 flex items-center justify-center gap-2">
			<span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-xl font-bold text-white">A</span>
			<span class="text-2xl font-extrabold tracking-tight text-white">Atrevidos</span>
		</a>

		<form onsubmit={handleSubmit} class="flex flex-col space-y-4 rounded-3xl bg-white p-8 shadow-2xl dark:bg-dark-800">
			<h1 class="text-center text-2xl font-bold text-gray-900 dark:text-white">{mode === 'login' ? 'Bienvenida/o de nuevo' : 'Crear tu cuenta'}</h1>
			<p class="text-center text-sm text-gray-500 dark:text-gray-400">
				{mode === 'login' ? 'Ingresá para seguir conectando' : 'Solo para personas mayores de 18 años'}
			</p>

			<input bind:value={email} type="email" placeholder="Email" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" />
			<input bind:value={password} type="password" placeholder="Contraseña" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" />

			{#if mode === 'register'}
				<input bind:value={username} type="text" placeholder="Nombre de usuario" class="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900 dark:text-white" />
			{/if}

			<button type="submit" class="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading}>
				{#if loading}
					<span class="animate-pulse">Procesando...</span>
				{:else}
					{mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
				{/if}
			</button>

			{#if successMessage}
				<div class="rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
					{successMessage}
				</div>
			{/if}

			{#if error}
				<ErrorState message={error} />
			{/if}

			<button type="button" class="text-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400" onclick={() => {
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
	</div>
</div>
