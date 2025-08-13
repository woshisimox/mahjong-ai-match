import React, { useState } from 'react';
import { generateWall, dealHands, drawTile, checkWin, type PlayerState } from '@/lib/mahjongEngine';

export default function Home(){
  function tileClass(t:string){ const s=t[1]; if(s==='W') return 'tile w'; if(s==='B') return 'tile b'; if(s==='T') return 'tile t'; return 'tile z'; }
  function tileLabel(t:string){ const n=t[0]; const s=t[1]; if(s==='Z'){ const map:Record<string,string>={ '1':'東','2':'南','3':'西','4':'北','5':'中','6':'發','7':'白' }; return map[n]||t; } const mark = s==='W'?'万':(s==='B'?'饼':'条'); return `${n}${mark}`; }
  const Tile = ({t, small=false}:{t:string; small?:boolean})=>(<span className={tileClass(t)+(small?' small':'')} title={t}>{tileLabel(t)}</span>);

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [maxHands, setMaxHands] = useState(16);
  const [handNo, setHandNo] = useState(0);
  const [matchActive, setMatchActive] = useState(false);
  const [handRunning, setHandRunning] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [showHands, setShowHands] = useState(true);
  const [keys, setKeys] = useState<{kimi?:string; kimi2?:string; gemini?:string; grok?:string}>({});

  function appendLogs(lines: string[]){
    setLog(prev => {
      const next=[...prev];
      for(const ln of lines){
        if(next.length===0 || next[next.length-1]!==ln) next.push(ln);
      }
      return next;
    });
  }

  function sortTiles(arr: string[]): string[] {
    const suitOrder: Record<string, number> = { 'W':0, 'B':1, 'T':2, 'Z':3 };
    type SortKey = [number, number, string];
    const key = (t: string): SortKey => [suitOrder[t[1]] ?? 9, parseInt(t[0],10) || 0, t];
    return [...arr].sort((a,b)=>{
      const ka=key(a), kb=key(b);
      if(ka[0]!==kb[0]) return ka[0]-kb[0];
      if(ka[1]!==kb[1]) return ka[1]-kb[1];
      return ka[2]<kb[2]? -1 : ka[2]>kb[2]? 1 : 0;
    });
  }

  function startNewMatch(){
    const w = generateWall();
    const ps = dealHands(w, ['kimi','kimi2','gemini','grok']);
    setPlayers(ps); setWall(w);
    appendLogs(['新比赛开始（轮次清零，分数重置）']);
    setHandNo(0); setMatchActive(true); setHandRunning(false);
  }

  function startNextHand(){
    if(!matchActive){ alert('请先开始新比赛'); return; }
    if(handRunning){ alert('当前一轮仍在进行中'); return; }
    if(handNo>=maxHands){ alert('本场比赛轮次已满，请新开一场比赛'); return; }
    const w = generateWall();
    const ps = players.map(p => ({ ...p, hand: w.splice(0,13), discards: [] }));
    setPlayers(ps); setWall(w);
    appendLogs([`—— 第 ${handNo+1}/${maxHands} 轮开始 ——`]);
    setHandRunning(true);
    void playOneHand(ps, w);
  }

  function buildSnapshot(currentIndex: number){
    // me + opponents + table info
    const me = players[currentIndex];
    const opps = players.map((p,idx)=> idx!==currentIndex ? ({ ai:p.ai, discards:p.discards, score:p.score }) : null).filter(Boolean);
    return {
      me:{ ai: me.ai, discards: me.discards, score: me.score },
      opponents: opps,
      table:{ wallCount: wall.length, handNo, maxHands },
      discardsAll: players.map(p=>({ ai:p.ai, discards:p.discards }))
    };
  }
  async function playOneHand(ps: PlayerState[], w: string[]){
    for(let turn=0; turn<256; turn++){
      const i = turn % ps.length;
      const t = drawTile(w);
      if(!t){ appendLogs(['墙牌用尽，流局']); break; }
      ps[i].hand.push(t);

      const r = checkWin(ps[i].hand);
      if(r.win){
        appendLogs([`${ps[i].ai} 自摸：${r.fan.join('+')} = ${r.score}`]);
        const base=r.score;
        ps = ps.map((p,idx)=> idx===i? {...p, score: p.score + base*3 } : {...p, score: p.score - base });
        setPlayers(ps);
        break;
      }

      let out: string | null = null;
      let reasonText = 'local';
      let apiMeta: any = null;
      try{
        const resp = await fetch(`/api/aiPlay?ai=${ps[i].ai}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hand: ps[i].hand, keys, snapshot: buildSnapshot(i) })
        }).then(r=>r.json());
        if(resp?.tile && ps[i].hand.includes(resp.tile)){ out=resp.tile; reasonText = resp?.reason || reasonText; }
        apiMeta = resp?.meta || null;
      }catch{}
      if(!out){ out=ps[i].hand[0]; reasonText='fallback'; }
      const idx=ps[i].hand.indexOf(out); ps[i].hand.splice(idx,1); ps[i].discards.push(out);
      const apiLine = apiMeta ?
        `[API] ${ps[i].ai} ${apiMeta.usedApi ? `使用 ${apiMeta.provider} API` : `未调用外部API（${apiMeta.provider}）`} ${apiMeta.detail ? '- ' + apiMeta.detail : ''}`
        : `[API] ${ps[i].ai} 未调用外部API（无响应），使用本地策略`;
      const discardLine = `${ps[i].ai} 打出 ${tileLabel(out)}（理由：${reasonText}）`;
      appendLogs([apiLine, discardLine]);
      setPlayers([...ps]);
      await new Promise(r=>setTimeout(r, intervalMs));
    }

    setHandNo(x=>{
      const done=x+1;
      appendLogs([`—— 第 ${done}/${maxHands} 轮结束 ——`]);
      setHandRunning(false);
      if(done>=maxHands){ setMatchActive(false); appendLogs(['本场比赛已完成全部轮次。请点击“开始新比赛”开启下一场。']); }
      return done;
    });
    setWall(w);
  }

  return (<div className="max-w">
    <h1 style={{fontSize:24,fontWeight:700,marginBottom:12}}>Mahjong AI Match v3.3.3d（API审计优先 + 去重日志）</h1>

    <div className="card">
      <div className="flex items-center gap-3" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <label className="small">最大轮次：<input className="w-24" value={maxHands} onChange={e=>setMaxHands(Math.max(1,parseInt(e.target.value||'0',10)||1))} /></label>
        <label className="small">出牌间隔(ms)：<input className="w-24" value={intervalMs} onChange={e=>setIntervalMs(Math.max(100,parseInt(e.target.value||'100',10)||100))} /></label>
        <button className="btn" onClick={startNewMatch}>开始新比赛</button>
        <button className="btn" onClick={startNextHand} disabled={!matchActive || handRunning || handNo>=maxHands}>开始新一轮</button>
        <label className="small"><input type="checkbox" checked={showHands} onChange={e=>setShowHands(e.target.checked)} /> 显示手牌</label>
      </div>
    </div>

    <div className="card">
      <div className="font-semibold mb-2">AI Key 设置（仅本次会话内使用）</div>
      <div className="grid" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:12}}>
        <label className="small">Kimi Key 2
          <input className="w-full" placeholder="moonshot-..." value={keys.kimi2||''} onChange={e=>setKeys({...keys, kimi2:e.target.value})} />
        </label>
        <label className="small">Kimi (Moonshot) Key
          <input className="w-full" placeholder="moonshot-..." value={keys.kimi||''} onChange={e=>setKeys({...keys, kimi:e.target.value})} />
        </label>
        <label className="small">Gemini Key
          <input className="w-full" placeholder="AIza..." value={keys.gemini||''} onChange={e=>setKeys({...keys, gemini:e.target.value})} />
        </label>
        <label className="small">Grok (xAI) Key
          <input className="w-full" placeholder="xai-..." value={keys.grok||''} onChange={e=>setKeys({...keys, grok:e.target.value})} />
        </label>
      </div>
      <div className="text-xs" style={{opacity:.7, marginTop:6}}>未填写时，将使用本地启发式出牌（不会请求外部接口）。</div>
    </div>

    <div className="card">
      <div className="small">已完成轮次：{handNo} / {maxHands}　墙余：{wall.length}</div>
      <div className="mt-2">
        {players.map(p => (<div key={p.ai} className="mb-2">
          <div className="font-semibold">{p.ai}　<span className="text-xs" style={{opacity:.8}}>分：{p.score||0}</span></div>
          {showHands && (<>
            <div className="text-xs" style={{opacity:.95, marginTop:4}}>手：</div>
            <div className="tiles tiles-wrap-14">{sortTiles(p.hand||[]).map((x,i)=>(<Tile key={x+':h:'+i} t={x}/>))}</div>
          </>)}
          <div className="text-xs" style={{opacity:.85, marginTop:4}}>弃（顺序）：</div>
          <div className="tiles">{(p.discards||[]).map((x,i)=>(<Tile key={x+':d:'+i} t={x} small/>))}</div>
        </div>))}
      </div>
    </div>

    <div className="card"><div className="font-semibold mb-2">日志</div><div className="text-sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\n')}</div></div>
  </div>);
}
