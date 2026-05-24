// Liquid Glass kit — frosted glass + italic serif over saturated backdrops

const Backdrop = ({variant='aurora'}) => {
  const aurora = (
    <div className="backdrop" style={{filter:'saturate(1.1)'}}>
      <span/><span/>
    </div>
  );
  const dusk = (
    <div className="backdrop" style={{filter:'saturate(1.1)'}}>
      <span style={{background:'radial-gradient(circle, #FFD58A, #FF6B3D 55%, transparent 70%)',width:'55%',height:'60%',left:'10%',top:'15%',opacity:.85}}/>
      <span style={{background:'radial-gradient(circle, #6F50C7, #1E1F5C 55%, transparent 70%)',width:'70%',height:'80%',right:'-10%',bottom:'-20%',opacity:.85}}/>
    </div>
  );
  const sea = (
    <div className="backdrop" style={{filter:'saturate(1.2)'}}>
      <span style={{background:'radial-gradient(circle, #6DC8FF, #1E5BC7 55%, transparent 70%)',width:'80%',height:'80%',left:'-20%',top:'10%'}}/>
      <span style={{background:'radial-gradient(circle, #B6FFE5, #1E9F6B 55%, transparent 70%)',width:'60%',height:'60%',right:'-10%',bottom:'10%'}}/>
    </div>
  );
  return ({aurora,dusk,sea})[variant] || aurora;
};

const Hero = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{justifyContent:'space-between',padding:'40px 44px'}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:10}}>
          <div className="glass" style={{width:32,height:32,borderRadius:'50%',padding:0}}>
            <div style={{position:'absolute',inset:6,borderRadius:'50%',background:'radial-gradient(circle at 30% 25%, #fff, #FF7AB6 60%, #C13BB5)'}}/>
          </div>
          <span style={{fontFamily:'var(--sans)',fontWeight:600,letterSpacing:'-.01em'}}>Bed of Roses</span>
          <span className="lg-mono">v0.4 · WWDC build</span>
        </div>
        <div className="row" style={{gap:6}}>
          <span className="lg-chip">∿ liquid mode</span>
          <span className="lg-chip lg-chip-cool">live</span>
        </div>
      </div>
      <div>
        <div className="lg-eyebrow">// liquid glass · vision-era</div>
        <div className="lg-h1" style={{fontSize:148}}>
          Bed of <span style={{fontStyle:'italic'}}>Roses,</span><br/>
          <span className="lg-h2-sans" style={{fontFamily:'var(--sans)',fontWeight:300,fontSize:148,fontStyle:'normal',letterSpacing:'-.04em'}}>weightless.</span>
        </div>
        <div className="lg-display" style={{maxWidth:580,marginTop:18,fontSize:18}}>The original soft little OS, rebuilt as panes of frosted glass. Surfaces refract the world behind them. Hold the future, gently.</div>
      </div>
      <div className="row" style={{gap:12}}>
        <button className="lg-btn lg-btn-pri" style={{height:54,padding:'0 28px',fontSize:15}}>Begin</button>
        <button className="lg-btn" style={{height:54,padding:'0 28px',fontSize:15}}>Take a tour</button>
        <span className="lg-mono" style={{marginLeft:'auto'}}>↳ 02:34 PM · Lagos · 72°F</span>
      </div>
    </div>
  </div>
);

const Logo = () => (
  <div className="stage">
    <Backdrop variant="dusk"/>
    <div className="pad" style={{alignItems:'center',justifyContent:'center'}}>
      <div className="glass" style={{width:200,height:200,borderRadius:'50%',padding:0}}>
        <div style={{position:'absolute',inset:24,borderRadius:'50%',background:'radial-gradient(circle at 32% 28%, #fff 0%, #FFD58A 22%, #FF6B3D 55%, #6F50C7 100%)',boxShadow:'inset 0 -10px 30px rgba(0,0,0,.4)'}}/>
        <svg viewBox="0 0 100 100" style={{position:'absolute',inset:'30%',width:'40%',height:'40%',filter:'drop-shadow(0 4px 10px rgba(0,0,0,.4))'}}>
          <text x="50" y="68" fontFamily="Instrument Serif, Georgia, serif" fontStyle="italic" fontSize="64" fill="white" textAnchor="middle">R</text>
        </svg>
      </div>
      <div className="col" style={{alignItems:'center',gap:6,marginTop:16}}>
        <div className="lg-h2" style={{fontSize:46}}>Bed of Roses</div>
        <span className="lg-mono">a soft little OS · vision-era</span>
      </div>
    </div>
  </div>
);

