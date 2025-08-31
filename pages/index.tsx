
import React, { useState, useEffect, useRef } from 'react';
import {
  generateWall108, generateWall136, dealHands, drawTile, checkWin, type PlayerState,
  type RuleMode, getReactionsAfterDiscard, priorityResolve, applyMeldAction, onDrawPhase,
  discardTile, markWinner, applyConcealedGangAction, applyAddGangAction
} from '@/lib/mahjongEngine';

export default function Home(){
  function tileClass(t:string){ const s=t[1]; if(s==='W') return 'tile w'; if(s==='B') return 'tile b'; if(s==='T') return 'tile t'; return 'tile z'; }
  function tileLabel(t:string){ const n=t[0]; const s=t[1]; const mark = s==='W'?'万':(s==='B'?'饼':(s==='T'?'条':'字')); return `${n}${mark}`; }
  const Tile = ({t, small=false}:{t:string; small?:boolean})=>(<span className={tileClass(t)+(small?' small':'')} title={t}>{tileLabel(t)}</span>);

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [table, setTable] = useState<any|null>(null);
  const [wall, setWall] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [maxHands, setMaxHands] = useState(8);
  const [handNo, setHandNo] = useState(0);
  const [matchActive, setMatchActive] = useState(false);
  const [handRunning, setHandRunning] = useState(false);
  const [intervalMs, setIntervalMs] = useState(300);
  const [ruleMode, setRuleMode] = useState<RuleMode>('SCZDXZ');
  const [showHands, setShowHands] = useState(true);
  const [startScore, setStartScore] = useState(1000);
  const [seatProvider, setSeatProvider] = useState<{E:string;S:string;W:string;N:string}>({E:'local',S:'local',W:'local',N:'local'});
  const [paused, setPaused] = useState(false);
  const psRef = useRef<PlayerState[]|null>(null);
  const wallRef = useRef<string[]|null>(null);
  const runningRef = useRef(false);
  type Keys = { kimi?: string; kimi2?: string; gemini?: string; grok?: string };
  const [keys, setKeys] = useState<Keys>({});

  // load/save keys in sessionStorage
  useEffect(()=>{
    try{
      const s = sessionStorage.getItem('mahjong_api_keys');
      if(s){ setKeys(JSON.parse(s)); }
    }catch{}
  }, []);
  useEffect(()=>{
    try{ sessionStorage.setItem('mahjong_api_keys', JSON.stringify(keys||{})); }catch{}
  }, [keys]);
    

  function appendLogs(lines:string[]){ setLog(prev => { const next=[...prev]; for(const ln of lines){ next.push(ln); } return next; }); }


  // ===== 完全体 Shanten + Uke-ire =====
  const ALL_SUITS = ['W','B','T'] as const;
  function allTileKeys(includeHonors:boolean){
    const arr:string[] = [];
    for(const s of ALL_SUITS){ for(let n=1;n<=9;n++) arr.push(`${n}${s}`); }
    if(includeHonors){ for(let n=1;n<=7;n++) arr.push(`${n}Z`); }
    return arr;
  }
  function toSuitCounts(hand:string[]){
    const m:Record<string, number[]> = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) };
    const honors = Array(8).fill(0); // 1..7Z
    for(const t of hand){
      const s=t[1]; const n=parseInt(t[0],10)||0;
      if(s==='W'||s==='B'||s==='T'){ m[s][n]++; } else if(s==='Z'){ honors[n]++; }
    }
    return { suits:m, honors };
  }
  function cloneArr(a:number[]){ return a.slice(); }
  function evalSuitFull(cnt:number[]){
    // 深度搜索该门花色的最好 (mentsu, taatsu)
    const memo = new Map<string,[number,number]>();
    function dfs(a:number[], i=1):[number,number]{
      while(i<=9 && a[i]===0) i++;
      if(i>9) return [0,0];
      const key = i+':'+a.join(',');
      if(memo.has(key)) return memo.get(key)!;
      let best:[number,number]=[0,0];
      // 1) 跳过一张（用于后续与相邻组成搭子）
      {
        const b = cloneArr(a); b[i]--;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m, t]);
      }
      // 2) 刻子
      if(a[i]>=3){
        const b = cloneArr(a); b[i]-=3;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m+1, t]);
      }
      // 3) 顺子
      if(i<=7 && a[i+1]>0 && a[i+2]>0 && a[i]>0){
        const b = cloneArr(a); b[i]--; b[i+1]--; b[i+2]--;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m+1, t]);
      }
      // 4) 对子作为搭子
      if(a[i]>=2){
        const b = cloneArr(a); b[i]-=2;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m, t+1]);
      }
      // 5) 两面搭子 i,i+1
      if(i<=8 && a[i]>0 && a[i+1]>0){
        const b = cloneArr(a); b[i]--; b[i+1]--;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m, t+1]);
      }
      // 6) 岔张搭子 i,i+2
      if(i<=7 && a[i]>0 && a[i+2]>0){
        const b = cloneArr(a); b[i]--; b[i+2]--;
        const [m,t] = dfs(b, i);
        best = maxPair(best, [m, t+1]);
      }
      memo.set(key, best);
      return best;
    }
    function maxPair(a:[number,number], b:[number,number]){
      if(b[0]>a[0]) return b;
      if(b[0]===a[0] && b[1]>a[1]) return b;
      return a;
    }
    return dfs(cnt.slice());
  }
  function honorsEval(honors:number[]){
    // honors only triplets & pairs
    let m=0,t=0,pairs=0;
    for(let n=1;n<=7;n++){
      const c = honors[n];
      if(c>=3){ m += Math.floor(c/3); }
      if(c%3===2){ t += 1; pairs += Math.floor(c/2); }
      else if(c%3===1){ /* single no taatsu */ }
    }
    return { m, t, pairs };
  }
  function normalHandShantenFull(hand:string[], meldsCount:number){
    const { suits, honors } = toSuitCounts(hand);
    let totalM = 0, totalT = 0;
    // 数牌三门
    for(const s of ALL_SUITS){
      const [m,t] = evalSuitFull(suits[s]);
      totalM += m; totalT += t;
    }
    // 字牌
    const he = honorsEval(honors);
    totalM += he.m; totalT += he.t;
    // 限制搭子数：不能超过 (4 - (鸣面子 + 门清面子))
    const mentsu = Math.min(4, totalM + meldsCount);
    const maxTaatsu = Math.max(0, 4 - mentsu);
    const taatsu = Math.min(totalT, maxTaatsu);
    // 判断是否有对子充当将：若无，则 shanten +1
    const hasPair = (he.pairs > 0) || hasAnyPair(suits);
    let sh = 8 - (2*mentsu + taatsu) - (hasPair?1:0);
    return Math.max(-1, sh);
  }
  function hasAnyPair(suits:Record<string,number[]>){
    for(const s of ALL_SUITS){ for(let n=1;n<=9;n++){ if(suits[s][n]>=2) return true; } }
    return false;
  }
  function sevenPairsShanten(hand:string[], includeHonors:boolean){
    // 7对向听：需要7个对子，不能有刻子（刻子算1对，其余2张浪费）
    const cnt:Record<string,number> = {};
    for(const t of hand){ cnt[t]=(cnt[t]||0)+1; }
    let pairs=0, extras=0, kinds=0;
    for(const key of Object.keys(cnt)){
      kinds++;
      pairs += Math.floor(cnt[key]/2);
      if(cnt[key]>=3) extras++; // 刻子多出来一张
    }
    let sh = 6 - pairs + Math.max(0, 7 - kinds);
    return Math.max(-1, sh);
  }
  function bestShanten(hand:string[], meldsCount:number, includeHonors:boolean){
    const a = normalHandShantenFull(hand, meldsCount);
    const b = sevenPairsShanten(hand, includeHonors);
    return Math.min(a,b);
  }
  function seenMapFromSnapshot(snapshot:any, selfHand:string[]){
    const seen:Record<string,number>={};
    const add=(t:string)=>{ seen[t]=(seen[t]||0)+1; };
    for(const t of selfHand) add(t);
    const players = Array.isArray(snapshot?.players)? snapshot.players: [];
    for(const p of players){
      const ds = Array.isArray(p?.discards)? p.discards: [];
      for(const d of ds) add(d);
      const melds = Array.isArray(p?.melds)? p.melds: [];
      for(const m of melds){
        const tiles = Array.isArray(m?.tiles)? m.tiles: [];
        for(const d of tiles) add(d);
      }
    }
    const tableDis = Array.isArray(snapshot?.discards)? snapshot.discards: [];
    for(const d of tableDis) add(d);
    return seen;
  }
  function ukeire(hand:string[], snapshot:any, includeHonors:boolean){
    const meldsCount = Array.isArray(snapshot?.players) ? (snapshot.players.find((x:any)=>x?.hand===hand)?.melds?.length || 0) : 0;
    const sh0 = bestShanten(hand, meldsCount, includeHonors);
    const keys = allTileKeys(includeHonors);
    const seen = seenMapFromSnapshot(snapshot||{}, hand);
    let total=0; const detail:Record<string,number>={};
    for(const k of keys){
      const remain = Math.max(0, 4 - (seen[k]||0));
      if(remain<=0) continue;
      const h2 = hand.slice(); h2.push(k);
      const sh1 = bestShanten(h2, meldsCount, includeHonors);
      if(sh1 < sh0){
        total += remain; detail[k]=remain;
      }
    }
    return { total, detail, sh0 };
  }

  function sortTiles(arr:string[]){
    const order=(t:string)=>{
      const suitRank = t[1]==='W'?0:(t[1]==='B'?1:(t[1]==='T'?2:3));
      return suitRank*100 + (parseInt(t[0],10)||0);
    };
    return [...arr].sort((a,b)=>order(a)-order(b));
  }

  // 计算可以吃的三张序列（包含目标牌）

  // ---- 简易 Shanten 估算：支持 4面子+1将，考虑已鸣牌数 ----
  function shantenApprox_OBSOLETE(hand:string[], meldsCount:number){
    // 拷贝手，按花色统计
    const bySuit:Record<string, number[]> = { W:Array(10).fill(0), B:Array(10).fill(0), T:Array(10).fill(0) };
    const honors:Record<string, number> = {}; // 四川无字牌时为空
    for(const t of hand){
      const s=t[1]; const n=parseInt(t[0],10);
      if(s==='W'||s==='B'||s==='T'){ bySuit[s][n]++; }
      else { honors[t]=(honors[t]||0)+1; }
    }
    // 先贪心吃顺（每门按 1-7）
    let mentsuInHand = 0;
    const suitClone=(arr:number[])=>arr.slice();
    function eatSeq(arr:number[]){
      let made=0;
      for(let n=1;n<=7;n++){
        while(arr[n]>0 && arr[n+1]>0 && arr[n+2]>0){
          arr[n]--;arr[n+1]--;arr[n+2]--; made++;
        }
      }
      return made;
    }
    function takePungs(arr:number[]){
      let made=0;
      for(let n=1;n<=9;n++){
        while(arr[n]>=3){ arr[n]-=3; made++; }
      }
      return made;
    }
    let tmp;
    // 尝试两种顺序：先顺后刻、先刻后顺，取最大
    let bestM=0;
    for(const order of [0,1]){
      const W=suitClone(bySuit.W), B=suitClone(bySuit.B), T=suitClone(bySuit.T);
      let m=0;
      if(order===0){
        m+=eatSeq(W)+eatSeq(B)+eatSeq(T);
        m+=takePungs(W)+takePungs(B)+takePungs(T);
      }else{
        m+=takePungs(W)+takePungs(B)+takePungs(T);
        m+=eatSeq(W)+eatSeq(B)+eatSeq(T);
      }
      bestM=Math.max(bestM,m);
    }
    mentsuInHand = bestM;

    // 计算将（对子）
    let pairs=0;
    for(const s of ['W','B','T']){
      for(let n=1;n<=9;n++){
        const cnt = bySuit[s][n];
        if(cnt>=2) pairs += Math.floor(cnt/2);
      }
    }
    for(const k in honors){ if(honors[k]>=2) pairs += Math.floor(honors[k]/2); }

    // 已鸣的面子数
    const mentsuTotal = mentsuInHand + (meldsCount||0);
    const pairFlag = pairs>0 ? 1 : 0;
    // 目标：4面子+1将 → 8 - (2*面子 + 将)
    const sh = 8 - (2*mentsuTotal + pairFlag);
    return Math.max(-1, sh); // -1 即听牌
  }

  function handAfterRemove(orig:string[], tiles:string[]){
    const h = [...orig];
    for(const t of tiles){
      const idx = h.indexOf(t);
      if(idx>=0) h.splice(idx,1);
    }
    return h;
  }

  function possibleChiSeqs(hand:string[], taken:string){
    const s = taken[1]; const n = parseInt(taken[0],10);
    const has=(x:string)=>hand.includes(x);
    const seqs:string[][]=[];
    if(s==='W'||s==='B'||s==='T'){
      if(n>=3 && has(`${n-2}${s}`) && has(`${n-1}${s}`)) seqs.push([`${n-2}${s}`,`${n-1}${s}`,taken]);
      if(n>=2 && n<=8 && has(`${n-1}${s}`) && has(`${n+1}${s}`)) seqs.push([`${n-1}${s}`,taken,`${n+1}${s}`]);
      if(n<=7 && has(`${n+1}${s}`) && has(`${n+2}${s}`)) seqs.push([taken,`${n+1}${s}`,`${n+2}${s}`]);
    }
    return seqs;
  }

  function startNewMatch() {
    setLog([]);
    const w = ruleMode==='SCZDXZ' ? generateWall108() : generateWall136();
    const ps = dealHands(w, ['东','南','西','北']);
    // 统一起始分
    for(const p of ps){ (p as any).score = startScore; }
    setPlayers(ps);
    setWall(w);
    setTable({ wall: [...w], discards: [], players: ps.map(p=>({ ...p, melds: [], isWinner:false })), turn: 0, dealer:0, lastDiscard:null, roundActive:true, winners: [], rule: ruleMode });
    appendLogs(['新比赛开始（轮次清零，分数重置）']);
    setHandNo(0);
    setMatchActive(true);
    setHandRunning(false);
    setPaused(false);
    psRef.current = null; wallRef.current = null;
    runningRef.current = false;
    runningRef.current = false;
  }

  function startNextHand(){
    if(!matchActive){ alert('请先开始新比赛'); return; }
    if(handRunning){ alert('当前一轮仍在进行中'); return; }
    if(handNo>=maxHands){ alert('本场比赛轮次已满，请新开一场比赛'); return; }
    const w = ruleMode==='SCZDXZ' ? generateWall108() : generateWall136();
    const ps = players.map(p => ({ ...p, hand: w.splice(0,13), discards: [], melds: [], isWinner:false }));
    setPlayers(ps); setWall(w);
    setTable({ wall: [...w], discards: [], players: ps.map(p=>({ ...p })), turn: 0, dealer:0, lastDiscard:null, roundActive:true, winners: [], rule: ruleMode });
    psRef.current = ps; wallRef.current = w; setPaused(false);
    appendLogs([`—— 第 ${handNo+1}/${maxHands} 轮开始 ——`]);
    setHandRunning(true);
    runningRef.current = true;
    void playOneHand(ps, w, runningRef);
  }


  async function askAI(provider:string, hand:string[], snapshot:any){
    try{
      const resp = await fetch(`/api/aiPlay?provider=${encodeURIComponent(provider)}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ hand, keys, snapshot })
      });
      const data = await resp.json();
      if(data && typeof data.tile==='string' && hand.includes(data.tile)){
        return data;
      }
    }catch(e){}
    // fallback: drop first
    return { tile: hand[0], reason: 'fallback (no api)', meta:{ usedApi:false, provider:'local' } };
  }
    
  
  function togglePause(){
    if(!handRunning) return;
    if(!paused){
      runningRef.current = false;
      setPaused(true);
      appendLogs(['⏸️ 已暂停']);
    }else{
      runningRef.current = true;
      setPaused(false);
      appendLogs(['▶️ 继续']);
      if(psRef.current && wallRef.current){
        void playOneHand(psRef.current, wallRef.current, runningRef);
      }
    }
  }
  function stopHand(){
    if(!handRunning) return;
    runningRef.current = false;
    setPaused(false);
    setHandRunning(false);
    appendLogs(['⏹️ 已停止当前轮次']);
  }

  async function playOneHand(ps:PlayerState[], w:string[], rRef: React.RefObject<boolean>){
    for(let turn=0; turn<2000; turn++){
      if(!rRef?.current){ appendLogs(['回合未开始或已停止']); return; }
      if(w.length===0){ appendLogs(['牌墙打空，流局']); break; }
      for(let i=0;i<ps.length;i++){
        // 跳过已胡
        // @ts-ignore
        if(table?.players?.[i]?.isWinner) continue;

        // 1) 摸牌
        const t = w.shift()!;
        ps[i].hand.push(t);
        setWall([...w]);

        // 1.1) 自摸
        const r = checkWin(ps[i].hand);
        if(r.win){
          appendLogs([`${ps[i].ai} 自摸：${r.fan.join('+')} = ${r.score}`]);
          // 标记赢家并继续血战
          if(table){ markWinner(table, i); setTable({ ...table });

            // 同步玩家可视状态（手牌/面子/弃牌）
            for(let si=0; si<table.players.length; si++){
              if(ps[si]){
                ps[si].hand = [...(table.players[si]?.hand||[])];
                ps[si].discards = [...(table.players[si]?.discards||[])];
                // @ts-ignore
                ps[si].melds = [...(table.players[si]?.melds||[])];
              }
            }
            setPlayers([...ps]);
}
setPlayers([...ps]);
          await new Promise(r=>setTimeout(r, intervalMs));
          continue;
        }

        // 1.2) 杠（优先 BUGANG，再看 ANGANG）
        if(table){
          const me = table.players[i];
          // 补杠：已有碰，且摸到同张 t
          const hasPeng = (me.melds||[]).some((m:any)=>m.type==='PENG' && m.tiles && m.tiles[0]===t);
          if(hasPeng){
            applyAddGangAction(table, i, t);
            appendLogs([`➡️ ${ps[i].ai} 补杠 ${tileLabel(t)}（补摸一张）`]);
            if(table){ table.wall = [...w]; }
            setTable({ ...table });
            setWall([...w]);

            // 同步玩家可视状态（手牌/面子/弃牌）
            for(let si=0; si<table.players.length; si++){
              if(ps[si]){
                ps[si].hand = [...(table.players[si]?.hand||[])];
                ps[si].discards = [...(table.players[si]?.discards||[])];
                // @ts-ignore
                ps[si].melds = [...(table.players[si]?.melds||[])];
              }
            }
            setPlayers([...ps]);

            // 杠后自动补一张到手里已经在后端完成；此处不再自摸判断，继续流程
          }else{
            // 暗杠：四张相同
            const counts:Record<string,number>={}; for(const x of ps[i].hand) counts[x]=(counts[x]||0)+1;
            const angang = Object.entries(counts).find(([k,v])=>v===4)?.[0];
            if(angang){
              const meldsCount = (table.players[i]?.melds||[]).length;
              const includeHonors = (ruleMode!=='SCZDXZ');
                const before = bestShanten(ps[i].hand, meldsCount, includeHonors);
                const afterHand = handAfterRemove(ps[i].hand, [angang,angang,angang,angang]);
                const after = bestShanten(afterHand, meldsCount+1, includeHonors);
                const ukeAfter = ukeire(afterHand, table, includeHonors);
              if(after <= before){
                applyConcealedGangAction(table, i, angang as string);
                appendLogs([`➡️ ${ps[i].ai} 暗杠 ${tileLabel(angang)}（补摸一张，shanten ${before}→${after}）`]);
                setTable({ ...table });
              } else {
                appendLogs([`↩️ 放弃暗杠 ${tileLabel(angang)}（shanten ${before}→${after} 变差）`]);
              }
            }setWall([...w]);

            // 同步玩家可视状态（手牌/面子/弃牌）
            for(let si=0; si<table.players.length; si++){
              if(ps[si]){
                ps[si].hand = [...(table.players[si]?.hand||[])];
                ps[si].discards = [...(table.players[si]?.discards||[])];
                // @ts-ignore
                ps[si].melds = [...(table.players[si]?.melds||[])];
              }
            }
            setPlayers([...ps]);

            }
          }
        }

        // 2) 出牌（调用 /api/aiPlay 决策 + 本地兜底）
        const snapshot:any = table ? { players: table.players, discards: table.discards } : {};
        const seatKeys = ['E','S','W','N'] as const; const seatKey = seatKeys[i] || 'E';
        const provider = (seatProvider as any)[seatKey] || 'local';
        const decide = await askAI(provider, [...ps[i].hand], snapshot);
        const out = (decide && decide.tile && ps[i].hand.includes(decide.tile)) ? decide.tile : ps[i].hand[0];
        const reasonText = decide?.reason || 'local';
        // 执行弃牌
        const idxTile = ps[i].hand.indexOf(out);
        ps[i].hand.splice(idxTile,1);
        ps[i].discards.push(out);
        appendLogs([`${ps[i].ai} 打出 ${tileLabel(out)} — ${decide?.meta?.usedApi ? 'API:' + (decide?.meta?.provider||'local') : '本地'}；${reasonText}`]);
        // 3) 询问反应并执行
        if(table){
          table.players = ps.map((p,idx)=>({ ...p, melds: (table.players[idx]?.melds||[]), isWinner: (table.players[idx]?.isWinner||false) }));
          table.wall = [...w];
          table.lastDiscard = { tile: out, from: i };
          table.turn = i;
          const reacts = getReactionsAfterDiscard(table);
          const resolved = priorityResolve(reacts);
          if(resolved && resolved.length>0){
            const huSeats = resolved.filter(r=>r.actions.includes('HU')).map(r=>r.seat);
            if(huSeats.length>0){
              for(const s of huSeats){
                markWinner(table, s);
                appendLogs([`➡️ ${ps[s].ai} 荣和（接炮） ${tileLabel(out)}`]);
              }
            }else{
              const gangSeat = resolved.find(r=>r.actions.includes('GANG'))?.seat;
              if(typeof gangSeat==='number'){
                applyMeldAction(table, gangSeat, 'GANG', [out,out,out,out]);
                appendLogs([`➡️ ${ps[gangSeat].ai} 明杠 ${tileLabel(out)}（补摸一张）`]);
              }else{
                const pengSeat = resolved.find(r=>r.actions.includes('PENG'))?.seat;
              if(typeof pengSeat==='number'){
                const actor = pengSeat;
                const meldsCount = (table.players[actor]?.melds||[]).length;
                const includeHonors = (ruleMode!=='SCZDXZ');
                const before = bestShanten(ps[actor].hand, meldsCount, includeHonors);
                const afterHand = handAfterRemove(ps[actor].hand, [out,out]);
                const after = bestShanten(afterHand, meldsCount+1, includeHonors);
                const ukeAfter = ukeire(afterHand, table, includeHonors);
                if(after <= before){
                  applyMeldAction(table, actor, 'PENG', [out,out,out]);
                  appendLogs([`➡️ ${ps[actor].ai} 碰 ${tileLabel(out)}（shanten ${before}→${after}）`]);
                } else {
                  appendLogs([`↩️ 放弃碰 ${tileLabel(out)}（shanten ${before}→${after} 变差）`]);
                }
              }else{
                  const chiSeat = resolved.find(r=>r.actions.includes('CHI'))?.seat;
                if(typeof chiSeat==='number'){
                  const actor = chiSeat;
                  const seqs = possibleChiSeqs(ps[actor].hand, out);
                  let bestSeq:string[]|null = null; let bestDelta=999;
                  const meldsCount = (table.players[actor]?.melds||[]).length;
                  const before = shantenApprox(ps[actor].hand, meldsCount);
                  for(const seq of seqs){
                    const myTwo = seq.filter(x=>x!==out);
                    const afterHand = handAfterRemove(ps[actor].hand, myTwo);
                    const after = shantenApprox(afterHand, meldsCount+1);
                    const delta = after - before;
                    if(after <= before && delta < bestDelta){ bestDelta = delta; bestSeq = seq; }
                  }
                  if(bestSeq){
                    applyMeldAction(table, actor, 'CHI', bestSeq);
                    appendLogs([`➡️ ${ps[actor].ai} 吃 ${bestSeq.map(tileLabel).join('-')}（shanten ${before}→${before+bestDelta}）`]);
                  }else{
                    appendLogs([`↩️ 放弃吃 ${tileLabel(out)}（吃后听牌形势不佳）`]);
                  }
                }
                }
              }
            }
            setTable({ ...table });
          }
        }

        psRef.current = ps; wallRef.current = w;
        setPlayers([...ps]);
        setWall([...w]);
        await new Promise(r=>setTimeout(r, intervalMs));
      }
    }
    appendLogs([`—— 第 ${handNo+1}/${maxHands} 轮结束 ——`]);
    setHandRunning(false);
    setPaused(false);
    psRef.current = null; wallRef.current = null;
    runningRef.current = false;
    runningRef.current = false;
    setHandNo(x=>x+1);
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
          <span className="small" style={{marginLeft:8}}>余牌：{wall.length}</span>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:12, width:'100%', marginTop:8}}>
          <div>
            
        <div style={{marginTop:8}}>
          <div className="small mb-1">座位与AI：</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0,1fr))', gap:8}}>
            <label className="small">东：
              <select value={seatProvider.E} onChange={e=>setSeatProvider({...seatProvider, E:e.target.value})}>
                <option value="local">内置(Local)</option>
                <option value="kimi2">Kimi</option>
                <option value="kimi">Kimi(备用)</option>
                <option value="gemini">Gemini</option>
                <option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">南：
              <select value={seatProvider.S} onChange={e=>setSeatProvider({...seatProvider, S:e.target.value})}>
                <option value="local">内置(Local)</option>
                <option value="kimi2">Kimi</option>
                <option value="kimi">Kimi(备用)</option>
                <option value="gemini">Gemini</option>
                <option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">西：
              <select value={seatProvider.W} onChange={e=>setSeatProvider({...seatProvider, W:e.target.value})}>
                <option value="local">内置(Local)</option>
                <option value="kimi2">Kimi</option>
                <option value="kimi">Kimi(备用)</option>
                <option value="gemini">Gemini</option>
                <option value="grok">Grok</option>
              </select>
            </label>
            <label className="small">北：
              <select value={seatProvider.N} onChange={e=>setSeatProvider({...seatProvider, N:e.target.value})}>
                <option value="local">内置(Local)</option>
                <option value="kimi2">Kimi</option>
                <option value="kimi">Kimi(备用)</option>
                <option value="gemini">Gemini</option>
                <option value="grok">Grok</option>
              </select>
            </label>
          </div>
        </div>
    
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
        <div className="log-sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\\n')}</div>
      </div>
    </div>
  );
}
