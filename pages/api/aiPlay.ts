import type { NextApiRequest, NextApiResponse } from 'next';

type Keys = { kimi?: string; kimi2?: string; gemini?: string; grok?: string };
type Decide = { tile: string; reason: string };
type Snapshot = any;

function safePick(hand: string[], fallbackReason = 'fallback'): Decide {
  return { tile: hand[0], reason: fallbackReason };
}

function normalizeJson(text: string): Decide | null {
  try {
    // Strip code fences if present
    const t = text.trim().replace(/^```json|^```|```$/g, '').trim();
    const j = JSON.parse(t);
    if (j && typeof j.tile === 'string' && typeof j.reason === 'string') return j as Decide;
  } catch {}
  return null;
}

// ---------------- Kimi / Moonshot ----------------
async function callMoonshot(key: string, hand: string[], snapshot: Snapshot): Promise<Decide> {
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。
请在这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;

  const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'moonshot-v1-32k',
      messages: [
        { role: 'system', content: 'Reply only with a single-line JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  const data: any = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content || '';
  const j = normalizeJson(text);
  return j || safePick(hand, 'moonshot-fallback');
}

// ---------------- xAI Grok ----------------
async function callGrok(key: string, hand: string[], snapshot: Snapshot): Promise<Decide> {
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `You are a mahjong discard helper.
Hand: ${hand.join(' ')}.
Table snapshot: ${snap}.
Choose ONE tile to discard. Reply STRICT JSON: {"tile":"<one of hand>","reason":"why (brief)"}`;

  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [
        { role: 'system', content: 'Reply only with a single-line JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  const data: any = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content || '';
  const j = normalizeJson(text);
  return j || safePick(hand, 'grok-fallback');
}

// ---------------- Google Gemini ----------------
async function callGemini(key: string, hand: string[], snapshot: Snapshot): Promise<Decide> {
  const snap = JSON.stringify(snapshot || {}).slice(0, 1800);
  const prompt = `You are a mahjong discard helper.\nHand: ${hand.join(' ')}.\nTable snapshot: ${snap}.\nChoose ONE tile to discard. Reply STRICT JSON: {"tile":"<one of hand>","reason":"why (brief)"}\nReply only JSON.`;

  const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const data: any = await resp.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join(' ') || '';
  const j = normalizeJson(text);
  return j || safePick(hand, 'gemini-fallback');
}

// ---------------- Local heuristic ----------------
function localHeuristic(hand: string[], snapshot: Snapshot): Decide {
  const counts: Record<string, number> = {};
  for (const x of hand) counts[x] = (counts[x] || 0) + 1;
  function has(x: string) { return counts[x] > 0; }
  function val(x: string) {
    const n = parseInt(x[0]); const s = x[1];
    let v = 0;
    // 孤张/边张惩罚
    if (s !== 'Z') {
      if (!has(`${n - 1}${s}`) && !has(`${n + 1}${s}`)) v += 3;
      if (n === 1 || n === 9) v += 1;
      if (has(`${n - 2}${s}`) || has(`${n + 2}${s}`)) v += 1;
    } else {
      // 字牌少见：优先打出孤立字
      if (counts[x] === 1) v += 4;
    }
    // 重复多的价值高（不想打掉）
    v += Math.max(0, 3 - counts[x]) * 0.5;
    return v;
  }
  let best = hand[0], sc = +1e9;
  for (const x of hand) { const v = val(x); if (v < sc) { sc = v; best = x; } }
  return { tile: best, reason: 'local heuristic' };
}

// ---------------- API handler ----------------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const ai = (req.query.ai as string) || 'local';
    const { hand, keys, snapshot } = req.body as { hand: string[]; keys?: Keys; snapshot?: any };
    if (!Array.isArray(hand) || hand.length === 0) return res.status(400).json({ error: 'hand required' });
    const ks: Keys = keys || {};

    if (ai === 'kimi2' && ks.kimi2) {
      const r = await callMoonshot(ks.kimi2, hand, snapshot);
      return res.json({ ...r, meta: { usedApi: true, provider: 'moonshot', detail: 'kimi2 seat' } });
    }
    if (ai === 'kimi' && ks.kimi) {
      const r = await callMoonshot(ks.kimi, hand, snapshot);
      return res.json({ ...r, meta: { usedApi: true, provider: 'moonshot', detail: 'kimi seat' } });
    }
    if (ai === 'grok' && ks.grok) {
      const r = await callGrok(ks.grok, hand, snapshot);
      return res.json({ ...r, meta: { usedApi: true, provider: 'xai', detail: 'grok seat' } });
    }
    if (ai === 'gemini' && ks.gemini) {
      const r = await callGemini(ks.gemini, hand, snapshot);
      return res.json({ ...r, meta: { usedApi: true, provider: 'gemini', detail: 'gemini seat' } });
    }

    // fallback: local
    const r = localHeuristic(hand, snapshot);
    return res.json({ ...r, meta: { usedApi: false, provider: 'local', detail: 'local heuristic' } });
  } catch (e: any) {
    return res.status(200).json({ tile: (req.body?.hand || [])[0], reason: 'error-fallback', meta: { usedApi: false, provider: 'error', detail: String(e?.message || 'error') } });
  }
}