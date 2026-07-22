<script lang="ts">
  import { auth } from '$lib';

  export let active: 'feed' | 'discover' | 'matches' | 'messages' | 'profile' = 'feed';
  export let onSignOut: (() => void) | null = null;
  export let signingOut = false;

  type NavItem = {
    id: typeof active;
    href: string;
    label: string;
    icon: string;
  };

  const navItems: NavItem[] = [
    {
      id: 'feed',
      href: '/',
      label: 'Inicio',
      icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 011-1h0a1 1 0 011 1v4a1 1 0 001 1h4a1 1 0 001-1V10'
    },
    {
      id: 'discover',
      href: '/discover',
      label: 'Descubrir',
      icon: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z'
    },
    {
      id: 'matches',
      href: '/matches',
      label: 'Matches',
      icon: 'M12 21s-7.5-4.5-10-9.5C.5 7 3 3 7 3c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 5 8.5-2.5 5-10 9.5-10 9.5z'
    },
    {
      id: 'messages',
      href: '/messages',
      label: 'Mensajes',
      icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'
    },
    {
      id: 'profile',
      href: '/profile',
      label: 'Mi perfil',
      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
    }
  ];

  const signOutIcon =
    'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3h4a3 3 0 013 3v1';
</script>

<div class="relative min-h-screen bg-dark-950 text-white">
  <!-- Glow ambiental de fondo, mismo mood oscuro/sensual que /welcome -->
  <div class="pointer-events-none fixed inset-0 overflow-hidden">
    <div class="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary-700/20 blur-3xl"></div>
    <div class="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-fuchsia-700/10 blur-3xl"></div>
  </div>

  <!-- Sidebar: navegación fija estilo D4Swing/Sexlog (icono + etiqueta) -->
  <aside
    class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-dark-950/80 px-4 py-6 backdrop-blur-xl lg:flex"
  >
    <a href="/" class="mb-8 flex items-center gap-2 px-2">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white shadow-lg shadow-primary-500/30"
        >A</span
      >
      <span class="text-xl font-extrabold tracking-tight text-white">Atrevidos</span>
    </a>

    <nav class="flex flex-1 flex-col gap-1">
      {#each navItems as item (item.id)}
        <a
          href={item.href}
          aria-current={active === item.id ? 'page' : undefined}
          class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            active === item.id
              ? 'bg-gradient-to-r from-primary-500/25 to-fuchsia-500/10 text-primary-300 ring-1 ring-primary-500/30 shadow-inner'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-100'
          }`}
        >
          <svg class="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
          </svg>
          {item.label}
        </a>
      {/each}
    </nav>

    <a
      href="/subscription"
      class="mb-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-fuchsia-600 px-3 py-3 text-sm font-bold text-white shadow-md shadow-primary-500/30 transition hover:brightness-110"
    >
      <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"
        ><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.538 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.287-3.957a1 1 0 00-.363-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.285-3.958z"
        /></svg
      >
      Atrevidos Premium
    </a>

    {#if $auth.user?.email}
      <p class="mb-2 truncate px-2 text-xs text-gray-500">{$auth.user.email}</p>
    {/if}

    <button
      type="button"
      on:click={() => onSignOut?.()}
      disabled={signingOut}
      class="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={signOutIcon} />
      </svg>
      {#if signingOut}Cerrando…{:else}Cerrar sesión{/if}
    </button>
  </aside>

  <!-- Barra superior para mobile (la sidebar se oculta bajo lg) -->
  <header
    class="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-dark-950/90 px-4 py-3 backdrop-blur-xl lg:hidden"
  >
    <a href="/" class="flex items-center gap-2">
      <span
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-md shadow-primary-500/30"
        >A</span
      >
      <span class="text-lg font-extrabold tracking-tight text-white">Atrevidos</span>
    </a>
    <div class="flex items-center gap-2">
      <a
        href="/subscription"
        class="rounded-lg bg-gradient-to-r from-primary-500 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-primary-500/30"
      >
        Premium
      </a>
      <button
        type="button"
        on:click={() => onSignOut?.()}
        disabled={signingOut}
        aria-label={signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        title="Cerrar sesión"
        class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {#if signingOut}
          <div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
        {:else}
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={signOutIcon} />
          </svg>
        {/if}
      </button>
    </div>
  </header>

  <div class="relative z-10 lg:pl-60">
    <slot />
  </div>

  <!-- Nav inferior para mobile -->
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-white/5 bg-dark-950/90 px-2 py-1.5 backdrop-blur-xl lg:hidden"
  >
    {#each navItems as item (item.id)}
      <a
        href={item.href}
        aria-current={active === item.id ? 'page' : undefined}
        class={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition ${
          active === item.id ? 'text-primary-400' : 'text-gray-500'
        }`}
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
        </svg>
        {item.label}
      </a>
    {/each}
  </nav>

  <div class="h-16 lg:hidden"></div>
</div>
