import React, { useEffect, useMemo, useState } from 'react'
import {
  generateWallEx, dealHands, drawTile, sortTiles,
  isFlower, scoreWinClassic, scoreWinSichuanStrict,
  settlementTsumoStrict, settlementRonStrict,
  type PlayerState, type Tile
} from '@/lib/mahjongEngine'

const SEAT: ('东'|'南'|'西'|'北')[] = ['东','南','西','北'];
const label = (i:number)=> SEAT[i%4];
const tileLabel = (t:Tile)=> t;

type Rule = 'classic'|'sichuan'|'sichuan_strict';

export default function Home(){
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [rule, setRule] = useState<Rule>('classic');
  const [useFlowers, setUseFlowers] = useState(false);
  const [scCap, setScCap] = useState(13);
  const [scBase, setScBase] = useState(1);

  // seat AI & key before game
  const [seatCfg, setSeatCfg] = useState<{ ai:PlayerState['ai']; apiKey:string }[]>(
    [{ai:'local', apiKey:''},{ai:'local', apiKey:''},{ai:'local', apiKey:''},{ai:'local', apiKey:''}]
  );

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<Tile[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const appendLogs = (ls:string[]) => setLogs(prev=>[...prev, ...ls]);

  useEffect(()=>{
    document.body.classList.remove('light','dark');
    document.body.classList.add(theme);
  },[theme]);

  function start(){
    // build player states using current seat config
    const w = generateWallEx({ includeFlowers: useFlowers && rule==='classic', sichuan: (rule!=='classic') });
    const hands = dealHands(w, 4);
    // East draws one extra
    hands[0].push(drawTile(w)!);
    // auto replace flowers (classic only)
    const ps: PlayerState[] = SEAT.map((s,idx)=>{
      const base: PlayerState = {
        seat: s,
        ai: seatCfg[idx].ai,
        apiKey: seatCfg[idx].apiKey,
        hand: hands[idx],
        discards: [],
        melds: [],
        score: 25000,
        flowers: [],
        alive: true,
      };
      return base;
    });

    if(rule==='classic' && useFlowers){
      for(let i=0;i<ps.length;i++){
        let changed=true;
        while(changed){
          changed=false;
          for(let k=0;k<ps[i].hand.length;k++){
            const t = ps[i].hand[k];
            if(isFlower(t)){
              ps[i].flowers!.push(t);
              ps[i].hand.splice(k,1);
              const nt = drawTile(w);
              if(nt){ ps[i].hand.push(nt); changed=true; break; }
            }
          }
        }
      }
    }

    if(rule!=='classic'){
      // auto set que by minimum suit count
      for(let i=0;i<ps.length;i++){
        const cnt:any = {W:0,B:0,T:0};
        for(const t of ps[i].hand){ const s=t[1]; if(s==='W'||s==='B'||s==='T') cnt[s]++; }
        const q: 'W'|'B'|'T' = (['W','B','T'] as const).reduce((a,b)=> cnt[a]<=cnt[b]?a:b);
        ps[i].que = q;
      }
    }

    setPlayers(ps);
    setWall(w);
    setLogs([`新一局开始：${rule==='classic'?'经典':'四川'+(rule==='sichuan_strict'?'·严格':'')}`]);
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row">
          <label className="small">规则
            <select value={rule} onChange={e=>setRule(e.target.value as Rule)}>
              <option value="classic">经典（含鬼/可吃/可花）</option>
              <option value="sichuan">四川·血战到底（无字/无花/不可吃/定缺）</option>
              <option value="sichuan_strict">四川·血战（严格：倍数/封顶/根/杠）</option>
            </select>
          </label>
          <label className="small">
            <input type="checkbox" checked={useFlowers} disabled={rule!=='classic'} onChange={e=>setUseFlowers(e.target.checked)} />
            启用花牌（仅经典）
          </label>
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
          <div className="spacer" />
          <button className="btn" onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>主题：{theme==='light'?'浅绿':'深绿'}</button>
          <button className="btn" onClick={start}>开始新局</button>
        </div>
      </div>

      <div className="card">
        <b>座位 & AI 设置</b>
        <div className="hr" />
        <div className="row">
          {SEAT.map((s,idx)=> (
            <div key={s} style={{minWidth:240}}>
              <div className="row">
                <span><b>{s}</b></span>
                <select value={seatCfg[idx].ai} onChange={e=>{
                  const nv = e.target.value as PlayerState['ai'];
                  setSeatCfg(prev=> prev.map((c,i)=> i===idx? {...c, ai:nv}:c ));
                }}>
                  <option value="local">local</option>
                  <option value="openai">openai</option>
                  <option value="kimi">kimi</option>
                </select>
              </div>
              <div className="row">
                <input placeholder={`${s} 的 API Key（可留空用 local）`} value={seatCfg[idx].apiKey} onChange={e=>{
                  const v=e.target.value; setSeatCfg(prev=> prev.map((c,i)=> i===idx? {...c, apiKey:v}:c ));
                }} style={{width: 220}} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <b>牌桌</b>
        <div className="row">
          {players.length===4 ? players.map((p,idx)=>(
            <div key={idx} style={{minWidth:240}}>
              <div><b>{label(idx)}</b> <span className="badge">{p.ai}</span> 分：{p.score}</div>
              <div className="tiles">
                {sortTiles(p.hand).map((t,i)=>(<span className="tile" key={i}>{tileLabel(t)}</span>))}
              </div>
              {rule==='classic' && p.flowers && p.flowers.length>0 && (
                <div>花牌：<span className="tiles">{p.flowers.map((t,i)=>(<span className="tile" key={i}>{tileLabel(t)}</span>))}</span></div>
              )}
              {(rule!=='classic') && p.que && <div>缺：{p.que}</div>}
            </div>
          )) : (<i>尚未开始</i>)}
        </div>
      </div>

      <div className="card">
        <b>日志</b>
        <pre>{logs.join('\n')}</pre>
      </div>
    </div>
  )
}