const Hud = () => (
  <div className="stage">
    <Backdrop variant="sea"/>
    <div className="pad">
      <div className="lg-eyebrow">// brand</div>
      <div className="lg-h2-sans">HUD register</div>
      <div className="glass" style={{flex:1,padding:18,minHeight:200,borderRadius:24}}>
        <div className="row" style={{justifyContent:'space-between'}}>
          <div className="row" style={{gap:8}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:'radial-gradient(circle at 30% 25%, #fff, #B6FFE5 60%, #1E9F6B)',boxShadow:'0 0 12px #B6FFE5'}}/>
            <span style={{fontFamily:'var(--sans)',fontWeight:600}}>Rose · listening</span>
          </div>
          <span className="lg-chip lg-chip-warm" style={{height:22,fontSize:10}}>REC ●</span>
        </div>
        <div style={{display:'flex',gap:3,alignItems:'flex-end',height:60,marginTop:14}}>
          {Array.from({length:42}).map((_,i)=>{
            const h=8+Math.abs(Math.sin(i*0.7+1))*46;
            return <div key={i} style={{flex:1,height:h,borderRadius:3,background:'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.4))',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)'}}/>;
          })}
        </div>
        <div className="row" style={{justifyContent:'space-between',marginTop:10}}>
          <span className="lg-mono">▌ 14:32:08 · 142 MB · NET ↗ 12 KB/s</span>
          <span className="lg-mono">[Esc] dismiss</span>
        </div>
      </div>
    </div>
  </div>
);

const Swatch = ({name,desc,fill}) => (
  <div className="col" style={{gap:6,width:140}}>
    <div className="glass" style={{height:120,borderRadius:18,padding:0,background:fill}}>
      <div style={{position:'absolute',bottom:10,left:14,right:14,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.04em',color:'#fff',textShadow:'0 1px 2px rgba(0,0,0,.5)'}}>{desc}</div>
    </div>
    <div className="lg-mono" style={{color:'#fff'}}>{name}</div>
  </div>
);

const Colors = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{gap:18}}>
      <div className="lg-eyebrow">// foundations / 02</div>
      <div className="lg-h2-sans">Tints over the world</div>
      <div className="lg-body" style={{maxWidth:560}}>The palette is the wallpaper. Surface tints are barely-there washes that pick up whatever is behind them — that's the whole game.</div>
      <div className="row" style={{gap:14}}>
        <Swatch name="Glass / clear" desc="rgba(255,255,255,.18)" fill="linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08))"/>
        <Swatch name="Glass / light" desc="rgba(255,255,255,.78)" fill="linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.55))"/>
        <Swatch name="Tint / cool" desc="rgba(120,170,255,.55)" fill="linear-gradient(180deg, rgba(120,170,255,.7), rgba(60,110,220,.45))"/>
        <Swatch name="Tint / warm" desc="rgba(255,180,140,.55)" fill="linear-gradient(180deg, rgba(255,180,140,.7), rgba(220,110,60,.45))"/>
        <Swatch name="Tint / fresh" desc="rgba(180,255,200,.55)" fill="linear-gradient(180deg, rgba(180,255,200,.7), rgba(40,160,90,.4))"/>
        <Swatch name="On-dark text" desc="#FFFFFF · 78%" fill="linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.05))"/>
      </div>
    </div>
  </div>
);

const Type = () => (
  <div className="stage">
    <Backdrop variant="dusk"/>
    <div className="pad" style={{gap:14}}>
      <div className="lg-eyebrow">// type / 03</div>
      <div className="lg-h1" style={{fontSize:128}}><i>Weightless</i></div>
      <div className="lg-h2-sans" style={{color:'rgba(255,255,255,.85)'}}>Inter Tight 600 · UI</div>
      <div className="lg-h3">Inter Tight 500 · subhead</div>
      <div className="lg-body" style={{maxWidth:540}}>Body sets in Inter Tight 14/22, generous tracking. Italic Instrument Serif handles all the romance — a single phrase per surface, never a paragraph.</div>
      <div className="lg-mono">// JetBrains Mono · 11/.06em — paths, runs, system chatter</div>
    </div>
  </div>
);

