// Y2K / Frutiger Aero UI Kit

const Bokeh = ({c='var(--lime)',size=120,top,left,right,bottom,o=0.6}) => (
  <span className="bokeh" style={{width:size,height:size,top,left,right,bottom,background:c,opacity:o}}/>
);
const Drop = ({size=56,top,left,right,bottom}) => (
  <span className="drop" style={{width:size,height:size,top,left,right,bottom}}/>
);

const Hero = () => (
  <div className="stage deep" style={{padding:0}}>
    {/* sky decorations */}
    <Bokeh c="rgba(255,255,255,.9)" size={220} top={-60} left={-40} o={0.7}/>
    <Bokeh c="rgba(168,224,99,.7)" size={180} top={120} right={-50}/>
    <Bokeh c="rgba(0,213,255,.6)" size={140} bottom={20} left={60}/>
    <Drop size={90} top={56} right={140}/>
    <Drop size={42} top={130} right={220}/>
    <Drop size={64} bottom={80} right={70}/>
    <Drop size={28} top={60} left={'45%'}/>
    {/* horizon shimmer */}
    <div style={{position:'absolute',left:0,right:0,bottom:'24%',height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent)'}}/>

    <div style={{position:'relative',height:'100%',padding:'40px 44px',display:'flex',flexDirection:'column',justifyContent:'space-between',color:'#fff'}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:10}}>
          <span style={{width:24,height:24,borderRadius:'50%',background:'radial-gradient(circle at 30% 25%, #fff, #A8E063 60%, #5FC92F)',boxShadow:'0 0 0 2px rgba(255,255,255,.7), 0 4px 10px rgba(0,40,120,.4)'}}/>
          <span style={{fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'-.01em'}}>Bed of Roses</span>
          <span className="y-mono" style={{color:'rgba(255,255,255,.8)'}}>v0.4 · build 2026.05.09</span>
        </div>
        <div className="row" style={{gap:6}}>
          <span className="y-chip" style={{background:'rgba(255,255,255,.25)',color:'#fff',border:'1px solid rgba(255,255,255,.5)'}}>♪ now playing</span>
          <span className="y-chip y-chip-lime">● online</span>
        </div>
      </div>
      <div>
        <div className="y-eyebrow" style={{color:'#CCF5FF'}}>// frutiger aero · 2008 — forever</div>
        <div className="y-h1" style={{fontSize:124,textShadow:'0 2px 0 rgba(0,30,90,.35), 0 18px 40px rgba(0,30,90,.55)'}}>Bed of<br/><span style={{background:'linear-gradient(180deg,#fff,#A8E063)',WebkitBackgroundClip:'text',color:'transparent'}}>Roses™</span></div>
        <div className="y-display" style={{color:'rgba(255,255,255,.92)',maxWidth:560,marginTop:14,fontSize:18}}>The original soft little OS — now with reflections, droplets and a lime spring in its step. Hold the future, gently.</div>
      </div>
      <div className="row" style={{gap:12}}>
        <button className="gel gel-lg gel-lime">▶ Get Started</button>
        <button className="gel gel-lg gel-ghost">Take a tour</button>
        <span className="y-mono" style={{color:'rgba(255,255,255,.85)',marginLeft:'auto'}}>↳ 02:34 PM · 72° · Lagos</span>
      </div>
    </div>
  </div>
);

const Logo = () => (
  <div className="stage sky" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
    <Bokeh c="rgba(168,224,99,.6)" size={180} top={-30} right={-30}/>
    <Bokeh c="rgba(0,213,255,.5)" size={140} bottom={-20} left={-20}/>
    <div className="col" style={{alignItems:'center',gap:20,position:'relative',zIndex:1}}>
      {/* Aqua glass orb logo */}
      <div style={{position:'relative',width:160,height:160}}>
        <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'radial-gradient(circle at 32% 28%, #fff 0%, #9ED6FF 22%, #3BA8FF 55%, #003FA8 100%)',boxShadow:'inset 0 -10px 30px rgba(0,30,90,.6), 0 18px 40px rgba(0,30,90,.4), 0 3px 6px rgba(0,30,90,.3)'}}/>
        {/* lime petal */}
        <svg viewBox="0 0 120 120" style={{position:'absolute',inset:'18% 18% auto auto',width:64,height:64,filter:'drop-shadow(0 4px 8px rgba(0,30,90,.4))'}}>
          <defs><radialGradient id="lp" cx="35%" cy="30%"><stop offset="0%" stopColor="#fff"/><stop offset="40%" stopColor="#D6FF9D"/><stop offset="100%" stopColor="#3FA017"/></radialGradient></defs>
          <path d="M60 10 C 90 30, 105 60, 80 100 C 55 80, 45 50, 60 10 Z" fill="url(#lp)" stroke="#fff" strokeOpacity=".8"/>
        </svg>
        {/* gloss */}
        <div style={{position:'absolute',inset:'6% 14% auto 14%',height:'34%',borderRadius:'50%',background:'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,0))'}}/>
      </div>
      <div className="col" style={{alignItems:'center',gap:6}}>
        <div className="y-h2" style={{fontSize:42,letterSpacing:'-.03em'}}>Bed of Roses<sup style={{fontSize:14,color:'var(--sky-3)'}}>™</sup></div>
        <span className="y-mono" style={{color:'var(--sky-3)'}}>// a soft little OS · ©2008 forever</span>
      </div>
    </div>
  </div>
);

