import React, { useMemo, useState } from 'react'
import { generateWallEx, dealHands, drawTile, sortTiles, isFlower, scoreWin, scoreWinSichuanStrict, type PlayerState, type Tile } from '@/lib/mahjongEngine'

const SEAT = ['东','南','西','北'];
const label = (i:number)=> SEAT[i%4];
const tileLabel = (t:Tile)=> t;

export default function Home(){
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [rule, setRule] = useState<'classic'|'sichuan'|'sichuan_strict'>('classic');
  const [useFlowers, setUseFlowers] = useState(false);
  const [scCap, setScCap] = useState(13);
  const [scBase, setScBase] = useState(1);

  const [players, setPlayers] = useState<PlayerState[]>([
    { ai:'local', hand:[], discards:[], melds:[], score:25000, flowers:[], alive:true },
    { ai:'local', hand:[], discards:[], melds:[], score:25000, flowers:[], alive:true },
    { ai:'local', hand:[], discards:[], melds:[], score:25000, flowers:[], alive:true },
    { ai:'local', hand:[], discards:[], melds:[], score:25000, flowers:[], alive:true },
  ]);
  const [wall, setWall] = useState<Tile[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const appendLogs = (ls:string[])=> setLogs(prev=>[...prev, ...ls]);

  function settlementTsumo(ps: PlayerState[], who: number, wr: {yaku:string[]; fan:number}){
    const base = wr.fan;
    const deltas = ps.map((_,i)=> i===who ? +base*3 : -base);
    appendLogs([`结算：${label(who)} 自摸（${wr.yaku.join('+')}，共${base}番）`,
      ...ps.map((p,i)=>`  ${label(i)}：${deltas[i]>0?'+':''}${deltas[i]}`)
    ]);
    return ps.map((p,i)=>({ ...p, score: p.score + deltas[i] }));
  }
  function settlementRon(ps: PlayerState[], winner: number, loser: number, wr: {yaku:string[]; fan:number}){
    const base = wr.fan;
    const deltas = ps.map((_,i)=> i===winner ? +base : (i===loser ? -base : 0));
    appendLogs([`结算：${label(winner)} 荣和（${label(loser)} 放铳；${wr.yaku.join('+')}，共${base}番）`,
      ...ps.map((p,i)=>`  ${label(i)}：${deltas[i]>0?'+':''}${deltas[i]}`)
    ]);
    return ps.map((p,i)=>({ ...p, score: p.score + deltas[i] }));
  }

  // 严格结算：纯函数
  function settlementTsumoStrict(ps: PlayerState[], who: number, wr: {yaku:string[]; fan:number}, cap:number, base:number){
    const fan = Math.min(wr.fan, cap);
    const pay = base * Math.pow(2, fan);
    const next = ps.map(p=>({...p}));
    let gain = 0;
    for(let i=0;i<next.length;i++){
      if(i===who) continue;
      if(next[i].alive===false) continue;
      next[i].score -= pay;
      gain += pay;
    }
    next[who].score += gain;
    return { ps: next, fan, pay, gain };
  }
  function settlementRonStrict(ps: PlayerState[], winner: number, loser: number, wr: {yaku:string[]; fan:number}, cap:number, base:number){
    const fan = Math.min(wr.fan, cap);
    const pay = base * Math.pow(2, fan);
    const next = ps.map(p=>({...p}));
    next[winner].score += pay;
    if(next[loser].alive!==false) next[loser].score -= pay;
    return { ps: next, fan, pay };
  }

  function start(){
    const w = generateWallEx({ includeFlowers: useFlowers && rule!=='sichuan' && rule!=='sichuan_strict', sichuan: (rule==='sichuan'||rule==='sichuan_strict') });
    let ps = dealHands(w, players.map(p=>p.ai));
    // 初始化
    ps = ps.map(p=>({ ...p, flowers: [], alive: true }));
    if(rule==='sichuan' || rule==='sichuan_strict'){
      ps = ps.map(p=>{
        const cnt:any = {W:0,B:0,T:0};
        for(const t of p.hand){ const s=t[1]; if(s==='W'||s==='B'||s==='T') cnt[s]++; }
        const que:( 'W'|'B'|'T') = (['W','B','T'] as const).reduce((a,b)=> cnt[a]<=cnt[b]?a:b);
        return { ...p, que };
      });
    }
    setWall(w);
    setPlayers(ps);
    setLogs([`新一局开始（规则：${rule==='classic'?'经典':'四川'+(rule==='sichuan_strict'?'·严格':'')}）`]);
  }

  return (
    <div className="wrap">
      <div className="card">
        <div className="row">
          <label className="small">规则
            <select value={rule} onChange={e=>setRule(e.target.value as any)}>
              <option value="classic">经典（含鬼/可吃/可花）</option>
              <option value="sichuan">四川·血战到底（无字/无花/不可吃/定缺）</option>
              <option value="sichuan_strict">四川·血战（严格：倍数/封顶/根/杠）</option>
            </select>
          </label>
          <label className="small"><input type="checkbox" checked={useFlowers} disabled={(rule!=='classic')} onChange={e=>setUseFlowers(e.target.checked)} /> 启用花牌</label>
          {rule==='sichuan_strict' && (
            <>
              <label className="small">封顶(番)
                <input type="number" min={6} max={20} value={scCap} onChange={e=>setScCap(parseInt(e.target.value||'13'))} style={{width:70}} />
              </label>
              <label className="small">底分
                <input type="number" min={1} max={10} value={scBase} onChange={e=>setScBase(parseInt(e.target.value||'1'))} style={{width:70}} />
              </label>
            </>
          )}
          <button onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>主题：{theme==='light'?'浅绿':'深绿'}</button>
          <button onClick={start}>开始新局</button>
        </div>
      </div>

      <div className="card">
        <div className="row">
          {players.map((p,idx)=>(
            <div key={idx} style={{minWidth:220}}>
              <div><b>{label(idx)}</b> <span className="badge">{p.ai}</span> 分：{p.score}</div>
              <div className="tiles">
                {sortTiles(p.hand).map((t,i)=>(<span className="tile" key={i}>{tileLabel(t)}</span>))}
              </div>
              {p.flowers && p.flowers.length>0 && rule==='classic' && (
                <div>花牌：<span className="tiles">{p.flowers.map((t,i)=>(<span className="tile" key={i}>{tileLabel(t)}</span>))}</span></div>
              )}
              {(rule==='sichuan'||rule==='sichuan_strict') && p.que && <div>缺：{p.que}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <b>日志</b>
        <pre>{logs.join('\n')}</pre>
      </div>
    </div>
  )
}
