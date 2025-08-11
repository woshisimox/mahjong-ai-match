import type { NextApiRequest, NextApiResponse } from 'next';
type Keys = { chatgpt?: string; kimi?: string; gemini?: string; grok?: string };

function normalizeTile(raw:string): string{
  if(!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '');
  const honor:Record<string,string>={ '东':'1Z','南':'2Z','西':'3Z','北':'4Z','中':'5Z','發':'6Z','发':'6Z','白':'7Z' };
  if(honor[s]) return honor[s];
  if(/^[1-9][万饼条]$/.test(s)){ const n=s[0]; const m = s[1]==='万'?'W':(s[1]==='饼'?'B':'T'); return `${n}${m}`; }
  if(/^[1-9][WBTZ]$/.test(s)) return s;
  return s;
}

async function callOpenAI(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const list = hand.join(' ');
  const prompt = `你是麻将出牌助手。严格遵守：1) 只能从下列列表中选择一张丢弃：${list}；2) 输出必须是严格 JSON；3) 字牌使用数字编码：东=1Z、南=2Z、西=3Z、北=4Z、中=5Z、發=6Z、白=7Z。\n局面: ${snap}\n请输出：{"tile":"<必须完全等于列表中的某一项>","reason":"依据(简要)"}`;
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You must return ONLY strict JSON matching {"tile": string, "reason": string}. The tile MUST be exactly one of the provided list.'},
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  });
  const data:any = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';
  try { const j = JSON.parse(text); const cand = normalizeTile(j?.tile); if(cand && hand.includes(cand)) return { tile:cand, reason:j?.reason||'' }; } catch {}
  return { tile: hand[0], reason: 'fallback' };
}

async function callMoonshot(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: 'Only respond with JSON.'},
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
    })
  });
  const data:any = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';
  try { const j = JSON.parse(text); const cand = normalizeTile(j?.tile); if(cand && hand.includes(cand)) return { tile:cand, reason:j?.reason||'' }; } catch {}
  return { tile: hand[0], reason: 'fallback' };
}

async function callGrok(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `You are a mahjong discard helper. Hand: ${hand.join(' ')}. Table snapshot: ${snap}. Choose ONE tile to discard. Reply STRICT JSON: {"tile":"<one of hand>","reason":"why (brief)"}`;
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-2',
      messages: [
        { role: 'system', content: 'Only respond with JSON.'},
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
    })
  });
  const data:any = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';
  try { const j = JSON.parse(text); const cand = normalizeTile(j?.tile); if(cand && hand.includes(cand)) return { tile:cand, reason:j?.reason||'' }; } catch {}
  return { tile: hand[0], reason: 'fallback' };
}

async function callGemini(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${snap}。选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: { temperature: 0.2 }
    })
  });
  const data:any = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try { const j = JSON.parse(text); const cand = normalizeTile(j?.tile); if(cand && hand.includes(cand)) return { tile:cand, reason:j?.reason||'' }; } catch {}
  return { tile: hand[0], reason: 'fallback' };
}

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try{
    const ai = (req.query.ai as string)||'local';
    const { hand, keys, snapshot } = req.body as { hand: string[]; keys?: Keys; snapshot?: any };
    if(!Array.isArray(hand) || hand.length===0) return res.status(400).json({ error: 'hand required' });

    const local = ()=>{
      const counts:Record<string,number>={}; for(const x of hand) counts[x]=(counts[x]||0)+1;
      function val(x:string){ const n=parseInt(x[0]); const s=x[1]; let v=0; if((counts[x]||0)>=2) v+=2; if(s!=='Z'){ const has=(t:string)=> hand.includes(t); if(has(`${n-1}${s}`)||has(`${n+1}${s}`)) v+=2; if(has(`${n-2}${s}`)||has(`${n+2}${s}`)) v+=1;} return v; }
      let best=hand[0], sc=1e9; for(const x of hand){ const v=val(x); if(v<sc){ sc=v; best=x; } }
      return { tile: best, reason: 'local', meta:{ usedApi:false, provider:'local', detail:'local heuristic'} };
    };

    const ks:Keys = keys||{};
    if(ai==='chatgpt' && ks.chatgpt){ const r=await callOpenAI(ks.chatgpt, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'openai', detail:'chatgpt seat' } }); }
    if(ai==='kimi' && ks.kimi){ const r=await callMoonshot(ks.kimi, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'moonshot', detail:'kimi seat' } }); }
    if(ai==='grok' && ks.grok){ const r=await callGrok(ks.grok, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'xai', detail:'grok seat' } }); }
    if(ai==='gemini' && ks.gemini){ const r=await callGemini(ks.gemini, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'gemini', detail:'gemini seat' } }); }

    return res.json(local());
  }catch(e:any){
    return res.status(200).json({ tile: (req.body?.hand||[])[0], reason: 'fallback-error', meta:{ usedApi:false, provider:'error', detail:String(e?.message||'error') } });
  }
}
