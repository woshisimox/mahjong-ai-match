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
    


function shantenApprox(hand:string[], meldsCount:number){
  const bySuit:Record<string, number[]> = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) };
  for(const t of hand){ const s=t[1]; const n=parseInt(t[0],10); if(bySuit[s]) bySuit[s][n]++; }
  function eatSeq(arr:number[]){ let m=0; for(let n=1;n<=7;n++){ while(arr[n]>0 && arr[n+1]>0 && arr[n+2]>0){ arr[n]--;arr[n+1]--;arr[n+2]--; m++; } } return m; }
  function takePungs(arr:number[]){ let m=0; for(let n=1;n<=9;n++){ while(arr[n]>=3){ arr[n]-=3; m++; } } return m; }
  function suitClone(a:number[]){ return a.slice(); }
  let best=0; for(const o of [0,1]){ const W=suitClone(bySuit.W), B=suitClone(bySuit.B), T=suitClone(bySuit.T); let m=0; if(o===0){ m+=eatSeq(W)+eatSeq(B)+eatSeq(T); m+=takePungs(W)+takePungs(B)+takePungs(T);} else { m+=takePungs(W)+takePungs(B)+takePungs(T); m+=eatSeq(W)+eatSeq(B)+eatSeq(T);} best=Math.max(best,m); }
  let pairs=0; for(const s of ['W','B','T']) for(let n=1;n<=9;n++) pairs += Math.floor((bySuit as any)[s][n]/2);
  const mentsuTotal = best + (snapshot?.meldsCount || 0);
  const pairFlag = pairs>0 ? 1 : 0;
  return Math.max(-1, 8 - (2*mentsuTotal + pairFlag));
}

