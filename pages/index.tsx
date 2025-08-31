import React, { useState } from 'react';
import {
  generateWall, dealHands, drawTile,
  checkWin, scoreWin,
  canPon, pickChi, canMinkan, findAnkanTile, findKakanTile,
  type PlayerState, type Tile, type Meld
} from '@/lib/mahjongEngine';

export default function Home(){
  const seatNames = ['东家','南家','西家','北家'];
  const label = (i:number)=> seatNames[i%4];
  function tileClass(t:string){ const s=t[1]; if(s==='W') return 'tile w'; if(s==='B') return 'tile b'; if(s==='T') return 'tile t'; return 'tile z'; }
  function tileLabel(t:string){ const n=t[0]; const s=t[1]; if(s==='Z'){ const map:any={1:'东',2:'南',3:'西',4:'北',5:'中',6:'发',7:'白'}; return map[parseInt(n)]; } const mark = s==='W'?'万':(s==='B'?'饼':'条'); return `${n}${mark}`; }
  const TileV = ({t, small=false}:{t:string; small?:boolean})=>(<span className={tileClass(t)+(small?' small':'')} title={t}>{tileLabel(t)}</span>);

  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [maxHands, setMaxHands] = useState(12);
  const [handNo, setHandNo] = useState(0);
  const [matchActive, setMatchActive] = useState(false);
  const [handRunning, setHandRunning] = useState(false);
  const [intervalMs, setIntervalMs] = useState(500);
  const [showHands, setShowHands] = useState(true);
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  React.useEffect(()=>{ if(typeof document!=='undefined'){ document.body.dataset.theme = theme; } }, [theme]);

  const [keys, setKeys] = useState<{kimi2?:string; kimi?:string; gemini?:string; grok?:string}>({});
  const [seatProviders, setSeatProviders] = useState<string[]>(['local','local','local','local']);

  function appendLogs(lines: string[]){ setLog(prev => [...prev, ...lines]); }
  function sortTiles(ts: string[]){
    return [...ts].sort((a,b)=>{
      if(a[1]!==b[1]) return a[1].localeCompare(b[1]);
      return parseInt(a[0]) - parseInt(b[0]);
    });
  }

  function settlementTsumo(ps: PlayerState[], who: number, wr: {yaku:string[]; fan:number}){
    const base = wr.fan;
    const deltas = ps.map((_,i)=> i===who ? +base*3 : -base);
    appendLogs([`结算：${label(who)} 自摸（${wr.yaku.join('+')}，共${base}番）`,
      ...ps.map((p,i)=>`  ${label(i)}：${deltas[i]>0?'+':''}${deltas[i]}`)
    ]);
    return ps.map((p,i)=>({...p, score: p.score + deltas[i]}));
  }
  function settlementRon(ps: PlayerState[], winner: number, loser: number, wr: {yaku:string[]; fan:number}){
    const base = wr.fan;
    const deltas = ps.map((_,i)=> i===winner ? +base : (i===loser ? -base : 0));
    appendLogs([`结算：${label(winner)} 荣和（${label(loser)} 放铳；${wr.yaku.join('+')}，共${base}番）`,
      ...ps.map((p,i)=>`  ${label(i)}：${deltas[i]>0?'+':''}${deltas[i]}`)
    ]);
    return ps.map((p,i)=>({...p, score: p.score + deltas[i]}));
  }

  function buildSnapshot(curIdx:number){
    const self = players[curIdx] as (PlayerState | undefined);
    const opps = players.map((p,idx)=>({ ai:p.ai, count:p.hand.length, discards:p.discards.slice(-6), idx })).filter((_,idx)=>idx!==curIdx);
    return {
      you:{ ai: (self?.ai||''), count: (self?.hand?.length||0), melds: (self?.melds||[]) },
      opponents: opps,
      table:{ wallCount: wall.length, handNo, maxHands },
      discardsAll: players.map(p=>({ ai:p.ai, discards:p.discards }))
    };
  }

  async function playOneHand(psInit: PlayerState[], wallInit: string[]){
    let ps = psInit.map(p=>({...p, hand: sortTiles(p.hand)}));
    let w = wallInit;
    // 预留4张作“岭上牌”（死墙替代，简化）
    let rinshan: string[] = []; // 欢乐场：不保留死墙
    let cur = 0; // 轮到谁
    let steps = 0;
    let afterKanDraw = false; // 当前轮到的人是否应岭上摸牌

    while(true){
      steps++; if(steps>800){ appendLogs(['达到步数上限，流局']); break; }

      // 摸牌（普通或岭上）
      let t: string | null = null;
      let wasRinshan = false;
      if(afterKanDraw){
        wasRinshan = true; // 欢乐场：岭上直接从主墙摸
        t = drawTile(w);
        afterKanDraw = false;
      }else{
        t = drawTile(w);
      }
      if(!t){ appendLogs(['墙牌用尽，流局']); break; }
      ps[cur].hand.push(t);
      ps[cur].hand = sortTiles(ps[cur].hand);

      // --- 抢杠检查（针对加杠）：如果此时立刻宣布加杠，会被抢？我们用“先判加杠抢杠”逻辑 ---
      // 1) 优先尝试“加杠”
      const kakan = findKakanTile(ps[cur].hand, ps[cur].melds);
      if(kakan){
        const tile = kakan.tile;
        // 其他家能否对该牌荣和（抢杠）？
        let robbed = false;
        for(let r=1;r<ps.length;r++){
          const j=(cur+r)%ps.length;
          const canRon = checkWin([...ps[j].hand, tile]);
          if(canRon){
            // 抢杠荣和
            const wr = scoreWin([...ps[j].hand, tile], { robKong:true, tsumo:false });
            // 从碰面子升级失败（不加杠了），直接结算
            appendLogs([`${label(j)} 抢杠和 ${tileLabel(tile)}（抢 ${label(cur)} 的加杠）`]);
            ps = settlementRon(ps, j, cur, wr);
            setPlayers(ps); robbed = true; break;
          }
        }
        if(robbed){ break; }
        // 没有人抢杠，则执行加杠
        ps[cur].hand.splice(ps[cur].hand.indexOf(tile),1);
        ps[cur].melds[kakan.meldIndex] = { type:'kan', kanType:'kakan', tiles:[tile,tile,tile,tile], from: cur };
        appendLogs([`${label(cur)} 加杠 ${tileLabel(tile)}`]);
        setPlayers([...ps]);
        // 加杠后岭上摸
        afterKanDraw = true;
        await new Promise(r=>setTimeout(r, intervalMs));
        continue; // 进入下一轮（岭上摸）
      }

      // 2) 尝试“暗杠”（有4张同牌，在打牌前处理；每轮最多一次）
      const ankan = findAnkanTile(ps[cur].hand);
      if(ankan){
        // 从手移除4张
        let removed=0;
        ps[cur].hand = ps[cur].hand.filter(x=>{
          if(x===ankan && removed<4){ removed++; return false; }
          return true;
        });
        ps[cur].melds.push({ type:'kan', kanType:'ankan', tiles:[ankan,ankan,ankan,ankan], from: cur });
        appendLogs([`${label(cur)} 暗杠 ${tileLabel(ankan)}`]);
        setPlayers([...ps]);
        afterKanDraw = true;
        await new Promise(r=>setTimeout(r, intervalMs));
        continue; // 岭上摸
      }

      // 自摸判定（岭上摸后自摸将包含岭上开花番）
      const rSelf = scoreWin(ps[cur].hand, { tsumo:true, rinshan: wasRinshan });
      if(rSelf.win){
        const wr = rSelf;
        appendLogs([`${label(cur)} 自摸：${wr.yaku.join('+')} = ${wr.fan}`]);
        ps = settlementTsumo(ps, cur, wr);
        setPlayers(ps); break;
      }

      // 选择出牌
      let out: string | null = null;
      let reasonText = 'local';
      let apiMeta: any = null;
      try{
        const resp = await fetch(`/api/aiPlay?ai=${ps[cur].ai}`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ hand: ps[cur].hand, keys, snapshot: buildSnapshot(cur) })
        }).then(r=>r.json());
        if(resp?.tile && ps[cur].hand.includes(resp.tile)){ out=resp.tile; reasonText = resp?.reason || reasonText; }
        apiMeta = resp?.meta || null;
      }catch{}
      if(!out){ out=ps[cur].hand[0]; reasonText='fallback'; }

      // 执行打出
      const idx = ps[cur].hand.indexOf(out);
      ps[cur].hand.splice(idx,1);
      ps[cur].discards.push(out);
      const apiLine = apiMeta ? `[API] ${label(cur)} ${apiMeta.usedApi ? `使用 ${apiMeta.provider}` : '未使用外部API'} ${apiMeta?.detail ? '- ' + apiMeta.detail : ''}` : `[API] ${label(cur)} 未调用外部API（无响应），使用本地策略`;
      const discardLine = `${label(cur)} 打出 ${tileLabel(out)}（理由：${reasonText}）`;
      appendLogs([apiLine, discardLine]);
      setPlayers([...ps]);
      await new Promise(r=>setTimeout(r, intervalMs));

      
      // 荣和优先（欢乐场：一炮多响）
      {
        const winners: { j:number; wr:any }[] = [];
        for(let k=1;k<ps.length;k++){
          const j=(cur+k)%ps.length;
          if(checkWin([...ps[j].hand, out as string])){
            const wr = scoreWin([...ps[j].hand, out as string], { tsumo:false });
            winners.push({ j, wr });
          }
        }
        if(winners.length>0){
          // 从弃牌区移除一次（被拿走）
          const lastIdx = ps[cur].discards.lastIndexOf(out as string);
          if(lastIdx >= 0) ps[cur].discards.splice(lastIdx,1);
          // 逐一结算（放铳者分别赔付）
          for(const wnr of winners){
            appendLogs([`${label(wnr.j)} 荣和 ${tileLabel(out!)}（${label(cur)} 放铳）`]);
            ps = settlementRon(ps, wnr.j, cur, wnr.wr);
          }
          setPlayers(ps);
          break;
        }
      }

      // 明杠（来自弃牌）：优先于碰/吃
      {
        let claimed = false;
        for(let k=1;k<ps.length;k++){
          const j=(cur+k)%ps.length;
          if(canMinkan(ps[j].hand, out!)){
            // 执行明杠
            let removed=0;
            ps[j].hand = ps[j].hand.filter(t=>{
              if(t===out && removed<3){ removed++; return false; }
              return true;
            });
            ps[j].melds.push({ type:'kan', kanType:'minkan', tiles:[out!,out!,out!,out!], from: cur });
            // 从弃牌区移除
            const lastIdx = ps[cur].discards.lastIndexOf(out as string);
            if(lastIdx >= 0) ps[cur].discards.splice(lastIdx,1);
            appendLogs([`${label(j)} 明杠！（取 ${label(cur)} 的 ${tileLabel(out!)}）`]);
            setPlayers([...ps]);
            // 明杠后由 j 岭上摸
            cur = j;
            afterKanDraw = true;
            await new Promise(r=>setTimeout(r, intervalMs));
            claimed = true;
            break;
          }
        }
        if(claimed) continue;
      }

      // 碰（优先于吃）
      {
        let claimed = false;
        for(let k=1;k<ps.length;k++){
          const j=(cur+k)%ps.length;
          if(canPon(ps[j].hand, out!)){
            // 从 j 手牌移除两张 out，组成碰面子
            let removed = 0;
            ps[j].hand = ps[j].hand.filter(t=>{
              if(t===out && removed<2){ removed++; return false; }
              return true;
            });
            const meld: Meld = { type:'pon', tiles:[out!, out!, out!], from: cur };
            ps[j].melds.push(meld);
            // 从弃牌区移除被拿走的那张
            const lastIdx = ps[cur].discards.lastIndexOf(out as string);
            if(lastIdx >= 0) ps[cur].discards.splice(lastIdx,1);
            appendLogs([`${label(j)} 碰！（取 ${label(cur)} 的 ${tileLabel(out!)}）`]);
            setPlayers([...ps]);
            // 碰后由 j 出牌（不摸牌）
            cur = j;
            claimed = true;
            break;
          }
        }
        if(claimed) continue;
      }

      // 吃（仅下家）
      const next = (cur+1)%ps.length;
      const chiPick = pickChi(ps[next].hand, out!);
      if(chiPick){
        // 从下家手里移除吃用的两张
        for(const need of chiPick){
          const k = ps[next].hand.indexOf(need);
          if(k>=0) ps[next].hand.splice(k,1);
        }
        const seq = [ ...chiPick, out! ].sort((a,b)=>{
          if(a[1]!==b[1]) return a[1].localeCompare(b[1]);
          return parseInt(a[0]) - parseInt(b[0]);
        });
        ps[next].melds.push({ type:'chi', tiles: seq, from: cur });
        // 从弃牌区移除被拿走的那张
        const lastIdx = ps[cur].discards.lastIndexOf(out as string);
        if(lastIdx >= 0) ps[cur].discards.splice(lastIdx,1);
        appendLogs([`${label(next)} 吃！（取 ${label(cur)} 的 ${tileLabel(out!)} → ${seq.map(tileLabel).join('')}）`]);
        setPlayers([...ps]);
        // 吃后由下家出牌（不摸牌）
        cur = next;
        continue;
      }

      // 无人叫牌，轮到下家
      cur = (cur+1)%ps.length;
    }
  }

  async function startMatch(){
    setMatchActive(true); setLog([]); setHandNo(0);
    let ps = dealHands(generateWall(), seatProviders);
    setPlayers(ps); setWall([]);
    for(let h=0; h<maxHands; h++){
      setHandRunning(true);
      let wall = generateWall();
      ps = dealHands(wall, ps.map(p=>p.ai)); // 重新发牌，沿用AI标识
      setPlayers(ps); setWall(wall);
      appendLogs([`—— 第 ${h+1} 局开始 ——`]);
      await playOneHand(ps, wall);
      setHandRunning(false);
      setHandNo(h+1);
      await new Promise(r=>setTimeout(r, 400));
    }
    setMatchActive(false);
  }

  return (<div className="wrap">
    <div className="card">
      <div className="row">
        <button className="btn" disabled={matchActive||handRunning} onClick={startMatch}>开始对战</button>
        <label className="small">轮数
          <input type="number" min={1} max={99} value={maxHands} onChange={e=>setMaxHands(parseInt(e.target.value||'1'))} style={{width:70}} /></label>
        <label className="small">速度(ms)
          <input type="number" min={0} max={3000} value={intervalMs} onChange={e=>setIntervalMs(parseInt(e.target.value||'0'))} style={{width:90}} /></label>
        <button className="btn" onClick={()=>setTheme(theme==='light'?'dark':'light')}>主题：{theme==='light'?'浅绿':'深绿'}</button>
        <label className="small"><input type="checkbox" checked={showHands} onChange={e=>setShowHands(e.target.checked)} /> 显示手牌</label>
      </div>
    </div>

    <div className="card">
      <div className="font-semibold mb-2">每座位AI（提供方）</div>
      <div className="grid" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:12}}>
        {[0,1,2,3].map((pi)=>(
          <label key={'prov:'+pi} className="small">{label(pi)} 提供方
            <select className="w-full" value={seatProviders[pi]}
              disabled={matchActive||handRunning}
              onChange={e=>{ const val=e.target.value; const arr=[...seatProviders]; arr[pi]=val; setSeatProviders(arr); }}>
              <option value="local">local</option>
              <option value="kimi2">kimi2</option>
              <option value="kimi">kimi</option>
              <option value="grok">grok</option>
              <option value="gemini">gemini</option>
            </select>
          </label>
        ))}
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
      <div className="small" style={{opacity:.9}}>墙余：{wall.length}</div>
      <div className="mt-2">
        {players.map((p,pi) => (<div key={label(pi)} className="mb-3">
          <div className="font-semibold">{label(pi)}　<span className="text-xxs" style={{opacity:.6}}>({p.ai})</span>　<span className="text-xs" style={{opacity:.8}}>分：{p.score||0}</span></div>
          {showHands && (<>
            <div className="text-xs" style={{opacity:.95, marginTop:4}}>手：</div>
            <div className="tiles tiles-wrap-14">{(p.hand||[]).map((x,i)=>(<TileV key={x+':h:'+i} t={x}/>))}</div>
          </>)}
          <div className="text-xs" style={{opacity:.85, marginTop:4}}>副露：</div>
          <div className="melds">
            {(p.melds||[]).map((m,i)=>(
              <div key={'m:'+i} className={'meld ' + m.type + (m.kanType?(' '+m.kanType):'')}>
                {m.tiles.map((x,xi)=>(<TileV key={'m:'+i+':t:'+xi} t={x} small/>))}
                <span className="ml-1 text-xxs" style={{opacity:.7}}>
                  {m.type==='kan' ? (m.kanType==='ankan'?'暗杠':m.kanType==='minkan'?'明杠':'加杠') : (m.type==='pon'?'碰':'吃')}
                  {' '}来自 {label(m.from)}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs" style={{opacity:.85, marginTop:4}}>弃（顺序）：</div>
          <div className="tiles">{(p.discards||[]).map((x,i)=>(<TileV key={x+':d:'+i} t={x} small/>))}</div>
        </div>))}
      </div>
    </div>

    <div className="card"><div className="font-semibold mb-2">日志</div>
      <div className="log sm" style={{whiteSpace:'pre-wrap'}}>{log.join('\n')}</div>
    </div>

    
    
    
    <style jsx>{`
      :global(html, body){ height:100%; }
      :global(body){ margin:0; background:var(--bg); color:var(--fg); }

      :global(body[data-theme='light']){
        --bg:#e8f5e9; --fg:#113b2e; --fg-soft:#195845;
        --card-bg:#ffffff; --card-border:#bfe3cf;
        --btn-bg:#0e7a47; --btn-fg:#ffffff;
        --input-bg:#ffffff; --input-fg:#113b2e; --input-border:#bfe3cf;
        --tile-bg:#fffffe; --tile-fg:#111; --tile-border:#dadada;
        --log-bg:#ffffff; --log-border:#bfe3cf; --log-fg:#113b2e;
        --meld-chi:#e5f9ee; --meld-pon:#e6f3ff; --meld-ankan:#eef3f4; --meld-minkan:#fff7dc; --meld-kakan:#fff1e5;
      }
      :global(body[data-theme='dark']){
        --bg:#0b5a3c; --fg:#f2f5f3; --fg-soft:#e2efe8;
        --card-bg:rgba(255,255,255,.06); --card-border:rgba(255,255,255,.12);
        --btn-bg:#0e7a47; --btn-fg:#ffffff;
        --input-bg:rgba(255,255,255,.08); --input-fg:#f2f5f3; --input-border:rgba(255,255,255,.18);
        --tile-bg:#fffffe; --tile-fg:#111; --tile-border:#e6e6e6;
        --log-bg:rgba(0,0,0,.35); --log-border:rgba(255,255,255,.12); --log-fg:#ecf3ee;
        --meld-chi:rgba(46,204,113,.10); --meld-pon:rgba(52,152,219,.12); --meld-ankan:rgba(149,165,166,.18); --meld-minkan:rgba(241,196,15,.22); --meld-kakan:rgba(230,126,34,.20);
      }

      .wrap{ max-width:980px; margin:24px auto; padding:12px; }
      .card{ background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:12px 14px; margin-bottom:12px; }
      .row{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .btn{ background:var(--btn-bg); color:var(--btn-fg); padding:8px 12px; border-radius:8px; border:1px solid rgba(0,0,0,.12); }
      .btn:disabled{ opacity:.55; }
      .small{ font-size:12px; display:flex; align-items:center; gap:8px; color:var(--fg-soft); }
      .grid .small{ display:flex; flex-direction:column; align-items:flex-start; }
      input, select{ background:var(--input-bg); color:var(--input-fg); border:1px solid var(--input-border); border-radius:8px; padding:6px 8px; }
      .tiles{ display:flex; gap:6px; flex-wrap:wrap; }
      .tiles-wrap-14 .tile{ width:28px; }
      .tile{ display:inline-flex; width:32px; height:44px; border:1px solid var(--tile-border); border-radius:6px;
        align-items:center; justify-content:center; font-weight:700; background:var(--tile-bg); color:var(--tile-fg);
        box-shadow: 0 1px 2px rgba(0,0,0,.12); }
      .tile.small{ width:24px; height:34px; font-weight:600; }
      .melds{ display:flex; gap:10px; flex-wrap:wrap; }
      .meld{ display:inline-flex; align-items:center; padding:3px 5px; border-radius:6px; border:1px dashed var(--input-border); background:#f8fffb; }
      .meld.chi{ background:var(--meld-chi); }
      .meld.pon{ background:var(--meld-pon); }
      .meld.ankan{ background:var(--meld-ankan); }
      .meld.minkan{ background:var(--meld-minkan); }
      .meld.kakan{ background:var(--meld-kakan); }
      .text-xxs{ font-size:11px; color:var(--fg-soft); }
      .log{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px;
        max-height:260px; overflow:auto; background:var(--log-bg); border:1px solid var(--log-border);
        border-radius:8px; padding:8px; color:var(--log-fg); }
    `}</style>



  </div>);
}