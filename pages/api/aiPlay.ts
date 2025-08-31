import type { NextApiRequest, NextApiResponse } from 'next';
type Keys = { kimi?: string; kimi2?: string; gemini?: string; grok?: string };
async function callMoonshot(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${'${snap}'}。在了解对手弃牌/分数/墙余后，从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch('https://api.moonshot.cn/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'moonshot-v1-8k', messages:[{role:'system',content:'Only respond with JSON.'},{role:'user',content:prompt}], temperature:0.2 })});
  const data:any = await resp.json(); const text = data?.choices?.[0]?.message?.content || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
async function callGrok(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `You are a mahjong discard helper. Hand: ${hand.join(' ')}. Table snapshot: ${'${snap}'}.
Choose ONE tile to discard. Reply STRICT JSON: {"tile":"<one of hand>","reason":"why (brief)"}`;
  const resp = await fetch('https://api.x.ai/v1/chat/completions',{ method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, body: JSON.stringify({ model:'grok-2', messages:[{role:'system',content:'Only respond with JSON.'},{role:'user',content:prompt}], temperature:0.2 })});
  const data:any = await resp.json(); const text = data?.choices?.[0]?.message?.content || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
async function callGemini(key:string, hand:string[], snapshot:any){
  const snap = JSON.stringify(snapshot||{}).slice(0,1800);
  const prompt = `你是麻将出牌助手。麻将手牌: ${hand.join(' ')}。局面: ${'${snap}'}。在了解对手弃牌/分数/墙余后，从这些牌中选择一张要打出的牌，输出严格 JSON：{"tile":"<必须是手牌之一>","reason":"依据(简要)"}`;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{ temperature:0.2 } })});
  const data:any = await resp.json(); const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''; try{ const j=JSON.parse(text); if(j?.tile && hand.includes(j.tile)) return j; }catch{} return { tile: hand[0], reason: 'fallback' };
}
export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if(req.method!=='POST') return res.status(405).json({error:'Method Not Allowed'});
  try{
    const ai=(req.query.ai as string)||'local';
    const { hand, keys, snapshot } = req.body as { hand: string[]; keys?: Keys; snapshot?: any };
    if(!Array.isArray(hand)||hand.length===0) return res.status(400).json({error:'hand required'});
    

const local=()=>{
  // ---- Improved local heuristic: maximize meld potential, minimize isolation ----
  const counts:Record<string,number>={}; for(const x of hand) counts[x]=(counts[x]||0)+1;

  // Visibility: own hand + discards in snapshot
  const seen:Record<string,number>={};
  for(const x of hand) seen[x]=(seen[x]||0)+1;
  const players = Array.isArray(snapshot?.players)? snapshot.players: [];
  for(const p of players){ const ds = Array.isArray(p?.discards)? p.discards: []; for(const d of ds){ seen[d]=(seen[d]||0)+1; } }
  const tableDis = Array.isArray(snapshot?.discards)? snapshot.discards: [];
  for(const d of tableDis){ seen[d]=(seen[d]||0)+1; }

  const suit = (t:string)=>t[1];
  const num  = (t:string)=>parseInt(t[0],10)||0;
  const isNum = (t:string)=>['W','B','T'].includes(suit(t));
  const has = (t:string)=> (counts[t]||0)>0;

  function neighborCount(t:string){
    if(!isNum(t)) return 0;
    const s=suit(t), n=num(t);
    return (has(`${n-2}${s}`)?1:0) + (has(`${n-1}${s}`)?1:0) + (has(`${n+1}${s}`)?1:0) + (has(`${n+2}${s}`)?1:0);
  }

  function keepScore(tile:string):number{
    const c = counts[tile]||0;
    let score = 0;

    // (A) triplet/pair value
    if(c>=3) score += 9;
    else if(c==2) score += 5;

    // (B) straight potential (only numbered)
    if(isNum(tile)){
      const nbh = neighborCount(tile);
      score += Math.min(6, nbh*3);  // 0,3,6,9,12 -> cap at 6
      const n=num(tile);
      const terminal = (n==1 || n==9);
      if(terminal && nbh===0) score -= 2;
      // edge waits penalize slightly if isolated
      const left = has(`${n-1}${suit(tile)}`), right = has(`${n+1}${suit(tile)}`);
      if(!(left||right)) score -= 1.5;
    }else{
      // honors lone penalty; pair ok; triplet best
      if(c===1) score -= 2;
    }

    // (C) visibility: many seen -> less chance to complete
    const seenCnt = seen[tile]||0;
    score -= Math.max(0, seenCnt-1) * 0.8;

    return score;
  }

  // choose discard: lowest keepScore
  let drop = hand[0], best = 1e9;
  for(const x of hand){
    const sc = -keepScore(x); // invert
    if(sc < best){ best=sc; drop=x; }
  }

  // human-readable reason
  function reasonFor(x:string){
    const c = counts[x]||0;
    const s = suit(x), n = num(x);
    const seenCnt = seen[x]||0;
    const nbh = neighborCount(x);
    if(c===1 && (!isNum(x) || nbh===0)) return `孤张${x}，无连接`;
    if(isNum(x) && (n===1||n===9) && nbh===0) return `幺九孤张，难以成顺`;
    if(c===1 && nbh===1) return `仅一侧相邻，连张弱`;
    if(seenCnt>=3) return `多数已出现（${seenCnt}张），完成机会低`;
    return `整体价值较低（连接度${nbh}，已见${seenCnt}）`;
  }

  return { tile: drop, reason: reasonFor(drop), meta:{ usedApi:false, provider:'local', detail:'improved heuristic'} };
};


    const ks=keys||{};
    if(ai==='kimi2' && ks.kimi2){ const r=await callMoonshot(ks.kimi2, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'moonshot', detail:'kimi2 seat'} }); }
    if(ai==='kimi' && ks.kimi){ const r=await callMoonshot(ks.kimi, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'moonshot', detail:'kimi seat'} }); }
    if(ai==='grok' && ks.grok){ const r=await callGrok(ks.grok, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'xai', detail:'grok seat'} }); }
    if(ai==='gemini' && ks.gemini){ const r=await callGemini(ks.gemini, hand, snapshot); return res.json({ ...r, meta:{ usedApi:true, provider:'gemini', detail:'gemini seat'} }); }
    return res.json(local());
  }catch(e:any){
    return res.status(200).json({ tile:(req.body?.hand||[])[0], reason:'fallback-error', meta:{ usedApi:false, provider:'error', detail:String(e?.message||'error')} });
  }
}