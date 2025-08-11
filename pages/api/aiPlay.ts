// pages/api/aiPlay.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

type AiResp = { tile: string; reason?: string };

function chooseLocalDiscardWithReason(hand: string[]): AiResp {
  const count: Record<string, number> = {};
  for (const t of hand) count[t] = (count[t] || 0) + 1;

  const neighborExists = (tile: string, delta: number): boolean => {
    const n = parseInt(tile[0], 10); const s = tile[1];
    if (s === 'Z') return false;
    const m = n + delta; if (m < 1 || m > 9) return false;
    return (count[`${m}${s}`] || 0) > 0;
  };

  const reasons: Record<string, string[]> = {};
  const scoreTile = (tile: string): number => {
    const n = parseInt(tile[0], 10); const s = tile[1]; const c = count[tile];
    reasons[tile] = [];
    let score = 50;

    if (c >= 2) { score += 40; reasons[tile].push('成对/刻子，优先保留'); }
    if (s === 'Z') {
      if (c === 1) { score -= 15; reasons[tile].push('孤张字牌，优先丢弃'); }
      else reasons[tile].push('字牌对子/刻子，价值高');
      return score;
    }

    const term = (n === 1 || n === 9);
    let neighbors = 0; for (const d of [-2,-1,1,2]) if (neighborExists(tile, d)) neighbors++;
    if (neighbors > 0) reasons[tile].push(`有${neighbors}个邻接（搭子潜力）`);
    score += neighbors * 8;

    if (term && neighbors === 0) { score -= 12; reasons[tile].push('端张且无邻接，价值低'); }
    if ((n === 2 || n === 8) && neighbors === 0) { score -= 6; reasons[tile].push('边张且无邻接，价值偏低'); }

    if (c < 3) { score -= (3 - c) * 2; reasons[tile].push('出现较少，更可丢'); }

    return score;
  };

  let best = hand[0]; let bestScore = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const s = scoreTile(hand[i]);
    if (s < bestScore) { bestScore = s; best = hand[i]; }
  }
  return { tile: best, reason: (reasons[best] || []).join('、') || '启发式选择' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { ai } = req.query;
  const { hand, apiKeys } = req.body as { hand: string[]; apiKeys?: Record<string,string> };

  const CHATGPT_KEY = apiKeys?.chatgpt || process.env.OPENAI_API_KEY || '';
  const KIMI_KEY    = apiKeys?.kimi    || process.env.KIMI_API_KEY   || '';
  const GEMINI_KEY  = apiKeys?.gemini  || process.env.GEMINI_API_KEY || '';
  const GROK_KEY    = apiKeys?.grok    || process.env.GROK_API_KEY   || '';

  const prompt = `你当前手牌是：[${hand.join(', ')}]，请出一张牌（只返回牌名，如 3W、5Z）`;

  async function callOpenAI(): Promise<AiResp | null> {
    if (!CHATGPT_KEY || ai !== 'chatgpt') return null;
    const r = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: '你是一个麻将AI，只能回复要打出的单张牌名。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 8
    }, { headers: { Authorization: `Bearer ${CHATGPT_KEY}` } });
    const tile = (r.data.choices?.[0]?.message?.content || '').trim();
    return tile ? { tile, reason: 'via chatgpt' } : null;
  }

  async function callKimi(): Promise<AiResp | null> {
    if (!KIMI_KEY || ai !== 'kimi') return null;
    const r = await axios.post('https://api.moonshot.cn/v1/chat/completions', {
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: '你是一个麻将AI，只能回复要打出的单张牌名。' },
        { role: 'user', content: prompt }
      ]
    }, { headers: { Authorization: `Bearer ${KIMI_KEY}` } });
    const tile = (r.data.choices?.[0]?.message?.content || '').trim();
    return tile ? { tile, reason: 'via kimi' } : null;
  }

  async function callGemini(): Promise<AiResp | null> {
    if (!GEMINI_KEY || !ai?.toString().startsWith('gemini')) return null;
    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }]
    });
    const tile = (r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    return tile ? { tile, reason: 'via gemini' } : null;
  }

  async function callGrok(): Promise<AiResp | null> {
    // Placeholder for grok
    return null;
  }

  try {
    let resp = await callOpenAI();
    if (!resp) resp = await callKimi();
    if (!resp) resp = await callGemini();
    if (!resp) resp = await callGrok();

    if (!resp) resp = chooseLocalDiscardWithReason(hand);
    if (!hand.includes(resp.tile)) resp = chooseLocalDiscardWithReason(hand);

    return res.json(resp);
  } catch {
    const fallback = chooseLocalDiscardWithReason(hand);
    return res.json(fallback);
  }
}
