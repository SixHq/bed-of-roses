// Neo Brutalist UI Kit
const Tag = ({children,c='ink'}) => {
  const styles = {ink:{background:'var(--ink)',color:'var(--paper-2)',borderColor:'var(--ink)'},
                  hot:{background:'var(--hot)',color:'var(--paper-2)',borderColor:'var(--hot)'},
                  acid:{background:'var(--acid)',color:'var(--ink)',borderColor:'var(--ink)'},
                  paper:{background:'var(--paper-2)',color:'var(--ink)',borderColor:'var(--ink)'}};
  return <span style={{...styles[c],border:'1px solid',padding:'2px 8px',fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.18em',textTransform:'uppercase',display:'inline-flex',alignItems:'center',gap:4}}>{children}</span>;
};
const Dot = ({c='var(--hot)',size=8}) => <span style={{width:size,height:size,borderRadius:'50%',background:c,display:'inline-block'}}/>;
const Divider = ({label}) => (
  <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6}}>
    <span className="n-mono" style={{color:'var(--hot)'}}>///</span>
    <span className="n-tag">{label}</span>
    <span className="n-divider" style={{flex:1}}>{'─'.repeat(120)}</span>
  </div>
);

const Hero = () => (
  <div style={{padding:'40px 44px',height:'100%',display:'flex',flexDirection:'column',justifyContent:'space-between',background:'var(--paper-2)',borderTop:'1px solid var(--ink)',position:'relative'}}>
    <div className="row" style={{justifyContent:'space-between',alignItems:'flex-start'}}>
      <div className="col" style={{gap:4}}>
        <span className="n-mono">[01] / 14</span>
        <span className="n-eyebrow">// bed-of-roses · v0.4 · neo brutalist</span>
      </div>
      <div className="row" style={{gap:8}}><Tag c="hot">stable</Tag><Tag>2026.05.09</Tag></div>
    </div>
    <div>
      <div className="n-h1" style={{fontSize:140}}>BED OF<br/>ROSES<span style={{color:'var(--hot)'}}>.</span></div>
      <Divider label="A SOFT LITTLE OS — STRUCTURED EDITION"/>
      <div className="n-display" style={{maxWidth:580,marginTop:18}}>An assistant that respects the grid. Hairlines, sharp corners, monospace metadata. No friendly ornament — just the work, presented honestly.</div>
    </div>
    <div className="row" style={{gap:10}}>
      <button className="n-btn n-btn-pri">▸ Initialize</button>
      <button className="n-btn">View source</button>
      <button className="n-btn n-btn-ghost">↳ /docs</button>
    </div>
  </div>
);

