<script lang="ts">
	import { supabase } from '$lib/supabase/client';
	import type { Database } from '$lib/database.types';
	import { onMount } from 'svelte';
	import Post from '$lib/components/post.svelte';
	import {
		buildHomepageFeedQuery,
		normalizeHomepageFeedPost,
		parseHomepagePublicFeedRows,
		type HomepageFeedPost
	} from '$lib/feed';

	let posts: HomepageFeedPost[] = [];
	let loading = true;
	let error: string | null = null;
	const FEED_PAGE_SIZE = 20;

	onMount(async () => {
		try {
			const { data, error: fetchError } = await buildHomepageFeedQuery(supabase, FEED_PAGE_SIZE);

			if (fetchError) throw fetchError;
			posts = parseHomepagePublicFeedRows(data).map(normalizeHomepageFeedPost);
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
		<div class="flex flex-col items-center justify-center p-12 text-center text-gray-500">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
			<p>Cargando posts...</p>
		</div>
	{:else if error}
		<div class="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg text-center">
			<p class="font-bold">Error al cargar el feed</p>
			<p class="text-sm mt-1">{error}</p>
			<button class="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700" onclick={() => location.reload()}>Reintentar</button>
		</div>
	{:else if posts.length === 0}
		<div class="flex flex-col items-center justify-center p-12 text-center text-gray-500">
			<p class="text-lg">No hay posts todavía.</p>
			<p class="text-sm mt-2">¡Sé el primero en compartir algo!</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#each posts as post}
				<Post {post} />
			{/each}
		</div>
	{/if}
</div>