const Hud = () => (
  <div className="stage deep" style={{padding:32,display:'flex',flexDirection:'column',gap:14}}>
    <Bokeh c="rgba(168,224,99,.6)" size={180} top={-40} right={-30}/>
    <Drop size={32} top={20} right={60}/>
    <div className="y-eyebrow" style={{color:'#CCF5FF'}}>// brand</div>
    <div className="y-h2" style={{color:'#fff'}}>HUD register</div>
    <div className="glass" style={{flex:1,position:'relative',padding:14,minHeight:200,borderRadius:18}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:8}}>
          <span style={{width:10,height:10,borderRadius:'50%',background:'radial-gradient(circle at 30% 25%, #fff, #5FC92F 60%, #2F7A12)',boxShadow:'0 0 8px #A8E063'}}/>
          <span className="y-mono" style={{fontWeight:600}}>Rose · listening</span>
        </div>
        <span className="y-chip y-chip-lime" style={{height:22,fontSize:10}}>REC ●</span>
      </div>
      <div style={{display:'flex',gap:3,alignItems:'flex-end',height:60,marginTop:14}}>
        {Array.from({length:42}).map((_,i)=> {
          const h = 8 + Math.abs(Math.sin(i*0.7+1))*46;
          return <div key={i} style={{flex:1,height:h,borderRadius:3,background:'linear-gradient(180deg,#D6FF9D,#5FC92F)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)'}}/>;
        })}
      </div>
      <div className="row" style={{justifyContent:'space-between',marginTop:14}}>
        <span className="y-mono">▌ 14:32:08 · 142 MB · NET ↗ 12 KB/s</span>
        <span className="y-mono">[Esc] dismiss</span>
      </div>
    </div>
  </div>
);