const Logo = () => (
  <div style={{padding:32,height:'100%',background:'var(--paper-2)',display:'flex',flexDirection:'column',gap:24,justifyContent:'center',alignItems:'center',position:'relative',borderTop:'1px solid var(--ink)'}}>
    <div style={{position:'absolute',top:18,left:22,right:22,display:'flex',justifyContent:'space-between'}} className="n-tag"><span>FIG.01</span><span>LOGO LOCKUP</span></div>
    <div style={{width:120,height:120,border:'2px solid var(--ink)',position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',right:-12,bottom:-12,left:6,top:6,background:'var(--hot)',zIndex:-1}}/>
      <div className="n-h1" style={{fontSize:72,lineHeight:1}}>R<span style={{color:'var(--hot)'}}>.</span></div>
    </div>
    <div className="col" style={{alignItems:'center',gap:8}}>
      <div className="n-h2" style={{fontSize:36,textAlign:'center',lineHeight:.95}}>BED OF<br/>ROSES.</div>
      <Tag>a soft little OS</Tag>
    </div>
    <div style={{position:'absolute',bottom:18,left:22,right:22,display:'flex',justifyContent:'space-between'}} className="n-tag"><span>—</span><span>1:1 / 1:2</span></div>
  </div>
);

const Hud = () => (
  <div style={{padding:32,height:'100%',background:'var(--paper-2)',display:'flex',flexDirection:'column',gap:14,borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// brand</div>
    <div className="n-h2">HUD REGISTER</div>
    <div style={{flex:1,position:'relative',border:'1px solid var(--ink)',background:'var(--paper)',minHeight:200}}>
      <div style={{position:'absolute',top:0,left:0,right:0,padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--ink)',background:'var(--paper-2)'}}>
        <div className="row" style={{gap:10}}><Dot c="var(--hot)"/><span className="n-mono" style={{fontWeight:700}}>BED-OF-ROSES</span><span className="n-tag">14:32:08</span></div>
        <Tag c="hot">REC ●</Tag>
      </div>
      <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'10px 14px',display:'flex',justifyContent:'space-between',borderTop:'1px solid var(--ink)',background:'var(--paper-2)'}}>
        <span className="n-tag">PID 2402 / MEM 142MB / NET ↗ 12kb/s</span>
        <span className="n-tag">[ESC] DISMISS</span>
      </div>
      <div style={{position:'absolute',inset:'46% 14px auto 14px',height:1,background:'var(--ink)'}}/>
      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)'}} className="n-h3" >LISTENING</div>
    </div>
  </div>
);

const Swatch = ({name,hex,fg='var(--ink)'}) => (
  <div className="col" style={{gap:6,width:108}}>
    <div style={{background:hex,height:108,border:'1px solid var(--ink)',position:'relative'}}>
      <div style={{position:'absolute',top:6,left:8,fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.1em',color:fg,textTransform:'uppercase'}}>{hex}</div>
    </div>
    <div className="n-mono">{name}</div>
  </div>
);

const Colors = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:18,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// foundations / 02</div>
    <div className="n-h2">PALETTE — REDUCED, ONE HOT</div>
    <div className="n-body" style={{maxWidth:580}}>Ink + paper carry the structure. The hot accent is rationed — used for state changes and hierarchy, never decoration.</div>
    <div className="row" style={{gap:12}}>
      <Swatch name="PAPER" hex="#F4F2ED"/>
      <Swatch name="WHITE" hex="#FFFFFF"/>
      <Swatch name="INK" hex="#0A0A0A" fg="var(--paper)"/>
      <Swatch name="HOT" hex="#FF3B00" fg="var(--paper)"/>
      <Swatch name="ACID" hex="#D6FF3B"/>
      <Swatch name="HAIR" hex="rgba(10,10,10,.18)"/>
    </div>
  </div>
);

const Type = () => (
  <div style={{padding:36,height:'100%',display:'flex',flexDirection:'column',gap:14,background:'var(--paper-2)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// type / 03</div>
    <div className="n-h1" style={{fontSize:120}}>STRUCT<br/>URE.<span style={{color:'var(--hot)'}}>_</span></div>
    <div className="n-h2" style={{color:'var(--hot)'}}>DISPLAY · INTER TIGHT 800</div>
    <div className="n-h3">SUB · INTER TIGHT 700 / UPPER</div>
    <div className="n-body" style={{maxWidth:560}}>Body sets in Inter Tight at 14/22, normal case. Long-form reading is allowed; we just don't dress it up.</div>
    <div className="n-mono" style={{color:'var(--ink-2)'}}>// mono · jetbrains mono · 12/.04em / used for metadata, paths, timestamps</div>
  </div>
);

const Buttons = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:16,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 04</div>
    <div className="n-h2">BUTTONS</div>
    <div className="row">
      <button className="n-btn n-btn-pri">▸ Initialize</button>
      <button className="n-btn n-btn-hot">Save</button>
      <button className="n-btn n-btn-acid">Connect</button>
      <button className="n-btn">Continue</button>
      <button className="n-btn n-btn-ghost">↳ skip</button>
      <button className="n-btn" disabled style={{opacity:.35,cursor:'not-allowed'}}>Disabled</button>
    </div>
    <div className="row">
      <button className="n-btn" style={{height:32,fontSize:11,padding:'0 14px'}}>SMALL</button>
      <button className="n-btn n-btn-pri" style={{height:56,fontSize:16,padding:'0 28px'}}>Large action</button>
    </div>
    <Divider label="HOVER INVERTS · NO RADIUS · NO SHADOW · 1PX HAIRLINE"/>
  </div>
);

const Fields = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:16,background:'var(--paper-2)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 05</div>
    <div className="n-h2">FIELDS</div>
    <div className="n-field"><label>NAME</label><input className="n-input" placeholder="enter handle…"/></div>
    <div className="n-field"><label>API KEY · FOCUSED</label><input className="n-input n-input-focus" type="password" defaultValue="••••••••••"/></div>
    <div className="n-field"><label>PROMPT</label><textarea className="n-input" rows="3" style={{height:'auto',padding:14,resize:'none',fontFamily:'var(--mono)',fontSize:13}} defaultValue="plan a slow sunday in lagos"/></div>
  </div>
);

const Chips = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:16,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 06</div>
    <div className="n-h2">CHIPS &amp; STATES</div>
    <div className="row" style={{gap:6}}>
      <button className="n-chip">CASUAL</button>
      <button className="n-chip n-chip-on">CONCISE</button>
      <button className="n-chip">VERBOSE</button>
      <button className="n-chip">POETIC</button>
      <button className="n-chip n-chip-hot">FACTUAL</button>
    </div>
    <Divider label="STATES"/>
    <div className="row" style={{gap:8}}>
      <Tag c="ink">DEFAULT</Tag><Tag c="hot">LIVE</Tag><Tag c="acid">DRAFT</Tag><Tag>v0.4</Tag><Tag>2026·05·09</Tag>
    </div>
  </div>
);

const Tiles = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:14,background:'var(--paper-2)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 07</div>
    <div className="n-h2">WIDGET TILES</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0,border:'1px solid var(--ink)'}}>
      <div className="n-tile" style={{height:118,borderTop:0,borderLeft:0}}>
        <span className="n-tile-meta">/weather/lagos</span>
        <div><span className="n-tile-title" style={{fontSize:32}}>18°</span><span style={{marginLeft:8,fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-3)',textTransform:'uppercase'}}>CLOUDY</span></div>
      </div>
      <div className="n-tile" style={{height:118,gridColumn:'span 2',borderTop:0,borderLeft:0,borderRight:0,background:'var(--ink)',color:'var(--paper-2)'}}>
        <div className="row" style={{justifyContent:'space-between'}}><span className="n-tile-meta" style={{color:'rgba(255,255,255,.6)'}}>/flight/ba76</span><Tag c="hot">ON TIME</Tag></div>
        <span className="n-tile-title" style={{color:'var(--paper-2)'}}>LAGOS → LONDON</span>
      </div>
      <div className="n-tile" style={{height:118,gridColumn:'span 2',borderLeft:0,borderBottom:0,background:'var(--hot)',color:'var(--paper-2)'}}>
        <span className="n-tile-meta" style={{color:'rgba(255,255,255,.7)'}}>/today</span>
        <span className="n-tile-title" style={{color:'var(--paper-2)'}}>3 ITEMS · 1 OVERDUE</span>
      </div>
      <div className="n-tile" style={{height:118,borderLeft:0,borderRight:0,borderBottom:0}}>
        <span className="n-tile-meta">/notes</span>
        <span className="n-tile-title" style={{fontSize:14}}>A BED OF ROSES BEGINS AS A SINGLE THOUGHT.</span>
      </div>
    </div>
  </div>
);

