// Cartoon Brutalist UI Kit — all components in one design canvas
const { useState } = React;

// ── Tiny helpers ──
const Sticker = ({children, color="yel", rotate}) => {
  const cls = {yel:'',pink:'br-sticker-pink',sky:'br-sticker-sky',mint:'br-sticker-mint'}[color] || '';
  return <span className={`br-sticker ${cls}`} style={rotate!==undefined?{transform:`rotate(${rotate}deg)`}:undefined}>{children}</span>;
};
const Dot = ({c='var(--mint)',size=10}) => <span style={{width:size,height:size,borderRadius:'50%',background:c,border:'2px solid var(--ink)',display:'inline-block'}} />;

// ─────────────── COLORS ───────────────
const ColorChip = ({name, hex, fg='var(--ink)'}) => (
  <div style={{display:'flex',flexDirection:'column',gap:6,width:120}}>
    <div className="br-card-sq" style={{background:hex,height:120,borderRadius:14,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:8,right:8,fontFamily:'var(--mono)',fontSize:10,fontWeight:700,letterSpacing:'.1em',color:fg,opacity:.85}}>{hex}</div>
    </div>
    <div className="br-tag" style={{textAlign:'center'}}>{name}</div>
  </div>
);

const ColorsArtboard = () => (
  <div style={{padding:32,display:'flex',flexDirection:'column',gap:24,background:'var(--cream)',height:'100%'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--pink)'}}>// Foundations</div>
      <div className="br-h2" style={{marginTop:6}}>Pop Palette</div>
      <div className="br-body" style={{maxWidth:520,marginTop:8,opacity:.75}}>Saturated, primary-leaning, sticker-energy. Black is a color too — it does the heavy lifting on every stroke.</div>
    </div>
    <div className="row" style={{gap:16}}>
      <ColorChip name="Cream" hex="#FFF4DC"/>
      <ColorChip name="Pink" hex="#FF4FA3"/>
      <ColorChip name="Yellow" hex="#FFD93D"/>
      <ColorChip name="Sky" hex="#6BCEFF"/>
      <ColorChip name="Mint" hex="#5FE3A1"/>
      <ColorChip name="Purple" hex="#9B5DE5" fg="var(--cream)"/>
      <ColorChip name="Tomato" hex="#FF6B45"/>
      <ColorChip name="Ink" hex="#0A0A0A" fg="var(--cream)"/>
    </div>
    <div style={{marginTop:8}}>
      <div className="br-eyebrow">Pairings</div>
      <div className="row" style={{gap:18,marginTop:14}}>
        <div className="br-card" style={{background:'var(--pink)',width:160,height:90,position:'relative'}}>
          <div className="br-tag" style={{position:'absolute',bottom:10,left:14,color:'var(--ink)'}}>PINK / INK</div>
        </div>
        <div className="br-card" style={{background:'var(--yellow)',width:160,height:90,position:'relative'}}>
          <div className="br-tag" style={{position:'absolute',bottom:10,left:14}}>YELLOW / INK</div>
        </div>
        <div className="br-card" style={{background:'var(--sky)',width:160,height:90,position:'relative'}}>
          <div className="br-tag" style={{position:'absolute',bottom:10,left:14}}>SKY / INK</div>
        </div>
        <div className="br-card" style={{background:'var(--ink)',width:160,height:90,position:'relative'}}>
          <div className="br-tag" style={{position:'absolute',bottom:10,left:14,color:'var(--yellow)'}}>INK / YELLOW</div>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────── TYPE ───────────────
const TypeArtboard = () => (
  <div style={{padding:32,display:'flex',flexDirection:'column',gap:18,background:'var(--paper)',height:'100%'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Type system</div>
      <div className="br-h1" style={{marginTop:6,fontSize:120}}>BED&nbsp;OF<br/>ROSES.</div>
    </div>
    <div className="br-h2" style={{color:'var(--pink)'}}>Display: Archivo Black</div>
    <div className="br-display">Subhead in Bricolage Grotesque, weight 700.</div>
    <div className="br-body" style={{maxWidth:580}}>Body sits in Space Grotesk — friendly grotesque, even color, reads warm + cool both. Long reads stay calm; short labels stay loud.</div>
    <div style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:700,letterSpacing:'.18em',textTransform:'uppercase'}}>Mono · Space Mono · 13/700/.18em</div>
    <div className="row" style={{marginTop:8,gap:8}}>
      <Sticker color="pink" rotate={-3}>★ display</Sticker>
      <Sticker color="yel" rotate={2}>aa subhead</Sticker>
      <Sticker color="sky">▤ body</Sticker>
      <Sticker color="mint" rotate={-2}>// mono</Sticker>
    </div>
  </div>
);

// ─────────────── BUTTONS ───────────────
const ButtonsArtboard = () => (
  <div style={{padding:32,display:'flex',flexDirection:'column',gap:22,background:'var(--cream)',height:'100%'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Components</div>
      <div className="br-h2">Buttons</div>
    </div>
    <div className="row">
      <button className="br-btn br-btn-pri">▸ Begin</button>
      <button className="br-btn br-btn-yel">Continue</button>
      <button className="br-btn br-btn-pink">★ Save</button>
      <button className="br-btn br-btn-sky">Connect</button>
      <button className="br-btn br-btn-mint">Done!</button>
    </div>
    <div className="row">
      <button className="br-btn br-btn-ghost">Maybe later</button>
      <button className="br-btn br-btn-disabled">Begin</button>
      <button className="br-btn br-btn-pri" style={{height:42,fontSize:14,padding:'0 16px',borderRadius:10,boxShadow:'3px 3px 0 var(--ink)'}}>SMALL</button>
      <button className="br-btn br-btn-yel" style={{height:68,fontSize:22,padding:'0 30px',borderRadius:18,boxShadow:'8px 8px 0 var(--ink)'}}>BIG MOOD</button>
    </div>
    <div className="br-tag" style={{opacity:.5}}>↳ hover lifts -2px / -2px · press pushes +2/+2</div>
  </div>
);

// ─────────────── FIELDS ───────────────
const FieldsArtboard = () => (
  <div style={{padding:32,display:'flex',flexDirection:'column',gap:22,background:'var(--paper)',height:'100%'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--pink)'}}>// Components</div>
      <div className="br-h2">Fields</div>
    </div>
    <div className="br-field">
      <label>What should I call you?</label>
      <input className="br-input" placeholder="say a name…"/>
    </div>
    <div className="br-field">
      <label>Your key <span className="br-sticker br-sticker-mint" style={{marginLeft:6,fontSize:9,padding:'2px 8px'}}>focused</span></label>
      <input className="br-input br-input-focus" type="password" defaultValue="••••••••••"/>
    </div>
    <div className="br-field">
      <label>Tell me what you want</label>
      <textarea className="br-input" rows="3" style={{height:'auto',padding:'14px 18px',resize:'none',fontFamily:'var(--body)',fontSize:16,fontWeight:500}} defaultValue="Plan a slow Sunday in Lagos, with one good meal and a short walk."/>
    </div>
  </div>
);

// ─────────────── CHIPS ───────────────
const ChipsArtboard = () => (
  <div style={{padding:32,background:'var(--cream)',height:'100%',display:'flex',flexDirection:'column',gap:20}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Components</div>
      <div className="br-h2">Chips</div>
    </div>
    <div className="row" style={{gap:10}}>
      <button className="br-chip">casual</button>
      <button className="br-chip br-chip-on">★ concise</button>
      <button className="br-chip">verbose</button>
      <button className="br-chip br-chip-pink">poetic</button>
      <button className="br-chip">factual</button>
    </div>
    <div className="br-eyebrow" style={{marginTop:6}}>Tags &amp; stickers</div>
    <div className="row" style={{gap:12}}>
      <Sticker color="yel" rotate={-3}>NEW</Sticker>
      <Sticker color="pink" rotate={4}>★ default</Sticker>
      <Sticker color="sky">connected</Sticker>
      <Sticker color="mint" rotate={-2}>● live</Sticker>
      <Sticker color="yel">v0.4</Sticker>
    </div>
  </div>
);

// ─────────────── TILES ───────────────
const TilesArtboard = () => (
  <div style={{padding:32,background:'var(--paper)',height:'100%',display:'flex',flexDirection:'column',gap:18}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Components</div>
      <div className="br-h2">Widget tiles</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
      <div className="br-tile" style={{background:'var(--sky)',height:130,gridColumn:'span 1'}}>
        <span className="br-tile-meta">weather · lagos</span>
        <div><span className="br-tile-title" style={{fontSize:32}}>18°</span><span className="br-tile-title" style={{marginLeft:8,opacity:.7}}>cloudy</span></div>
      </div>
      <div className="br-tile" style={{background:'var(--yellow)',height:130,gridColumn:'span 2',position:'relative'}}>
        <Sticker color="pink" rotate={6}>ON TIME</Sticker>
        <span className="br-tile-meta">flight · ba76</span>
        <div><span className="br-tile-title">Lagos → London</span></div>
      </div>
      <div className="br-tile" style={{background:'var(--mint)',height:130,gridColumn:'span 2'}}>
        <span className="br-tile-meta">today</span>
        <div><span className="br-tile-title">3 things, simply.</span></div>
      </div>
      <div className="br-tile" style={{background:'var(--pink)',height:130,color:'var(--ink)'}}>
        <span className="br-tile-meta">notes</span>
        <div><span className="br-tile-title" style={{fontSize:18,lineHeight:1.05}}>a bed of roses begins as a single thought</span></div>
      </div>
    </div>
  </div>
);

// ─────────────── PROVIDERS ───────────────
const ProviderRow = ({name, status, mark, on, bg}) => (
  <div className="br-card" style={{padding:16,display:'flex',alignItems:'center',gap:14,background:on?'var(--yellow)':'var(--paper)',position:'relative'}}>
    <div style={{width:48,height:48,border:'var(--stroke)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',background:bg,flexShrink:0,boxShadow:'3px 3px 0 var(--ink)'}}>
      {mark}
    </div>
    <div style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontFamily:'var(--display)',fontSize:22,textTransform:'uppercase',letterSpacing:'-.01em'}}>{name}</span>
        {on && <Sticker color="pink" rotate={-4}>★ default</Sticker>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'var(--mono)',fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase'}}>
        <Dot c={on?'var(--mint)':'rgba(10,10,10,.18)'} size={10}/> {status}
      </div>
    </div>
  </div>
);

const ProvidersArtboard = () => (
  <div style={{padding:32,background:'var(--cream)',height:'100%',display:'flex',flexDirection:'column',gap:14}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Components</div>
      <div className="br-h2">Providers</div>
    </div>
    <ProviderRow name="Anthropic" status="connected · sonnet-4-5" on bg="var(--paper)" mark={<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OpenAI" status="tap to connect" bg="var(--mint)" mark={<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--ink)" strokeWidth="2"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg>}/>
    <ProviderRow name="Gemini" status="tap to connect" bg="var(--sky)" mark={<svg viewBox="0 0 24 24" width="26" height="26" fill="var(--ink)"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="Compatible" status="byo endpoint" bg="var(--pink)" mark={<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--ink)" strokeWidth="2"><circle cx="6" cy="7" r="2.4" fill="var(--ink)"/><circle cx="18" cy="7" r="2.4" fill="var(--ink)"/><circle cx="12" cy="18" r="2.4" fill="var(--ink)"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

// ─────────────── AVATAR / PRESENCE ───────────────
const AvatarFace = ({mood='happy',color='var(--yellow)'}) => (
  <div className="br-avatar" style={{background:color}}>
    <div className="br-avatar-eye">
      {mood==='wink'?<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 11 Q11 2 20 11" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round"/></svg>:<span/>}
      <span/>
    </div>
  </div>
);

const AvatarArtboard = () => (
  <div style={{padding:32,background:'var(--paper)',height:'100%',display:'flex',flexDirection:'column',gap:20}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--pink)'}}>// Brand</div>
      <div className="br-h2">Presence</div>
      <div className="br-body" style={{maxWidth:480,marginTop:6,opacity:.75}}>The companion as a face — two eyes on a colored disc. Default lands on sunshine yellow; the AI swaps colors as it gets to know you.</div>
    </div>
    <div className="row" style={{gap:30,marginTop:6}}>
      <div className="col" style={{alignItems:'center'}}><AvatarFace color="var(--yellow)"/><div className="br-tag">DEFAULT · SUN</div></div>
      <div className="col" style={{alignItems:'center'}}><AvatarFace color="var(--pink)" mood="wink"/><div className="br-tag">FLIRT · ROSE</div></div>
      <div className="col" style={{alignItems:'center'}}><AvatarFace color="var(--mint)"/><div className="br-tag">CALM · MINT</div></div>
      <div className="col" style={{alignItems:'center'}}><AvatarFace color="var(--sky)"/><div className="br-tag">FOCUS · SKY</div></div>
    </div>
  </div>
);

// ─────────────── CHAT BUBBLES ───────────────
const BubblesArtboard = () => (
  <div style={{padding:32,background:'var(--cream)',height:'100%',display:'flex',flexDirection:'column',gap:14}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Components</div>
      <div className="br-h2">Chat</div>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div className="br-bubble br-bubble-user">Show me flights from Lagos to London.</div>
      <div className="br-bubble br-bubble-ai">
        <span className="br-bubble-name">★ Rose</span>
        Sure thing — I pinned a Flight Tracker tile to today. Tap it whenever.
      </div>
      <div className="br-bubble br-bubble-user" style={{background:'var(--sky)'}}>Make it pretty too.</div>
      <div className="br-bubble br-bubble-ai" style={{background:'var(--mint)'}}>
        <span className="br-bubble-name" style={{color:'var(--purple)'}}>★ Rose</span>
        On it. Cartoon mode, big shadows, no apologies.
      </div>
      <div style={{alignSelf:'center',padding:'6px 14px',background:'var(--paper)',border:'var(--stroke-thin)',borderRadius:99,fontFamily:'var(--mono)',fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',boxShadow:'2px 2px 0 var(--ink)'}}>· reconnecting ·</div>
    </div>
  </div>
);

// ─────────────── CHAT BAR ───────────────
const ChatBarArtboard = () => (
  <div style={{padding:32,background:'var(--paper)',height:'100%',display:'flex',flexDirection:'column',gap:18,justifyContent:'center'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--pink)'}}>// Components</div>
      <div className="br-h2">Chat bar</div>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:10,padding:10,paddingLeft:22,background:'var(--yellow)',border:'var(--stroke)',borderRadius:22,boxShadow:'8px 8px 0 var(--ink)'}}>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--grotesque)',fontWeight:600,fontSize:18,padding:'12px 0',color:'var(--ink)'}} placeholder="ask, or describe what you need…"/>
      <button style={{width:50,height:50,borderRadius:'50%',border:'var(--stroke)',background:'var(--ink)',color:'var(--cream)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'3px 3px 0 var(--cream), 3px 3px 0 3px var(--ink)',cursor:'pointer'}}>
        <span aria-hidden="true" style={{position:'relative',width:34,height:34,borderRadius:'50%',border:'2px solid var(--cream)',background:'radial-gradient(circle at 50% 55%, var(--purple), transparent 68%)',boxShadow:'0 0 0 3px var(--ink)'}}>
          <span style={{position:'absolute',left:'50%',top:'50%',width:8,height:8,marginLeft:-4,marginTop:-4,borderRadius:'50%',background:'var(--cream)',boxShadow:'0 0 0 3px var(--purple)'}} />
        </span>
      </button>
    </div>
    <div className="row" style={{gap:8}}>
      <button className="br-chip">+ image</button>
      <button className="br-chip">+ doc</button>
      <button className="br-chip br-chip-mint">▸ voice</button>
    </div>
  </div>
);

// ─────────────── HUD ───────────────
const HudArtboard = () => (
  <div style={{padding:32,background:'var(--cream)',height:'100%',display:'flex',flexDirection:'column',gap:18,position:'relative'}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Brand</div>
      <div className="br-h2">HUD register</div>
    </div>
    <div style={{flex:1,position:'relative',border:'var(--stroke)',borderRadius:14,background:'var(--paper)',minHeight:200,boxShadow:'var(--pop-3)'}}>
      <div style={{position:'absolute',top:14,left:18,display:'flex',gap:10,alignItems:'center'}}>
        <Dot c="var(--mint)"/>
        <span style={{fontFamily:'var(--display)',textTransform:'uppercase',fontSize:18}}>Bed of Roses</span>
        <span className="br-tag" style={{opacity:.5}}>14:32</span>
      </div>
      <div style={{position:'absolute',top:14,right:18,display:'flex',gap:8,alignItems:'center'}}>
        <Sticker color="yel" rotate={3}>v0.4</Sticker>
      </div>
      <div style={{position:'absolute',bottom:14,left:18}} className="br-tag">· identity ·</div>
      <div style={{position:'absolute',bottom:14,right:18,display:'flex',gap:8,alignItems:'center'}}>
        <Dot c="var(--pink)"/><span className="br-tag" style={{color:'var(--pink)'}}>LISTENING</span>
      </div>
      <div style={{position:'absolute',inset:'50% 18px auto 18px',transform:'translateY(-50%)',height:1,background:'var(--ink)'}}/>
    </div>
  </div>
);

// ─────────────── LOGO ───────────────
const LogoArtboard = () => (
  <div style={{padding:32,background:'var(--pink)',height:'100%',display:'flex',flexDirection:'column',gap:24,justifyContent:'center',alignItems:'center',position:'relative',overflow:'hidden'}}>
    <div className="br-dots" style={{position:'absolute',inset:0,opacity:.18}}/>
    <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
      <div style={{width:96,height:96,borderRadius:'50%',background:'var(--yellow)',border:'var(--stroke-fat)',boxShadow:'var(--pop-3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg viewBox="0 0 48 48" width="56" height="56">
          <circle cx="24" cy="24" r="9" fill="var(--ink)"/>
          <circle cx="24" cy="11" r="6" fill="var(--ink)"/>
          <circle cx="11" cy="24" r="6" fill="var(--ink)"/>
          <circle cx="37" cy="24" r="6" fill="var(--ink)"/>
          <circle cx="24" cy="37" r="6" fill="var(--ink)"/>
        </svg>
      </div>
      <div className="br-h1" style={{fontSize:64,textAlign:'center',lineHeight:.9}}>BED OF<br/>ROSES.</div>
      <span className="br-logo-sub">a soft little OS</span>
    </div>
  </div>
);

// ─────────────── PROVIDER MARKS ───────────────
const Mark = ({label, bg, children}) => (
  <div className="col" style={{alignItems:'center',gap:8}}>
    <div style={{width:80,height:80,borderRadius:18,border:'var(--stroke)',background:bg,boxShadow:'var(--pop-2)',display:'flex',alignItems:'center',justifyContent:'center'}}>{children}</div>
    <div className="br-tag">{label}</div>
  </div>
);

const MarksArtboard = () => (
  <div style={{padding:32,background:'var(--paper)',height:'100%',display:'flex',flexDirection:'column',gap:24}}>
    <div>
      <div className="br-eyebrow" style={{color:'var(--purple)'}}>// Brand</div>
      <div className="br-h2">Provider marks</div>
    </div>
    <div className="row" style={{gap:18}}>
      <Mark label="Anthropic" bg="var(--cream)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OpenAI" bg="var(--mint)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--ink)" strokeWidth="2"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg></Mark>
      <Mark label="Gemini" bg="var(--sky)"><svg viewBox="0 0 24 24" width="36" height="36" fill="var(--ink)"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="Ollama" bg="var(--pink)"><svg viewBox="0 0 24 24" width="36" height="36" fill="var(--ink)"><ellipse cx="12" cy="14" rx="8" ry="6.5"/><circle cx="9" cy="13" r="1.6" fill="var(--cream)"/><circle cx="15" cy="13" r="1.6" fill="var(--cream)"/></svg></Mark>
      <Mark label="Compatible" bg="var(--yellow)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--ink)" strokeWidth="2"><circle cx="6" cy="7" r="2.4" fill="var(--ink)"/><circle cx="18" cy="7" r="2.4" fill="var(--ink)"/><circle cx="12" cy="18" r="2.4" fill="var(--ink)"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

// ─────────────── HERO / OVERVIEW ───────────────
const HeroArtboard = () => (
  <div style={{padding:40,background:'var(--yellow)',height:'100%',display:'flex',flexDirection:'column',gap:22,position:'relative',overflow:'hidden'}}>
    <div className="br-stripes" style={{position:'absolute',inset:'auto 0 0 0',height:80,opacity:.08}}/>
    <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
      <div className="row" style={{gap:14}}>
        <Dot c="var(--pink)" size={16}/>
        <span style={{fontFamily:'var(--display)',fontSize:22,textTransform:'uppercase',letterSpacing:'-.01em'}}>Bed of Roses</span>
      </div>
      <Sticker color="pink" rotate={6}>★ Cartoon Brutalist · v1</Sticker>
    </div>
    <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',gap:14}}>
      <div className="br-h1" style={{fontSize:120}}>HELLO,<br/><span style={{color:'var(--pink)'}}>FRIEND.</span></div>
      <div className="br-display" style={{maxWidth:680}}>A complete UI kit for a soft little OS that won't take itself too seriously. Heavy strokes. Hard shadows. Bright as you please.</div>
    </div>
    <div className="row" style={{gap:14}}>
      <button className="br-btn br-btn-pri">▸ get started</button>
      <button className="br-btn br-btn-pink">★ pick a vibe</button>
      <span className="br-tag" style={{opacity:.6,marginLeft:8}}>↓ scroll for the kit</span>
    </div>
  </div>
);

// ─────────────── ASSEMBLE ───────────────
const App = () => (
  <DesignCanvas title="Bed of Roses — Cartoon Brutalist UI Kit" subtitle="Heavy borders · hard shadows · sticker energy" defaultZoom={0.7}>

    <DCSection id="hero" title="Overview" subtitle="The vibe, the brand, the wordmark.">
      <DCArtboard id="hero" label="Hero · the pitch" width={900} height={560}><HeroArtboard/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={560}><LogoArtboard/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><HudArtboard/></DCArtboard>
    </DCSection>

    <DCSection id="foundations" title="Foundations" subtitle="Color, type, and the rules of the road.">
      <DCArtboard id="colors" label="Pop palette" width={920} height={520}><ColorsArtboard/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><TypeArtboard/></DCArtboard>
    </DCSection>

    <DCSection id="components" title="Components" subtitle="Buttons, fields, chips, tiles, chat — all yours.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={460}><ButtonsArtboard/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><FieldsArtboard/></DCArtboard>
      <DCArtboard id="chips" label="Chips & stickers" width={520} height={460}><ChipsArtboard/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={620} height={460}><TilesArtboard/></DCArtboard>
      <DCArtboard id="bubbles" label="Chat" width={520} height={520}><BubblesArtboard/></DCArtboard>
      <DCArtboard id="chatbar" label="Chat bar" width={620} height={420}><ChatBarArtboard/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={520}><ProvidersArtboard/></DCArtboard>
    </DCSection>

    <DCSection id="brand" title="Brand" subtitle="Faces, marks, the cast of characters.">
      <DCArtboard id="avatar" label="Presence faces" width={760} height={420}><AvatarArtboard/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={340}><MarksArtboard/></DCArtboard>
    </DCSection>

  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
