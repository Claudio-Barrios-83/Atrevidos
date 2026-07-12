<script lang="ts">
  import { supabase } from '$lib/supabase/client';
  import { goto } from '$app/navigation';
  import { uploadPostImage } from '$lib/supabase/post-media';
  import { normalizePostImageRefs } from '$lib/post-media';
  import { auth } from '$lib';

  let content = '';
  let publishing = false;
  let error = '';

  async function createPost() {
    if (publishing) return;
    publishing = true;
    error = '';

    try {
      const user = $auth.user;
      if (!user) {
        throw new Error('Debes iniciar sesión para publicar.');
      }

      const post = {
        user_id: user.id,
        content: content.trim(),
        visibility: 'public' as const,
        image_urls: [] // Simplified for now
      };

      const { error: postError, data: newPost } = await supabase
        .from('posts')
        .insert([post])
        .select()
        .single();
      
      if (postError) throw postError;

      // Opcional: Podrías redirigir o mostrar un mensaje de éxito. 
      // Por ahora, redirigimos al feed para que el usuario vea su post.
      goto('/feed');
    } catch (e: any) {
      error = e.message;
    } finally {
      publishing = false;
    }
  }
</script>

<div class="max-w-2xl mx-auto p-4">
  <h1 class="text-2xl font-bold mb-4">Crear Post</h1>
  
  {#if error}
    <div class="bg-red-100 text-red-700 p-2 mb-4 rounded">{error}</div>
  {/if}

  <textarea 
    bind:value={content}
    class="w-full p-2 border rounded mb-4"
    placeholder="¿Qué está pasando?"
  ></textarea>

  <button 
    onclick={createPost}
    disabled={publishing}
    class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
  >
    {publishing ? 'Publicando...' : 'Publicar'}
  </button>
</div>
