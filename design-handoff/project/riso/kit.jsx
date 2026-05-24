// Risograph Print Shop kit — overprinted spot inks, halftones, misregistration

const Halftone = ({color='var(--pink)',size=8,opacity=.35,style={}}) => (
  <div style={{position:'absolute',inset:0,pointerEvents:'none',
    backgroundImage:`radial-gradient(circle, ${color} 22%, transparent 24%)`,
    backgroundSize:`${size}px ${size}px`,opacity,mixBlendMode:'multiply',...style}}/>
);

const Blob = ({c='var(--pink)',size=240,top,left,right,bottom,opacity=.85,offset=4}) => (
  <>
    <div style={{position:'absolute',width:size,height:size,top,left,right,bottom,
      background:c,borderRadius:'50%',mixBlendMode:'multiply',opacity,filter:'blur(0.4px)'}}/>
    <div style={{position:'absolute',width:size,height:size,
      top:top!=null?top+offset:undefined,left:left!=null?left+offset:undefined,
      right:right!=null?right-offset:undefined,bottom:bottom!=null?bottom-offset:undefined,
      background:c,borderRadius:'50%',mixBlendMode:'multiply',opacity:opacity*.4}}/>
  </>
);

const Hero = () => (
  <div className="stage" style={{padding:0,background:'var(--paper)'}}>
    <Blob c="var(--pink)" size={300} top={-60} right={-40} opacity={.7}/>
    <Blob c="var(--yellow)" size={220} bottom={-40} left={-30} opacity={.85} offset={-5}/>
    <Blob c="var(--blue)" size={140} top={140} left={'48%'} opacity={.55} offset={6}/>
    <Halftone color="rgba(255,72,176,.6)" size={6} opacity={.18} style={{maskImage:'radial-gradient(circle at 80% 20%, black 30%, transparent 60%)'}}/>
    <div style={{position:'relative',height:'100%',padding:'40px 44px',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:8}}>
          <div style={{width:24,height:24,borderRadius:'50%',background:'var(--pink)',position:'relative'}}>
            <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'var(--blue)',mixBlendMode:'multiply',transform:'translate(3px,2px)'}}/>
          </div>
          <span style={{fontFamily:'var(--sans)',fontWeight:700,letterSpacing:'-.01em'}}>Bed of Roses</span>
          <span className="r-tag">issue 04 · spring 2026</span>
        </div>
        <div className="row" style={{gap:6}}>
          <span className="r-chip">2-color riso</span>
          <span className="r-chip r-chip-pink">limited run</span>
        </div>
      </div>
      <div>
        <div className="r-eyebrow">a print-shop edition</div>
        <div className="r-h1" style={{fontSize:140}}>
          Bed of <span style={{color:'var(--pink)',fontStyle:'italic'}}>Roses</span><br/>
          <span style={{color:'var(--blue)'}}>printed,</span> <span style={{textDecoration:'underline',textDecorationStyle:'wavy',textDecorationColor:'var(--yellow)',textUnderlineOffset:'8px'}}>folded.</span>
        </div>
        <div className="r-display" style={{maxWidth:580,marginTop:18,fontSize:20}}>
          A soft little OS, hand-pulled in three spot inks on warm cream stock. Misregistration is the point. The grain stays.
        </div>
      </div>
      <div className="row" style={{gap:10}}>
        <button className="r-btn r-btn-pink">★ Subscribe</button>
        <button className="r-btn r-btn-blue">Read issue 03</button>
        <button className="r-btn r-btn-ghost">↳ printer notes</button>
      </div>
    </div>
  </div>
);

