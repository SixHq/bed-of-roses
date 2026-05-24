// Pixel CRT / Retro Terminal kit

const Hr = () => <div className="p-mono" style={{whiteSpace:'nowrap',overflow:'hidden',color:'var(--green-deep)'}}>{'─'.repeat(200)}</div>;
const AsciiBox = ({children,style}) => (
  <div style={{position:'relative',padding:'14px 16px',border:'1px solid var(--green)',color:'var(--green)',background:'var(--bg-2)',boxShadow:'0 0 12px rgba(51,255,102,.25)',...style}}>
    <span style={{position:'absolute',top:-1,left:-1}} className="p-mono">┌</span>
    <span style={{position:'absolute',top:-1,right:-1}} className="p-mono">┐</span>
    <span style={{position:'absolute',bottom:-1,left:-1}} className="p-mono">└</span>
    <span style={{position:'absolute',bottom:-1,right:-1}} className="p-mono">┘</span>
    {children}
  </div>
);

const Hero = () => (
  <div className="stage" style={{padding:'40px 44px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
    <div className="row" style={{justifyContent:'space-between',position:'relative'}}>
      <div className="row" style={{gap:10}}>
        <span className="blink" style={{display:'inline-block',width:10,height:14,background:'var(--green)'}}/>
        <span className="p-mono" style={{color:'var(--green)',fontWeight:700}}>BED-OF-ROSES.OS</span>
        <span className="p-mono">v0.4 · build 20260509</span>
      </div>
      <div className="row" style={{gap:6}}>
        <span className="p-chip p-chip-amber">▌ BOOT OK</span>
        <span className="p-chip p-chip-on">ROSE READY</span>
      </div>
    </div>
    <div style={{position:'relative'}}>
      <div className="p-eyebrow" style={{marginBottom:6}}>// term · 80×24 · phosphor green</div>
      <div className="p-h1" style={{fontSize:172}}>
        BED OF<br/>
        ROSES<span className="blink" style={{color:'var(--amber)'}}>_</span>
      </div>
      <Hr/>
      <div className="p-display" style={{maxWidth:600,marginTop:14,fontSize:16}}>
        &gt; A SOFT LITTLE OS, FOR PEOPLE WHO LIKE THEIR ASSISTANTS<br/>
        &gt; QUIET, MONOSPACED, AND SLIGHTLY GREEN.
      </div>
    </div>
    <div className="row" style={{gap:10}}>
      <button className="p-btn p-btn-pri">▶ RUN</button>
      <button className="p-btn">VIEW SRC</button>
      <button className="p-btn p-btn-amber">⚠ DEBUG</button>
      <span className="p-mono" style={{marginLeft:'auto'}}>↳ /USR/LOCAL/ROSE</span>
    </div>
  </div>
);

const Logo = () => (
  <div className="stage" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div className="col" style={{alignItems:'center',gap:18,position:'relative',zIndex:1}}>
      {/* pixel rose logo */}
      <svg viewBox="0 0 16 16" width={180} height={180} shapeRendering="crispEdges" style={{filter:'drop-shadow(0 0 12px rgba(51,255,102,.6))'}}>
        {(()=>{
          const g='#33FF66', d='#1FA63E', a='#FFB000', m='#FF3B8B';
          const px = [
            [6,2,m],[7,2,m],[8,2,m],
            [5,3,m],[6,3,a],[7,3,m],[8,3,a],[9,3,m],
            [4,4,m],[5,4,a],[6,4,m],[7,4,a],[8,4,m],[9,4,a],[10,4,m],
            [4,5,m],[5,5,m],[6,5,a],[7,5,m],[8,5,a],[9,5,m],[10,5,m],
            [5,6,m],[6,6,m],[7,6,m],[8,6,m],[9,6,m],
            [7,7,d],[8,7,d],
            [6,8,g],[7,8,g],[8,8,g],[9,8,g],
            [5,9,g],[7,9,d],[8,9,d],[10,9,g],
            [4,10,g],[5,10,g],[7,10,d],[8,10,d],[10,10,g],[11,10,g],
            [7,11,d],[8,11,d],
            [7,12,d],[8,12,d],[9,12,d],
            [7,13,d],
          ];
          return px.map(([x,y,c],i)=>(<rect key={i} x={x} y={y} width="1" height="1" fill={c}/>));
        })()}
      </svg>
      <div className="col" style={{alignItems:'center',gap:6}}>
        <div className="p-h2" style={{fontSize:48,color:'var(--green)'}}>BED-OF-ROSES.OS</div>
        <span className="p-mono" style={{color:'var(--green-dim)'}}>// ©2026 ROSE SYSTEMS · BUILD 0042</span>
        <Hr/>
      </div>
    </div>
  </div>
);

const Hud = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:10}}>
    <div className="p-eyebrow">// brand</div>
    <div className="p-h2" style={{fontSize:46}}>HUD REGISTER</div>
    <AsciiBox style={{flex:1,minHeight:200}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:8}}>
          <span className="blink" style={{display:'inline-block',width:8,height:12,background:'var(--green)'}}/>
          <span className="p-mono" style={{color:'var(--green)',fontWeight:700}}>ROSE :: LISTENING</span>
        </div>
        <span className="p-chip p-chip-mag">REC ●</span>
      </div>
      {/* ASCII waveform */}
      <pre className="p-mono" style={{margin:'14px 0 6px',color:'var(--green)',whiteSpace:'pre',fontSize:14,lineHeight:1,letterSpacing:'.04em',textShadow:'0 0 6px rgba(51,255,102,.6)'}}>
{`  ▁▁▂▃▅▇█▇▆▄▃▂▃▅▇█▇▅▃▂▁▂▃▄▅▇█▇▅▃▂▁
  ▁▂▃▄▆▇█▇▅▃▂▁▂▃▄▅▆▇▆▄▃▂▁▂▃▅▇█▇▅▃▁`}
      </pre>
      <Hr/>
      <div className="row" style={{justifyContent:'space-between'}}>
        <span className="p-mono">▌ 14:32:08 · 142MB · NET ↗ 12K/S</span>
        <span className="p-mono">[ESC] DISMISS</span>
      </div>
    </AsciiBox>
  </div>
);

