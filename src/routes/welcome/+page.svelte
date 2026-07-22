<script lang="ts">
  import heroImage from '$lib/assets/landing-hero-sensual.png';

  const highlights = [
    { label: 'Feed y matches', value: '100% activos' },
    { label: 'Chat en tiempo real', value: 'Sin demoras' },
    { label: 'Privacidad', value: 'Solo para logueados' },
    { label: 'Lanzamiento', value: 'Argentina 🇦🇷 y Brasil 🇧🇷' }
  ];

  const features = [
    {
      title: 'Descubrí gente afín',
      description: 'Explorá perfiles reales con filtros por ubicación, intereses e intención de relación.',
      icon: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z'
    },
    {
      title: 'Matches mutuos',
      description: 'Dale like, super-like, y cuando el interés es mutuo se abre el chat automáticamente.',
      icon: 'M12 21s-7.5-4.5-10-9.5C.5 7 3 3 7 3c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 5 8.5-2.5 5-10 9.5-10 9.5z'
    },
    {
      title: 'Privacidad primero',
      description: 'Nada es visible sin iniciar sesión. Podés publicar de forma anónima o solo para tus conexiones.',
      icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z'
    }
  ];
</script>

<svelte:head>
  <title>Atrevidos — Conectá con libertad</title>
</svelte:head>

<div class="min-h-screen bg-dark-900 text-white">
  <header class="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
    <div class="flex items-center gap-2">
      <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white">A</span>
      <span class="text-xl font-extrabold tracking-tight">Atrevidos</span>
    </div>
    <nav class="flex items-center gap-2 sm:gap-4">
      <a href="/privacy" class="hidden text-sm text-gray-300 hover:text-white sm:inline">Privacidad</a>
      <a href="/safety" class="hidden text-sm text-gray-300 hover:text-white sm:inline">Seguridad</a>
      <a href="/login" class="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">Entrar</a>
      <a href="/signup" class="rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition hover:brightness-110">Crear cuenta</a>
    </nav>
  </header>

  <!-- Hero -->
  <section class="relative overflow-hidden">
    <!-- Imagen artística de fondo (silueta editorial, sin contenido explícito),
         con capas de gradiente encima para que el texto siga siendo 100%
         legible sobre cualquier parte de la foto. -->
    <img
      src={heroImage}
      alt="Pareja abrazada en una silueta artística con iluminación dramática rosa y violeta"
      class="absolute inset-0 h-full w-full object-cover object-center opacity-60"
      loading="eager"
      fetchpriority="high"
    />
    <div class="absolute inset-0 bg-gradient-to-b from-dark-900/70 via-dark-900/85 to-dark-900"></div>
    <div class="absolute inset-0 bg-gradient-to-r from-dark-900 via-dark-900/40 to-dark-900/80"></div>
    <div class="absolute inset-0 bg-gradient-to-br from-primary-900/30 via-transparent to-fuchsia-900/20"></div>

    <div class="relative mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
      <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-500/30">
        Solo para mayores de 18 años
      </span>

      <h1 class="mt-6 text-4xl font-extrabold leading-tight tracking-tight drop-shadow-lg sm:text-6xl">
        Conectá con libertad,
        <span class="bg-gradient-to-r from-primary-400 to-fuchsia-400 bg-clip-text text-transparent">sin filtros de nadie más.</span>
      </h1>

      <p class="mx-auto mt-6 max-w-2xl text-lg text-gray-200 drop-shadow-md">
        Atrevidos es la red social pensada para parejas y personas liberales que buscan conexiones reales, con
        privacidad de verdad: nadie ve nada sin iniciar sesión.
      </p>

      <div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href="/signup"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-fuchsia-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-primary-500/30 transition hover:brightness-110 sm:w-auto"
        >
          Crear mi cuenta gratis →
        </a>
        <a
          href="/login"
          class="inline-flex w-full items-center justify-center rounded-xl border border-gray-500 bg-dark-900/40 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm transition hover:bg-white/10 sm:w-auto"
        >
          Ya tengo cuenta
        </a>
      </div>

      <div class="mx-auto mt-16 grid grid-cols-2 gap-6 rounded-2xl border-t border-white/10 bg-dark-900/30 p-6 pt-10 backdrop-blur-sm sm:grid-cols-4">
        {#each highlights as item}
          <div>
            <p class="text-xl font-extrabold text-primary-400 sm:text-2xl">{item.value}</p>
            <p class="mt-1 text-xs text-gray-300 sm:text-sm">{item.label}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="mx-auto max-w-6xl px-4 py-16">
    <div class="grid gap-6 sm:grid-cols-3">
      {#each features as feature}
        <div class="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500/15 text-primary-400">
            <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={feature.icon} />
            </svg>
          </div>
          <h3 class="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
          <p class="mt-2 text-sm text-gray-400">{feature.description}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- Premium teaser -->
  <section class="mx-auto max-w-6xl px-4 py-8 pb-20">
    <div class="flex flex-col items-center justify-between gap-6 rounded-3xl bg-gradient-to-r from-primary-600 to-fuchsia-600 p-8 text-center sm:flex-row sm:text-left">
      <div>
        <h2 class="text-2xl font-extrabold text-white">Atrevidos Premium</h2>
        <p class="mt-1 text-white/90">Super-likes ilimitados y mirá quién te dio like. Un solo plan, sin vueltas.</p>
      </div>
      <a
        href="/signup"
        class="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-bold text-primary-700 shadow-lg transition hover:brightness-95"
      >
        Empezar ahora
      </a>
    </div>
  </section>

  <footer class="border-t border-white/10 px-4 py-8">
    <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-gray-400 sm:flex-row">
      <p>&copy; {new Date().getFullYear()} Atrevidos. Comunidad adulta y responsable.</p>
      <div class="flex gap-4">
        <a href="/privacy" class="hover:text-white">Privacidad</a>
        <a href="/terms" class="hover:text-white">Términos</a>
        <a href="/safety" class="hover:text-white">Seguridad</a>
      </div>
    </div>
  </footer>
</div>
