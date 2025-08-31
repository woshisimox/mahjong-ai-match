// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next';

type Decide = { tile: string; reason: string; meta: { usedApi: boolean; provider: string; detail: string } };

const ALL_SUITS = ['W','B','T'] as const;

function allTileKeys(includeHonors:boolean){
  const arr:string[] = [];
  for(const s of ALL_SUITS){ for(let n=1;n<=9;n++) arr.push(`${n}${s}`); }
  if(includeHonors){ for(let n=1;n<=7;n++) arr.push(`${n}Z`); }
  return arr;
}
function toSuitCounts(hand:string[]){
  const m:any = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) };
  const honors = Array(8).fill(0);
  for(const t of hand){ const s=t[1], n=+t[0]||0; if(m[s]) m[s][n]++; else if(s==='Z') honors[n]++; }
  return { suits:m, honors };
}
function evalSuitFull(cnt:number[]){
  const memo = new Map<string,[number,number]>();
  const clone=(a:number[])=>a.slice();
  const maxp=(a:[number,number], b:[number,number])=>{ if(b[0]>a[0]) return b; if(b[0]===a[0] && b[1]>a[1]) return b; return a; };
  function dfs(a:number[], i=1):[number,number]{
    while(i<=9 && a[i]===0) i++;
    if(i>9) return [0,0];
    const key = i+':'+a.join(',');
    const hit = memo.get(key); if(hit) return hit;
    let best:[number,number]=[0,0];
    { const b=clone(a); b[i]--; best = maxp(best, dfs(b,i)); }
    if(a[i]>=3){ const b=clone(a); b[i]-=3; const r=dfs(b,i); best = maxp(best,[r[0]+1,r[1]]); }
    if(i<=7 && a[i]>0 && a[i+1]>0 && a[i+2]>0){ const b=clone(a); b[i]--; b[i+1]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0]+1,r[1]]); }
    if(a[i]>=2){ const b=clone(a); b[i]-=2; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
    if(i<=8 && a[i]>0 && a[i+1]>0){ const b=clone(a); b[i]--; b[i+1]--; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
    if(i<=7 && a[i]>0 && a[i+2]>0){ const b=clone(a); b[i]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
    memo.set(key, best); return best;
  }
  return dfs(cnt.slice());
}
function honorsEval(honors:number[]){ let m=0,t=0,pairs=0; for(let n=1;n<=7;n++){ const c=honors[n]; if(c>=3) m+=Math.floor(c/3); if(c%3===2){ t+=1; pairs+=Math.floor(c/2); } } return {m,t,pairs}; }
function hasAnyPair(suits:any){ for(const s of ALL_SUITS) for(let n=1;n<=9;n++) if(suits[s][n]>=2) return true; return false; }
function normalHandShantenFull(hand:string[], meldsCount:number){
  const { suits, honors } = toSuitCounts(hand);
  let totalM=0,totalT=0;
  for(const s of ALL_SUITS){ const r=evalSuitFull(suits[s]); totalM+=r[0]; totalT+=r[1]; }
  const he = honorsEval(honors); totalM+=he.m; totalT+=he.t;
  const mentsu = Math.min(4, totalM + meldsCount);
  const taatsu = Math.min(totalT, Math.max(0, 4-mentsu));
  const hasPair = he.pairs>0 || hasAnyPair(suits);
  let sh = 8 - (2*mentsu + taatsu) - (hasPair?1:0);
  return Math.max(-1, sh);
}
function sevenPairsShanten(hand:string[]){
  const c:Record<string,number>={}; for(const t of hand) c[t]=(c[t]||0)+1;
  let pairs=0,kinds=0; for(const k in c){ kinds++; pairs += Math.floor(c[k]/2); }
  return Math.max(-1, 6 - pairs + Math.max(0, 7-kinds));
}
function bestShanten(hand:string[], meldsCount:number, includeHonors:boolean){
  const a = normalHandShantenFull(hand, meldsCount);
  const b = sevenPairsShanten(hand);
  return Math.min(a,b);
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
  const keys = allTileKeys(includeHonors);
  const seen = seenMap(snapshot||{}, hand);
  let total=0, detail:Record<string,number>={};
  for(const k of keys){
    const remain = Math.max(0, 4 - (seen[k]||0)); if(remain<=0) continue;
    const h2 = hand.slice(); h2.push(k);
    const sh1 = bestShanten(h2, meldsCount, includeHonors);
    if(sh1 < sh0){ total += remain; detail[k]=remain; }
  }
  return { total, detail, sh0 };
}

function reasonForLocal(x:string, hand:string[], snapshot:any){
  const counts:Record<string,number>={}; for(const t of hand) counts[t]=(counts[t]||0)+1;
  const seen = seenMap(snapshot||{}, hand);
  const suit=(t:string)=>t[1]; const num=(t:string)=>parseInt(t[0],10)||0;
  const isNum=(t:string)=>['W','B','T'].includes(suit(t));
  const has=(t:string)=> (counts[t]||0)>0;
  const neighborCount=(t:string)=>{ if(!isNum(t)) return 0; const s=suit(t), n=num(t); let c=0; if(has(`${n-2}${s}`)) c++; if(has(`${n-1}${s}`)) c++; if(has(`${n+1}${s}`)) c++; if(has(`${n+2}${s}`)) c++; return c; };
  const c = counts[x]||0, s=suit(x), n=num(x), seenCnt = seen[x]||0, nbh=neighborCount(x);
  if(c===1 && (!isNum(x) || nbh===0)) return `孤张${x}，无连接`;
  if(isNum(x) && (n===1||n===9) && nbh===0) return `幺九孤张，难以成顺`;
  if(c===1 && nbh===1) return `仅一侧相邻，连张弱`;
  if(seenCnt>=3) return `多数已出现（${seenCnt}张），完成机会低`;
  return `整体价值较低（连接度${nbh}，已见${seenCnt}）`;
}
function localDecide(hand:string[], snapshot:any): Decide {
  const includeHonors = !!(snapshot?.includeHonors ?? true);
  const meldsCount = 0;
  const keepScore=(x:string)=>{
    const s=x[1], n=+x[0]; let v=0;
    const has=(t:string)=> hand.includes(t);
    if(hand.filter(t=>t===x).length>=2) v+=2;
    if(s!=='Z'){
      if(has(`${n-1}${s}`)) v+=2; if(has(`${n+1}${s}`)) v+=2;
      if(has(`${n-2}${s}`)||has(`${n+2}${s}`)) v+=1;
    }
    return v;
  };
  let drop = hand[0]; let bestSh = 999, bestUke = -1, bestKeep = 1e9;
  for(const x of hand){
    const h2 = hand.slice(); const idx=h2.indexOf(x); if(idx>=0) h2.splice(idx,1);
    const sh = bestShanten(h2, meldsCount, includeHonors);
    const uke = ukeireOf(h2, snapshot, includeHonors, meldsCount).total;
    const keep = -keepScore(x);
    if(sh < bestSh || (sh===bestSh && (uke > bestUke || (uke===bestUke && keep < bestKeep)))){
      bestSh = sh; bestUke = uke; bestKeep = keep; drop = x;
    }
  }
  return { tile: drop, reason: reasonForLocal(drop, hand, snapshot)+`；shanten=${bestSh}，uke=${bestUke}`, meta:{ usedApi:false, provider:'local', detail:'shanten+ukeire' } };
}

async function callProvider(provider:string, hand:string[], keys:any, snapshot:any): Promise<Decide|null>{
  const text = [
    `你在打麻将（四川/传统皆可），手牌如下：${hand.join(',')}`,
    `请只返回 JSON：{"tile":"<要打出的牌>","reason":"<简短理由>"}`,
    `注意：tile 必须是以上手牌中的一个编码（例如 "5W"）`,
  ].join('\\n');
  const parse = (s:string): {tile?:string;reason?:string}=>{ try{ const m=s.match(/\{[\s\S]*\}/); const obj=m?JSON.parse(m[0]):JSON.parse(s); return { tile: obj.tile, reason: obj.reason }; }catch{ return {}; } };
  try{
    if(provider==='kimi2' || provider==='kimi'){
      const apiKey = keys?.kimi2 || keys?.kimi; if(!apiKey) return null;
      const resp = await fetch('https://api.moonshot.cn/v1/chat/completions',{
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body: JSON.stringify({ model:'moonshot-v1-8k', messages:[{role:'user', content:text}], temperature:0.2 })
      });
      if(!resp.ok) return null; const data=await resp.json();
      const content = data?.choices?.[0]?.message?.content || ''; const obj=parse(content);
      if(obj.tile && hand.includes(obj.tile)) return { tile: obj.tile, reason: obj.reason || 'kimi', meta:{ usedApi:true, provider:'kimi2', detail:'chat' } };
      return null;
    }
    if(provider==='gemini'){
      const apiKey = keys?.gemini; if(!apiKey) return null;
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text }] }], generationConfig:{ temperature:0.2 } })
      });
      if(!resp.ok) return null; const data=await resp.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''; const obj=parse(content);
      if(obj.tile && hand.includes(obj.tile)) return { tile: obj.tile, reason: obj.reason || 'gemini', meta:{ usedApi:true, provider:'gemini', detail:'generateContent' } };
      return null;
    }
    if(provider==='grok'){
      const apiKey = keys?.grok; if(!apiKey) return null;
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body: JSON.stringify({ model:'grok-2-latest', messages:[{role:'user', content:text}], temperature:0.2 })
      });
      if(!resp.ok) return null; const data=await resp.json();
      const content = data?.choices?.[0]?.message?.content || ''; const obj=parse(content);
      if(obj.tile && hand.includes(obj.tile)) return { tile: obj.tile, reason: obj.reason || 'grok', meta:{ usedApi:true, provider:'grok', detail:'chat' } };
      return null;
    }
  }catch(_e){ return null; }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provider = String((req.query.provider || req.query.ai || 'local'));
  const { hand = [], keys = {}, snapshot = {} } = (req.method==='POST' ? (req.body||{}) : {}) as any;
  if(!Array.isArray(hand) || hand.length===0){ res.status(200).json({ tile:'', reason:'empty hand', meta:{ usedApi:false, provider:'local', detail:'invalid-hand' } }); return; }
  if(provider && provider!=='local'){ const remote = await callProvider(provider, hand, keys, snapshot); if(remote && remote.tile && hand.includes(remote.tile)){ res.status(200).json(remote); return; } }
  const local = localDecide(hand, snapshot); res.status(200).json(local);
}