const Logo = () => (
  <div className="stage" style={{background:'var(--paper-2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <Blob c="var(--pink)" size={220} top={-40} right={-30} opacity={.65}/>
    <Blob c="var(--yellow)" size={160} bottom={-20} left={-30} opacity={.85} offset={-4}/>
    <div className="col" style={{alignItems:'center',gap:18,position:'relative',zIndex:1}}>
      {/* Stamp seal logo */}
      <div style={{position:'relative',width:160,height:160}}>
        <svg viewBox="0 0 160 160" width="160" height="160">
          <defs>
            <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" fill="#1A1F3D" opacity=".25"/></pattern>
          </defs>
          {/* offset blue ring */}
          <circle cx="82" cy="78" r="68" fill="none" stroke="#3145C2" strokeWidth="2.5" opacity=".9"/>
          {/* main pink ring */}
          <circle cx="80" cy="80" r="68" fill="none" stroke="#FF48B0" strokeWidth="3"/>
          <circle cx="80" cy="80" r="58" fill="url(#dots)"/>
          {/* ribbon */}
          <rect x="14" y="68" width="132" height="24" fill="#FFE15B" opacity=".95" transform="rotate(-3 80 80)"/>
          <text x="80" y="86" fontFamily="Fraunces, Georgia, serif" fontWeight="900" fontSize="22" fill="#1A1F3D" textAnchor="middle" fontStyle="italic" transform="rotate(-3 80 80)">Bed of Roses</text>
          {/* stars */}
          <text x="36" y="40" fontSize="20" fill="#FF48B0">✦</text>
          <text x="120" y="135" fontSize="20" fill="#3145C2">✦</text>
        </svg>
      </div>
      <div className="col" style={{alignItems:'center',gap:6}}>
        <div className="r-h2" style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:38}}>est. 2026</div>
        <span className="r-tag">a soft little os · printed by hand</span>
      </div>
    </div>
  </div>
);

const Hud = () => (
  <div className="stage" style={{background:'var(--paper)',padding:32,display:'flex',flexDirection:'column',gap:14}}>
    <Blob c="var(--yellow)" size={180} top={-40} right={-30} opacity={.85} offset={-4}/>
    <div className="r-eyebrow">// brand</div>
    <div className="r-h2">HUD register</div>
    <div className="ht" style={{flex:1,position:'relative',padding:16,borderRadius:14,border:'2px solid var(--ink)',background:'var(--paper-2)',boxShadow:'4px 4px 0 var(--pink)',color:'var(--blue)',minHeight:200}}>
      <div className="row" style={{justifyContent:'space-between'}}>
        <div className="row" style={{gap:8}}><span style={{width:10,height:10,borderRadius:'50%',background:'var(--pink)'}}/><span className="r-mono" style={{fontWeight:700,color:'var(--ink)'}}>Rose · listening</span></div>
        <span className="r-chip r-chip-pink" style={{height:22,fontSize:10,boxShadow:'2px 2px 0 var(--blue)'}}>REC ●</span>
      </div>
      <svg viewBox="0 0 400 80" style={{width:'100%',height:80,marginTop:14}}>
        {Array.from({length:48}).map((_,i)=>{
          const h=10+Math.abs(Math.sin(i*0.6+1))*54;
          return <rect key={i} x={i*8.3} y={(80-h)/2} width="6" height={h} fill={i%3===0?'#FF48B0':'#3145C2'}/>;
        })}
      </svg>
      <div className="row" style={{justifyContent:'space-between',marginTop:10}}>
        <span className="r-mono">▌ 14:32 · 142 MB · run #42</span>
        <span className="r-mono">[Esc] dismiss</span>
      </div>
    </div>
  </div>
);

const Swatch = ({name,hex,fill,fg='var(--ink)'}) => (
  <div className="col" style={{gap:6,width:120}}>
    <div className="ht ht-loose" style={{height:120,borderRadius:10,background:fill,border:'2px solid var(--ink)',color:fill,position:'relative',boxShadow:'3px 3px 0 var(--ink)'}}>
      <div style={{position:'absolute',bottom:8,left:10,right:10,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.04em',color:fg,textTransform:'uppercase',mixBlendMode:'normal'}}>{hex}</div>
    </div>
    <div className="r-mono" style={{color:'var(--ink)'}}>{name}</div>
  </div>
);

const Colors = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper-2)'}}>
    <Blob c="var(--pink)" size={140} bottom={-40} right={-30} opacity={.55}/>
    <div className="r-eyebrow">// foundations / 02</div>
    <div className="r-h2">Three spot inks · cream stock</div>
    <div className="r-body" style={{maxWidth:560}}>Riso emulates rather than replicates. Each ink prints individually and overlaps in multiply, leaving a faint paper-show through every fill.</div>
    <div className="row" style={{gap:14}}>
      <Swatch name="Paper" hex="#F4ECD8" fill="#F4ECD8"/>
      <Swatch name="Fluoro Pink" hex="#FF48B0" fill="#FF48B0" fg="#fff"/>
      <Swatch name="Federal Blue" hex="#3145C2" fill="#3145C2" fg="#fff"/>
      <Swatch name="Sun Yellow" hex="#FFE15B" fill="#FFE15B"/>
      <Swatch name="Teal" hex="#2BAA8E" fill="#2BAA8E" fg="#fff"/>
      <Swatch name="Ink (deep blue)" hex="#1A1F3D" fill="#1A1F3D" fg="#FAF3E0"/>
    </div>
  </div>
);

