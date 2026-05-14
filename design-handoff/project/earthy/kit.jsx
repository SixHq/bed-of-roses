// Warm & Earthy UI Kit
const { useState } = React;

const Pill = ({children, color='ink'}) => {
  const map = {ink:{background:'var(--ink)',color:'var(--paper)'},
               terra:{background:'var(--terra)',color:'var(--paper)'},
               mustard:{background:'var(--mustard)',color:'var(--ink)'},
               olive:{background:'var(--olive)',color:'var(--paper)'},
               sage:{background:'var(--sage)',color:'var(--ink)'},
               paper:{background:'var(--paper-warm)',color:'var(--ink-2)',border:'1px solid var(--hair)'}};
  return <span style={{...map[color],display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:99,fontFamily:'var(--mono)',fontSize:10,fontWeight:500,letterSpacing:'.14em',textTransform:'uppercase'}}>{children}</span>;
};
const Dot = ({c='var(--olive)',size=8}) => <span style={{width:size,height:size,borderRadius:'50%',background:c,display:'inline-block'}}/>;

// ─── Hero ───
const HeroArtboard = () => (
  <div style={{padding:48,height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',background:'linear-gradient(180deg,#F5E9D0 0%,#EDE2CD 100%)',position:'relative',overflow:'hidden'}}>
    <svg viewBox="0 0 600 200" style={{position:'absolute',inset:'auto 0 -20px 0',width:'100%',opacity:.16}}><path d="M0 140 Q150 60 300 140 T600 140 V200 H0 Z" fill="var(--olive)"/><path d="M0 160 Q200 100 400 160 T600 160 V200 H0 Z" fill="var(--terra)" opacity=".4"/></svg>
    <div className="row" style={{justifyContent:'space-between'}}>
      <div className="row" style={{gap:10}}><Dot c="var(--terra)" size={10}/><span style={{fontFamily:'var(--serif)',fontSize:18,fontStyle:'italic'}}>Bed of Roses</span></div>
      <Pill color="paper">warm &amp; earthy · v1</Pill>
    </div>
    <div style={{position:'relative'}}>
      <div className="e-eyebrow" style={{marginBottom:14}}>// the soft little OS</div>
      <div className="e-h1" style={{fontSize:108}}>A house<br/>made of <em>roses</em><br/>&amp; long light.</div>
      <div className="e-display" style={{maxWidth:580,marginTop:18}}>An assistant that holds your day like a clay cup — warm, simple, not too clever about it.</div>
    </div>
    <div className="row" style={{gap:10,position:'relative'}}>
      <button className="e-btn e-btn-pri">Begin <span className="e-arrow"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></button>
      <button className="e-btn">Take a look around</button>
    </div>
  </div>
);

// ─── Logo ───
const LogoArtboard = () => (
  <div style={{padding:32,height:'100%',background:'var(--terra)',display:'flex',flexDirection:'column',gap:24,justifyContent:'center',alignItems:'center',position:'relative',overflow:'hidden'}}>
    <svg viewBox="0 0 400 400" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.10}}>{[...Array(12)].map((_,i)=><circle key={i} cx={200} cy={200} r={20+i*16} fill="none" stroke="var(--paper)" strokeWidth="1"/>)}</svg>
    <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:18}}>
      <div style={{width:88,height:88,borderRadius:'50%',background:'var(--paper)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 24px rgba(42,31,20,.25)'}}>
        <svg viewBox="0 0 48 48" width="56" height="56">
          <g fill="var(--terra)">
            <path d="M24 12c-4 0-7 3-7 7 0 0-4-1-6 2-2 3 0 7 3 8-2 3-1 7 3 8 0 4 4 6 7 5 3 1 7-1 7-5 4-1 5-5 3-8 3-1 5-5 3-8-2-3-6-2-6-2 0-4-3-7-7-7z"/>
            <circle cx="24" cy="22" r="4" fill="var(--paper)"/>
          </g>
        </svg>
      </div>
      <div className="e-h1" style={{fontSize:64,textAlign:'center',color:'var(--paper)',lineHeight:.92}}>Bed of<br/><em style={{color:'var(--mustard)'}}>Roses</em>.</div>
      <Pill color="paper">a soft little OS</Pill>
    </div>
  </div>
);

