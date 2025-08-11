// pages/index.tsx
import React, { useState, useRef, type CSSProperties } from 'react';
import { generateWall, dealHands, drawTile, discardTile, checkWin, updateScores, defaultRules, type PlayerState } from '@/lib/mahjongEngine';

const AI_PLAYERS = ['chatgpt', 'kimi', 'gemini', 'grok'] as const;

// ======== Tile Graphics ========
const CN_NUM = ['零','一','二','三','四','五','六','七','八','九'];
function parseTile(code: string){
  const n = parseInt(code[0],10);
  const s = code[1] as 'W'|'B'|'T'|'Z';
  return { n, s };
}

function DotsSVG({ n }: { n:number }){
  const cells = Array.from({length:9}, (_,i)=>i);
  return (
    <svg viewBox="0 0 90 120" width="100%" height="100%">
      {cells.slice(0, n).map((i)=>{
        const col = i % 3; const row = Math.floor(i/3);
        const cx = 15 + col*30; const cy = 20 + row*30;
        return <circle key={i} cx={cx} cy={cy} r={6} />;
      })}
    </svg>
  );
}

function BambooSVG({ n }: { n:number }){
  const bars = Array.from({length:n}, (_,i)=>i);
  return (
    <svg viewBox="0 0 90 120" width="100%" height="100%">
      {bars.map((i)=>{
        const x = 10 + (i%3)*26; const y = 10 + Math.floor(i/3)*35;
        return <rect key={i} x={x} y={y} width={18} height={28} rx={4} ry={4} />;
      })}
    </svg>
  );
}

function Characters({ n }: { n:number }){
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="text-[22px] leading-none">{CN_NUM[n]}</div>
      <div className="text-[18px] leading-none mt-1">萬</div>
    </div>
  );
}

function TileView({ code, drawn=false }: { code:string; drawn?:boolean }){
  const { n, s } = parseTile(code);
  const honorChar = ['', '东', '南', '西', '北', '中', '发', '白'][n] || '';
  const color =
    s === 'W' ? '#dc2626' :
    s === 'Z' && n === 5 ? '#dc2626' :
    s === 'Z' && n === 6 ? '#16a34a' :
    '#0f172a';

  return (
    <div className={`tile ${drawn ? 'drawn' : ''}`} style={{padding:0, width:44, height:60, display:'inline-flex', alignItems:'center', justifyContent:'center'} as CSSProperties}>
      <div className="w-[40px] h-[56px] rounded-md border flex items-center justify-center overflow-hidden" style={{ color }}>
        {s==='B' && <DotsSVG n={n} />}
        {s==='T' && <BambooSVG n={n} />}
        {s==='W' && <Characters n={n} />}
        {s==='Z' && (<div className="w-full h-full flex items-center justify-center text-[20px]">{honorChar}</div>)}
      </div>
    </div>
  );
}

