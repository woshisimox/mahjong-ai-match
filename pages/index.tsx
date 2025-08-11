import React, { useEffect, useRef, useState } from 'react';
import { generateWall, dealHands, drawTile, checkWin, type PlayerState } from '@/lib/mahjongEngine';

export default function Home(){
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);

  // ---- Match (比赛) vs Hand (一轮) ----
  const [maxHands, setMaxHands] = useState(16);             // 比赛设置：最多轮次
  const [handNo, setHandNo] = useState(0);                  // 当前已经完成的轮次
  const [matchActive, setMatchActive] = useState(false);    // 是否处于一场比赛中
  const [handRunning, setHandRunning] = useState(false);    // 当前这一轮是否在进行中
  const [intervalMs, setIntervalMs] = useState(1000);       // 每次出牌的间隔（1s）

  // 初始化并开始一场新的“比赛”（重置轮次与分数）
  function startNewMatch(){
    const w = generateWall();
    const ps = dealHands(w, ['chatgpt','kimi','gemini','grok']);
    setPlayers(ps);
    setWall(w);
    setLog(p=>[...p, '新比赛开始（轮次清零，分数重置）']);
    setHandNo(0);               // 清零已完成轮次
    setMatchActive(true);       // 标记进入比赛中
    setHandRunning(false);      // 还没开始第一轮
  }

  // 在同一场“比赛”中，开始新的一轮（不重置分数，只发新手牌/新墙）
  function startNextHand(){
    if(!matchActive){ alert('请先开始新比赛'); return; }
    if(handRunning){ alert('当前一轮仍在进行中'); return; }
    if(handNo >= maxHands){ alert('本场比赛的轮次已满，请新开一场比赛'); return; }

    const w = generateWall();
    // 仅发新手牌，不改分数
    const ps = players.map(p => ({ ...p, hand: w.splice(0,13), discards: [] }));
    setPlayers(ps);
    setWall(w);
    setLog(p=>[...p, `—— 第 ${handNo+1}/${maxHands} 轮开始 ——`]);
    setHandRunning(true);

    playOneHand(ps, w);
  }

  async function playOneHand(ps: PlayerState[], w: string[]){
    // 每一轮的完整流程：摸牌 → 自摸判定 → 丢牌 →（无吃碰杠，简化）
    for(let turn=0; turn<256; turn++){
      const i = turn % ps.length;
      const t = drawTile(w);
      if(!t){ setLog(p=>[...p, '墙牌用尽，流局']); break; }
      ps[i].hand.push(t);

      const r = checkWin(ps[i].hand);
      if(r.win){
        setLog(p=>[...p, `${ps[i].ai} 自摸：${r.fan.join('+')} = ${r.score}`]);
        // 简化积分：赢家 +3*base，其余 -base（与之前 v3.x 逻辑一致）
        const base=r.score;
        ps = ps.map((p,idx)=> idx===i? {...p, score: p.score + base*3 } : {...p, score: p.score - base });
        setPlayers(ps);
        break;
      }

      // 简化：出第一张
      const out = ps[i].hand.shift()!;
      ps[i].discards.push(out);
      setPlayers([...ps]);
      await new Promise(r=>setTimeout(r, intervalMs));
    }

    // 一轮结束，累计手数+1；检查比赛是否结束
    setHandNo(x=>{
      const done = x+1;
      setLog(p=>[...p, `—— 第 ${done}/${maxHands} 轮结束 ——`]);
      setHandRunning(false);
      if(done >= maxHands){
        setMatchActive(false);
        setLog(p=>[...p, '本场比赛已完成全部轮次。请点击“开始新比赛”开启下一场。']);
      }
      return done;
    });
    setWall(w);
  }

  // UI
  return (<div className="max-w">
    <h1 style={{fontSize:24,fontWeight:700,marginBottom:12}}>Mahjong AI Match v3.3.1（修复“新比赛 / 新一轮”语义）</h1>

    <div className="card">
      <div className="flex items-center gap-3" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <label className="small">最大轮次：<input className="w-24" value={maxHands} onChange={e=>setMaxHands(Math.max(1,parseInt(e.target.value||'0',10)||1))} /></label>
        <label className="small">出牌间隔(ms)：<input className="w-24" value={intervalMs} onChange={e=>setIntervalMs(Math.max(100,parseInt(e.target.value||'100',10)||100))} /></label>
        <button className="btn" onClick={startNewMatch}>开始新比赛</button>
        <button className="btn" onClick={startNextHand} disabled={!matchActive || handRunning || handNo>=maxHands}>开始新一轮</button>
        <span className="small" style={{opacity:.85}}>状态：{matchActive? (handRunning? '比赛中·本轮进行中' : '比赛中·等待开始下一轮') : (handNo>=maxHands && handNo>0 ? '比赛已结束' : '未开始')}</span>
      </div>
    </div>

    <div className="card">
      <div className="small">已完成轮次：{handNo} / {maxHands}</div>
      <div className="small">墙余：{wall.length}</div>
      <div className="mt-2">
        {players.map(p => (<div key={p.ai} className="mb-2">
          <div className="font-semibold">{p.ai}　<span className="text-xs" style={{opacity:.8}}>分：{p.score||0}</span></div>
          <div className="text-xs" style={{opacity:.8}}>弃：{(p.discards||[]).join(' ')||'—'}</div>
        </div>))}
      </div>
    </div>

    <div className="card">
      <div className="font-semibold mb-2">日志</div>
      <div className="text-sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\n')}</div>
    </div>
  </div>);
}
