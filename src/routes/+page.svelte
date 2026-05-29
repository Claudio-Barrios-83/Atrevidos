<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase, getUser } from '$lib/supabase';
  
  let user = null;
  let posts = [];
  let loading = true;
  let newPostContent = '';
  let publishing = false;

  onMount(async () => {
    // Verificar sesión
    const currentUser = await getUser();
    if (!currentUser) {
      goto('/login');
      return;
    }
    user = currentUser;

    // Cargar posts públicos
    await loadPosts();
  });

  async function loadPosts() {
    loading = true;
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles (username, avatar_url, display_name)
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading posts:', error);
    } else {
      posts = data || [];
    }
    loading = false;
  }

  async function createPost() {
    if (!newPostContent.trim() || !user) return;
    
    publishing = true;
    try {
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        content: newPostContent,
        visibility: 'public'
      });

      if (error) throw error;
      
      newPostContent = '';
      await loadPosts(); // Recargar feed
    } catch (err: any) {
      console.error('Error creating post:', err);
      alert('Error al crear la publicación: ' + err.message);
    } finally {
      publishing = false;
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    goto('/login');
  }
</script>

<div class="max-w-2xl mx-auto px-4 py-8">
  <header class="flex justify-between items-center mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Atrevidos</h1>
    <button
      on:click={handleSignOut}
      class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
    >
      Cerrar sesión
    </button>
  </header>

  <!-- Crear Post -->
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-6">
    <textarea
      bind:value={newPostContent}
      placeholder="¿Qué estás pensando?"
      class="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
      rows="3"
    ></textarea>
    <div class="flex justify-end mt-2">
      <button
        on:click={createPost}
        disabled={publishing || !newPostContent.trim()}
        class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if publishing}Publicando...{:else}Publicar{/if}
      </button>
    </div>
  </div>

  <!-- Feed -->
  {#if loading}
    <div class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Cargando publicaciones...</p>
    </div>
  {:else if posts.length === 0}
    <div class="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-xl">
      <p class="text-gray-500 dark:text-gray-400">Aún no hay publicaciones. ¡Sé el primero!</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each posts as post}
        <article class="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              {#if post.profiles?.avatar_url}
                <img src={post.profiles.avatar_url} alt={post.profiles.display_name || post.profiles.username} class="w-10 h-10 rounded-full object-cover" />
              {:else}
                <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold">
                  {post.profiles?.display_name?.[0] || post.profiles?.username?.[0] || 'U'}
                </div>
              {/if}
            </div>
            <div class="flex-grow">
              <div class="flex items-center space-x-2">
                <span class="font-semibold text-gray-900 dark:text-white">
                  {post.profiles?.display_name || post.profiles?.username || 'Anónimo'}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(post.created_at).toLocaleDateString()}
                </span>
              </div>
              <p class="mt-2 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{post.content}</p>
              
              <div class="mt-4 flex items-center space-x-6 text-gray-500 dark:text-gray-400 text-sm">
                <button class="hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center space-x-1">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                  <span>{post.like_count || 0}</span>
                </button>
                <button class="hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center space-x-1">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                  <span>{post.comment_count || 0}</span>
                </button>
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>