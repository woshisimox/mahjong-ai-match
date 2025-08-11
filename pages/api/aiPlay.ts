
import type { NextApiRequest, NextApiResponse } from 'next';

type Keys = { chatgpt?: string; kimi?: string; gemini?: string; grok?: string };

type PlayResult = { tile: string; reason: string; meta: { usedApi: boolean; provider: string; detail: string } };

function safePick(hand: string[]): string {
  return Array.isArray(hand) && hand.length ? hand[0] : '';
}

function extractFirstJson(text: string): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function callOpenAI(key: string, hand: string[], snapshot: any): Promise<PlayResult> {
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' }, // ★ Force strict JSON
      messages: [
        { role: 'system', content: '只输出 JSON，包含 keys: tile, reason。不得添加任何解释或代码块。' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data: any = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content || '';
  let j = extractFirstJson(text);
  if (!j || !j.tile || !hand.includes(j.tile)) {
    return { tile: safePick(hand), reason: 'fallback (invalid JSON/tile)', meta: { usedApi: true, provider: 'openai', detail: 'chatgpt seat' } };
  }
  return { tile: j.tile, reason: j.reason || 'model', meta: { usedApi: true, provider: 'openai', detail: 'chatgpt seat' } };
}

async function callMoonshot(key: string, hand: string[], snapshot: any): Promise<PlayResult> {
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;

  const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '只输出 JSON，包含 keys: tile, reason。不得添加任何解释或代码块。' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data: any = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content || '';
  let j = extractFirstJson(text);
  if (!j || !j.tile || !hand.includes(j.tile)) {
    return { tile: safePick(hand), reason: 'fallback (invalid JSON/tile)', meta: { usedApi: true, provider: 'moonshot', detail: 'kimi seat' } };
  }
  return { tile: j.tile, reason: j.reason || 'model', meta: { usedApi: true, provider: 'moonshot', detail: 'kimi seat' } };
}

// Extremely simple local heuristic as a final fallback
function localHeuristic(hand: string[]): PlayResult {
  // prefer discarding isolated honors; then high-number suits with no neighbors
  function score(tile: string): number {
    const suit = tile.slice(-1);
    const n = parseInt(tile[0], 10);
    if (suit === 'Z') return 0; // honors first to discard
    let s = 0;
    const has = (t: string) => hand.includes(t);
    if (!isNaN(n)) {
      if (!has(`${n-1}${suit}`)) s += 1;
      if (!has(`${n+1}${suit}`)) s += 1;
      if (!has(`${n}${suit}`) || hand.filter(x => x === tile).length === 1) s += 1;
    }
    return s;
  }
  let best = hand[0];
  let bestScore = -1;
  for (const t of hand) {
    const sc = score(t);
    if (sc > bestScore) { bestScore = sc; best = t; }
  }
  return { tile: best, reason: 'local heuristic', meta: { usedApi: false, provider: 'local', detail: 'local heuristic' } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ai: string = req.body?.ai || 'chatgpt';
    const keys: Keys = req.body?.keys || {};
    const hand: string[] = req.body?.hand || [];
    const snapshot: any = req.body?.snapshot || {};

    if (ai === 'chatgpt' && keys.chatgpt) {
      const r = await callOpenAI(keys.chatgpt, hand, snapshot);
      return res.status(200).json(r);
    }
    if (ai === 'kimi' && keys.kimi) {
      const r = await callMoonshot(keys.kimi, hand, snapshot);
      return res.status(200).json(r);
    }

    // other providers could be added here (gemini/grok) — keep previous behavior by falling back to local
    return res.status(200).json(localHeuristic(hand));
  } catch (e: any) {
    return res.status(200).json({ tile: safePick(req.body?.hand || []), reason: 'fallback (error)', meta: { usedApi: false, provider: 'error', detail: String(e?.message || 'error') } });
  }
}