const Swatch = ({name,hex,fill}) => (
  <div className="col" style={{gap:6,width:130}}>
    <div style={{height:120,border:'1px solid var(--green)',background:fill,position:'relative',boxShadow:'0 0 12px rgba(51,255,102,.25)'}}>
      <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.25) 2px 3px)',pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:8,left:10,right:10,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.04em',color:'var(--green)',textShadow:'0 0 4px rgba(51,255,102,.6)'}}>{hex}</div>
    </div>
    <div className="p-mono" style={{color:'var(--green)'}}>{name}</div>
  </div>
);

const Colors = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="p-eyebrow">// foundations / 02</div>
    <div className="p-h2">PALETTE :: PHOSPHOR</div>
    <div className="p-body" style={{maxWidth:560}}>One green for the work, two extra channels for state. Nothing here is decorative — magenta is reserved for errors, amber for caution.</div>
    <div className="row" style={{gap:14}}>
      <Swatch name="BG" hex="#0B0F0A" fill="#0B0F0A"/>
      <Swatch name="GREEN" hex="#33FF66" fill="#33FF66"/>
      <Swatch name="GREEN DIM" hex="#1FA63E" fill="#1FA63E"/>
      <Swatch name="AMBER" hex="#FFB000" fill="#FFB000"/>
      <Swatch name="MAGENTA" hex="#FF3B8B" fill="#FF3B8B"/>
      <Swatch name="CYAN" hex="#00E0FF" fill="#00E0FF"/>
    </div>
  </div>
);