const Swatch = ({name,fill,fg='var(--ink)',hex}) => (
  <div className="col" style={{gap:6,width:120}}>
    <div style={{height:120,borderRadius:14,background:fill,border:'1px solid rgba(255,255,255,.7)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.85), 0 6px 14px -4px rgba(0,40,120,.3)',position:'relative'}}>
      <div style={{position:'absolute',inset:'8% 12% auto 12%',height:'34%',borderRadius:'50%',background:'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,0))'}}/>
      <div style={{position:'absolute',bottom:8,left:10,right:10,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.04em',color:fg,textTransform:'uppercase'}}>{hex}</div>
    </div>
    <div className="y-mono" style={{color:'var(--ink)'}}>{name}</div>
  </div>
);

const Colors = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <Bokeh c="rgba(168,224,99,.4)" size={140} bottom={-30} right={-20}/>
    <div className="y-eyebrow">// foundations / 02</div>
    <div className="y-h2">Palette · sky, water, lime</div>
    <div className="y-body" style={{maxWidth:560}}>Sky gradient does most of the work. Lime is the optimistic accent — never used flat, always with a highlight running across the top half.</div>
    <div className="row" style={{gap:14}}>
      <Swatch name="Sky" hex="#9ED6FF→#0066FF" fill="linear-gradient(180deg,#BFE7FF,#0066FF)" fg="#fff"/>
      <Swatch name="Aqua" hex="#00D5FF" fill="linear-gradient(180deg,#CCF5FF,#00D5FF)"/>
      <Swatch name="Lime" hex="#A8E063" fill="linear-gradient(180deg,#D6FF9D,#5FC92F)"/>
      <Swatch name="Silver" hex="#C8D6E5" fill="linear-gradient(180deg,#FFFFFF,#C8D6E5)"/>
      <Swatch name="Ink" hex="#0A2A4D" fill="linear-gradient(180deg,#3D5C82,#0A2A4D)" fg="#fff"/>
      <Swatch name="Glass" hex="rgba(255,…)" fill="linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.4))"/>
    </div>
  </div>
);

const Type = () => (
  <div className="stage sky" style={{padding:36,display:'flex',flexDirection:'column',gap:14}}>
    <Bokeh c="rgba(0,213,255,.4)" size={160} top={-30} right={-20}/>
    <div className="y-eyebrow">// type / 03</div>
    <div className="y-h1" style={{fontSize:104,background:'linear-gradient(180deg,#fff,#3BA8FF 60%,#0066FF)',WebkitBackgroundClip:'text',color:'transparent',textShadow:'0 2px 0 rgba(255,255,255,.6)'}}>Optim<br/>istic.</div>
    <div className="y-h2" style={{color:'var(--sky-3)'}}>Sora 700 · display headlines</div>
    <div className="y-h3">Sora 600 · all-caps subheads with looser tracking</div>
    <div className="y-body" style={{maxWidth:540}}>Body sets in Inter. Optimistic, highly legible, friendly without being precious. Long-form reading is fine — copy doesn't need to apologize for being copy.</div>
    <div className="y-mono">// JetBrains Mono · 11/.05em — used for paths, timestamps, system chatter</div>
  </div>
);

const Buttons = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="y-eyebrow">// components / 04</div>
    <div className="y-h2">Gel buttons</div>
    <div className="row">
      <button className="gel">▶ Initialize</button>
      <button className="gel gel-lime">Save</button>
      <button className="gel gel-aqua">Connect</button>
      <button className="gel gel-silver">Continue</button>
      <button className="gel gel-ghost">Skip</button>
      <button className="gel" disabled style={{opacity:.4,cursor:'not-allowed',filter:'saturate(.5)'}}>Disabled</button>
    </div>
    <div className="row">
      <button className="gel gel-sm">small</button>
      <button className="gel">medium</button>
      <button className="gel gel-lg gel-lime">Large action ★</button>
    </div>
    <div className="y-mono" style={{marginTop:6}}>// inset highlight + hard 50% gloss break + soft drop shadow = the recipe</div>
  </div>
);

const Fields = () => (
  <div className="stage sky" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <Drop size={48} top={20} right={30}/>
    <div className="y-eyebrow">// components / 05</div>
    <div className="y-h2">Fields</div>
    <div className="col" style={{gap:6}}>
      <span className="y-mono" style={{color:'var(--ink)'}}>Display name</span>
      <input className="y-input" placeholder="enter your handle…"/>
    </div>
    <div className="col" style={{gap:6}}>
      <span className="y-mono" style={{color:'var(--ink)'}}>API key · focused</span>
      <input className="y-input y-input-focus" type="password" defaultValue="••••••••••"/>
    </div>
    <div className="col" style={{gap:6}}>
      <span className="y-mono" style={{color:'var(--ink)'}}>Prompt</span>
      <textarea className="y-input" rows="3" style={{height:'auto',padding:14,resize:'none',borderRadius:18,fontFamily:'var(--body)'}} defaultValue="plan a slow sunday in lagos with three cafes and a bookstore"/>
    </div>
  </div>
);

const Chips = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <div className="y-eyebrow">// components / 06</div>
    <div className="y-h2">Chips &amp; states</div>
    <div className="row" style={{gap:8}}>
      <button className="y-chip">Casual</button>
      <button className="y-chip y-chip-on">Concise</button>
      <button className="y-chip">Verbose</button>
      <button className="y-chip y-chip-lime">Poetic</button>
      <button className="y-chip">Factual</button>
    </div>
    <div className="row" style={{gap:8}}>
      <span className="y-chip y-chip-lime">● online</span>
      <span className="y-chip y-chip-on">↑ syncing</span>
      <span className="y-chip">v0.4</span>
      <span className="y-chip">2026·05·09</span>
      <span className="y-chip" style={{background:'linear-gradient(180deg,#FFE0A1,#FFB840)',color:'#5C3300'}}>◐ draft</span>
    </div>
    <div className="y-mono">// pill geometry, half-gloss top, lime for affirmative</div>
  </div>
);

