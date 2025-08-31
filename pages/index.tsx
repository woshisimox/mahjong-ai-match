// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';

type RuleMode = 'SCZDXZ' | 'BASIC';
type MeldType = 'CHI' | 'PENG' | 'GANG' | 'ANGANG' | 'BUGANG';
type Meld = { type: MeldType; tiles: string[]; };
type PlayerState = { ai: string; hand: string[]; discards: string[]; melds: Meld[]; isWinner: boolean; score: number };

export default function Home() {
  const [ruleMode, setRuleMode] = useState<RuleMode>('SCZDXZ');
  const [players, setPlayers] = useState<PlayerState[]>([
    { ai: '东', hand: [], discards: [], melds: [], isWinner: false, score: 1000 },
    { ai: '南', hand: [], discards: [], melds: [], isWinner: false, score: 1000 },
    { ai: '西', hand: [], discards: [], melds: [], isWinner: false, score: 1000 },
    { ai: '北', hand: [], discards: [], melds: [], isWinner: false, score: 1000 },
  ]);
  const [wall, setWall] = useState<string[]>([]);
  const [table, setTable] = useState<any | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const appendLogs = (items: string[]) => setLogs(prev => [...prev, ...items]);

  const [maxHands, setMaxHands] = useState(1);
  const [intervalMs, setIntervalMs] = useState(200);
  const [showHands, setShowHands] = useState(true);
  const [startScore, setStartScore] = useState(1000);

  const [matchActive, setMatchActive] = useState(false);
  const [handRunning, setHandRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const [seatProvider, setSeatProvider] = useState<{E:string;S:string;W:string;N:string}>({E:'local',S:'local',W:'local',N:'local'});
  const [keys, setKeys] = useState<{kimi2?:string; kimi?:string; gemini?:string; grok?:string}>({});

  const runningRef = useRef(false);
  const psRef = useRef<PlayerState[]|null>(null);
  const wallRef = useRef<string[]|null>(null);

  useEffect(() => { const raw = sessionStorage.getItem('mahjong_keys'); if (raw) try { setKeys(JSON.parse(raw)); } catch {} }, []);
  useEffect(() => { sessionStorage.setItem('mahjong_keys', JSON.stringify(keys||{})); }, [keys]);

  function startNewMatch() {
    appendLogs(['🟢 新比赛']);
    const ps = ['东','南','西','北'].map(seat => ({ ai: seat, hand: [], discards: [], melds: [], isWinner: false, score: startScore })) as PlayerState[];
    setPlayers(ps); setWall([]); setTable(null);
    setMatchActive(true); setHandRunning(false); setPaused(false);
    runningRef.current = false; psRef.current = null; wallRef.current = null;
  }

  async function startNextHand() {
    if (!matchActive) return;
    appendLogs(['🟡 开始新一轮']);
    const w = generateWall(ruleMode); shuffle(w);
    const ps = players.map(p => ({ ...p, hand: w.splice(0,13), discards: [], melds: [], isWinner:false }));
    setPlayers(ps); setWall([...w]);
    const tb = { wall:[...w], discards:[], players: ps.map(p=>({ ...p })), turn:0, dealer:0, lastDiscard:null, roundActive:true, winners:[], rule:ruleMode };
    setTable(tb);
    psRef.current = ps; wallRef.current = w;
    setPaused(false); setHandRunning(true); runningRef.current = true;
    void playOneHand(ps, w, runningRef);
  }

  function togglePause(){
    if(!handRunning) return;
    if(!paused){ runningRef.current = false; setPaused(true); appendLogs(['⏸️ 已暂停']); }
    else { runningRef.current = true; setPaused(false); appendLogs(['▶️ 继续']); if(psRef.current && wallRef.current){ void playOneHand(psRef.current, wallRef.current, runningRef); } }
  }
  function stopHand(){ if(!handRunning) return; runningRef.current=false; setPaused(false); setHandRunning(false); appendLogs(['⏹️ 已停止当前轮次']); }

  // ===== shanten + uke-ire =====
  const ALL_SUITS = ['W','B','T'] as const;
  function allTileKeys(includeHonors:boolean){ const arr:string[]=[]; for(const s of ALL_SUITS){ for(let n=1;n<=9;n++) arr.push(`${n}${s}`); } if(includeHonors){ for(let n=1;n<=7;n++) arr.push(`${n}Z`); } return arr; }
  function toSuitCounts(hand:string[]){ const m:Record<string, number[]> = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) }; const honors=Array(8).fill(0); for(const t of hand){ const s=t[1]; const n=+t[0]||0; if(s==='W'||s==='B'||s==='T') m[s][n]++; else if(s==='Z') honors[n]++; } return { suits:m, honors }; }
  function cloneArr(a:number[]){ return a.slice(); }
  function evalSuitFull(cnt:number[]){
    const memo=new Map<string,[number,number]>();
    function maxp(a:[number,number],b:[number,number]){ if(b[0]>a[0]) return b; if(b[0]===a[0]&&b[1]>a[1]) return b; return a; }
    function dfs(a:number[],i=1):[number,number]{
      while(i<=9&&a[i]===0)i++;
      if(i>9)return[0,0];
      const key=i+':'+a.join(',');
      const hit=memo.get(key); if(hit) return hit;
      let best:[number,number]=[0,0];
      { const b=cloneArr(a); b[i]--; best=maxp(best,dfs(b,i)); }
      if(a[i]>=3){ const b=cloneArr(a); b[i]-=3; const r=dfs(b,i); best=maxp(best,[r[0]+1,r[1]]); }
      if(i<=7 && a[i]>0 && a[i+1]>0 && a[i+2]>0){ const b=cloneArr(a); b[i]--; b[i+1]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0]+1,r[1]]); }
      if(a[i]>=2){ const b=cloneArr(a); b[i]-=2; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
      if(i<=8 && a[i]>0 && a[i+1]>0){ const b=cloneArr(a); b[i]--; b[i+1]--; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
      if(i<=7 && a[i]>0 && a[i+2]>0){ const b=cloneArr(a); b[i]--; b[i+2]--; const r=dfs(b,i); best=maxp(best,[r[0], r[1]+1]); }
      memo.set(key,best); return best;
    }
    return dfs(cnt.slice());
  }
  function honorsEval(honors:number[]){ let m=0,t=0,pairs=0; for(let n=1;n<=7;n++){ const c=honors[n]; if(c>=3)m+=Math.floor(c/3); if(c%3===2){t+=1;pairs+=Math.floor(c/2);} } return {m,t,pairs}; }
  function hasAnyPair(suits:Record<string,number[]>) { for(const s of ALL_SUITS) for(let n=1;n<=9;n++) if(suits[s][n]>=2) return true; return false; }
  function normalHandShantenFull(hand:string[], meldsCount:number){ const { suits, honors }=toSuitCounts(hand); let totalM=0,totalT=0; for(const s of ALL_SUITS){ const r=evalSuitFull(suits[s]); totalM+=r[0]; totalT+=r[1]; } const he=honorsEval(honors); totalM+=he.m; totalT+=he.t; const mentsu=Math.min(4,totalM+meldsCount); const taatsu=Math.min(totalT, Math.max(0,4-mentsu)); const hasPair= he.pairs>0 || hasAnyPair(suits); let sh= 8 - (2*mentsu + taatsu) - (hasPair?1:0); return Math.max(-1, sh); }
  function sevenPairsShanten(hand:string[]){ const c:Record<string,number>={}; for(const t of hand) c[t]=(c[t]||0)+1; let pairs=0,kinds=0; for(const k in c){ kinds++; pairs+=Math.floor(c[k]/2); } return Math.max(-1, 6 - pairs + Math.max(0, 7-kinds)); }
  function bestShanten(hand:string[], meldsCount:number, includeHonors:boolean){ const a=normalHandShantenFull(hand, meldsCount); const b=sevenPairsShanten(hand); return Math.min(a,b); }
  function seenMapFromSnapshot(snapshot:any, selfHand:string[]){ const seen:Record<string,number>={}; const add=(t:string)=>{ seen[t]=(seen[t]||0)+1; }; for(const t of selfHand)add(t); const players=Array.isArray(snapshot?.players)? snapshot.players: []; for(const p of players){ const ds=Array.isArray(p?.discards)? p.discards: []; for(const d of ds)add(d); const melds=Array.isArray(p?.melds)? p.melds: []; for(const m of melds){ const ts=Array.isArray(m?.tiles)? m.tiles: []; for(const d of ts) add(d);} } const tableDis=Array.isArray(snapshot?.discards)? snapshot.discards: []; for(const d of tableDis) add(d); return seen; }
  function ukeire(hand:string[], snapshot:any, includeHonors:boolean){ const sh0 = bestShanten(hand, 0, includeHonors); const keys = allTileKeys(includeHonors); const seen=seenMapFromSnapshot(snapshot||{}, hand); let total=0; const detail:Record<string,number>={}; for(const k of keys){ const remain=Math.max(0, 4 - (seen[k]||0)); if(remain<=0) continue; const h2=hand.slice(); h2.push(k); const sh1=bestShanten(h2, 0, includeHonors); if(sh1<sh0){ total+=remain; detail[k]=remain; } } return { total, detail, sh0 }; }
  function handAfterRemove(orig:string[], tiles:string[]){ const h=[...orig]; for(const t of tiles){ const idx=h.indexOf(t); if(idx>=0) h.splice(idx,1);} return h; }

  // ===== 规则工具 & 计分 =====
  function tileLabel(t:string){ const n=+t[0]; const s=t[1]; if(s==='W') return ['','一','二','三','四','五','六','七','八','九'][n]+'万'; if(s==='T') return ['','一','二','三','四','五','六','七','八','九'][n]+'条'; if(s==='B') return ['','一','二','三','四','五','六','七','八','九'][n]+'饼'; if(s==='Z') return ['','东','南','西','北','中','发','白'][n]; return t; }
  function sortTiles(arr:string[]){ const ord:Record<string,number>={W:0,T:1,B:2,Z:3}; return [...arr].sort((a,b)=>{ const sa=a[1], sb=b[1]; if(ord[sa]!==ord[sb]) return ord[sa]-ord[sb]; const na=+a[0], nb=+b[0]; return na-nb; }); }
  function possibleChiSeqs(hand:string[], taken:string){ const s=taken[1]; const n=+taken[0]; if(!['W','T','B'].includes(s)) return []; const has=(t:string)=> hand.includes(t); const seqs:string[][]=[]; if(n>=3 && has(`${n-2}${s}`) && has(`${n-1}${s}`)) seqs.push([`${n-2}${s}`,`${n-1}${s}`,taken]); if(n>=2 && n<=8 && has(`${n-1}${s}`) && has(`${n+1}${s}`)) seqs.push([`${n-1}${s}`,taken,`${n+1}${s}`]); if(n<=7 && has(`${n+1}${s}`) && has(`${n+2}${s}`)) seqs.push([taken,`${n+1}${s}`,`${n+2}${s}`]); return seqs; }

  // ======== 计分（含 对对胡 / 幺九 / 断幺 / 根） ========
  type ScoreBreak = { fan: number; points: number; labels: string[] };
  function tileListAll(full14: string[], melds: Meld[]) { const all: string[] = [...full14]; for (const m of (melds || [])) if (Array.isArray(m.tiles)) all.push(...m.tiles); return all; }
  function countMap(list: string[]) { const c: Record<string, number> = {}; for (const t of list) c[t] = (c[t] || 0) + 1; return c; }
  function isSevenPairs(full14: string[]) { if (full14.length !== 14) return false; const c = countMap(full14); let pairs = 0; for (const k in c) pairs += Math.floor(c[k] / 2); return pairs === 7; }
  function isDuiDuiHu14(full14: string[], melds: Meld[]) { if ((melds || []).some(m => m.type === 'CHI')) return false; const c = countMap(full14); let pairs = 0; for (const k in c) { const r = c[k] % 3; if (r === 1) return false; if (r === 2) pairs++; } return pairs === 1; }
  function isQingYiSeAll(full14: string[], melds: Meld[], includeHonors: boolean) { const all = tileListAll(full14, melds); if (includeHonors && all.some(t => t[1] === 'Z')) return false; const suits = new Set(all.filter(t => t[1] !== 'Z').map(t => t[1])); return suits.size === 1 && all.length > 0; }
  function isMenQing(melds: Meld[]) { return (melds || []).every(m => m.type === 'ANGANG'); }
  function isYaoJiu(full14: string[], melds: Meld[]) { const all = tileListAll(full14, melds); return all.every(t => t[1] === 'Z' || t[0] === '1' || t[0] === '9'); }
  function isDuanYao(full14: string[], melds: Meld[]) { const all = tileListAll(full14, melds); return all.every(t => t[1] !== 'Z' && +t[0] >= 2 && +t[0] <= 8); }
  function countGen(full14: string[], melds: Meld[]) { const all = tileListAll(full14, melds); const c = countMap(all); let gens = 0; for (const k in c) gens += Math.floor(c[k] / 4); return gens; }
  function calcHuScore(hand14: string[], melds: Meld[], isZimo: boolean, includeHonors: boolean): ScoreBreak {
    let fan = 1; const labels: string[] = ['平胡'];
    if (isZimo) { fan += 1; labels.push('自摸'); }
    if (isSevenPairs(hand14)) { fan += 2; labels.push('七对'); }
    if (isDuiDuiHu14(hand14, melds)) { fan += 2; labels.push('对对胡'); }
    if (isYaoJiu(hand14, melds)) { fan += 3; labels.push('幺九'); }
    if (isDuanYao(hand14, melds)) { fan += 2; labels.push('断幺'); }
    if (isQingYiSeAll(hand14, melds, (ruleMode!=='SCZDXZ'))) { fan += 5; labels.push('清一色'); }
    if (isMenQing(melds)) { fan += 1; labels.push('门清'); }
    const gen = countGen(hand14, melds); if (gen > 0) { fan += gen; labels.push(`${gen}根`); }
    const points = Math.pow(2, fan); return { fan, points, labels };
  }
  function settleRong(ps: PlayerState[], winner: number, discarder: number, points: number, labels: string[], outTile: string) {
    ps[winner].score = (ps[winner].score || 0) + points; ps[discarder].score = (ps[discarder].score || 0) - points;
    appendLogs([`💰 计分：${ps[winner].ai} 荣和（${tileLabel(outTile)}）= ${points} 点（${labels.join(' + ')}）；放炮 ${ps[discarder].ai} -${points}`]);
  }
  function settleZimo(ps: PlayerState[], winner: number, points: number, labels: string[]) {
    for (let j = 0; j < ps.length; j++) { if (j === winner) continue; ps[j].score = (ps[j].score || 0) - points; }
    ps[winner].score = (ps[winner].score || 0) + points * (ps.length - 1);
    appendLogs([`💰 计分：${ps[winner].ai} 自摸 = ${points}×${ps.length - 1} 点（${labels.join(' + ')}）`]);
  }

  // ===== 反应与执行 =====
  function countInHand(h:string[], t:string){ return h.filter(x=>x===t).length; }
  function canWinWith(h:string[], t:string){ const includeHonors = (ruleMode!=='SCZDXZ'); const sh = bestShanten([...h, t], 0, includeHonors); return sh===-1; }
  function getReactionsAfterDiscard(tb:any){
    const out=tb.lastDiscard?.tile as string; const from=tb.lastDiscard?.from as number;
    if(!out && out!=='') return [];
    const res:any[]=[];
    for(let k=1;k<=3;k++){
      const seat=(from+k)%4;
      if(tb.players[seat]?.isWinner) continue;
      const h=tb.players[seat].hand;
      const acts:string[]=[];
      if(canWinWith(h,out)) acts.push('HU');
      if(countInHand(h,out)>=3) acts.push('GANG');
      if(countInHand(h,out)>=2) acts.push('PENG');
      if(k===1){
        const seqs=possibleChiSeqs(h,out); if(seqs.length) acts.push('CHI');
      }
      if(acts.length) res.push({ seat, actions: acts });
    }
    return res;
  }
  function priorityResolve(reacts:any[]){
    if(!reacts.length) return [];
    const hu=reacts.filter(r=>r.actions.includes('HU')); if(hu.length) return hu;
    const gang=reacts.find(r=>r.actions.includes('GANG')); if(gang) return [gang];
    const peng=reacts.find(r=>r.actions.includes('PENG')); if(peng) return [peng];
    const chi=reacts.find(r=>r.actions.includes('CHI')); if(chi) return [chi];
    return [];
  }
  function applyMeldAction(tb:any, seat:number, type:MeldType, tiles:string[]){
    const p=tb.players[seat];
    if(type==='PENG'){
      const t=tiles[0];
      for(let c=0;c<2;c++){ const idx=p.hand.indexOf(t); if(idx>=0) p.hand.splice(idx,1); }
      p.melds=[...(p.melds||[]), {type:'PENG', tiles:[t,t,t]}];
    } else if(type==='CHI'){
      const taken=tb.lastDiscard?.tile;
      const need=tiles.filter(x=>x!==taken);
      for(const t of need){ const idx=p.hand.indexOf(t); if(idx>=0) p.hand.splice(idx,1); }
      p.melds=[...(p.melds||[]), {type:'CHI', tiles:[...tiles]}];
    } else if(type==='GANG'){
      const t=tiles[0];
      for(let c=0;c<3;c++){ const idx=p.hand.indexOf(t); if(idx>=0) p.hand.splice(idx,1); }
      p.melds=[...(p.melds||[]), {type:'GANG', tiles:[t,t,t,t]}];
    }
    tb.lastDiscard=null;
  }
  function applyConcealedGangAction(tb:any, seat:number, t:string){
    const p=tb.players[seat];
    for(let c=0;c<4;c++){ const idx=p.hand.indexOf(t); if(idx>=0) p.hand.splice(idx,1); }
    p.melds=[...(p.melds||[]), {type:'ANGANG', tiles:[t,t,t,t]}];
  }
  function applyAddGangAction(tb:any, seat:number, t:string){
    const p=tb.players[seat];
    const idx=p.hand.indexOf(t); if(idx>=0) p.hand.splice(idx,1);
    const m=(p.melds||[]).find(m=>m.type==='PENG'&&m.tiles[0]===t);
    if(m){ m.type='GANG'; m.tiles=[t,t,t,t]; }
    else{ p.melds=[...(p.melds||[]), { type:'GANG', tiles:[t,t,t,t] }]; }
  }

  // ===== 牌墙 =====
  function generateWall(mode:RuleMode){ const out:string[]=[]; const suits=['W','T','B']; for(const s of suits){ for(let n=1;n<=9;n++){ for(let k=0;k<4;k++) out.push(`${n}${s}`);} } if(mode==='BASIC'){ for(let n=1;n<=7;n++){ for(let k=0;k<4;k++) out.push(`${n}Z`);} } return out; }
  function shuffle<T>(a:T[]){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } }

  // ===== AI =====
  async function askAI(provider:string, hand:string[], snapshot:any){
    try{
      const resp = await fetch(`/api/aiPlay?provider=${encodeURIComponent(provider)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ hand, keys, snapshot }) });
      if(!resp.ok) throw new Error('api fail');
      const data = await resp.json(); return data;
    }catch(e){
      const includeHonors = (ruleMode!=='SCZDXZ'); const keepScore=(x:string)=>{ const s=x[1], n=+x[0]; let v=0; const has=(t:string)=> hand.includes(t); if(hand.filter(t=>t===x).length>=2) v+=2; if(s!=='Z'){ if(has(`${n-1}${s}`)) v+=2; if(has(`${n+1}${s}`)) v+=2; if(has(`${n-2}${s}`)||has(`${n+2}${s}`)) v+=1; } return v; };
      let drop = hand[0], bestSh=999, bestUke=-1, bestKeep=1e9;
      for(const x of hand){ const h2=hand.slice(); const idx=h2.indexOf(x); if(idx>=0) h2.splice(idx,1); const sh=bestShanten(h2, 0, includeHonors); const uk=ukeire(h2, snapshot, includeHonors).total; const kp=-keepScore(x); if(sh<bestSh||(sh===bestSh&&(uk>bestUke||(uk===bestUke&&kp<bestKeep)))){ bestSh=sh; bestUke=uk; bestKeep=kp; drop=x; } }
      const reason=`local fallback；shanten=${bestSh}，uke=${bestUke}`; return { tile: drop, reason, meta:{ usedApi:false, provider:'local', detail:'shanten+uke' } };
    }
  }

  // ===== 主循环 =====
  async function playOneHand(ps: PlayerState[], w: string[], rRef: React.RefObject<boolean>) {
    if (!rRef?.current) { appendLogs(['回合未开始或已停止']); return; }
    const skipDrawOnce = new Set<number>(); const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
    const includeHonors = (ruleMode !== 'SCZDXZ'); const seatKeys = ['E','S','W','N'] as const;
    const stillActive = ()=> (table?.players||ps).filter(p=>!p?.isWinner).length;
    outer: while (rRef.current && w.length>0 && stillActive()>1) {
      for (let i=0; i<ps.length; i++) {
        if (!rRef.current) { appendLogs(['回合未开始或已停止']); break outer; }
        if (table?.players?.[i]?.isWinner || ps[i]?.isWinner) continue;
        if (!table) break outer;

        // 1) 抓牌
        if(!skipDrawOnce.has(i)){
          if (w.length<=0) break outer;
          const t = w.shift()!; ps[i].hand.push(t); appendLogs([`🀄 ${ps[i].ai} 摸 ${tileLabel(t)}`]);
          table.wall=[...w]; setWall([...w]); setPlayers([...ps]);
          table.players = ps.map((p,idx)=>({ ...p, hand:[...(p.hand||[])], discards:[...(p.discards||[])], melds:(table.players?.[idx]?.melds||[]), isWinner:(table.players?.[idx]?.isWinner||false) }));
          table.turn=i; setTable({ ...table });

          // 暗杠
          const cnt:Record<string,number>={}; for(const x of ps[i].hand) cnt[x]=(cnt[x]||0)+1;
          const candidates=Object.keys(cnt).filter(k=>cnt[k]>=4);
          if(candidates.length){
            const mc=(table.players[i]?.melds||[]).length; const before=bestShanten(ps[i].hand, mc, includeHonors);
            let pick:string|null=null, bestGain=-999, bestUke=-1;
            for(const k of candidates){ const afterH=handAfterRemove(ps[i].hand,[k,k,k,k]); const after=bestShanten(afterH, mc+1, includeHonors); if(after<=before){ const uk=ukeire(afterH, table, includeHonors).total; const gain=before-after; if(gain>bestGain||(gain===bestGain&&uk>bestUke)){ bestGain=gain; bestUke=uk; pick=k; } } }
            if(pick){ applyConcealedGangAction(table, i, pick); appendLogs([`➡️ ${ps[i].ai} 暗杠 ${tileLabel(pick)}（补摸一张，sh ${before}→${before-bestGain}${bestUke>=0?`，uke ${bestUke}`:''}）`]); setTable({ ...table });
              if(w.length>0){ const g=w.shift()!; ps[i].hand.push(g); table.wall=[...w]; setWall([...w]); setPlayers([...ps]); appendLogs([`🀄 ${ps[i].ai} 补摸 ${tileLabel(g)}`]); setTable({ ...table });
                const mc2=(table.players[i]?.melds||[]).length; const sh2=bestShanten(ps[i].hand, mc2, includeHonors);
                if(sh2===-1){ const score=calcHuScore(ps[i].hand.slice(), table.players[i]?.melds||[], true, includeHonors); settleZimo(ps, i, score.points, score.labels); table.players[i].isWinner=true; ps[i].isWinner=true; appendLogs([`🎉 ${ps[i].ai} 自摸`]); setPlayers([...ps]); setTable({ ...table }); const alive=(table.players||ps).filter(p=>!p.isWinner).length; if(alive<=1){ setHandRunning(false); if(rRef) rRef.current=false; appendLogs(['✅ 本轮结束（自摸）']); return; } else { continue; } }
              }
            }
          }
          // 补杠（碰升级）
          const myMelds=(table.players[i]?.melds||[]);
          for(const m of myMelds){ if(m.type==='PENG'){ const t0=m.tiles[0]; if(ps[i].hand.includes(t0)){ applyAddGangAction(table, i, t0); appendLogs([`➡️ ${ps[i].ai} 补杠 ${tileLabel(t0)}（补摸一张）`]); setTable({ ...table }); if(w.length>0){ const g=w.shift()!; ps[i].hand.push(g); table.wall=[...w]; setWall([...w]); setPlayers([...ps]); appendLogs([`🀄 ${ps[i].ai} 补摸 ${tileLabel(g)}`]); setTable({ ...table });
                const mc2=(table.players[i]?.melds||[]).length; const sh2=bestShanten(ps[i].hand, mc2, includeHonors);
                if(sh2===-1){ const score=calcHuScore(ps[i].hand.slice(), table.players[i]?.melds||[], true, includeHonors); settleZimo(ps, i, score.points, score.labels); table.players[i].isWinner=true; ps[i].isWinner=true; appendLogs([`🎉 ${ps[i].ai} 自摸`]); setPlayers([...ps]); setTable({ ...table }); const alive=(table.players||ps).filter(p=>!p.isWinner).length; if(alive<=1){ setHandRunning(false); if(rRef) rRef.current=false; appendLogs(['✅ 本轮结束（自摸）']); return; } else { continue; } }
              } } } }
        } else { skipDrawOnce.delete(i); }

        // 2) 出牌
        if (!rRef.current) { appendLogs(['回合未开始或已停止']); break outer; }
        const snapshot:any = table ? { players: table.players, discards: table.discards } : {};
        const seatKey = (['E','S','W','N'] as const)[i] || 'E';
        const provider = (seatProvider as any)[seatKey] || 'local';
        const decide = await askAI(provider, [...ps[i].hand], snapshot);
        const out = (decide && decide.tile && ps[i].hand.includes(decide.tile)) ? decide.tile : ps[i].hand[0];
        const reasonText = decide?.reason || 'local';
        const idxTile = ps[i].hand.indexOf(out); if(idxTile>=0) ps[i].hand.splice(idxTile,1);
        ps[i].discards.push(out);
        appendLogs([`${ps[i].ai} 打出 ${tileLabel(out)} — ${decide?.meta?.usedApi ? 'API:' + (decide?.meta?.provider||'local') : '本地'}；${reasonText}`]);

        table.players = ps.map((p,idx)=>({ ...p, hand:[...(p.hand||[])], discards:[...(p.discards||[])], melds:(table.players?.[idx]?.melds||[]), isWinner:(table.players?.[idx]?.isWinner||false) }));
        table.wall=[...w]; setWall([...w]); table.lastDiscard = { tile: out, from: i }; table.turn=i; setPlayers([...ps]); setTable({ ...table });

        // 3) 反应
        const reacts = getReactionsAfterDiscard(table);
        const resolved = priorityResolve(reacts);

        // 3.1 多家可胡（计分）
        const huSeats = resolved.filter(r=>r.actions.includes('HU')).map(r=>r.seat);
        if(huSeats.length){
          for(const s of huSeats){
            const full14=[...ps[s].hand, out];
            const score=calcHuScore(full14, table.players[s]?.melds||[], false, includeHonors);
            settleRong(ps, s, i, score.points, score.labels, out);
            table.players[s].isWinner=true; ps[s].isWinner=true;
            appendLogs([`🎉 ${ps[s].ai} 荣和（${tileLabel(out)}）`]);
          }
          setPlayers([...ps]); setTable({ ...table });
          if ((table.players||ps).filter(p=>!p.isWinner).length<=1) break outer;
        }

        // 3.2 明杠
        const gangSeat = resolved.find(r=>r.actions.includes('GANG'))?.seat;
        if(typeof gangSeat==='number' && !table.players[gangSeat].isWinner){
          const actor = gangSeat;
          applyMeldAction(table, actor, 'GANG', [out,out,out,out]);
          appendLogs([`➡️ ${ps[actor].ai} 明杠 ${tileLabel(out)}（补摸一张）`]);
          setTable({ ...table });
          if(w.length>0){
            const g=w.shift()!; ps[actor].hand.push(g);
            table.wall=[...w]; setWall([...w]); setPlayers([...ps]); appendLogs([`🀄 ${ps[actor].ai} 补摸 ${tileLabel(g)}`]); setTable({ ...table });
            const mc2=(table.players[actor]?.melds||[]).length; const sh2=bestShanten(ps[actor].hand, mc2, includeHonors);
            if(sh2===-1){ const score=calcHuScore(ps[actor].hand.slice(), table.players[actor]?.melds||[], true, includeHonors); settleZimo(ps, actor, score.points, score.labels); table.players[actor].isWinner=true; ps[actor].isWinner=true; appendLogs([`🎉 ${ps[actor].ai} 自摸`]); setPlayers([...ps]); setTable({ ...table }); const alive=(table.players||ps).filter(p=>!p.isWinner).length; if(alive<=1){ setHandRunning(false); if(rRef) rRef.current=false; appendLogs(['✅ 本轮结束（自摸）']); return; } else { skipDrawOnce.add(actor); i = actor - 1; continue; } }
          }
          skipDrawOnce.add(actor); i = actor - 1; continue;
        }

        // 3.3 碰
        const pengSeat = resolved.find(r=>r.actions.includes('PENG'))?.seat;
        if(typeof pengSeat==='number' && !table.players[pengSeat].isWinner){
          const actor = pengSeat;
          const mc=(table.players[actor]?.melds||[]).length; const before=bestShanten(ps[actor].hand, mc, includeHonors);
          const afterHand=handAfterRemove(ps[actor].hand,[out,out]); const after=bestShanten(afterHand, mc+1, includeHonors);
          if(after<=before){ applyMeldAction(table, actor, 'PENG', [out,out,out]); const uke=ukeire(afterHand, table, includeHonors).total; appendLogs([`➡️ ${ps[actor].ai} 碰 ${tileLabel(out)}（sh ${before}→${after}，uke ${uke}）`]); setTable({ ...table }); skipDrawOnce.add(actor); i=actor-1; continue; } else { appendLogs([`↩️ 放弃碰 ${tileLabel(out)}（sh ${before}→${after} 变差）`]); }
        }

        // 3.4 吃（仅下家）
        const chiSeat = resolved.find(r=>r.actions.includes('CHI'))?.seat;
        if(typeof chiSeat==='number' && !table.players[chiSeat].isWinner){
          const actor = chiSeat;
          const seqs=possibleChiSeqs(ps[actor].hand, out);
          const mc=(table.players[actor]?.melds||[]).length; const before=bestShanten(ps[actor].hand, mc, includeHonors);
          let chooseSeq:string[]|null=null, bestGain=-999, bestUke=-1;
          for(const seq of seqs){ const myTwo=seq.filter(x=>x!==out); const afterH=handAfterRemove(ps[actor].hand,myTwo); const after=bestShanten(afterH, mc+1, includeHonors); if(after<=before){ const uk=ukeire(afterH, table, includeHonors).total; const gain=before-after; if(gain>bestGain || (gain===bestGain && uk>bestUke)){ bestGain=gain; bestUke=uk; chooseSeq=seq; } } }
          if(chooseSeq){ applyMeldAction(table, actor, 'CHI', chooseSeq); appendLogs([`➡️ ${ps[actor].ai} 吃 ${chooseSeq.map(tileLabel).join('-')}（sh ${before}→${before-bestGain}，uke ${bestUke}）`]); setTable({ ...table }); skipDrawOnce.add(actor); i=actor-1; continue; } else { appendLogs([`↩️ 放弃吃 ${tileLabel(out)}（吃后不更近）`]); }
        }

        // 无人反应
        psRef.current = ps; wallRef.current = w; setPlayers([...ps]); await sleep(intervalMs);
      }
    }
    setHandRunning(false); if(rRef) rRef.current=false; appendLogs(['✅ 本轮结束']);
  }

  return (
    <div className="max-w">
      <h1 style={{fontSize:22,fontWeight:700,marginBottom:12}}>Mahjong AI Match — 吃/碰/杠/胡（四川/传统 可切换）</h1>

      <div className="card">
        <div className="flex items-center gap-3" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <label className="small">规则：
            <select value={ruleMode} onChange={e=>setRuleMode(e.target.value as RuleMode)}>
              <option value="SCZDXZ">四川·血战到底（108）</option>
              <option value="BASIC">传统（136）</option>
            </select>
          </label>
          <label className="small">最大轮次：<input className="w-24" value={maxHands} onChange={e=>setMaxHands(Math.max(1,parseInt(e.target.value||'0',10)||1))} /></label>
          <label className="small">步进(ms)：<input className="w-24" value={intervalMs} onChange={e=>setIntervalMs(Math.max(0,parseInt(e.target.value||'0',10)||0))} /></label>
          <label className="small">起始分：<input className="w-24" value={startScore} onChange={e=>setStartScore(Math.max(0,parseInt(e.target.value||"0",10)||0))} /></label>
          <label className="small"><input type="checkbox" checked={showHands} onChange={e=>setShowHands(e.target.checked)} /> 显示手牌</label>
          <button onClick={startNewMatch}>开始新比赛</button>
          <button onClick={startNextHand} disabled={!matchActive}>开始下一轮</button>
          <button onClick={togglePause} disabled={!handRunning}>{paused ? '继续' : '暂停'}</button>
          <button onClick={stopHand} disabled={!handRunning}>停止当前轮次</button>
          <span className="small" style={{marginLeft:8}}>余牌：{(table?.wall?.length ?? wall.length)}</span>
        </div>

        <div style={{marginTop:8}}>
          <div className="small mb-1">座位与AI：</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:8}}>
            <label className="small">东：
              <select value={seatProvider.E} onChange={e=>setSeatProvider({...seatProvider, E:e.target.value})}>
                <option value="local">内置(Local)</option><option value="kimi2">Kimi</option><option value="kimi">Kimi(备用)</option><option value="gemini">Gemini</option><option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">南：
              <select value={seatProvider.S} onChange={e=>setSeatProvider({...seatProvider, S:e.target.value})}>
                <option value="local">内置(Local)</option><option value="kimi2">Kimi</option><option value="kimi">Kimi(备用)</option><option value="gemini">Gemini</option><option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">西：
              <select value={seatProvider.W} onChange={e=>setSeatProvider({...seatProvider, W:e.target.value})}>
                <option value="local">内置(Local)</option><option value="kimi2">Kimi</option><option value="kimi">Kimi(备用)</option><option value="gemini">Gemini</option><option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">北：
              <select value={seatProvider.N} onChange={e=>setSeatProvider({...seatProvider, N:e.target.value})}>
                <option value="local">内置(Local)</option><option value="kimi2">Kimi</option><option value="kimi">Kimi(备用)</option><option value="gemini">Gemini</option><option value="grok">Grok</option>
              </select>
            </label>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12, width:'100%', marginTop:8}}>
          <div>
            <div className="small mb-1">Kimi（Moonshot）API Key</div>
            <input className="w-full" placeholder="moonshot-..." value={keys.kimi2||''} onChange={e=>setKeys({...keys, kimi2:e.target.value})} />
          </div>
          <div>
            <div className="small mb-1">Kimi（Moonshot 备用）</div>
            <input className="w-full" placeholder="moonshot-..." value={keys.kimi||''} onChange={e=>setKeys({...keys, kimi:e.target.value})} />
          </div>
          <div>
            <div className="small mb-1">Gemini API Key</div>
            <input className="w-full" placeholder="AIza..." value={keys.gemini||''} onChange={e=>setKeys({...keys, gemini:e.target.value})} />
          </div>
          <div>
            <div className="small mb-1">Grok API Key</div>
            <input className="w-full" placeholder="xai-..." value={keys.grok||''} onChange={e=>setKeys({...keys, grok:e.target.value})} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex" style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16}}>
          {players.map((p, i) => (
            <div key={p.ai} className="mb-2">
              <div className="font-semibold">{p.ai}　<span className="text-xs" style={{opacity:.8}}>分：{p.score||0}</span></div>
              {showHands && (<>
                <div className="text-xs" style={{opacity:.95, marginTop:4}}>手：</div>
                <div className="tiles tiles-wrap-14">{sortTiles(p.hand||[]).map((x,j)=>(<Tile key={x+':h:'+j} t={x}/>))}</div>
              </>)}
              <div className="text-xs" style={{opacity:.85, marginTop:4}}>面子（吃/碰/杠）：</div>
              <div className="tiles">{(p.melds||[]).map((m:any,mi:number)=>(<span key={"meld:"+mi} className="meld-group">{(m.tiles||[]).map((x:string,xi:number)=>(<Tile key={x+":m:"+xi} t={x} small/>))}</span>))}</div>
              <div className="text-xs" style={{opacity:.85, marginTop:4}}>弃（顺序）：</div>
              <div className="tiles">{(p.discards||[]).map((x,j)=>(<Tile key={x+':d:'+j} t={x} small/>))}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="font-semibold mb-2">日志</div>
        <div className="log-sm" style={{whiteSpace:'pre-wrap'}}>{logs.join('\n')}</div>
      </div>
    </div>
  );
}

function Tile({t, small}:{t:string; small?:boolean}){
  const n=+t[0], s=t[1];
  const label = s==='W'? `${n}万` : s==='T'? `${n}条` : s==='B'? `${n}饼` : ['','东','南','西','北','中','发','白'][n]||t;
  return <span className={`tile ${small?'tile-sm':''}`}>{label}</span>;
}
