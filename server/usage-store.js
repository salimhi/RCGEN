import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Extracts and anonymizes client IP address using SHA-256 with salt.
 */
export function getClientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = 'local';
  if (forwarded) {
    const parts = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',');
    ip = parts[0]?.trim() || 'local';
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }

  const salt = process.env.LIMIT_SALT || 'rc-generation-salt-default';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex');
}

/**
 * Local file-backed usage store (used in local development mode only).
 * Never touches filesystem if process.env.VERCEL is set.
 */
class LocalUsageStore {
  constructor() {
    this.dirPath = path.join(process.cwd(), '.data');
    this.filePath = path.join(this.dirPath, 'usage.json');
    this.state = {
      requests: [], // { clientKey, timestamp }
      aiGenerations: [] // { clientKey, timestamp }
    };
    this.load();
  }

  load() {
    if (process.env.VERCEL) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.requests) && Array.isArray(parsed.aiGenerations)) {
          this.state = parsed;
          this.cleanup();
          return;
        }
      }
    } catch (err) {
      console.warn('[UsageStore] Could not read .data/usage.json, re-initializing:', err.message);
    }
    this.save();
  }

  save() {
    if (process.env.VERCEL) return;
    try {
      if (!fs.existsSync(this.dirPath)) {
        fs.mkdirSync(this.dirPath, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[UsageStore] Failed to persist usage state to .data/usage.json:', err.message);
    }
  }

  cleanup() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.state.requests = this.state.requests.filter((r) => r.timestamp > oneDayAgo);
    this.state.aiGenerations = this.state.aiGenerations.filter((g) => g.timestamp > oneDayAgo);
  }

  async checkLimits(clientKey) {
    this.cleanup();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Check rate limit: > 60 total generate requests per hour per client
    const recentRequests = this.state.requests.filter(
      (r) => r.clientKey === clientKey && r.timestamp > oneHourAgo
    );
    if (recentRequests.length >= 60) {
      return { allowed: false, rateLimited: true, canUseAi: false };
    }

    // Record request
    this.state.requests.push({ clientKey, timestamp: now });

    // Check AI hourly cap per client (default 10)
    const hourlyCap = parseInt(process.env.AI_HOURLY_CAP || '10', 10);
    const clientHourlyAi = this.state.aiGenerations.filter(
      (g) => g.clientKey === clientKey && g.timestamp > oneHourAgo
    );

    // Check AI daily cap globally (default 100)
    const dailyCap = parseInt(process.env.AI_DAILY_CAP || '100', 10);
    const globalDailyAi = this.state.aiGenerations.filter((g) => g.timestamp > oneDayAgo);

    const canUseAi = clientHourlyAi.length < hourlyCap && globalDailyAi.length < dailyCap;
    this.save();

    return {
      allowed: true,
      rateLimited: false,
      canUseAi,
      reason: canUseAi ? null : 'limit_reached',
      recordAiSuccess: async () => {
        this.state.aiGenerations.push({ clientKey, timestamp: Date.now() });
        this.save();
      }
    };
  }
}

/**
 * Database usage store (used on Vercel or when Supabase is configured).
 */
class DatabaseUsageStore {
  constructor(getSupabaseClient) {
    this.getSupabaseClient = getSupabaseClient;
  }

  async checkLimits(clientKey) {
    try {
      const supabase = this.getSupabaseClient();
      if (!supabase) {
        return { allowed: true, canUseAi: false, reason: 'limit_reached' };
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Check request rate limit: > 60 total requests from this client in past hour
      const { count: reqCount, error: reqErr } = await supabase
        .from('rc_generation_log')
        .select('*', { count: 'exact', head: true })
        .eq('client_key', clientKey)
        .gte('created_at', oneHourAgo);

      if (reqErr) throw reqErr;
      if (reqCount && reqCount >= 60) {
        return { allowed: false, rateLimited: true, canUseAi: false };
      }

      // Check AI hourly cap per client
      const hourlyCap = parseInt(process.env.AI_HOURLY_CAP || '10', 10);
      const { count: clientAiCount, error: clientErr } = await supabase
        .from('rc_generation_log')
        .select('*', { count: 'exact', head: true })
        .eq('client_key', clientKey)
        .eq('used_ai', true)
        .gte('created_at', oneHourAgo);

      if (clientErr) throw clientErr;

      // Check global daily cap
      const dailyCap = parseInt(process.env.AI_DAILY_CAP || '100', 10);
      const { count: globalAiCount, error: globalErr } = await supabase
        .from('rc_generation_log')
        .select('*', { count: 'exact', head: true })
        .eq('used_ai', true)
        .gte('created_at', oneDayAgo);

      if (globalErr) throw globalErr;

      const canUseAi = (clientAiCount || 0) < hourlyCap && (globalAiCount || 0) < dailyCap;

      return {
        allowed: true,
        rateLimited: false,
        canUseAi,
        reason: canUseAi ? null : 'limit_reached',
        recordAiSuccess: async () => {
          try {
            await supabase.from('rc_generation_log').insert({
              client_key: clientKey,
              used_ai: true,
              created_at: new Date().toISOString()
            });
          } catch (insertErr) {
            console.error('[UsageStore] Failed to record AI success in database:', insertErr.message);
          }
        }
      };
    } catch (err) {
      console.error('[UsageStore] Database read failed, failing closed for AI:', err.message);
      // Fail closed: skip AI, use rule-based
      return {
        allowed: true,
        rateLimited: false,
        canUseAi: false,
        reason: 'limit_reached',
        recordAiSuccess: async () => {}
      };
    }
  }
}

let localStoreInstance = null;

export function getUsageStore(isSupabaseMode, getSupabaseClient) {
  if (isSupabaseMode || process.env.VERCEL) {
    return new DatabaseUsageStore(getSupabaseClient);
  }
  if (!localStoreInstance) {
    localStoreInstance = new LocalUsageStore();
  }
  return localStoreInstance;
}

