
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

  function sortTiles(arr:string[]){
    const order=(t:string)=>{
      const suitRank = t[1]==='W'?0:(t[1]==='B'?1:(t[1]==='T'?2:3));
      return suitRank*100 + (parseInt(t[0],10)||0);
    };
    return [...arr].sort((a,b)=>order(a)-order(b));
  }

  // 计算可以吃的三张序列（包含目标牌）
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
    const ps = dealHands(w, ['kimi','kimi2','gemini','grok']);
    setPlayers(ps);
    setWall(w);
    setTable({ wall: [...w], discards: [], players: ps.map(p=>({ ...p, melds: [], isWinner:false })), turn: 0, dealer:0, lastDiscard:null, roundActive:true, winners: [], rule: ruleMode });
    appendLogs(['新比赛开始（轮次清零，分数重置）']);
    setHandNo(0);
    setMatchActive(true);
    setHandRunning(false);
    if(rRef) rRef.current = false;
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
    appendLogs([`—— 第 ${handNo+1}/${maxHands} 轮开始 ——`]);
    setHandRunning(true);
    runningRef.current = true;
    void playOneHand(ps, w, runningRef);
  }


  async function askAI(ai:string, hand:string[], snapshot:any){
    try{
      const resp = await fetch(`/api/aiPlay?ai=${encodeURIComponent(ai)}`, {
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
        appendLogs([`🀄 ${ps[i].ai} 摸牌 ${tileLabel(t)}`]);

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
            setTable({ ...table });

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
              applyConcealedGangAction(table, i, angang);
              appendLogs([`➡️ ${ps[i].ai} 暗杠 ${tileLabel(angang)}（补摸一张）`]);
              setTable({ ...table });

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
        const decide = await askAI(ps[i].ai, [...ps[i].hand], snapshot);
        const out = (decide && decide.tile && ps[i].hand.includes(decide.tile)) ? decide.tile : ps[i].hand[0];
        const reasonText = decide?.reason || 'local';
        // 执行弃牌
        const idxTile = ps[i].hand.indexOf(out);
        ps[i].hand.splice(idxTile,1);
        ps[i].discards.push(out);
        appendLogs([`[API] ${ps[i].ai} ${decide?.meta?.usedApi? '使用' : '未使用'}（${decide?.meta?.provider||'local'}）`, `${ps[i].ai} 打出 ${tileLabel(out)}（理由：${reasonText}）`]);
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
                  applyMeldAction(table, pengSeat, 'PENG', [out,out,out]);
                  appendLogs([`➡️ ${ps[pengSeat].ai} 碰 ${tileLabel(out)}`]);
                }else{
                  const chiSeat = resolved.find(r=>r.actions.includes('CHI'))?.seat;
                  if(typeof chiSeat==='number'){
                    const seqs = possibleChiSeqs(ps[chiSeat].hand, out);
                    const choose = seqs[0]||[];
                    if(choose.length===3){
                      applyMeldAction(table, chiSeat, 'CHI', choose);
                      appendLogs([`➡️ ${ps[chiSeat].ai} 吃 ${choose.map(tileLabel).join('-')}`]);
                    }
                  }
                }
              }
            }
            setTable({ ...table });
          }
        }

        setPlayers([...ps]);
        await new Promise(r=>setTimeout(r, intervalMs));
      }
    }
    appendLogs([`—— 第 ${handNo+1}/${maxHands} 轮结束 ——`]);
    setHandRunning(false);
    if(rRef) rRef.current = false;
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
          <label className="small"><input type="checkbox" checked={showHands} onChange={e=>setShowHands(e.target.checked)} /> 显示手牌</label>
          <button onClick={startNewMatch}>开始新比赛</button>
          <button onClick={startNextHand} disabled={!matchActive}>开始下一轮</button>
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
        <div className="log-sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\\n')}</div>
      </div>
    </div>
  );
}
