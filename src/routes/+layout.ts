import { browser } from '$app/environment';
import { supabase } from '$lib/supabase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
  let session = null;

  if (browser) {
    session = (await supabase.auth.getSession()).data.session;
  }

  return {
    session
  };
};