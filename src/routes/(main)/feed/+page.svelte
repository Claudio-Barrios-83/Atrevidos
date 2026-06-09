<script lang="ts">
	import { supabase } from '$lib/supabase/client';
	import type { Database } from '$lib/database.types';
	import { onMount } from 'svelte';
    import Post from '$lib/components/post.svelte';

	type PostWithProfile = Database['public']['Tables']['posts']['Row'] & {
		profiles: { username: string; avatar_url: string | null } | null;
	};

	let posts: PostWithProfile[] = [];
	let loading = true;
	let error: string | null = null;

	onMount(async () => {
		try {
			const { data, error: fetchError } = await supabase
				.from('posts')
				.select('*, profiles(username, avatar_url)')
				.order('created_at', { ascending: false });

			if (fetchError) throw fetchError;
			posts = data as PostWithProfile[];
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	});
</script>

<div class="max-w-2xl mx-auto p-4">
	<h1 class="text-2xl font-bold mb-6">Feed</h1>

	{#if loading}
		<p class="text-gray-500">Cargando posts...</p>
	{:else if error}
		<p class="text-red-500">Error: {error}</p>
	{:else if posts.length === 0}
		<p class="text-gray-500">No hay posts todavía.</p>
	{:else}
		<div class="space-y-6">
			{#each posts as post}
				<Post {post} />
			{/each}
		</div>
	{/if}
</div>