const Tile = ({h=130,grad,children,corner}) => (
  <div style={{height:h,borderRadius:18,padding:14,position:'relative',overflow:'hidden',
    background:grad||'linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.55))',
    border:'1px solid rgba(255,255,255,.85)',
    boxShadow:'inset 0 1px 0 rgba(255,255,255,.95), 0 10px 22px -8px rgba(0,40,120,.3)',
    color:'var(--ink)'}}>
    <div style={{position:'absolute',inset:'4% 8% auto 8%',height:'34%',borderRadius:'50% / 100%',background:'linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,0))',pointerEvents:'none'}}/>
    {corner && <div style={{position:'absolute',top:10,right:12,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.06em',opacity:.75}}>{corner}</div>}
    <div style={{position:'relative',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>{children}</div>
  </div>
);

const Tiles = () => (
  <div className="stage sky" style={{padding:32,display:'flex',flexDirection:'column',gap:14}}>
    <Bokeh c="rgba(168,224,99,.5)" size={140} bottom={-30} right={-30}/>
    <div className="y-eyebrow">// components / 07</div>
    <div className="y-h2">Widget tiles</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
      <Tile h={130} corner="weather">
        <span className="y-mono">Lagos</span>
        <div className="row" style={{gap:8,alignItems:'flex-end'}}>
          <span style={{fontFamily:'var(--sans)',fontWeight:800,fontSize:42,lineHeight:1}}>18°</span>
          <span style={{fontFamily:'var(--sans)',fontWeight:600,color:'var(--sky-3)'}}>partly cloudy</span>
        </div>
      </Tile>
      <Tile h={130} grad="linear-gradient(180deg,#7FC8FF,#0066FF)" corner="↗ flight">
        <span className="y-mono" style={{color:'rgba(255,255,255,.85)'}}>BA76 · on time</span>
        <div style={{color:'#fff'}}>
          <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:18}}>Lagos → London</div>
          <div className="y-mono" style={{color:'rgba(255,255,255,.85)'}}>22:40 · gate B17</div>
        </div>
      </Tile>
      <Tile h={130} grad="linear-gradient(180deg,#D6FF9D,#5FC92F)" corner="today">
        <span className="y-mono" style={{color:'#15330A'}}>3 items · 1 overdue</span>
        <div style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:18,color:'#15330A'}}>Buy roses ✿ <span style={{opacity:.6}}>· call mom · gym</span></div>
      </Tile>
      <Tile h={110} grad="linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.55))" corner="now playing">
        <div className="row" style={{gap:10}}>
          <div style={{width:42,height:42,borderRadius:8,background:'linear-gradient(135deg,#FFB6E1,#7FC8FF)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.9), 0 4px 8px rgba(0,40,120,.25)'}}/>
          <div className="col" style={{gap:2}}>
            <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:14}}>Aqua interlude</div>
            <span className="y-mono">soft little radio · 02:14</span>
          </div>
        </div>
        <div style={{height:4,borderRadius:2,background:'rgba(0,40,120,.15)',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:'42%',borderRadius:2,background:'linear-gradient(90deg,#7FC8FF,#0066FF)'}}/>
        </div>
      </Tile>
      <Tile h={110} corner="messages">
        <span className="y-mono">2 new</span>
        <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:15}}>Mom: <span style={{color:'var(--ink-2)',fontWeight:400}}>did you eat?</span></div>
      </Tile>
      <Tile h={110} corner="battery">
        <span className="y-mono">82% · 6h left</span>
        <div style={{position:'relative',height:18,borderRadius:6,background:'linear-gradient(180deg,#F2F7FC,#D9E5F2)',border:'1px solid rgba(0,40,120,.15)',boxShadow:'inset 0 2px 4px rgba(0,40,120,.15)'}}>
          <div style={{position:'absolute',left:2,top:2,bottom:2,width:'82%',borderRadius:4,background:'linear-gradient(180deg,#D6FF9D,#5FC92F)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.8)'}}/>
        </div>
      </Tile>
    </div>
  </div>
);