const Type = () => (
  <div className="stage" style={{padding:36,display:'flex',flexDirection:'column',gap:14,background:'var(--paper)'}}>
    <Blob c="var(--blue)" size={160} top={-30} right={-20} opacity={.4} offset={5}/>
    <div className="r-eyebrow">// type / 03</div>
    <div style={{position:'relative'}}>
      <div className="r-h1" style={{fontSize:120,position:'relative'}}>
        <span style={{position:'absolute',color:'var(--pink)',mixBlendMode:'multiply',transform:'translate(3px,2px)',zIndex:0}}>Off-print.</span>
        <span style={{position:'absolute',color:'var(--blue)',mixBlendMode:'multiply',transform:'translate(-2px,-1px)',zIndex:0}}>Off-print.</span>
        <span style={{position:'relative',zIndex:1}}>Off-print.</span>
      </div>
    </div>
    <div className="r-h2" style={{color:'var(--pink)'}}><i>Fraunces 800 italic</i> · display</div>
    <div className="r-h3">SPACE GROTESK 700 · uppercase subhead</div>
    <div className="r-body" style={{maxWidth:540}}>Body sets in Space Grotesk at 14/22. Captions and ornaments lean into Fraunces italics — small, intentional flourishes between blocks of plain prose.</div>
    <div className="r-mono">// JetBrains Mono · paths, runs, color codes</div>
  </div>
);

const Buttons = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper-2)'}}>
    <div className="r-eyebrow">// components / 04</div>
    <div className="r-h2">Buttons</div>
    <div className="row">
      <button className="r-btn r-btn-pink">★ Subscribe</button>
      <button className="r-btn r-btn-blue">Save</button>
      <button className="r-btn r-btn-yellow">Connect</button>
      <button className="r-btn">Continue</button>
      <button className="r-btn r-btn-ghost">↳ skip</button>
      <button className="r-btn" disabled style={{opacity:.45,cursor:'not-allowed'}}>Disabled</button>
    </div>
    <div className="row">
      <button className="r-btn" style={{height:34,fontSize:11,padding:'0 14px'}}>Small</button>
      <button className="r-btn r-btn-pink" style={{height:60,fontSize:16,padding:'0 32px'}}>Large action ✦</button>
    </div>
    <div className="r-mono" style={{marginTop:6}}>// 3px misregistration shadow in a contrasting ink — the riso recipe</div>
  </div>
);

const Fields = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper)'}}>
    <Blob c="var(--yellow)" size={140} bottom={-30} right={-20} opacity={.7} offset={-4}/>
    <div className="r-eyebrow">// components / 05</div>
    <div className="r-h2">Fields</div>
    <div className="col" style={{gap:6}}><span className="r-mono">name</span><input className="r-input" placeholder="ada lovelace…"/></div>
    <div className="col" style={{gap:6}}><span className="r-mono">api key · focused</span><input className="r-input r-input-focus" type="password" defaultValue="••••••••••"/></div>
    <div className="col" style={{gap:6}}><span className="r-mono">prompt</span><textarea className="r-input" rows="3" style={{height:'auto',padding:14,resize:'none',fontFamily:'var(--sans)'}} defaultValue="plan a slow sunday in lagos with three cafes and a bookstore"/></div>
  </div>
);