const Type = () => (
  <div className="stage" style={{padding:36,display:'flex',flexDirection:'column',gap:14}}>
    <div className="p-eyebrow">// type / 03</div>
    <div className="p-h1" style={{fontSize:140}}>READY.<span className="blink" style={{color:'var(--amber)'}}>_</span></div>
    <div className="p-h2" style={{fontSize:48,color:'var(--amber)'}}>VT323 / DISPLAY</div>
    <div className="p-h3">IBM PLEX MONO 700 · UI · UPPERCASE</div>
    <div className="p-body" style={{maxWidth:540}}>&gt; Body sets in IBM Plex Mono 13/22. Not all caps — it would be cruel.<br/>&gt; The phosphor glow does the heavy lifting; type stays calm.</div>
    <div className="p-mono">// 11/.06em — used for paths, runs, system chatter</div>
  </div>
);

const Buttons = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="p-eyebrow">// components / 04</div>
    <div className="p-h2">BUTTONS</div>
    <div className="row">
      <button className="p-btn p-btn-pri">▶ RUN</button>
      <button className="p-btn">SAVE</button>
      <button className="p-btn p-btn-amber">⚠ CAUTION</button>
      <button className="p-btn p-btn-mag">✕ ABORT</button>
      <button className="p-btn p-btn-ghost">↳ SKIP</button>
      <button className="p-btn" disabled style={{opacity:.4,cursor:'not-allowed'}}>DISABLED</button>
    </div>
    <div className="row">
      <button className="p-btn" style={{height:28,fontSize:10,padding:'0 12px'}}>SMALL</button>
      <button className="p-btn p-btn-pri" style={{height:52,fontSize:14,padding:'0 26px'}}>LARGE ACTION</button>
    </div>
    <Hr/>
    <div className="p-mono">// HOVER :: FILLS WITH PHOSPHOR · NO RADIUS · NO SHADOW · GLOW INSTEAD</div>
  </div>
);

const Fields = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="p-eyebrow">// components / 05</div>
    <div className="p-h2">FIELDS</div>
    <div className="col" style={{gap:6}}><span className="p-mono">&gt; NAME</span><input className="p-input" placeholder="ENTER HANDLE..."/></div>
    <div className="col" style={{gap:6}}><span className="p-mono">&gt; API_KEY [FOCUSED]</span><input className="p-input p-input-focus" type="password" defaultValue="••••••••••"/></div>
    <div className="col" style={{gap:6}}><span className="p-mono">&gt; PROMPT</span><textarea className="p-input" rows="3" style={{height:'auto',padding:14,resize:'none'}} defaultValue="plan a slow sunday in lagos"/></div>
  </div>
);

const Chips = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="p-eyebrow">// components / 06</div>
    <div className="p-h2">CHIPS &amp; STATES</div>
    <div className="row" style={{gap:6}}>
      <button className="p-chip">CASUAL</button>
      <button className="p-chip p-chip-on">CONCISE</button>
      <button className="p-chip">VERBOSE</button>
      <button className="p-chip p-chip-amber">POETIC</button>
      <button className="p-chip p-chip-mag">FACTUAL</button>
    </div>
    <div className="row" style={{gap:6}}>
      <span className="p-chip p-chip-on">● ONLINE</span>
      <span className="p-chip">↑ SYNC</span>
      <span className="p-chip p-chip-amber">◐ DRAFT</span>
      <span className="p-chip p-chip-mag">⚠ ERR</span>
      <span className="p-chip">v0.4</span>
    </div>
    <Hr/>
    <div className="p-mono">// 1px STROKE · 24PX HEIGHT · NO ROUNDING</div>
  </div>
);