const Buttons = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{gap:18}}>
      <div className="lg-eyebrow">// components / 04</div>
      <div className="lg-h2-sans">Buttons</div>
      <div className="row">
        <button className="lg-btn lg-btn-pri">Begin</button>
        <button className="lg-btn">Continue</button>
        <button className="lg-btn lg-btn-cool">Connect</button>
        <button className="lg-btn lg-btn-warm">Save</button>
        <button className="lg-btn lg-btn-ghost">Skip</button>
        <button className="lg-btn" disabled style={{opacity:.4,cursor:'not-allowed'}}>Disabled</button>
      </div>
      <div className="row">
        <button className="lg-btn" style={{height:34,padding:'0 16px',fontSize:12}}>Small</button>
        <button className="lg-btn">Medium</button>
        <button className="lg-btn lg-btn-pri" style={{height:58,padding:'0 30px',fontSize:16}}>Large action</button>
      </div>
      <div className="lg-mono">// inset top-light · soft drop · backdrop blur 20px sat 1.6</div>
    </div>
  </div>
);

const Fields = () => (
  <div className="stage">
    <Backdrop variant="sea"/>
    <div className="pad" style={{gap:18}}>
      <div className="lg-eyebrow">// components / 05</div>
      <div className="lg-h2-sans">Fields</div>
      <div className="col" style={{gap:6}}><span className="lg-mono">Display name</span><input className="lg-input" placeholder="enter your handle…"/></div>
      <div className="col" style={{gap:6}}><span className="lg-mono">API key · focused</span><input className="lg-input lg-input-focus" type="password" defaultValue="••••••••••"/></div>
      <div className="col" style={{gap:6}}><span className="lg-mono">Prompt</span><textarea className="lg-input" rows="3" style={{height:'auto',padding:14,resize:'none',borderRadius:22,fontFamily:'var(--sans)'}} defaultValue="plan a slow sunday in lagos"/></div>
    </div>
  </div>
);

const Chips = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{gap:18}}>
      <div className="lg-eyebrow">// components / 06</div>
      <div className="lg-h2-sans">Chips &amp; states</div>
      <div className="row" style={{gap:8}}>
        <button className="lg-chip">Casual</button>
        <button className="lg-chip lg-chip-on">Concise</button>
        <button className="lg-chip">Verbose</button>
        <button className="lg-chip lg-chip-warm">Poetic</button>
        <button className="lg-chip lg-chip-cool">Factual</button>
      </div>
      <div className="row" style={{gap:8}}>
        <span className="lg-chip lg-chip-cool">● online</span>
        <span className="lg-chip">↑ syncing</span>
        <span className="lg-chip lg-chip-warm">◐ draft</span>
        <span className="lg-chip">v0.4</span>
        <span className="lg-chip">2026·05·09</span>
      </div>
      <div className="lg-mono">// pill geometry · top-light specular · backdrop blur 16</div>
    </div>
  </div>
);

const Tile = ({h=130,children,corner,variant=''}) => (
  <div className={`glass ${variant}`} style={{height:h,padding:14,borderRadius:22}}>
    {corner && <div style={{position:'absolute',top:10,right:14,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.06em',color:'rgba(255,255,255,.78)'}}>{corner}</div>}
    <div style={{position:'relative',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',color:'#fff'}}>{children}</div>
  </div>
);

const Tiles = () => (
  <div className="stage">
    <Backdrop variant="dusk"/>
    <div className="pad" style={{gap:14}}>
      <div className="lg-eyebrow">// components / 07</div>
      <div className="lg-h2-sans">Widget tiles</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
        <Tile h={130} corner="weather">
          <span className="lg-mono">Lagos</span>
          <div className="row" style={{gap:8,alignItems:'flex-end'}}>
            <span style={{fontFamily:'var(--display)',fontStyle:'italic',fontSize:54,lineHeight:1}}>18°</span>
            <span style={{fontFamily:'var(--sans)',fontWeight:500}}>partly cloudy</span>
          </div>
        </Tile>
        <Tile h={130} variant="glass-tint-cool" corner="↗ flight">
          <span className="lg-mono">BA76 · on time</span>
          <div>
            <div style={{fontFamily:'var(--display)',fontStyle:'italic',fontSize:24}}>Lagos → London</div>
            <div className="lg-mono">22:40 · gate B17</div>
          </div>
        </Tile>
        <Tile h={130} variant="glass-tint-warm" corner="today">
          <span className="lg-mono">3 items · 1 overdue</span>
          <div style={{fontFamily:'var(--display)',fontStyle:'italic',fontSize:22}}>Buy roses ✿ <span style={{opacity:.65}}>· call mom · gym</span></div>
        </Tile>
        <Tile h={110} corner="now playing">
          <div className="row" style={{gap:10}}>
            <div style={{width:42,height:42,borderRadius:10,background:'linear-gradient(135deg,#FFB6E1,#7FC8FF)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)'}}/>
            <div className="col" style={{gap:2}}>
              <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:14}}>Aqua interlude</div>
              <span className="lg-mono">soft little radio · 02:14</span>
            </div>
          </div>
          <div style={{height:4,borderRadius:2,background:'rgba(255,255,255,.25)',position:'relative'}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:'42%',borderRadius:2,background:'rgba(255,255,255,.85)'}}/>
          </div>
        </Tile>
        <Tile h={110} corner="messages">
          <span className="lg-mono">2 new</span>
          <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:15}}>Mom: <span style={{opacity:.7,fontWeight:400,fontStyle:'italic',fontFamily:'var(--display)'}}>did you eat?</span></div>
        </Tile>
        <Tile h={110} corner="battery">
          <span className="lg-mono">82% · 6h left</span>
          <div style={{height:18,borderRadius:6,background:'rgba(255,255,255,.18)',border:'1px solid rgba(255,255,255,.4)',position:'relative',boxShadow:'inset 0 1px 0 rgba(255,255,255,.5)'}}>
            <div style={{position:'absolute',left:2,top:2,bottom:2,width:'82%',borderRadius:4,background:'linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.6))',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)'}}/>
          </div>
        </Tile>
      </div>
    </div>
  </div>
);

const Bubbles = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{gap:12}}>
      <div className="lg-eyebrow">// components / 08</div>
      <div className="lg-h2-sans">Conversation</div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div className="lg-mono" style={{alignSelf:'center'}}>━━ session 0042 · 14:32 ━━</div>
        <div className="lg-bubble lg-bubble-user">show me flights from lagos to london</div>
        <div className="lg-bubble lg-bubble-ai"><span className="lg-mono" style={{display:'block',marginBottom:4}}>Rose · 14:32:08</span>I pinned a flight tracker to <i>/today</i>. Tap to expand it.</div>
        <div className="lg-bubble lg-bubble-user">make it pretty too</div>
        <div className="lg-bubble lg-bubble-ai"><span className="lg-mono" style={{display:'block',marginBottom:4}}>Rose · 14:32:11</span>It already is — you're looking through it.</div>
        <div className="lg-mono" style={{alignSelf:'center'}}>·· typing ··</div>
      </div>
    </div>
  </div>
);