const Chips = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper-2)'}}>
    <div className="r-eyebrow">// components / 06</div>
    <div className="r-h2">Chips &amp; states</div>
    <div className="row" style={{gap:8}}>
      <button className="r-chip">Casual</button>
      <button className="r-chip r-chip-pink">Concise</button>
      <button className="r-chip">Verbose</button>
      <button className="r-chip r-chip-yellow">Poetic</button>
      <button className="r-chip r-chip-blue">Factual</button>
    </div>
    <div className="row" style={{gap:8}}>
      <span className="r-chip r-chip-pink">● live</span>
      <span className="r-chip r-chip-blue">↑ syncing</span>
      <span className="r-chip r-chip-yellow">◐ draft</span>
      <span className="r-chip">v0.4</span>
      <span className="r-chip">2026·05·09</span>
    </div>
    <div className="r-mono">// pill on cream, 2px ink stroke, no shadow on chips</div>
  </div>
);

const Tile = ({h=130,bg='var(--paper-2)',shadowColor='var(--pink)',children,corner,fg='var(--ink)'}) => (
  <div className="ht" style={{height:h,padding:14,position:'relative',overflow:'hidden',
    background:bg,color:fg,
    border:'2px solid var(--ink)',borderRadius:14,boxShadow:`4px 4px 0 ${shadowColor}`}}>
    {corner && <div style={{position:'absolute',top:10,right:12,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.06em',opacity:.75}}>{corner}</div>}
    <div style={{position:'relative',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>{children}</div>
  </div>
);

const Tiles = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:14,background:'var(--paper)'}}>
    <Blob c="var(--blue)" size={160} top={'40%'} right={-50} opacity={.4} offset={5}/>
    <div className="r-eyebrow">// components / 07</div>
    <div className="r-h2">Widget tiles</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
      <Tile h={130} corner="weather">
        <span className="r-mono">Lagos</span>
        <div className="row" style={{gap:8,alignItems:'flex-end'}}>
          <span style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:800,fontSize:48,lineHeight:1}}>18°</span>
          <span style={{fontFamily:'var(--sans)',fontWeight:600,color:'var(--pink)'}}>partly cloudy</span>
        </div>
      </Tile>
      <Tile h={130} bg="var(--blue)" fg="var(--paper)" shadowColor="var(--yellow)" corner="↗ flight">
        <span className="r-mono" style={{color:'rgba(250,243,224,.85)'}}>BA76 · on time</span>
        <div>
          <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:800,fontSize:22}}>Lagos → London</div>
          <div className="r-mono" style={{color:'rgba(250,243,224,.85)'}}>22:40 · gate B17</div>
        </div>
      </Tile>
      <Tile h={130} bg="var(--yellow)" shadowColor="var(--blue)" corner="today">
        <span className="r-mono">3 items · 1 overdue</span>
        <div style={{fontFamily:'var(--serif)',fontWeight:800,fontSize:20}}>Buy roses ✿ <span style={{opacity:.55}}>· call mom · gym</span></div>
      </Tile>
      <Tile h={110} bg="var(--pink)" fg="var(--paper)" shadowColor="var(--blue)" corner="now playing">
        <div className="row" style={{gap:10}}>
          <div style={{width:42,height:42,borderRadius:8,background:'var(--paper)',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(circle, #3145C2 30%, transparent 32%)',backgroundSize:'5px 5px'}}/>
          </div>
          <div className="col" style={{gap:2}}>
            <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:700,fontSize:16}}>Aqua interlude</div>
            <span className="r-mono" style={{color:'rgba(250,243,224,.85)'}}>soft little radio · 02:14</span>
          </div>
        </div>
        <div style={{height:6,borderRadius:3,background:'rgba(250,243,224,.4)',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:'42%',borderRadius:3,background:'var(--yellow)'}}/>
        </div>
      </Tile>
      <Tile h={110} corner="messages">
        <span className="r-mono">2 new</span>
        <div style={{fontFamily:'var(--sans)',fontWeight:600,fontSize:15}}>Mom: <span style={{color:'var(--ink-soft)',fontWeight:400,fontStyle:'italic',fontFamily:'var(--serif)'}}>did you eat?</span></div>
      </Tile>
      <Tile h={110} corner="quote">
        <span className="r-mono">epigraph</span>
        <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:600,fontSize:16,lineHeight:1.3}}>"a soft little OS begins as a single thought."</div>
      </Tile>
    </div>
  </div>
);

