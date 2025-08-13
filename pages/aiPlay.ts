import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Unified AI play endpoint with detailed, per-call debug logs.
 * - Instruments Moonshot Kimi calls (kimi / kimi2) with status, latency, request/response previews, retries.
 * - Returns meta.debug containing structured diagnostics for every invocation.
 * - Always validates JSON and falls back with an explicit reason.
 *
 * Request (POST):
 *  { hand: string[], ai: 'kimi'|'kimi2'|'grok'|'gemini'|'local', keys?: { kimi?:string; kimi2?:string; grok?:string; gemini?:string }, snapshot?: any, debug?: boolean }
 *
 * Response (200):
 *  { tile: string, reason: string, meta: { usedApi: boolean, provider: string, detail: string, debug?: DebugInfo } }
 */

type Keys = { kimi?: string; kimi2?: string; gemini?: string; grok?: string };
type DebugInfo = {
  provider: string;
  model?: string;
  url?: string;
  requestId?: string;
  status?: number;
  latencyMs?: number;
  retries?: number;
  requestPreview?: string;
  responsePreview?: string;
  parseError?: string;
  tileValidated?: boolean;
  warn?: string;
};

function extractFirstJson(text: string): any | null {
  // Robustly extract the first {...} JSON object
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    try { return JSON.parse(slice); } catch {}
  }
  // Try relaxed: match code fence JSON
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

async function callMoonshot(key: string, hand: string[], snapshot: any, seatLabel: string, debugWanted: boolean) {
  const start = Date.now();
  const url = 'https://api.moonshot.cn/v1/chat/completions';
  const model = 'moonshot-v1-8k'; // you may switch to -32k if needed
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const body = {
    model,
    messages: [
      { role: 'system', content: 'Only respond with JSON.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 128,
    stream: false
  };

  let respText = '';
  let status = 0;
  let requestId = '';
  let parseError = '';
  let usedRetry = 0;

  const doOnce = async () => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    status = resp.status;
    requestId = resp.headers.get('x-request-id') || resp.headers.get('x-moonshot-request-id') || '';
    respText = await resp.text();
    return respText;
  };

  try {
    // First attempt
    await doOnce();
    // Retry on rate limit / transient server errors
    if ([408, 409, 429, 500, 502, 503, 504].includes(status)) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
      usedRetry = 1;
      await doOnce();
    }
  } catch (e: any) {
    parseError = `network_error: ${String(e?.message || e)}`;
  }

  let json: any = null;
  if (!parseError) {
    try {
      const asJson = JSON.parse(respText);
      const text = asJson?.choices?.[0]?.message?.content ?? '';
      json = extractFirstJson(String(text || respText));
      if (!json) {
        parseError = 'no_json_in_response';
      }
    } catch {
      // Not pure JSON body; try to extract JSON from raw text
      json = extractFirstJson(respText);
      if (!json) parseError = 'invalid_json_body_and_no_extractable_json';
    }
  }

  let picked = hand[0] || '';
  let reason = 'fallback';
  let tileValidated = false;
  let warn = '';

  if (json && typeof json === 'object') {
    const tile = String(json.tile || '').trim();
    const norm = tile;
    if (tile && hand.includes(norm)) {
      picked = norm;
      reason = String(json.reason || 'API');
      tileValidated = true;
    } else {
      warn = `tile_not_in_hand: "${tile}"`;
    }
  }

  const debug: DebugInfo = {
    provider: 'moonshot',
    model,
    url,
    status,
    requestId,
    retries: usedRetry,
    latencyMs: Date.now() - start,
    requestPreview: debugWanted ? JSON.stringify(body).slice(0, 600) : undefined,
    responsePreview: debugWanted ? String(respText || '').slice(0, 800) : undefined,
    parseError: parseError || undefined,
    tileValidated,
    warn: warn || undefined,
  };

  return { tile: picked, reason, meta: { usedApi: true, provider: 'moonshot', detail: seatLabel, debug } };
}

function localHeuristic(hand: string[]) {
  // Very simple local fallback
  if (!hand || hand.length === 0) return { tile: '', reason: 'no hand', meta: { usedApi: false, provider: 'local', detail: 'no hand' } };
  // Drop the first tile as a naive fallback
  return { tile: hand[0], reason: 'fallback (local heuristic)', meta: { usedApi: false, provider: 'local', detail: 'local heuristic' } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { hand, ai, keys, snapshot, debug } = req.body || {};
    if (!Array.isArray(hand) || hand.length === 0) return res.status(400).json({ error: 'hand required' });

    const ks: Keys = keys || {};
    const wantDebug = !!debug;

    if (ai === 'kimi2' && ks.kimi2) {
      const r = await callMoonshot(ks.kimi2, hand, snapshot, 'kimi2 seat', wantDebug);
      return res.status(200).json(r);
    }
    if (ai === 'kimi' && ks.kimi) {
      const r = await callMoonshot(ks.kimi, hand, snapshot, 'kimi seat', wantDebug);
      return res.status(200).json(r);
    }

    // passthrough placeholders: not instrumented here
    if (ai === 'grok' && ks.grok) {
      return res.status(200).json({ tile: hand[0], reason: 'not implemented in this patch', meta: { usedApi: false, provider: 'xai', detail: 'grok seat' } });
    }
    if (ai === 'gemini' && ks.gemini) {
      return res.status(200).json({ tile: hand[0], reason: 'not implemented in this patch', meta: { usedApi: false, provider: 'gemini', detail: 'gemini seat' } });
    }

    return res.status(200).json(localHeuristic(hand));
  } catch (e: any) {
    return res.status(200).json({
      tile: (req.body?.hand || [])[0],
      reason: 'fallback (server error)',
      meta: { usedApi: false, provider: 'error', detail: String(e?.message || 'error') }
    });
  }
}