const ChatBar = () => (
  <div className="stage">
    <Backdrop variant="sea"/>
    <div className="pad" style={{gap:16,justifyContent:'center'}}>
      <div className="lg-eyebrow">// components / 09</div>
      <div className="lg-h2-sans">Prompt bar</div>
      <div className="glass" style={{display:'flex',alignItems:'center',gap:8,padding:6,borderRadius:999}}>
        <button className="lg-btn lg-btn-ghost" style={{height:38,padding:'0 14px',border:'1px solid rgba(255,255,255,.25)'}}>＋</button>
        <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--sans)',fontSize:14,padding:'0 8px',height:42,color:'#fff'}} placeholder="ask Rose anything…" defaultValue="plan a slow sunday in lagos"/>
        <button className="lg-btn" style={{height:38,padding:'0 14px'}}>🎤</button>
        <button className="lg-btn lg-btn-pri" style={{height:38,padding:'0 20px'}}>Send ▸</button>
      </div>
      <div className="row" style={{gap:6}}>
        <button className="lg-chip">＋ image</button>
        <button className="lg-chip">＋ doc</button>
        <button className="lg-chip lg-chip-cool">↳ shortcuts</button>
        <span className="lg-mono" style={{marginLeft:'auto'}}>⌘K · command palette</span>
      </div>
    </div>
  </div>
);

const ProviderRow = ({name,status,mark,on}) => (
  <div className="glass" style={{display:'grid',gridTemplateColumns:'52px 1fr auto',alignItems:'center',gap:14,padding:'12px 16px',borderRadius:22,
    background:on?'linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,.18))':undefined}}>
    <div style={{width:40,height:40,borderRadius:14,background:'linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,.15))',
      border:'1px solid rgba(255,255,255,.55)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.7)',
      display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>{mark}</div>
    <div className="col" style={{gap:2}}>
      <div className="row" style={{gap:8}}>
        <span style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:17,color:'#fff'}}>{name}</span>
        {on && <span className="lg-chip lg-chip-on" style={{height:22,fontSize:10}}>default</span>}
      </div>
      <span className="lg-mono">{status}</span>
    </div>
    <span style={{fontFamily:'var(--display)',fontStyle:'italic',fontSize:24,color:'rgba(255,255,255,.85)'}}>›</span>
  </div>
);

