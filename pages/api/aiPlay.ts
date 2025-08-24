import type { NextApiRequest, NextApiResponse } from 'next';
type Keys = { chatgpt?: string; kimi?: string; gemini?: string; grok?: string };


async function safeFetchJson(url:string, init:any, timeoutMs=20000): Promise<{ok:boolean; status:number; data:any; text:string; error?:string}>{
  try{
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort(), timeoutMs);
    const resp = await fetch(url, { ...(init||{}), signal: ac.signal });
    clearTimeout(t);
    const text = await resp.text();
    let data:any = null;
    try{ data = JSON.parse(text); }catch{}
    if(!resp.ok){
      return { ok:false, status:resp.status, data, text, error: data?.error?.message || data?.message || text || ('HTTP '+resp.status) };
    }
    return { ok:true, status:resp.status, data, text };
  }catch(e:any){
    return { ok:false, status:0, data:null, text:'', error: String(e?.message||e||'error') };
  }
}

async function callOpenAI(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${'${snap}'}。在了解对手弃牌/分数/墙余后，从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const f = await safeFetchJson('https://api.openai.com/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system',content:'Only respond with JSON.'},{role:'user',content:prompt}], temperature:0.2 })});
  const data:any = f.data; if(!f.ok){ throw new Error('openai '+f.status+': '+(f.error||'unknown')); } const text = data?.choices?.[0]?.message?.content || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
async function callMoonshot(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${'${snap}'}。在了解对手弃牌/分数/墙余后，从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch('https://api.moonshot.cn/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'moonshot-v1-8k', messages:[{role:'system',content:'Only respond with JSON.'},{role:'user',content:prompt}], temperature:0.2 })});
  const data:any = f.data; if(!f.ok){ throw new Error('openai '+f.status+': '+(f.error||'unknown')); } const text = data?.choices?.[0]?.message?.content || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
async function callGrok(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `You are a mahjong discard helper. Hand: ${hand.join(' ')}. Table snapshot: ${'${snap}'}.
Choose ONE tile to discard. Reply STRICT JSON: {"tile":"<one of hand>","reason":"why (brief)"}`;
  const f = await safeFetchJson('https://api.x.ai/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'grok-2', messages:[{role:'system',content:'Only respond with JSON.'},{role:'user',content:prompt}], temperature:0.2 })});
  const data:any = f.data; if(!f.ok){ throw new Error('openai '+f.status+': '+(f.error||'unknown')); } const text = data?.choices?.[0]?.message?.content || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
async function callGemini(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${'${snap}'}。在了解对手弃牌/分数/墙余后，从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{ temperature:0.2 } })});
  const data:any = f.data; if(!f.ok){ throw new Error('openai '+f.status+': '+(f.error||'unknown')); } const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}

async function sleep(ms:number){ return new Promise(r=>setTimeout(r,ms)); }
async function withRetry<T>(fn:()=>Promise<T>, times=2, base=600): Promise<T>{
  let lastErr:any=null;
  for(let i=0;i<=times;i++){
    try{ return await fn(); }catch(e:any){ lastErr=e; if(i<times){ await sleep(base*Math.pow(2,i)+Math.floor(Math.random()*200)); } }
  }
  throw lastErr;
}

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=='POST') return res.status(405).json({error:'Method Not Allowed'});
  try{
    const ai=(req.query.ai as string)||'local';
    const { hand, keys, snapshot } = req.body as { hand: string[]; keys?: Keys; snapshot?: any };
    if(!Array.isArray(hand)||hand.length===0) return res.status(400).json({error:'hand required'});
    const local=()=>{ const counts:Record<string,number>={}; for(const x of hand) counts[x]=(counts[x]||0)+1;
      function val(x:string){ const n=parseInt(x[0]); const s=x[1]; let v=0; if((counts[x]||0)>=2) v+=2; if(s!=='Z'){ const has=(t:string)=> hand.includes(t); if(has(`${n-1}${s}`)||has(`${n+1}${s}`)) v+=2; if(has(`${n-2}${s}`)||has(`${n+2}${s}`)) v+=1;} return v; }
      let best=hand[0], sc=1e9; for(const x of hand){ const v=val(x); if(v<sc){ sc=v; best=x; } } return { tile:best, reason:'local', meta:{usedApi:false, provider:'local', detail:'local heuristic'} };
    };
    const ks=keys||{};
    if(ai==='chatgpt' && ks.chatgpt){ const r=await callOpenAI(ks.chatgpt, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'openai', detail:'chatgpt seat'} }); }
    if(ai==='kimi' && ks.kimi){ const r=await callMoonshot(ks.kimi, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'moonshot', detail:'kimi seat'} }); }
    if(ai==='grok' && ks.grok){ const r=await callGrok(ks.grok, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'xai', detail:'grok seat'} }); }
    if(ai==='gemini' && ks.gemini){ const r=await callGemini(ks.gemini, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'gemini', detail:'gemini seat'} }); }
    return res.json(local());
  }catch(e:any){
    return res.status(200).json({ tile:(req.body?.hand||[])[0], reason:'fallback-error', meta:{ usedApi:false, provider:'error', detail:String(e?.message||'error')} });
  }
}