const Tile = ({h=130,c='var(--green)',children,corner,fill='var(--bg-2)'}) => (
  <div style={{height:h,padding:14,position:'relative',overflow:'hidden',
    background:fill,color:c,border:`1px solid ${c}`,boxShadow:`0 0 12px ${c}33, inset 0 0 24px ${c}1A`}}>
    {corner && <div style={{position:'absolute',top:8,right:10,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.06em',opacity:.75}}>{corner}</div>}
    <div style={{position:'relative',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>{children}</div>
  </div>
);

const Tiles = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:14}}>
    <div className="p-eyebrow">// components / 07</div>
    <div className="p-h2">WIDGET TILES</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
      <Tile h={130} corner="WEATHER">
        <span className="p-mono">LAGOS</span>
        <div className="row" style={{gap:8,alignItems:'flex-end'}}>
          <span style={{fontFamily:'var(--display)',fontSize:64,lineHeight:1,color:'var(--green)'}}>18°</span>
          <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:12,color:'var(--green-dim)'}}>CLOUDY</span>
        </div>
      </Tile>
      <Tile h={130} c="var(--amber)" corner="↗ FLIGHT">
        <span className="p-mono" style={{color:'var(--amber)'}}>BA76 :: ON TIME</span>
        <div>
          <div style={{fontFamily:'var(--display)',fontSize:32,lineHeight:1}}>LAGOS → LONDON</div>
          <div className="p-mono" style={{color:'var(--amber)',opacity:.85}}>22:40 · GATE B17</div>
        </div>
      </Tile>
      <Tile h={130} c="var(--magenta)" corner="TODO">
        <span className="p-mono" style={{color:'var(--magenta)'}}>3 ITEMS · 1 OVERDUE</span>
        <div style={{fontFamily:'var(--display)',fontSize:30,lineHeight:1}}>BUY ROSES <span style={{opacity:.5}}>· CALL MOM</span></div>
      </Tile>
      <Tile h={110} corner="NOW PLAYING">
        <div className="row" style={{gap:10}}>
          <div style={{width:36,height:36,border:'1px solid var(--green)',background:'var(--bg)',position:'relative'}}>
            <div style={{position:'absolute',inset:6,background:'var(--green)',opacity:.3}}/>
            <div style={{position:'absolute',inset:10,background:'var(--green)'}}/>
          </div>
          <div className="col" style={{gap:2}}>
            <div className="p-h3" style={{fontSize:14}}>AQUA INTERLUDE</div>
            <span className="p-mono">SOFT LITTLE RADIO · 02:14</span>
          </div>
        </div>
        <div style={{height:4,border:'1px solid var(--green-deep)',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:'42%',background:'var(--green)',boxShadow:'0 0 8px var(--green)'}}/>
        </div>
      </Tile>
      <Tile h={110} corner="MSGS">
        <span className="p-mono">2 NEW</span>
        <div style={{fontFamily:'var(--mono)',fontSize:13}}>MOM: <span style={{color:'var(--green-dim)'}}>did you eat?</span></div>
      </Tile>
      <Tile h={110} c="var(--amber)" corner="SYS">
        <span className="p-mono" style={{color:'var(--amber)'}}>BATT 82% · 6H LEFT</span>
        <pre className="p-mono" style={{margin:0,color:'var(--amber)',fontSize:12,letterSpacing:'.1em'}}>{'[████████░░] 82%'}</pre>
      </Tile>
    </div>
  </div>
);

const Bubbles = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:12}}>
    <div className="p-eyebrow">// components / 08</div>
    <div className="p-h2">CONVERSATION</div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="p-mono" style={{alignSelf:'center'}}>━━ SESSION 0042 · 14:32 ━━</div>
      <div className="p-bubble p-bubble-user">&gt; show me flights from lagos to london</div>
      <div className="p-bubble p-bubble-ai"><span className="p-mono" style={{color:'var(--amber)',display:'block',marginBottom:4}}>ROSE@HOST :: 14:32:08</span>pinned a flight tracker to /today. tap to expand.</div>
      <div className="p-bubble p-bubble-user">&gt; make it pretty too</div>
      <div className="p-bubble p-bubble-ai"><span className="p-mono" style={{color:'var(--amber)',display:'block',marginBottom:4}}>ROSE@HOST :: 14:32:11</span>respectfully — we are in phosphor green, this is as pretty as it gets.</div>
      <div className="p-mono blink" style={{alignSelf:'center'}}>·· typing ··</div>
    </div>
  </div>
);