const Bubbles = () => (
  <div className="stage sky" style={{padding:32,display:'flex',flexDirection:'column',gap:12}}>
    <Drop size={36} top={20} right={32}/>
    <div className="y-eyebrow">// components / 08</div>
    <div className="y-h2">Conversation</div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="y-mono" style={{alignSelf:'center',color:'var(--ink-3)'}}>━━━ session 0042 · 14:32 ━━━</div>
      <div className="y-bubble y-bubble-user">show me flights from lagos to london</div>
      <div className="y-bubble y-bubble-ai"><span className="y-mono" style={{color:'var(--sky-3)',display:'block',marginBottom:4}}>Rose · 14:32:08</span>I pinned a flight tracker to /today. Tap to expand it. ✿</div>
      <div className="y-bubble y-bubble-user">make it a little prettier?</div>
      <div className="y-bubble y-bubble-ai"><span className="y-mono" style={{color:'var(--sky-3)',display:'block',marginBottom:4}}>Rose · 14:32:11</span>Already on it — added a sky gradient and a green dot. 🌿</div>
      <div className="y-mono" style={{alignSelf:'center',color:'var(--ink-3)'}}>·· typing ··</div>
    </div>
  </div>
);

const ChatBar = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:16,justifyContent:'center'}}>
    <div className="y-eyebrow">// components / 09</div>
    <div className="y-h2">Prompt bar</div>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:6,borderRadius:999,
      background:'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.7))',
      border:'1px solid rgba(255,255,255,.85)',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,.95), inset 0 -1px 0 rgba(0,40,120,.1), 0 10px 24px -6px rgba(0,40,120,.3)'}}>
      <button className="gel gel-sm gel-ghost" style={{paddingLeft:14}}>＋</button>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--body)',fontSize:14,padding:'0 8px',height:42,color:'var(--ink)'}} placeholder="ask Rose anything…" defaultValue="plan a slow sunday in lagos"/>
      <button className="gel gel-sm gel-aqua">🎤</button>
      <button className="gel" style={{height:40,padding:'0 20px'}}>Send ▸</button>
    </div>
    <div className="row" style={{gap:6}}>
      <button className="y-chip">＋ image</button>
      <button className="y-chip">＋ doc</button>
      <button className="y-chip y-chip-lime">↳ shortcuts</button>
      <span className="y-mono" style={{marginLeft:'auto'}}>⌘K · command palette</span>
    </div>
  </div>
);

const ProviderRow = ({name,status,mark,on}) => (
  <div className={on?'glass-blue':'glass'} style={{display:'grid',gridTemplateColumns:'52px 1fr auto',alignItems:'center',gap:14,padding:'12px 16px',borderRadius:18}}>
    <div style={{width:40,height:40,borderRadius:12,background:on?'rgba(255,255,255,.18)':'linear-gradient(180deg,#fff,#E1E9F2)',
      border:`1px solid ${on?'rgba(255,255,255,.5)':'rgba(255,255,255,.85)'}`,
      boxShadow:'inset 0 1px 0 rgba(255,255,255,.9), 0 3px 8px -2px rgba(0,40,120,.3)',
      display:'flex',alignItems:'center',justifyContent:'center',color:on?'#fff':'var(--ink)'}}>{mark}</div>
    <div className="col" style={{gap:2}}>
      <div className="row" style={{gap:8}}>
        <span style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:17}}>{name}</span>
        {on && <span className="y-chip y-chip-lime" style={{height:22,fontSize:10}}>● default</span>}
      </div>
      <span className="y-mono" style={{color:on?'rgba(255,255,255,.85)':'var(--ink-2)'}}>{status}</span>
    </div>
    <span style={{fontFamily:'var(--sans)',fontSize:18,opacity:.85}}>›</span>
  </div>
);

const Providers = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:10}}>
    <Bokeh c="rgba(0,213,255,.35)" size={150} top={-30} right={-30}/>
    <div className="y-eyebrow">// components / 10</div>
    <div className="y-h2">Providers</div>
    <ProviderRow name="Anthropic" status="connected · sonnet-4-5" on mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OpenAI" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>}/>
    <ProviderRow name="Gemini" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="Compatible" status="byo endpoint · http(s)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

const Orb = ({c1,c2,c3,size=120,label}) => (
  <div className="col" style={{alignItems:'center',gap:8}}>
    <div style={{position:'relative',width:size,height:size}}>
      <div style={{position:'absolute',inset:0,borderRadius:'50%',background:`radial-gradient(circle at 32% 28%, #fff 0%, ${c1} 22%, ${c2} 55%, ${c3} 100%)`,boxShadow:'inset 0 -10px 26px rgba(0,30,90,.55), 0 14px 30px rgba(0,30,90,.32), 0 2px 4px rgba(0,30,90,.25)'}}/>
      <div style={{position:'absolute',inset:'8% 16% auto 16%',height:'30%',borderRadius:'50%',background:'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,0))'}}/>
    </div>
    <span className="y-mono" style={{color:'var(--ink)'}}>{label}</span>
  </div>
);

