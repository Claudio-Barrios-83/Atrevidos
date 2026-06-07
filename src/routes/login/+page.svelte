<script lang="ts">
	import { goto } from '$app/navigation';
	import { LEGAL_NOTICE_LINKS } from '$lib/legal';
	import { auth } from '$lib/stores/auth';
	import { supabase } from '$lib/supabase';

	let email = '';
	let password = '';
	let isLogin = true;
	let loading = false;
	let error = '';
	let success = '';

	$: modeLabel = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
	$: submitLabel = loading ? 'Procesando…' : modeLabel;

	function generateUsername(emailAddress: string) {
		const [emailPrefix = ''] = emailAddress.split('@');
		const normalizedPrefix = emailPrefix
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');

		const safeBase = (normalizedPrefix || 'usuario').replace(/_+/g, '_');
		const suffix = `_${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
		const base = safeBase.slice(0, Math.max(3, 30 - suffix.length)).replace(/_+$/g, '') || 'usuario';

		return `${base}${suffix}`.slice(0, 30);
	}

	function getAuthErrorMessage(err: unknown, loginMode: boolean) {
		const defaultMessage = loginMode
			? 'No se pudo iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.'
			: 'No se pudo crear la cuenta. Inténtalo de nuevo en unos minutos.';

		const message = err instanceof Error ? err.message.toLowerCase() : '';

		if (!message) return defaultMessage;

		if (message.includes('email not confirmed')) {
			return 'Necesitas confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada e inténtalo nuevamente.';
		}

		if (
			message.includes('invalid login credentials') ||
			message.includes('invalid email or password')
		) {
			return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo nuevamente.';
		}

		if (message.includes('user already registered')) {
			return 'Ya existe una cuenta con este correo electrónico.';
		}

		if (
			message.includes('password should be at least') ||
			message.includes('weak password')
		) {
			return 'La contraseña debe cumplir con los requisitos mínimos de seguridad.';
		}

		if (message.includes('invalid email')) {
			return 'Ingresa un correo electrónico válido.';
		}

		if (message.includes('signup is disabled')) {
			return 'El registro no está disponible en este momento.';
		}

		if (message.includes('too many requests')) {
			return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.';
		}

		return defaultMessage;
	}

	async function handleAuth() {
		if (loading) return;

		const normalizedEmail = email.trim().toLowerCase();
		const passwordForSubmission = password;
		const submitMode = isLogin;
		const trimmedEmail = normalizedEmail.trim();

		if (!trimmedEmail || !passwordForSubmission.trim()) {
			error = 'Por favor ingresa tu correo y contraseña.';
			success = '';
			return;
		}

		email = normalizedEmail;
		loading = true;
		error = '';
		success = '';

		try {
			if (submitMode) {
				const { error: signInError } = await supabase.auth.signInWithPassword({
					email: trimmedEmail,
					password: passwordForSubmission
				});

				if (signInError) {
					throw signInError;
				}

				success = '¡Bienvenido de nuevo!';
				password = '';
				await goto('/');
				return;
			}

			const { data, error: signUpError } = await supabase.auth.signUp({
				email: trimmedEmail,
				password: passwordForSubmission,
				options: {
					data: {
						username: generateUsername(trimmedEmail)
					}
				}
			});

			if (signUpError) {
				throw signUpError;
			}

			password = '';

			if (data.session) {
				success = '¡Cuenta creada! Ya puedes empezar a publicar.';
				await goto('/');
				return;
			}

			success = '¡Cuenta creada! Revisa tu correo para verificar tu acceso antes de iniciar sesión.';
		} catch (err) {
			error = getAuthErrorMessage(err, submitMode);
		} finally {
			loading = false;
		}
	}

	function toggleMode() {
		if (loading) return;

		isLogin = !isLogin;
		error = '';
		success = '';
		password = '';
	}
</script>

{#if !$auth.initialized}
	<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
		<div class="text-center">
			<div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
			<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Comprobando tu sesión…</p>
		</div>
	</div>
{:else if $auth.user}
	<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
		<div class="text-center">
			<div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
			<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">Redirigiendo al feed…</p>
		</div>
	</div>
{:else}
	<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
		<div class="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
			<div>
				<h1 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">Atrevidos</h1>
				<h2 class="mt-2 text-center text-xl font-semibold text-gray-700 dark:text-gray-200">{modeLabel}</h2>
				<p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
					{#if isLogin}
						¿Aún no tienes cuenta?
						<button
							type="button"
							on:click={toggleMode}
							class="ml-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
						>
							Regístrate aquí
						</button>
					{:else}
						¿Ya tienes cuenta?
						<button
							type="button"
							on:click={toggleMode}
							class="ml-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
						>
							Inicia sesión
						</button>
					{/if}
				</p>
			</div>

			{#if error}
				<div class="rounded-md bg-red-50 p-4 dark:bg-red-950/40">
					<h3 class="text-sm font-medium text-red-800 dark:text-red-300">{error}</h3>
				</div>
			{/if}

			{#if success}
				<div class="rounded-md bg-green-50 p-4 dark:bg-green-950/40">
					<h3 class="text-sm font-medium text-green-800 dark:text-green-300">{success}</h3>
				</div>
			{/if}

			<form class="mt-8 space-y-6" on:submit|preventDefault={handleAuth}>
				<div class="-space-y-px rounded-md shadow-sm">
					<div>
						<label for="email" class="sr-only">Correo electrónico</label>
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							bind:value={email}
							disabled={loading}
							class="relative block w-full appearance-none rounded-t-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
							placeholder="Correo electrónico"
						/>
					</div>
					<div>
						<label for="password" class="sr-only">Contraseña</label>
						<input
							id="password"
							name="password"
							type="password"
							autocomplete={isLogin ? 'current-password' : 'new-password'}
							required
							bind:value={password}
							disabled={loading}
							minlength="6"
							class="relative block w-full appearance-none rounded-b-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:z-10 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
							placeholder="Contraseña"
						/>
					</div>
				</div>

				<div class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
					{#if isLogin}
						Inicia sesión para ver el feed y publicar.
					{:else}
						Tu nombre de usuario inicial se generará automáticamente a partir de tu correo.
					{/if}
				</div>

				<div class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
					<p>
						Al continuar puedes revisar nuestras políticas de
						{#each LEGAL_NOTICE_LINKS as link, index}
							<a
								href={link.href}
								target="_blank"
								rel="noreferrer"
								aria-label={`${link.label} (se abre en una nueva pestaña)`}
								class="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
							>
								{link.label.toLowerCase()}
								<span class="sr-only"> (se abre en una nueva pestaña)</span>
							</a>{#if index < LEGAL_NOTICE_LINKS.length - 2},{:else if index === LEGAL_NOTICE_LINKS.length - 2} y {/if}
						{/each}.
					</p>
				</div>

				<div>
					<button
						type="submit"
						disabled={loading}
						class="group relative flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if loading}
							<span class="absolute inset-y-0 left-0 flex items-center pl-3">
								<svg class="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							</span>
						{/if}
						{submitLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