// ─── HUD ───
const HudArtboard = () => (
  <div style={{padding:32,height:'100%',background:'var(--paper)',display:'flex',flexDirection:'column',gap:16}}>
    <div><div className="e-eyebrow">// brand</div><div className="e-h2">HUD <em>register</em></div></div>
    <div style={{flex:1,position:'relative',border:'1px solid var(--hair)',borderRadius:14,background:'var(--paper-warm)',minHeight:200,boxShadow:'var(--shadow-inset)'}}>
      <div style={{position:'absolute',top:14,left:18,display:'flex',gap:10,alignItems:'center'}}>
        <Dot c="var(--olive)"/>
        <span style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:18}}>Bed of Roses</span>
        <span className="e-tag">14:32</span>
      </div>
      <div style={{position:'absolute',top:14,right:18}}><Pill color="paper">v0.4</Pill></div>
      <div style={{position:'absolute',bottom:14,left:18}} className="e-tag">— identity —</div>
      <div style={{position:'absolute',bottom:14,right:18,display:'flex',gap:8,alignItems:'center'}}>
        <Dot c="var(--terra)"/><span className="e-tag" style={{color:'var(--terra)'}}>listening</span>
      </div>
    </div>
  </div>
);

// ─── Colors ───
const Swatch = ({name,hex,fg='var(--ink)'}) => (
  <div style={{display:'flex',flexDirection:'column',gap:6,width:108}}>
    <div style={{background:hex,height:108,borderRadius:14,position:'relative',border:'1px solid var(--hair)',boxShadow:'var(--shadow-soft)'}}>
      <div style={{position:'absolute',top:8,right:10,fontFamily:'var(--mono)',fontSize:9,letterSpacing:'.1em',color:fg,opacity:.75}}>{hex}</div>
    </div>
    <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:14,color:'var(--ink-2)'}}>{name}</div>
  </div>
);

const ColorsArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:24,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// foundations</div><div className="e-h2"><em>Earth</em> palette</div>
      <div className="e-body" style={{maxWidth:540,marginTop:6}}>Pulled from old kitchens and long walks: terracotta, olive, mustard, sage. Walnut ink ties it down.</div>
    </div>
    <div className="row" style={{gap:14}}>
      <Swatch name="Sand" hex="#EDE2CD"/>
      <Swatch name="Paper" hex="#FAF3E3"/>
      <Swatch name="Terracotta" hex="#C8553D" fg="var(--paper)"/>
      <Swatch name="Mustard" hex="#D4A24C"/>
      <Swatch name="Honey" hex="#E8B86F"/>
      <Swatch name="Olive" hex="#7A8450" fg="var(--paper)"/>
      <Swatch name="Sage" hex="#9CAF88"/>
      <Swatch name="Clay" hex="#B47148" fg="var(--paper)"/>
      <Swatch name="Plum" hex="#6B3F4A" fg="var(--paper)"/>
      <Swatch name="Walnut" hex="#2A1F14" fg="var(--mustard)"/>
    </div>
  </div>
);

// ─── Type ───
const TypeArtboard = () => (
  <div style={{padding:36,height:'100%',display:'flex',flexDirection:'column',gap:16,background:'var(--paper)'}}>
    <div><div className="e-eyebrow">// type system</div></div>
    <div className="e-h1" style={{fontSize:110,lineHeight:.9}}>The <em>quiet</em><br/>weight of a<br/><em>warm</em> page.</div>
    <div className="e-h2" style={{color:'var(--terra)'}}>Display · Newsreader, italic-capable</div>
    <div className="e-h3">Sub · Plus Jakarta Sans, 600</div>
    <div className="e-body" style={{maxWidth:560}}>Body sets in Plus Jakarta — humanist grotesque, gentle on long reads. Newsreader carries the heart, JetBrains Mono carries the labels.</div>
    <div style={{fontFamily:'var(--mono)',fontSize:11,letterSpacing:'.2em',textTransform:'uppercase',color:'var(--ink-3)'}}>· mono · jetbrains · 11/500/.2em</div>
  </div>
);

