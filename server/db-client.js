import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

let _supabaseInstance = null;

export function getSupabase() {
  if (_supabaseInstance) return _supabaseInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key || url.includes('placeholder')) {
    return null;
  }

  try {
    _supabaseInstance = createClient(url, key, {
      global: {
        fetch: async (fetchUrl, options) => {
          try {
            const res = await fetch(fetchUrl, options);
            if (!res.ok && res.status >= 500) triggerRestore();
            return res;
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 503 });
          }
        },
      },
    });
    return _supabaseInstance;
  } catch (err) {
    console.warn('[db-client] Supabase client initialization failed:', err.message);
    return null;
  }
}

export default getSupabase;