function allTileKeys(includeHonors:boolean){
  const arr:string[]=[]; for(const s of ['W','B','T']) for(let n=1;n<=9;n++) arr.push(`${n}${s}`);
  if(includeHonors){ for(let n=1;n<=7;n++) arr.push(`${n}Z`); }
  return arr;
}
function toSuitCounts(hand:string[]){
  const m:any = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) };
  const honors = Array(8).fill(0);
  for(const t of hand){ const s=t[1]; const n=parseInt(t[0],10)||0; if(m[s]) m[s][n]++; else if(s==='Z') honors[n]++; }
  return { suits:m, honors };
}
function evalSuitFull(cnt:number[]){
  const memo = new Map<string,[number,number]>();
  const clone=(a:number[])=>a.slice();
  function maxp(a:[number,number], b:[number,number]){ if(b[0]>a[0]) return b; if(b[0]===a[0] && b[1]>a[1]) return b; return a; }
  function dfs(a:number[], i=1):[number,number]{
    while(i<=9 && a[i]===0) i++;
    if(i>9) return [0,0];
    const key=i+':'+a.join(',');
    const hit=memo.get(key); if(hit) return hit;
    let best:[number,number]=[0,0];
    { const b=clone(a); b[i]--; best=maxp(best, dfs(b,i)); } // skip one
    if(a[i]>=3){ const b=clone(a); b[i]-=3; const r=dfs(b,i); best=maxp(best,[r[0]+1,r[1]]); } // pung
    if(i<=7 && a[i]>0 && a[i+1]>0 && a[i+2]>0){ const b=clone(a); b[i]--; b[i+1]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0]+1,r[1]]); } // chow
    if(a[i]>=2){ const b=clone(a); b[i]-=2; const r=dfs(b,i); best=maxp(best,[r[0],r[1]+1]); } // pair as taatsu
    if(i<=8 && a[i]>0 && a[i+1]>0){ const b=clone(a); b[i]--; b[i+1]--; const r=dfs(b,i); best=maxp(best,[r[0],r[1]+1]); } // ryanmen
    if(i<=7 && a[i]>0 && a[i+2]>0){ const b=clone(a); b[i]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0],r[1]+1]); } // kanchan/penchan
    memo.set(key,best); return best;
  }
  return dfs(cnt.slice());
}
function honorsEval(honors:number[]){
  let m=0,t=0,pairs=0;
  for(let n=1;n<=7;n++){ const c=honors[n]; if(c>=3) m+=Math.floor(c/3); if(c%3===2){ t+=1; pairs+=Math.floor(c/2);} }
  return {m,t,pairs};
}
function normalHandShantenFull(hand:string[], meldsCount:number){
  const { suits, honors } = toSuitCounts(hand);
  let totalM=0,totalT=0;
  for(const s of ['W','B','T']){ const r=evalSuitFull(suits[s]); totalM+=r[0]; totalT+=r[1]; }
  const he = honorsEval(honors); totalM+=he.m; totalT+=he.t;
  const mentsu = Math.min(4, totalM + meldsCount);
  const taatsu = Math.min(totalT, Math.max(0, 4-mentsu));
  const hasPair = he.pairs>0 || hasAnyPair(suits);
  let sh = 8 - (2*mentsu + taatsu) - (hasPair?1:0);
  return Math.max(-1, sh);
}
function hasAnyPair(suits:any){ for(const s of ['W','B','T']) for(let n=1;n<=9;n++) if(suits[s][n]>=2) return true; return false; }
function sevenPairsShanten(hand:string[]){
  const c:Record<string,number>={}; for(const t of hand) c[t]=(c[t]||0)+1;
  let pairs=0,kinds=0; for(const k in c){ kinds++; pairs += Math.floor(c[k]/2); }
  return Math.max(-1, 6 - pairs + Math.max(0, 7-kinds));
}
function bestShanten(hand:string[], meldsCount:number, includeHonors:boolean){
  const a = normalHandShantenFull(hand, meldsCount);
  const b = sevenPairsShanten(hand);
  return includeHonors ? Math.min(a,b) : Math.min(a,b); // both apply; honors presence handled in generator
}
function seenMap(snapshot:any, hand:string[]){
  const seen:Record<string,number>={};
  const add=(t:string)=>{ seen[t]=(seen[t]||0)+1; };
  for(const t of hand) add(t);
  const players = Array.isArray(snapshot?.players)? snapshot.players: [];
  for(const p of players){
    const ds = Array.isArray(p?.discards)? p.discards: []; for(const d of ds) add(d);
    const melds = Array.isArray(p?.melds)? p.melds: []; for(const m of melds){ const ts = Array.isArray(m?.tiles)? m.tiles: []; for(const d of ts) add(d); }
  }
  const tableDis = Array.isArray(snapshot?.discards)? snapshot.discards: []; for(const d of tableDis) add(d);
  return seen;
}
function ukeireOf(hand:string[], snapshot:any, includeHonors:boolean, meldsCount:number){
  const sh0 = bestShanten(hand, meldsCount, includeHonors);
  const seenM = seenMap(snapshot||{}, hand);
  const keys = allTileKeys(includeHonors);
  let total=0, detail:Record<string,number>={};
  for(const k of keys){
    const remain = Math.max(0, 4 - (seenM[k]||0)); if(remain<=0) continue;
    const h2 = hand.slice(); h2.push(k);
    const sh1 = bestShanten(h2, meldsCount, includeHonors);
    if(sh1 < sh0){ total += remain; detail[k]=remain; }
  }
  return { total, detail, sh0 };
}

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


  // choose discard: minimize shanten (approx), tie-break by keepScore
  
  let drop = hand[0];
  let bestSh = 999, bestUke = -1, bestKeep = 1e9;
  const includeHonors = !!(snapshot?.includeHonors ?? true);
  const meldsCount = Array.isArray(snapshot?.players) ? ((snapshot.players[0]?.melds?.length||0)) : 0; // rough
  for(const x of hand){
    const h2 = hand.slice(); const idx = h2.indexOf(x); if(idx>=0) h2.splice(idx,1);
    const sh = bestShanten(h2, meldsCount, includeHonors);
    const uke = ukeireOf(h2, snapshot, includeHonors, meldsCount).total;
    const keep = -keepScore(x);
    if(sh < bestSh || (sh===bestSh && (uke > bestUke || (uke===bestUke && keep < bestKeep)))){
      bestSh = sh; bestUke = uke; bestKeep = keep; drop = x;
    }
  }
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

  return { tile: drop, reason: reasonFor(drop)+`；shanten=${bestSh}，uke=${bestUke}` , meta:{ usedApi:false, provider:'local', detail:'shanten+ukeire'} };
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