// ─── Buttons ───
const ButtonsArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:20,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Buttons</em></div></div>
    <div className="row">
      <button className="e-btn e-btn-pri">Begin <span className="e-arrow"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></button>
      <button className="e-btn e-btn-terra">Save the day</button>
      <button className="e-btn e-btn-mustard">Continue</button>
      <button className="e-btn e-btn-olive">Connect</button>
    </div>
    <div className="row">
      <button className="e-btn">Take a look</button>
      <button className="e-btn e-btn-ghost">Maybe later</button>
      <button className="e-btn" disabled style={{opacity:.4,cursor:'not-allowed'}}>Begin</button>
    </div>
    <div className="row">
      <button className="e-btn e-btn-pri" style={{height:38,fontSize:13,padding:'0 16px'}}>SMALL</button>
      <button className="e-btn e-btn-terra" style={{height:60,fontSize:18,padding:'0 30px'}}>Take me home</button>
    </div>
    <div className="e-tag" style={{opacity:.6}}>↳ subtle lift on hover · pill radius · paper shadow</div>
  </div>
);

// ─── Fields ───
const FieldsArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:18,background:'var(--paper)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Fields</em></div></div>
    <div className="e-field"><label>What should I call you?</label><input className="e-input" placeholder="say a name…"/></div>
    <div className="e-field"><label>Your key</label><input className="e-input e-input-focus" type="password" defaultValue="••••••••••"/></div>
    <div className="e-field"><label>Tell me what you'd like, in your own words</label>
      <textarea className="e-input" rows="3" style={{height:'auto',padding:'14px 18px',resize:'none',fontFamily:'var(--sans)',fontSize:15}} defaultValue="A slow Sunday in Lagos, with one good meal and a short walk."/>
    </div>
  </div>
);

// ─── Chips ───
const ChipsArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:18,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Chips</em> &amp; tags</div></div>
    <div className="row" style={{gap:8}}>
      <button className="e-chip e-chip-italic">casual</button>
      <button className="e-chip e-chip-on e-chip-italic">concise</button>
      <button className="e-chip e-chip-italic">verbose</button>
      <button className="e-chip e-chip-italic">poetic</button>
      <button className="e-chip e-chip-italic">factual</button>
    </div>
    <div className="e-eyebrow" style={{marginTop:10}}>tags</div>
    <div className="row" style={{gap:10}}>
      <Pill color="ink">default</Pill>
      <Pill color="terra">listening</Pill>
      <Pill color="olive">connected</Pill>
      <Pill color="mustard">v0.4</Pill>
      <Pill color="sage">live</Pill>
      <Pill color="paper">draft</Pill>
    </div>
  </div>
);

// ─── Tiles ───
const TilesArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:16,background:'var(--paper)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Widget</em> tiles</div></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
      <div className="e-tile" style={{background:'var(--paper-warm)',height:118}}>
        <span className="e-tile-meta">weather · lagos</span>
        <div><span className="e-tile-title" style={{fontSize:30}}>18°</span><span style={{marginLeft:8,color:'var(--ink-3)',fontSize:13}}>cloudy</span></div>
      </div>
      <div className="e-tile" style={{background:'var(--terra)',color:'var(--paper)',height:118,gridColumn:'span 2',position:'relative',border:'none'}}>
        <Pill color="paper">on time</Pill>
        <span className="e-tile-meta" style={{color:'rgba(255,255,255,.7)'}}>flight · ba76</span>
        <div><span className="e-tile-title" style={{color:'var(--paper)'}}>Lagos → London</span></div>
      </div>
      <div className="e-tile" style={{background:'var(--olive)',color:'var(--paper)',height:118,gridColumn:'span 2',border:'none'}}>
        <span className="e-tile-meta" style={{color:'rgba(255,255,255,.7)'}}>today</span>
        <div><span className="e-tile-title" style={{color:'var(--paper)'}}>Three small things, gently.</span></div>
      </div>
      <div className="e-tile" style={{background:'var(--mustard)',height:118}}>
        <span className="e-tile-meta">notes</span>
        <div><span className="e-tile-title" style={{fontSize:17,fontStyle:'italic'}}>a bed of roses begins as a single thought…</span></div>
      </div>
    </div>
  </div>
);