const Avatar = () => (
  <div className="stage sky" style={{padding:32,display:'flex',flexDirection:'column',gap:24}}>
    <Bokeh c="rgba(168,224,99,.5)" size={160} bottom={-40} right={-30}/>
    <div><div className="y-eyebrow">// brand / 11</div><div className="y-h2">Presence orb</div></div>
    <div className="y-body" style={{maxWidth:540}}>Rose appears as a glass orb. The hue changes with state — sky for default, lime when she's heard you, aqua while thinking, sunset when something needs your attention.</div>
    <div className="row" style={{gap:32}}>
      <Orb label="00 · default" c1="#9ED6FF" c2="#3BA8FF" c3="#003FA8"/>
      <Orb label="01 · listening" c1="#D6FF9D" c2="#5FC92F" c3="#1F6005"/>
      <Orb label="02 · thinking" c1="#CCF5FF" c2="#00D5FF" c3="#005A78"/>
      <Orb label="03 · alert" c1="#FFE0A1" c2="#FF9C2E" c3="#7A3300"/>
    </div>
  </div>
);

const Mark = ({label,gradient,children}) => (
  <div className="col" style={{alignItems:'center',gap:6}}>
    <div style={{width:80,height:80,borderRadius:18,background:gradient,border:'1px solid rgba(255,255,255,.85)',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,.95), 0 10px 22px -8px rgba(0,40,120,.32)',
      position:'relative',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
      <div style={{position:'absolute',inset:'6% 10% auto 10%',height:'34%',borderRadius:'50% / 100%',background:'linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,0))'}}/>
      <div style={{position:'relative'}}>{children}</div>
    </div>
    <span className="y-mono" style={{color:'var(--ink)'}}>{label}</span>
  </div>
);

const Marks = () => (
  <div className="stage silver" style={{padding:32,display:'flex',flexDirection:'column',gap:18}}>
    <Bokeh c="rgba(0,213,255,.35)" size={140} bottom={-20} right={-20}/>
    <div><div className="y-eyebrow">// brand / 12</div><div className="y-h2">Provider marks · gel</div></div>
    <div className="row" style={{gap:14}}>
      <Mark label="Anthropic" gradient="linear-gradient(180deg,#FFB18C,#D9532E)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OpenAI" gradient="linear-gradient(180deg,#9DE8C8,#10A37F)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg></Mark>
      <Mark label="Gemini" gradient="linear-gradient(180deg,#9ED6FF,#0066FF)"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="Ollama" gradient="linear-gradient(180deg,#D6FF9D,#5FC92F)"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><ellipse cx="12" cy="14" rx="8" ry="6.5"/></svg></Mark>
      <Mark label="Compatible" gradient="linear-gradient(180deg,#E6EEF6,#92A8C2)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#0A2A4D" strokeWidth="1.5"><circle cx="6" cy="7" r="2.4" fill="#0A2A4D"/><circle cx="18" cy="7" r="2.4" fill="#0A2A4D"/><circle cx="12" cy="18" r="2.4" fill="#0A2A4D"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Y2K / Frutiger Aero" subtitle="Aqua glass · gel buttons · lime accents · water droplets · sky gradients" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The pitch, the lockup, the register.">
      <DCArtboard id="hero" label="Hero · the pitch" width={920} height={600}><Hero/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={600}><Logo/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><Hud/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Sky palette, optimistic type.">
      <DCArtboard id="colors" label="Palette" width={920} height={460}><Colors/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><Type/></DCArtboard>
    </DCSection>
    <DCSection id="components" title="Components" subtitle="Gel buttons, glass tiles, gradient bubbles.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={420}><Buttons/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><Fields/></DCArtboard>
      <DCArtboard id="chips" label="Chips & states" width={520} height={400}><Chips/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={760} height={460}><Tiles/></DCArtboard>
      <DCArtboard id="bubbles" label="Conversation" width={520} height={500}><Bubbles/></DCArtboard>
      <DCArtboard id="chatbar" label="Prompt bar" width={620} height={420}><ChatBar/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={460}><Providers/></DCArtboard>
    </DCSection>
    <DCSection id="brand" title="Brand" subtitle="Orbs and gel marks.">
      <DCArtboard id="avatar" label="Presence orb" width={760} height={420}><Avatar/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={320}><Marks/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