const Bubbles = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:12,background:'var(--paper-2)'}}>
    <div className="r-eyebrow">// components / 08</div>
    <div className="r-h2">Conversation</div>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="r-mono" style={{alignSelf:'center'}}>━━━ session 0042 · 14:32 ━━━</div>
      <div className="r-bubble r-bubble-user">show me flights from lagos to london</div>
      <div className="r-bubble r-bubble-ai"><span className="r-mono" style={{color:'var(--pink)',display:'block',marginBottom:4}}>Rose · 14:32:08</span>I pinned a flight tracker to <i>/today</i>. Tap to expand it.</div>
      <div className="r-bubble r-bubble-user">make it pretty too</div>
      <div className="r-bubble r-bubble-ai"><span className="r-mono" style={{color:'var(--pink)',display:'block',marginBottom:4}}>Rose · 14:32:11</span>Already on it — printed it in pink, blue and yellow ✿</div>
      <div className="r-mono" style={{alignSelf:'center'}}>·· typing ··</div>
    </div>
  </div>
);

const ChatBar = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:16,justifyContent:'center',background:'var(--paper)'}}>
    <div className="r-eyebrow">// components / 09</div>
    <div className="r-h2">Prompt bar</div>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:6,borderRadius:14,
      border:'2px solid var(--ink)',background:'var(--paper-2)',boxShadow:'4px 4px 0 var(--pink)'}}>
      <button className="r-btn" style={{height:38,padding:'0 14px',boxShadow:'none',borderColor:'var(--ink-soft)'}}>＋</button>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--sans)',fontSize:14,padding:'0 8px',height:42,color:'var(--ink)'}} placeholder="ask Rose…" defaultValue="plan a slow sunday in lagos"/>
      <button className="r-btn r-btn-yellow" style={{height:38,padding:'0 14px',boxShadow:'none'}}>🎤</button>
      <button className="r-btn r-btn-blue" style={{height:38,padding:'0 18px',boxShadow:'none'}}>Send ▸</button>
    </div>
    <div className="row" style={{gap:6}}>
      <button className="r-chip">＋ image</button>
      <button className="r-chip">＋ doc</button>
      <button className="r-chip r-chip-yellow">↳ shortcuts</button>
      <span className="r-mono" style={{marginLeft:'auto'}}>⌘K · command palette</span>
    </div>
  </div>
);

const ProviderRow = ({name,status,mark,on}) => (
  <div className="ht" style={{display:'grid',gridTemplateColumns:'52px 1fr auto',alignItems:'center',gap:14,padding:'12px 16px',borderRadius:14,
    border:'2px solid var(--ink)',
    background:on?'var(--pink)':'var(--paper-2)',
    color:on?'var(--paper)':'var(--ink)',
    boxShadow:on?'4px 4px 0 var(--blue)':'4px 4px 0 var(--ink-soft)'}}>
    <div style={{width:40,height:40,borderRadius:10,border:`2px solid ${on?'var(--paper)':'var(--ink)'}`,background:on?'var(--paper)':'var(--paper-2)',color:'var(--ink)',display:'flex',alignItems:'center',justifyContent:'center'}}>{mark}</div>
    <div className="col" style={{gap:2}}>
      <div className="row" style={{gap:8}}>
        <span style={{fontFamily:'var(--serif)',fontStyle:'italic',fontWeight:800,fontSize:20}}>{name}</span>
        {on && <span className="r-chip" style={{height:20,fontSize:9,background:'var(--yellow)',color:'var(--ink)',borderColor:'var(--ink)'}}>default</span>}
      </div>
      <span className="r-mono" style={{color:on?'rgba(250,243,224,.85)':'var(--ink-soft)'}}>{status}</span>
    </div>
    <span style={{fontFamily:'var(--serif)',fontSize:22,opacity:.85}}>›</span>
  </div>
);

