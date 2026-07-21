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
</script>

<div class="min-h-screen bg-gray-50 dark:bg-dark-900">
  <!-- Sidebar: navegación fija estilo D4Swing/Sexlog (icono + etiqueta) -->
  <aside
    class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-200 bg-white px-4 py-6 lg:flex dark:border-dark-700 dark:bg-dark-900"
  >
    <a href="/" class="mb-8 flex items-center gap-2 px-2">
      <span
        class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white"
        >A</span
      >
      <span class="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">Atrevidos</span>
    </a>

    <nav class="flex flex-1 flex-col gap-1">
      {#each navItems as item (item.id)}
        <a
          href={item.href}
          aria-current={active === item.id ? 'page' : undefined}
          class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            active === item.id
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-800'
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
      <p class="mb-2 truncate px-2 text-xs text-gray-400 dark:text-gray-500">{$auth.user.email}</p>
    {/if}

    <button
      type="button"
      on:click={() => onSignOut?.()}
      disabled={signingOut}
      class="rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-dark-800"
    >
      {#if signingOut}Cerrando…{:else}Cerrar sesión{/if}
    </button>
  </aside>

  <!-- Barra superior para mobile (la sidebar se oculta bajo lg) -->
  <header
    class="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden dark:border-dark-700 dark:bg-dark-900"
  >
    <a href="/" class="flex items-center gap-2">
      <span
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-bold text-white"
        >A</span
      >
      <span class="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">Atrevidos</span>
    </a>
    <a
      href="/subscription"
      class="rounded-lg bg-gradient-to-r from-primary-500 to-fuchsia-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
    >
      Premium
    </a>
  </header>

  <div class="lg:pl-60">
    <slot />
  </div>

  <!-- Nav inferior para mobile -->
  <nav
    class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-gray-200 bg-white px-2 py-1.5 lg:hidden dark:border-dark-700 dark:bg-dark-900"
  >
    {#each navItems as item (item.id)}
      <a
        href={item.href}
        aria-current={active === item.id ? 'page' : undefined}
        class={`flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition ${
          active === item.id ? 'text-primary-600 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'
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