const Bubbles = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:12,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 08</div>
    <div className="n-h2">CONVERSATION</div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div className="n-tag" style={{alignSelf:'center'}}>━━━ session 0042 ━━━</div>
      <div className="n-bubble n-bubble-user">show me flights from lagos to london</div>
      <div className="n-bubble n-bubble-ai"><span className="n-bubble-name">[ROSE] · 14:32:08</span>pinned a flight tracker tile to /today. tap to expand.</div>
      <div className="n-bubble n-bubble-user">make it pretty too</div>
      <div className="n-bubble n-bubble-ai"><span className="n-bubble-name">[ROSE] · 14:32:11</span>respectfully — that's not this theme's job.</div>
      <div className="n-tag" style={{alignSelf:'center'}}>·· typing ··</div>
    </div>
  </div>
);

const ChatBar = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:16,justifyContent:'center',background:'var(--paper-2)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 09</div>
    <div className="n-h2">PROMPT BAR</div>
    <div style={{display:'flex',alignItems:'center',gap:0,border:'1px solid var(--ink)',background:'var(--paper)'}}>
      <span style={{padding:'0 14px',fontFamily:'var(--mono)',fontSize:13,color:'var(--hot)',borderRight:'1px solid var(--ink)',height:48,display:'flex',alignItems:'center'}}>$</span>
      <input style={{flex:1,background:'transparent',border:0,outline:0,fontFamily:'var(--mono)',fontSize:14,padding:'0 14px',height:48,color:'var(--ink)'}} placeholder="enter prompt…"/>
      <button style={{height:48,padding:'0 18px',border:0,borderLeft:'1px solid var(--ink)',background:'var(--ink)',color:'var(--paper-2)',fontFamily:'var(--mono)',fontSize:12,letterSpacing:'.14em',cursor:'pointer'}}>SEND ↵</button>
    </div>
    <div className="row" style={{gap:6}}>
      <button className="n-chip">+ IMAGE</button>
      <button className="n-chip">+ DOC</button>
      <button className="n-chip">▸ VOICE</button>
      <span className="n-tag" style={{marginLeft:'auto'}}>CTRL+K · COMMAND</span>
    </div>
  </div>
);