// ─── Bubbles ───
const BubblesArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:14,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Conversation</em></div></div>
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="e-bubble e-bubble-user">Show me flights from Lagos to London.</div>
      <div className="e-bubble e-bubble-ai"><span className="e-bubble-name">Rose</span>Pinned a Flight Tracker tile to today — open whenever you'd like.</div>
      <div className="e-bubble e-bubble-user">And something soft to read while I wait?</div>
      <div className="e-bubble e-bubble-ai"><span className="e-bubble-name">Rose</span>Of course. Saving Berger's <em>Ways of Seeing</em> for the gate.</div>
      <div style={{alignSelf:'center',padding:'5px 12px',background:'var(--paper)',border:'1px solid var(--hair)',borderRadius:99,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--ink-3)'}}>· reconnecting ·</div>
    </div>
  </div>
);

// ─── Chat bar ───
const ChatBarArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:18,justifyContent:'center',background:'var(--paper)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Chat</em> bar</div></div>
    <div style={{display:'flex',alignItems:'center',gap:8,padding:8,paddingLeft:22,background:'var(--paper-warm)',border:'1px solid var(--hair)',borderRadius:99,boxShadow:'var(--shadow-lift)'}}>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--sans)',fontWeight:500,fontSize:16,padding:'12px 0',color:'var(--ink)'}} placeholder="ask, or describe what you need…"/>
      <button style={{width:42,height:42,borderRadius:'50%',border:'none',background:'var(--terra)',color:'var(--paper)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
        <span aria-hidden="true" style={{position:'relative',width:30,height:30,borderRadius:'50%',border:'1px solid rgba(255,248,234,.62)',background:'radial-gradient(circle at 50% 55%,rgba(255,248,234,.24),transparent 68%)'}}>
          <span style={{position:'absolute',left:'50%',top:'50%',width:7,height:7,marginLeft:-3.5,marginTop:-3.5,borderRadius:'50%',background:'var(--paper)',boxShadow:'0 0 16px rgba(255,248,234,.72)'}} />
        </span>
      </button>
    </div>
    <div className="row" style={{gap:8}}><button className="e-chip">+ image</button><button className="e-chip">+ doc</button><button className="e-chip">▸ voice</button></div>
  </div>
);

// ─── Providers ───
const ProviderRow = ({name,status,mark,on,bg}) => (
  <div className="e-card" style={{padding:14,display:'flex',alignItems:'center',gap:14,...(on?{borderColor:'var(--terra)',background:'rgba(200,85,61,.06)'}:{})}}>
    <div style={{width:42,height:42,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',background:bg,flexShrink:0,border:'1px solid var(--hair)'}}>{mark}</div>
    <div style={{flex:1,display:'flex',flexDirection:'column',gap:2}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontFamily:'var(--serif)',fontSize:20,fontWeight:500,letterSpacing:'-.012em'}}>{name}</span>
        {on && <Pill color="terra">default</Pill>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,fontFamily:'var(--mono)',fontSize:11,letterSpacing:'.06em',color:'var(--ink-3)'}}>
        <Dot c={on?'var(--olive)':'var(--ink-4)'}/>{status}
      </div>
    </div>
  </div>
);

const ProvidersArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:12,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// components</div><div className="e-h2"><em>Providers</em></div></div>
    <ProviderRow name="Anthropic" status="connected · sonnet-4-5" on bg="var(--paper-warm)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OpenAI" status="tap to connect" bg="var(--sage)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink)" strokeWidth="1.4"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg>}/>
    <ProviderRow name="Gemini" status="tap to connect" bg="var(--honey)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--ink)"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="Compatible" status="byo endpoint" bg="var(--paper-warm)" mark={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ink)" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="var(--ink)"/><circle cx="18" cy="7" r="2.4" fill="var(--ink)"/><circle cx="12" cy="18" r="2.4" fill="var(--ink)"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