// ======== Page ========
export default function Home(){
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [rules, setRules] = useState(defaultRules);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [apiKeys, setApiKeys] = useState({ chatgpt: '', kimi: '', gemini: '', grok: '' });

  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  const startGame = () => {
    const newWall = generateWall();
    const initial = dealHands([...newWall], [...AI_PLAYERS]);
    const remainWall = newWall.slice(initial.length * 13);
    setPlayers(initial);
    setWall(remainWall);
    setRound(0);
    setLog([]);
    setGameOver(false);
    setPaused(false);
    pauseRef.current = false;
  };

  async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
  async function waitWhilePaused() {
    while (pauseRef.current && runningRef.current) {
      await sleep(200);
    }
  }

  const togglePause = () => {
    if (!running) return;
    setPaused(p => {
      const next = !p;
      pauseRef.current = next;
      return next;
    });
  };

  const startAutoRound = async () => {
    if (gameOver || players.length === 0 || running) return;
    setRunning(true);
    runningRef.current = true;
    setPaused(false);
    pauseRef.current = false;

    let np: PlayerState[] = players.map(p => ({...p, lastWinScore: undefined, fan: []}));
    let w = [...wall];
    let winnerIdx = -1;
    let winInfo: {fan: string[], score: number} | null = null;

    outer: while (w.length > 0 && runningRef.current) {
      for (let i = 0; i < np.length; i++) {
        const p = np[i];
        if (p.isEliminated) continue;

        await waitWhilePaused();
        if (!runningRef.current) break outer;

        // Draw
        const t = drawTile(w);
        if (t) p.hand.push(t);

        const r = checkWin(p.hand);
        if (r.win) { winnerIdx = i; winInfo = r; p.fan = r.fan; break outer; }

        // Discard with reason
        const { tile, reason } = await discardTile(p.ai, p.hand, apiKeys);
        const idx = p.hand.indexOf(tile);
        if (idx >= 0) p.hand.splice(idx, 1);
        p.discards.push(tile);
        setLog(prev => [...prev, `${p.ai} 打出 ${tile}${reason ? `（理由：${reason}）` : ''}`]);

        setPlayers(np.map(x=>({...x})));
        await sleep(1000);
      }
    }

    runningRef.current = false;

    if (winnerIdx !== -1 && winInfo) {
      const updated = updateScores(np, winnerIdx, winInfo.score);
      setPlayers(updated);
      setLog(prev => [...prev, `${updated[winnerIdx].ai} 胡牌（${winInfo.fan.join('+')}），得分：${winInfo.score}`]);
      if (rules.knockout && updated.some(p => p.isEliminated)) {
        setGameOver(true);
        setLog(prev => [...prev, `比赛结束：${updated[winnerIdx].ai} 获胜`]);
      }
    } else {
      setPlayers(np);
      if (w.length === 0) setLog(prev => [...prev, `本轮流局（摸完牌墙无人胡）`]);
    }

    setWall(w);
    setRound(r => r + 1);
    if (round + 1 >= (rules.maxRounds ?? 16)) {
      setGameOver(true);
      const sorted = [...np].sort((a,b)=>b.score-a.score);
      setLog(prev => [...prev, `比赛结束：${sorted[0].ai} 积分最高`]);
    }
    setRunning(false);
    setPaused(false);
    pauseRef.current = false;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <style jsx global>{`
        .tile { display:inline-block; padding:6px 8px; margin:2px; background:#fff; border-radius:8px; border:1px solid #ddd; transition: transform .2s ease, box-shadow .2s ease; }
        .tile.drawn { transform: translateY(-6px); box-shadow:0 8px 18px rgba(0,0,0,.1); }
        .card { background:white; border:1px solid #e5e7eb; border-radius:14px; padding:12px; box-shadow: 0 4px 14px rgba(0,0,0,.05); }
        .btn { padding:10px 14px; border-radius:12px; border:1px solid #ddd; background:#fff; transition: transform .1s ease; }
        .btn:active { transform: scale(.98); }
        .btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
        .fadeIn { animation: fadeIn .25s ease both; }
        @keyframes fadeIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }
        .badge { display:inline-block; padding:2px 8px; border-radius:9999px; background:#f1f5f9; font-size:12px; }
      `}</style>

      <div className="max-w-6xl mx-auto space-y-6">

        {/* API Keys form */}
        <div className="card">
          <div className="font-semibold mb-2">AI API Keys（留空使用默认环境）</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['chatgpt','kimi','gemini','grok'] as const).map(name => (
              <label key={name} className="flex items-center gap-2">
                <span className="w-24 uppercase">{name}</span>
                <input
                  type="password"
                  className="border rounded px-2 py-1 flex-1"
                  placeholder="API Key"
                  value={apiKeys[name]}
                  onChange={e => setApiKeys(prev => ({...prev, [name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 items-end">
          <button className="btn" onClick={startGame}>开始新比赛</button>
          <button className="btn primary" onClick={startAutoRound} disabled={running || gameOver || players.length===0}>
            {running ? '出牌中…' : '开始新一轮（自动出到胡）'}
          </button>
          <button className="btn" onClick={togglePause} disabled={!running}>
            {paused ? '继续' : '暂停'}
          </button>

          <div className="ml-auto card flex gap-3 items-center">
            <div>起始资金</div>
            <input className="border rounded px-2 py-1 w-24" type="number" value={rules.initialScore}
              onChange={e => setRules(r => ({...r, initialScore: Number(e.target.value)||0 }))}/>
            <div>最大轮数</div>
            <input className="border rounded px-2 py-1 w-20" type="number" value={rules.maxRounds}
              onChange={e => setRules(r => ({...r, maxRounds: Number(e.target.value)||0 }))}/>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rules.knockout} onChange={e => setRules(r => ({...r, knockout: e.target.checked }))}/>
              淘汰模式
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md-grid-cols-2 lg:grid-cols-4 gap-4">
          {players.map((p) => (
            <div key={p.ai} className="card fadeIn">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{p.ai}</div>
                <div className={`badge ${p.isEliminated ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>
                  {p.isEliminated ? '已出局' : `资金 ${p.score}`}
                </div>
              </div>
              <div className="text-sm mb-2">手牌：</div>
              <div className="mb-2">
                {p.hand.slice(0, 14).map((t,i)=>(<TileView key={i} code={t} drawn={i===p.hand.length-1} />))}
              </div>
              <div className="text-sm mb-2">最近出牌：</div>
              <div className="mb-1">{p.discards.slice(-6).map((t,i)=>(<TileView key={i} code={t} />))}</div>
              {p.fan && p.fan.length>0 && (<div className="text-green-600 text-sm">胡牌：{p.fan.join('+')}</div>)}
              {typeof p.lastWinScore === 'number' && (<div className="text-xs text-slate-500">本轮变动：{p.lastWinScore>0?`+${p.lastWinScore}`:p.lastWinScore}</div>)}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="font-semibold mb-2">比赛日志</div>
          <div className="space-y-1 max-h-64 overflow-auto text-sm">
            {log.map((l,i)=>(<div key={i} className="fadeIn">• {l}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
}