const ProviderRow = ({name,status,mark,on}) => (
  <div style={{display:'grid',gridTemplateColumns:'48px 1fr auto',alignItems:'center',gap:14,padding:'12px 14px',border:'1px solid var(--ink)',background:on?'var(--hot)':'var(--paper-2)',color:on?'var(--paper-2)':'var(--ink)'}}>
    <div style={{width:36,height:36,border:`1px solid ${on?'var(--paper-2)':'var(--ink)'}`,display:'flex',alignItems:'center',justifyContent:'center'}}>{mark}</div>
    <div className="col" style={{gap:2}}>
      <div className="row" style={{gap:8}}><span style={{fontFamily:'var(--sans)',fontWeight:700,fontSize:18,letterSpacing:'-.01em',textTransform:'uppercase'}}>{name}</span>{on && <Tag c="paper">DEFAULT</Tag>}</div>
      <div style={{fontFamily:'var(--mono)',fontSize:11,letterSpacing:'.06em',opacity:.85}}>{status}</div>
    </div>
    <span className="n-mono" style={{opacity:.8}}>↗</span>
  </div>
);

const Providers = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:10,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div className="n-eyebrow">// components / 10</div>
    <div className="n-h2">PROVIDERS</div>
    <ProviderRow name="ANTHROPIC" status="connected · sonnet-4-5" on mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}/>
    <ProviderRow name="OPENAI" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--ink)" strokeWidth="1.4"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg>}/>
    <ProviderRow name="GEMINI" status="tap to connect" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="var(--ink)"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg>}/>
    <ProviderRow name="COMPATIBLE" status="byo endpoint" mark={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--ink)" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="var(--ink)"/><circle cx="18" cy="7" r="2.4" fill="var(--ink)"/><circle cx="12" cy="18" r="2.4" fill="var(--ink)"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg>}/>
  </div>
);

const Avatar = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:24,background:'var(--paper-2)',borderTop:'1px solid var(--ink)'}}>
    <div><div className="n-eyebrow">// brand / 11</div><div className="n-h2">PRESENCE</div></div>
    <div className="n-body" style={{maxWidth:520}}>A square block with offset hot shadow. State color shifts as personality is set. The block is the avatar — no face, no warmth performed.</div>
    <div className="row" style={{gap:32}}>
      <div className="col" style={{alignItems:'center'}}><div className="n-avatar" style={{'--c':'var(--paper-2)'}}/><div className="n-mono" style={{marginTop:4}}>00·DEFAULT</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="n-avatar" style={{'--c':'var(--hot)'}}/><div className="n-mono" style={{marginTop:4}}>01·HOT</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="n-avatar" style={{'--c':'var(--acid)'}}/><div className="n-mono" style={{marginTop:4}}>02·ACID</div></div>
      <div className="col" style={{alignItems:'center'}}><div className="n-avatar" style={{'--c':'var(--ink)'}}/><div className="n-mono" style={{marginTop:4}}>03·INK</div></div>
    </div>
  </div>
);

