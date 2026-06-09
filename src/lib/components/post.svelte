<script lang="ts">
    import type { Database } from '$lib/database.types';

    export let post: Database['public']['Tables']['posts']['Row'] & {
        profiles: { username: string; avatar_url: string | null } | null;
    };
</script>

<div class="bg-white p-4 rounded-lg shadow border border-gray-100">
    <div class="flex items-center gap-2 mb-2">
        {#if post.profiles?.avatar_url}
            <img src={post.profiles.avatar_url} alt={post.profiles.username} class="w-8 h-8 rounded-full" />
        {:else}
            <div class="w-8 h-8 rounded-full bg-gray-200" />
        {/if}
        <span class="font-bold text-sm">{post.profiles?.username ?? 'Anónimo'}</span>
    </div>
    <p class="text-gray-800 text-lg">{post.content}</p>
    <div class="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-50">
        {new Date(post.created_at).toLocaleDateString()}
    </div>
</div>