const ChatBar = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:16,justifyContent:'center'}}>
    <div className="p-eyebrow">// components / 09</div>
    <div className="p-h2">PROMPT BAR</div>
    <div style={{display:'flex',alignItems:'center',gap:0,border:'1px solid var(--green)',background:'var(--bg-2)',boxShadow:'0 0 12px rgba(51,255,102,.3)'}}>
      <span style={{padding:'0 14px',fontFamily:'var(--mono)',fontSize:14,color:'var(--amber)',borderRight:'1px solid var(--green-deep)',height:44,display:'flex',alignItems:'center',textShadow:'0 0 6px rgba(255,176,0,.7)'}}>$&gt;</span>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--mono)',fontSize:14,padding:'0 14px',height:44,color:'var(--green)',textShadow:'0 0 6px rgba(51,255,102,.55)'}} placeholder="ENTER PROMPT..." defaultValue="plan a slow sunday in lagos"/>
      <span className="blink" style={{width:10,height:18,background:'var(--green)',marginRight:14}}/>
      <button style={{height:44,padding:'0 18px',border:0,borderLeft:'1px solid var(--green-deep)',background:'var(--green)',color:'var(--bg)',fontFamily:'var(--mono)',fontWeight:700,fontSize:11,letterSpacing:'.18em',cursor:'pointer'}}>SEND ↵</button>
    </div>
    <div className="row" style={{gap:6}}>
      <button className="p-chip">+ FILE</button>
      <button className="p-chip">+ DOC</button>
      <button className="p-chip p-chip-amber">▶ VOICE</button>
      <span className="p-mono" style={{marginLeft:'auto'}}>CTRL-K · COMMAND</span>
    </div>
  </div>
);

const ProviderRow = ({name,status,mark,on}) => (
  <div style={{display:'grid',gridTemplateColumns:'48px 1fr auto',alignItems:'center',gap:14,padding:'12px 14px',
    border:`1px solid ${on?'var(--green)':'var(--green-deep)'}`,background:on?'rgba(51,255,102,.08)':'var(--bg-2)',
    boxShadow:on?'0 0 14px rgba(51,255,102,.4)':'none'}}>
    <div style={{width:36,height:36,border:`1px solid ${on?'var(--green)':'var(--green-dim)'}`,background:'var(--bg)',color:on?'var(--green)':'var(--green-dim)',display:'flex',alignItems:'center',justifyContent:'center'}}>{mark}</div>
    <div className="col" style={{gap:2}}>
      <div className="row" style={{gap:8}}>
        <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:14,letterSpacing:'.1em',textTransform:'uppercase',color:on?'var(--green)':'var(--green-dim)'}}>{name}</span>
        {on && <span className="p-chip p-chip-on" style={{height:18,fontSize:9}}>DEFAULT</span>}
      </div>
      <span className="p-mono">{status}</span>
    </div>
    <span className="p-mono" style={{fontSize:14,color:'var(--green)'}}>›</span>
  </div>
);

const Providers = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:8}}>
    <div className="p-eyebrow">// components / 10</div>
    <div className="p-h2">PROVIDERS</div>
    <ProviderRow name="ANTHROPIC" status="CONNECTED :: SONNET-4-5" on mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OPENAI" status="$ TAP TO CONNECT" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>}/>
    <ProviderRow name="GEMINI" status="$ TAP TO CONNECT" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="COMPATIBLE" status="$ BYO ENDPOINT" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

