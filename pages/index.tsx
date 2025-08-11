import React, { useEffect, useRef, useState } from 'react';
import { generateWall, dealHands, drawTile, checkWin, updateScores, type PlayerState } from '@/lib/mahjongEngine';
import { saveRoomState as _s, appendEvent as _e } from '@/lib/rooms';

export default function Home(){
  function tileClass(t:string){ const s=t[1]; if(s==='W') return 'tile w'; if(s==='B') return 'tile b'; if(s==='T') return 'tile t'; return 'tile z'; }
  function tileLabel(t:string){ const n=t[0]; const s=t[1]; if(s==='Z'){ const map:Record<string,string>={ '1':'東','2':'南','3':'西','4':'北','5':'中','6':'發','7':'白' }; return map[n]||t; } const mark = s==='W'?'万':(s==='B'?'饼':'条'); return `${n}${mark}`; }
  const Tile = ({t, small=false}:{t:string; small?:boolean})=>(<span className={tileClass(t)+(small?' small':'')} title={t}>{tileLabel(t)}</span>);

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [autoPlay, setAutoPlay] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [handNo, setHandNo] = useState(0);
  const [showHands, setShowHands] = useState(true);
  const discardCounterRef = useRef(0);

  function sortTiles(arr: string[]): string[] {
    const suitOrder: Record<string, number> = { 'W':0, 'B':1, 'T':2, 'Z':3 };
    const key = (t:string)=> [suitOrder[t[1]] ?? 9, parseInt(t[0],10) || 0, t];
    return [...arr].sort((a,b)=> { const [sa,na]=key(a), [sb,nb]=key(b); return sa!==sb? sa-sb : na-nb; });
  }
  async function pushEvent(type:string, payload:any){ if(!roomId) return; _e(roomId,handNo,{ts:Date.now(),type,payload}); }
  async function pushRoomState(){ if(!roomId) return; _s(roomId,{ players, wallCount: wall.length, log, handNo }); }

  function initMatch(){ const w = generateWall(); const ps = dealHands(w, ['chatgpt','kimi','gemini','grok']); setPlayers(ps); setWall(w); setCurrentRound(0); setHandNo(0); setLog(p=>[...p,'新比赛开始']); }

  async function playOneHand(){
    let np = players.map(p=>({ ...p })); let w = [...wall];
    setHandNo(h=>h+1); await pushEvent('hand_start', { handNo: handNo + 1 });
    for (let turn=0; turn<128; turn++){
      const i = turn % np.length;
      const t = drawTile(w); if (!t) break;
      np[i].hand.push(t);

      const r = checkWin(np[i].hand);
      if (r.win){ setLog(p=>[...p, `${np[i].ai} 自摸：${r.fan.join('+')} = ${r.score}`]); np = updateScores(np, i, r.score, 'ZIMO'); setPlayers(np); setWall(w); setCurrentRound(n=>n+1); await pushEvent('zimo', { winner: np[i].ai, score: r.score, fan: r.fan }); return; }

      const chosen = np[i].hand[0]; const idx=np[i].hand.indexOf(chosen); np[i].hand.splice(idx,1); np[i].discards.push(chosen);
      discardCounterRef.current += 1;
      setLog(p=>[...p, `${np[i].ai} 打出 ${chosen}`]);
      await pushEvent('discard', { ai: np[i].ai, tile: chosen, turn: discardCounterRef.current });

      setPlayers(np); setWall(w);
      await new Promise(r=>setTimeout(r,150));
    }
    setCurrentRound(n=>n+1); await pushEvent('hand_end', { handNo });
  }

  useEffect(()=>{ if(!autoPlay) return; let stop=false; (async()=>{ while(!stop){ await playOneHand(); if(!autoPlay) break; } })(); return ()=>{ stop=true; }; }, [autoPlay, players, wall]);

  return (<div className="max-w">
    <h1 style={{fontSize:28,fontWeight:700,marginBottom:12}}>Mahjong AI Match v4.3.3 (demo minimal)</h1>
    <div className="card">
      <div className="flex gap-3 items-center">
        <button className="btn" onClick={initMatch}>开始新比赛</button>
        <button className="btn" onClick={()=>setAutoPlay(v=>!v)} disabled={players.length===0}>{autoPlay? '暂停自动出牌' : '开始自动出牌'}</button>
        <label className="text-sm"><input type="checkbox" checked={showHands} onChange={e=>setShowHands(e.target.checked)} /> 显示手牌（已排序/图标）</label>
      </div>
    </div>
    <div className="card">
      <div className="font-semibold mb-2">牌局</div>
      <div className="text-sm">回合：{currentRound}　墙余：{wall.length}</div>
      <div className="mt-2">
        {players.map(p => (<div key={p.ai} className="mb-2">
          <div className="font-semibold">{p.ai}　<span className="text-xs" style={{opacity:.8}}>分：{p.score||0}</span></div>
          {showHands && (<><div className="text-xs" style={{opacity:.95, marginTop:4}}>手：</div><div className="tiles tiles-wrap-14">{sortTiles(p.hand||[]).map((x,i)=>(<Tile key={x+':h:'+i} t={x}/>))}</div></>)}
          <div className="text-xs" style={{opacity:.85, marginTop:4}}>弃（顺序）：</div>
          <div className="tiles">{(p.discards||[]).map((x,i)=>(<Tile key={x+':d:'+i} t={x} small/>))}</div>
        </div>))}
      </div>
    </div>
    <div className="card"><div className="font-semibold mb-2">日志</div><div className="text-sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\n')}</div></div>
  </div>);
}
