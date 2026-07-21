import ws from 'ws';

/**
 * Node.js < 22 no expone un `WebSocket` global, pero `@supabase/realtime-js`
 * intenta resolverlo al construir CUALQUIER SupabaseClient (incluso si nunca
 * se usan canales realtime), y lanza en el constructor si no lo encuentra.
 * En el navegador siempre existe `WebSocket` nativo, así que este fallback
 * solo entra en juego del lado del servidor (SSR, scripts, Node < 22).
 */
export const supabaseRealtimeTransport =
	typeof WebSocket !== 'undefined' ? WebSocket : (ws as unknown as typeof WebSocket);