const Avatar = () => {
  const Pixel = ({c1,label}) => (
    <div className="col" style={{alignItems:'center',gap:8}}>
      <svg viewBox="0 0 12 12" width={120} height={120} shapeRendering="crispEdges" style={{filter:`drop-shadow(0 0 10px ${c1})`}}>
        {[
          [4,2],[5,2],[6,2],[7,2],
          [3,3],[8,3],
          [2,4],[5,4],[6,4],[9,4],
          [2,5],[4,5],[7,5],[9,5],
          [2,6],[5,6],[6,6],[9,6],
          [3,7],[8,7],
          [4,8],[5,8],[6,8],[7,8],
        ].map(([x,y],i)=>(<rect key={i} x={x} y={y} width="1" height="1" fill={c1}/>))}
      </svg>
      <span className="p-mono" style={{color:'var(--green)'}}>{label}</span>
    </div>
  );
  return (
    <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:24}}>
      <div><div className="p-eyebrow">// brand / 11</div><div className="p-h2">PRESENCE</div></div>
      <div className="p-body" style={{maxWidth:540}}>&gt; Rose appears as a 12×12 pixel face. Color shifts with state.<br/>&gt; She does not blink unless asked.</div>
      <div className="row" style={{gap:32}}>
        <Pixel c1="#33FF66" label="00 · DEFAULT"/>
        <Pixel c1="#FFB000" label="01 · LISTENING"/>
        <Pixel c1="#00E0FF" label="02 · THINKING"/>
        <Pixel c1="#FF3B8B" label="03 · ALERT"/>
      </div>
    </div>
  );
};

const Mark = ({label,c='var(--green)',children}) => (
  <div className="col" style={{alignItems:'center',gap:6}}>
    <div style={{width:80,height:80,border:`1px solid ${c}`,color:c,background:'var(--bg-2)',
      boxShadow:`0 0 12px ${c}55, inset 0 0 18px ${c}22`,
      display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
      <div style={{position:'absolute',inset:0,background:'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.18) 2px 3px)',pointerEvents:'none'}}/>
      <div style={{position:'relative'}}>{children}</div>
    </div>
    <span className="p-mono" style={{color:'var(--green)'}}>{label}</span>
  </div>
);

const Marks = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div><div className="p-eyebrow">// brand / 12</div><div className="p-h2">PROVIDER MARKS</div></div>
    <div className="row" style={{gap:14}}>
      <Mark label="ANTHROPIC" c="var(--magenta)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OPENAI"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg></Mark>
      <Mark label="GEMINI" c="var(--cyan)"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="OLLAMA" c="var(--amber)"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><ellipse cx="12" cy="14" rx="8" ry="6.5"/></svg></Mark>
      <Mark label="COMPATIBLE"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Pixel CRT / Retro Terminal" subtitle="Phosphor green · scanlines · VT323 · ASCII chrome" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The pitch, the lockup, the register.">
      <DCArtboard id="hero" label="Hero · the pitch" width={920} height={600}><Hero/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={600}><Logo/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><Hud/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Phosphor palette, two display faces.">
      <DCArtboard id="colors" label="Palette" width={920} height={460}><Colors/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><Type/></DCArtboard>
    </DCSection>
    <DCSection id="components" title="Components" subtitle="Buttons, fields, chips, tiles, conversation.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={420}><Buttons/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><Fields/></DCArtboard>
      <DCArtboard id="chips" label="Chips & states" width={520} height={400}><Chips/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={760} height={460}><Tiles/></DCArtboard>
      <DCArtboard id="bubbles" label="Conversation" width={520} height={500}><Bubbles/></DCArtboard>
      <DCArtboard id="chatbar" label="Prompt bar" width={620} height={420}><ChatBar/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={460}><Providers/></DCArtboard>
    </DCSection>
    <DCSection id="brand" title="Brand" subtitle="Pixel faces and marks.">
      <DCArtboard id="avatar" label="Presence" width={760} height={420}><Avatar/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={320}><Marks/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
