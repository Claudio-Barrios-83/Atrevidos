<script lang="ts">
	import { supabase } from '$lib/supabase/client';
	import type { Database } from '$lib/database.types';
	import { onMount } from 'svelte';
	import Post from '$lib/components/post.svelte';
	import LoadingState from '$lib/components/loading-state.svelte';
	import ErrorState from '$lib/components/error-state.svelte';
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

	async function loadPosts() {
		loading = true;
		error = null;
		try {
			const { data, error: fetchError } = await buildHomepageFeedQuery(supabase, FEED_PAGE_SIZE);

			if (fetchError) throw fetchError;
			if (data) {
				posts = parseHomepagePublicFeedRows(data).map(normalizeHomepageFeedPost);
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	onMount(loadPosts);
</script>

<div class="max-w-2xl mx-auto p-4">
	<h1 class="text-2xl font-bold mb-6">Feed</h1>

	{#if loading}
		<LoadingState message="Cargando posts..." />
	{:else if error}
		<ErrorState message="Error al cargar el feed: {error}" retry={loadPosts} />
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