const Mark = ({label,bg,fg='var(--ink)',children}) => (
  <div className="col" style={{alignItems:'center',gap:6}}>
    <div style={{width:72,height:72,border:'1px solid var(--ink)',background:bg,color:fg,display:'flex',alignItems:'center',justifyContent:'center'}}>{children}</div>
    <div className="n-mono" style={{fontSize:10}}>{label}</div>
  </div>
);

const Marks = () => (
  <div style={{padding:32,height:'100%',display:'flex',flexDirection:'column',gap:18,background:'var(--paper)',borderTop:'1px solid var(--ink)'}}>
    <div><div className="n-eyebrow">// brand / 12</div><div className="n-h2">PROVIDER MARKS</div></div>
    <div className="row" style={{gap:14}}>
      <Mark label="ANTHROPIC" bg="var(--paper-2)"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg></Mark>
      <Mark label="OPENAI" bg="var(--paper-2)"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.6" fill="var(--ink)"/></svg></Mark>
      <Mark label="GEMINI" bg="var(--paper-2)"><svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M12 2C12 7 13 11 22 12C13 13 12 17 12 22C12 17 11 13 2 12C11 11 12 7 12 2Z"/></svg></Mark>
      <Mark label="OLLAMA" bg="var(--hot)" fg="var(--paper-2)"><svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><ellipse cx="12" cy="14" rx="8" ry="6.5"/></svg></Mark>
      <Mark label="COMPATIBLE" bg="var(--acid)"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="7" r="2.4" fill="currentColor"/><circle cx="18" cy="7" r="2.4" fill="currentColor"/><circle cx="12" cy="18" r="2.4" fill="currentColor"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="7" x2="12" y2="18"/><line x1="18" y1="7" x2="12" y2="18"/></svg></Mark>
    </div>
  </div>
);

const App = () => (
  <DesignCanvas title="Bed of Roses — Neo Brutalist UI Kit" subtitle="Hairlines · sharp corners · monospace metadata · single hot accent" defaultZoom={0.7}>
    <DCSection id="hero" title="Overview" subtitle="The pitch, the lockup, the register.">
      <DCArtboard id="hero" label="Hero · the pitch" width={920} height={600}><Hero/></DCArtboard>
      <DCArtboard id="logo" label="Logo lockup" width={420} height={600}><Logo/></DCArtboard>
      <DCArtboard id="hud" label="HUD register" width={620} height={420}><Hud/></DCArtboard>
    </DCSection>
    <DCSection id="foundations" title="Foundations" subtitle="Reduced palette, structural type.">
      <DCArtboard id="colors" label="Palette" width={920} height={460}><Colors/></DCArtboard>
      <DCArtboard id="type" label="Type system" width={620} height={520}><Type/></DCArtboard>
    </DCSection>
    <DCSection id="components" title="Components" subtitle="Buttons, fields, chips, tiles, conversation.">
      <DCArtboard id="buttons" label="Buttons" width={620} height={420}><Buttons/></DCArtboard>
      <DCArtboard id="fields" label="Fields" width={520} height={460}><Fields/></DCArtboard>
      <DCArtboard id="chips" label="Chips & states" width={520} height={400}><Chips/></DCArtboard>
      <DCArtboard id="tiles" label="Widget tiles" width={620} height={440}><Tiles/></DCArtboard>
      <DCArtboard id="bubbles" label="Conversation" width={520} height={500}><Bubbles/></DCArtboard>
      <DCArtboard id="chatbar" label="Prompt bar" width={620} height={420}><ChatBar/></DCArtboard>
      <DCArtboard id="providers" label="Providers" width={620} height={460}><Providers/></DCArtboard>
    </DCSection>
    <DCSection id="brand" title="Brand" subtitle="Faces and marks.">
      <DCArtboard id="avatar" label="Presence" width={760} height={420}><Avatar/></DCArtboard>
      <DCArtboard id="marks" label="Provider marks" width={760} height={320}><Marks/></DCArtboard>
    </DCSection>
  </DesignCanvas>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