const Providers = () => (
  <div className="stage">
    <Backdrop variant="dusk"/>
    <div className="pad" style={{gap:10}}>
      <div className="lg-eyebrow">// components / 10</div>
      <div className="lg-h2-sans">Providers</div>
      <ProviderRow name="Anthropic" status="connected · sonnet-4-5" on mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
      <ProviderRow name="OpenAI" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>}/>
      <ProviderRow name="Gemini" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
      <ProviderRow name="Compatible" status="byo endpoint · http(s)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
    </div>
  </div>
);

const Orb = ({c1,c2,c3,size=120,label}) => (
  <div className="col" style={{alignItems:'center',gap:8}}>
    <div className="glass" style={{width:size,height:size,borderRadius:'50%',padding:0}}>
      <div style={{position:'absolute',inset:14,borderRadius:'50%',background:`radial-gradient(circle at 32% 28%, #fff 0%, ${c1} 22%, ${c2} 55%, ${c3} 100%)`,boxShadow:'inset 0 -10px 26px rgba(0,0,0,.4)'}}/>
    </div>
    <span className="lg-mono">{label}</span>
  </div>
);

const Avatar = () => (
  <div className="stage">
    <Backdrop variant="aurora"/>
    <div className="pad" style={{gap:24}}>
      <div><div className="lg-eyebrow">// brand / 11</div><div className="lg-h2-sans">Presence orb</div></div>
      <div className="lg-body" style={{maxWidth:540,color:'rgba(255,255,255,.8)'}}>Rose lives inside a small frosted dome. The colored core inside shifts with state — bloom for default, fresh while listening, cool while thinking, warm when something needs attention.</div>
      <div className="row" style={{gap:32}}>
        <Orb label="00 · default" c1="#FFB6E1" c2="#FF7AB6" c3="#7E1F88"/>
        <Orb label="01 · listening" c1="#B6FFE5" c2="#1E9F6B" c3="#0A3C26"/>
        <Orb label="02 · thinking" c1="#A9E0FF" c2="#3C8BFF" c3="#0E2A66"/>
        <Orb label="03 · alert" c1="#FFD58A" c2="#FF7A2A" c3="#7A2A00"/>
      </div>
    </div>
  </div>
);

const Mark = ({label,c1,c2,children}) => (
  <div className="col" style={{alignItems:'center',gap:6}}>
    <div className="glass" style={{width:80,height:80,borderRadius:22,padding:0}}>
      <div style={{position:'absolute',inset:8,borderRadius:16,background:`linear-gradient(180deg, ${c1}, ${c2})`,boxShadow:'inset 0 1px 0 rgba(255,255,255,.6)'}}/>
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>{children}</div>
    </div>
    <span className="lg-mono">{label}</span>
  </div>
);

const Marks = () => (
  <div className="stage">
    <Backdrop variant="sea"/>
    <div className="pad" style={{gap:18}}>
      <div><div className="lg-eyebrow">// brand / 12</div><div className="lg-h2-sans">Provider marks</div></div>
      <div className="row" style={{gap:14}}>
        <Mark label="Anthropic" c1="#FFB18C" c2="#D9532E"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
        <Mark label="OpenAI" c1="#9DE8C8" c2="#10A37F"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg></Mark>
        <Mark label="Gemini" c1="#9ED6FF" c2="#0066FF"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
        <Mark label="Ollama" c1="#D6FF9D" c2="#5FC92F"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><ellipse cx="12" cy="14" rx="8" ry="6.5"/></svg></Mark>
        <Mark label="Compatible" c1="#E6EEF6" c2="#92A8C2"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
      </div>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Liquid Glass" subtitle="Frosted refraction · italic serif · saturated backdrops · vision-era depth" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The pitch, the lockup, the register.">
      <DCArtboard id="hero" label="Hero · the pitch" width={920} height={600}><Hero/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={600}><Logo/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><Hud/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Tints over the world, italic serif.">
      <DCArtboard id="colors" label="Palette" width={920} height={460}><Colors/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><Type/></DCArtboard>
    </DCSection>
    <DCSection id="components" title="Components" subtitle="Glass everything.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={420}><Buttons/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><Fields/></DCArtboard>
      <DCArtboard id="chips" label="Chips & states" width={520} height={400}><Chips/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={760} height={460}><Tiles/></DCArtboard>
      <DCArtboard id="bubbles" label="Conversation" width={520} height={500}><Bubbles/></DCArtboard>
      <DCArtboard id="chatbar" label="Prompt bar" width={620} height={420}><ChatBar/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={460}><Providers/></DCArtboard>
    </DCSection>
    <DCSection id="brand" title="Brand" subtitle="Frosted orbs and marks.">
      <DCArtboard id="avatar" label="Presence orb" width={760} height={420}><Avatar/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={320}><Marks/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