// ─── Avatar ───
const AvatarArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:24,background:'var(--paper)'}}>
    <div><div className="e-eyebrow">// brand</div><div className="e-h2"><em>Presence</em></div>
      <div className="e-body" style={{maxWidth:480,marginTop:6}}>A small warm sun. Default lands on honey; the assistant gently shifts hue as it gets to know you.</div>
    </div>
    <div className="row" style={{gap:30}}>
      <div className="col" style={{alignItems:'center'}}><div className="e-avatar" style={{'--c1':'#F5D08A','--c2':'#D4A24C'}}/><div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:15}}>Honey · default</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="e-avatar" style={{'--c1':'#E68C73','--c2':'#C8553D'}}/><div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:15}}>Terracotta</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="e-avatar" style={{'--c1':'#B5C49E','--c2':'#7A8450'}}/><div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:15}}>Olive</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="e-avatar" style={{'--c1':'#9A6B76','--c2':'#6B3F4A'}}/><div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:15}}>Plum</div></div>
    </div>
  </div>
);

// ─── Marks ───
const Mark = ({label,bg,children}) => (
  <div className="col" style={{alignItems:'center',gap:8}}>
    <div style={{width:72,height:72,borderRadius:18,background:bg,border:'1px solid var(--hair)',boxShadow:'var(--shadow-soft)',display:'flex',alignItems:'center',justifyContent:'center'}}>{children}</div>
    <div style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:14,color:'var(--ink-2)'}}>{label}</div>
  </div>
);

const MarksArtboard = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:24,background:'var(--sand)'}}>
    <div><div className="e-eyebrow">// brand</div><div className="e-h2"><em>Provider</em> marks</div></div>
    <div className="row" style={{gap:18}}>
      <Mark label="Anthropic" bg="var(--paper)"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--ink)" strokeWidth="1.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OpenAI" bg="var(--sage)"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--ink)" strokeWidth="1.4"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg></Mark>
      <Mark label="Gemini" bg="var(--honey)"><svg viewBox="0 0 24 24" width="32" height="32" fill="var(--ink)"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="Ollama" bg="var(--terra)"><svg viewBox="0 0 24 24" width="32" height="32" fill="var(--paper)"><ellipse cx="12" cy="14" rx="8" ry="6.5"/><circle cx="9" cy="13" r="1.6" fill="var(--terra)"/><circle cx="15" cy="13" r="1.6" fill="var(--terra)"/></svg></Mark>
      <Mark label="Compatible" bg="var(--mustard)"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--ink)" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="var(--ink)"/><circle cx="18" cy="7" r="2.4" fill="var(--ink)"/><circle cx="12" cy="18" r="2.4" fill="var(--ink)"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Warm & Earthy UI Kit" subtitle="Sun-bleached paper · walnut ink · terracotta + olive" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The mood, the wordmark, the register.">
      <DCArtboard id="hero" label="Hero · the mood" width={920} height={580}><HeroArtboard/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={580}><LogoArtboard/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><HudArtboard/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Earth palette and the type voice.">
      <DCArtboard id="colors" label="Earth palette" width={920} height={520}><ColorsArtboard/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><TypeArtboard/></DCArtboard>
    </DCSection>
    <DCSection id="components" title="Components" subtitle="Buttons, fields, chips, tiles, chat.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={460}><ButtonsArtboard/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><FieldsArtboard/></DCArtboard>
      <DCArtboard id="chips" label="Chips & tags" width={520} height={420}><ChipsArtboard/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={620} height={440}><TilesArtboard/></DCArtboard>
      <DCArtboard id="bubbles" label="Conversation" width={520} height={500}><BubblesArtboard/></DCArtboard>
      <DCArtboard id="chatbar" label="Chat bar" width={620} height={420}><ChatBarArtboard/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={460}><ProvidersArtboard/></DCArtboard>
    </DCSection>
    <DCSection id="brand" title="Brand" subtitle="Faces and marks.">
      <DCArtboard id="avatar" label="Presence" width={760} height={420}><AvatarArtboard/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={340}><MarksArtboard/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