const Providers = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:10,background:'var(--paper-2)'}}>
    <Blob c="var(--yellow)" size={150} top={-30} right={-30} opacity={.7} offset={-4}/>
    <div className="r-eyebrow">// components / 10</div>
    <div className="r-h2">Providers</div>
    <ProviderRow name="Anthropic" status="connected · sonnet-4-5" on mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OpenAI" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>}/>
    <ProviderRow name="Gemini" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="Compatible" status="byo endpoint · http(s)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

const Stamp = ({colors,size=120,label}) => (
  <div className="col" style={{alignItems:'center',gap:8}}>
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <circle cx="62" cy="62" r="48" fill={colors[1]} opacity=".75" />
      <circle cx="58" cy="58" r="48" fill={colors[0]} opacity=".85" style={{mixBlendMode:'multiply'}}/>
      <text x="60" y="68" fontFamily="Fraunces, serif" fontStyle="italic" fontWeight="900" fontSize="34" fill="#1A1F3D" textAnchor="middle">R</text>
    </svg>
    <span className="r-mono" style={{color:'var(--ink)'}}>{label}</span>
  </div>
);

const Avatar = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:24,background:'var(--paper)'}}>
    <Blob c="var(--blue)" size={160} bottom={-40} right={-30} opacity={.45} offset={5}/>
    <div><div className="r-eyebrow">// brand / 11</div><div className="r-h2">Presence stamp</div></div>
    <div className="r-body" style={{maxWidth:540}}>Rose appears as an off-register stamp. Two inks, slightly misaligned — when she's listening, the misregistration tightens.</div>
    <div className="row" style={{gap:32}}>
      <Stamp label="00 · default" colors={['#FF48B0','#3145C2']}/>
      <Stamp label="01 · listening" colors={['#FFE15B','#FF48B0']}/>
      <Stamp label="02 · thinking" colors={['#3145C2','#2BAA8E']}/>
      <Stamp label="03 · alert" colors={['#E53A22','#FFE15B']}/>
    </div>
  </div>
);

const Mark = ({label,c1,c2,children}) => (
  <div className="col" style={{alignItems:'center',gap:6}}>
    <div style={{width:80,height:80,borderRadius:14,position:'relative',border:'2px solid var(--ink)',background:'var(--paper-2)',boxShadow:'4px 4px 0 var(--ink)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:6,borderRadius:8,background:c1,mixBlendMode:'multiply',opacity:.85}}/>
      <div style={{position:'absolute',inset:6,borderRadius:8,background:c2,mixBlendMode:'multiply',opacity:.55,transform:'translate(3px,2px)'}}/>
      <div style={{position:'relative',color:'var(--ink)'}}>{children}</div>
    </div>
    <span className="r-mono" style={{color:'var(--ink)'}}>{label}</span>
  </div>
);

const Marks = () => (
  <div className="stage" style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper-2)'}}>
    <div><div className="r-eyebrow">// brand / 12</div><div className="r-h2">Provider stamps</div></div>
    <div className="row" style={{gap:14}}>
      <Mark label="Anthropic" c1="#FF48B0" c2="#FFE15B"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OpenAI" c1="#2BAA8E" c2="#FFE15B"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg></Mark>
      <Mark label="Gemini" c1="#3145C2" c2="#FF48B0"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="Ollama" c1="#FFE15B" c2="#FF48B0"><svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><ellipse cx="12" cy="14" rx="8" ry="6.5"/></svg></Mark>
      <Mark label="Compatible" c1="#3145C2" c2="#2BAA8E"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Risograph Print Shop" subtitle="Three spot inks · halftones · misregistration · paper grain" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The pitch, the lockup, the register.">
      <DCArtboard id="hero" label="Hero · the pitch" width={920} height={600}><Hero/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={600}><Logo/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><Hud/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Three spot inks, italic display.">
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
    <DCSection id="brand" title="Brand" subtitle="Stamps and marks.">
      <DCArtboard id="avatar" label="Presence stamp" width={760} height={420}><Avatar/></DCArtboard>
      <DCArtboard id="marks" label="Provider stamps" width={760} height={320}><Marks/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
