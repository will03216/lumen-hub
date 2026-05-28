/* Studio — image + video generator, cinema-dock layout, animated fake jobs */
const { PlaceholderTile } = window.Lumen;

const IMG_MODELS = [
  { id: "seedream-5-0-lite", label: "Seedream 5.0 Lite", hint: "Fast · balanced" },
  { id: "seedream-4-5-251128", label: "Seedream 4.5", hint: "Highest fidelity" },
];
const VID_MODELS = [
  { id: "seedance-1-5-pro-251215", label: "Seedance 1.5 Pro", hint: "Up to 1080p · 10s" },
  { id: "seedance-2-0-pro", label: "Seedance 2.0", hint: "Multi-ref · 15s · audio" },
];
const IMG_SIZES = ["1024x1024", "1536x1536", "2048x2048", "1920x1080", "1080x1920"];
const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

const IMG_SUGGESTIONS = [
  "A lone astronaut on a red-dust canyon rim at golden hour, reflective visor, cinematic wide shot, Kodak Vision3",
  "Hyperreal macro of a translucent beetle on wet moss, dewdrops, shallow depth of field, studio light",
  "Neon-drenched Tokyo alleyway after rain, puddle reflections, anamorphic flare, film still",
];
const VID_SUGGESTIONS = [
  "Motorcycle rider carving through a neon-soaked Tokyo tunnel at night, anamorphic flare, cinematic dolly",
  "Hummingbird hovering over a blooming desert cactus, ultra slow motion, macro, golden hour",
  "Tracking shot of a woman on a windswept cliff, flowing red dress, ocean mist, IMAX",
];

function Studio() {
  const [tab, setTab] = useState("image");
  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 28px 120px" }}>
      {/* Studio header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 20, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="plate mono">§ STUDIO · SESSION 0421</div>
          <h1 className="serif" style={{ fontSize: "clamp(40px, 6vw, 80px)", margin: "10px 0 0", letterSpacing: "-0.02em", lineHeight: 0.95 }}>
            Direct a new <span className="ital">shot.</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 4, border: "1px solid var(--line)", borderRadius: 999, background: "#0a0a11" }}>
          <button className="railtab" aria-selected={tab === "image"} onClick={() => setTab("image")}>
            <Dot on={tab === "image"} /> Image
          </button>
          <button className="railtab" aria-selected={tab === "video"} onClick={() => setTab("video")}>
            <Dot on={tab === "video"} /> Video
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase", alignSelf: "center" }}>
            ⌘ return&nbsp;to&nbsp;render &nbsp;·&nbsp; ⌘K presets
          </span>
        </div>
      </div>

      {/* Preset rail */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Style presets</span>
        {["Kodak Vision3 250D", "Anamorphic 2.39", "Studio Polaroid", "Handheld 16mm", "IMAX Reverie", "Neon Noir", "Golden Macro", "Brutalist Still", "Liminal Mall"].map((p, i) => (
          <button key={i} className="chip" style={{ whiteSpace: "nowrap" }}>{p}</button>
        ))}
        <button className="chip" style={{ whiteSpace: "nowrap", color: "var(--accent)", borderColor: "var(--accent)" }}>+ save current</button>
      </div>

      {tab === "image" ? <ImageStudio /> : <VideoStudio />}

      {/* Studio foot */}
      <div style={{ marginTop: 40, padding: "18px 0", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }} className="mono">
        <span style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase" }}>Session persists locally · nothing uploaded</span>
        <span style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase" }}>Press <kbd>?</kbd> for bindings · <kbd>⌘</kbd><kbd>↵</kbd> render</span>
      </div>
    </div>
  );
}

function Dot({ on }) {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? "var(--accent)" : "var(--ink-mute)", display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />;
}

/* ==================== IMAGE STUDIO ==================== */
function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(IMG_MODELS[0].id);
  const [size, setSize] = useState("2048x2048");
  const [seed, setSeed] = useState("");
  const [jobs, setJobs] = useState(seedImageJobs());

  function generate() {
    if (!prompt.trim()) return;
    const id = "img_" + Math.random().toString(36).slice(2, 10);
    const job = { id, prompt, model, size, seed: seed || "random", ts: Date.now(), status: "rendering" };
    setJobs(p => [job, ...p]);
    // Fake async completion
    setTimeout(() => {
      setJobs(p => p.map(j => j.id === id ? { ...j, status: "done", hue: Math.floor(Math.random() * 360), glyph: glyphFor(prompt) } : j));
    }, 2400 + Math.random() * 1800);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 28, marginTop: 28 }}>
      {/* Left: controls */}
      <aside style={{ position: "sticky", top: 80, alignSelf: "start", display: "flex", flexDirection: "column", gap: 18 }}>
        <Panel title="§ 01 Prompt" num="01">
          <textarea className="fld" rows={5} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the frame. Be specific about lens, light, stock, era." />
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {IMG_SUGGESTIONS.map((s, i) => <button key={i} className="chip" onClick={() => setPrompt(s)}>try #{i + 1}</button>)}
          </div>
        </Panel>

        <Panel title="§ 02 Engine" num="02">
          <ModelList models={IMG_MODELS} value={model} onChange={setModel} />
        </Panel>

        <Panel title="§ 03 Format" num="03">
          <Label>Size</Label>
          <Select value={size} onChange={setSize} options={IMG_SIZES.map(s => ({ id: s, label: s }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <Label>Seed</Label>
              <input className="fld" placeholder="random" value={seed} onChange={e => setSeed(e.target.value)} />
            </div>
            <div>
              <Label>Count</Label>
              <input className="fld" placeholder="1" defaultValue="1" />
            </div>
          </div>
        </Panel>

        <button className="btn primary lg" style={{ justifyContent: "center" }} onClick={generate} disabled={!prompt.trim()}>
          Render image <span className="ital serif">↵</span>
        </button>
        <p className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.08em", margin: 0, lineHeight: 1.6 }}>
          Engine: <span style={{ color: "var(--ink)" }}>{IMG_MODELS.find(m => m.id === model).label}</span>. Images render server-side. Download before URLs expire.
        </p>
      </aside>

      {/* Right: results */}
      <main>
        {jobs.length === 0 ? <EmptyCanvas kind="image" /> : <ImageGallery jobs={jobs} />}
      </main>
    </div>
  );
}

function seedImageJobs() {
  return [
    { id: "img_canyon", prompt: "A lone astronaut on a red-dust canyon rim at golden hour, reflective visor.", size: "2048x2048", model: "seedream-5-0-lite", seed: "42", ts: Date.now() - 120000, status: "done", hue: 28, glyph: "☉" },
    { id: "img_beetle", prompt: "Hyperreal macro of a translucent beetle on wet moss, studio light.", size: "2048x2048", model: "seedream-5-0-lite", seed: "random", ts: Date.now() - 240000, status: "done", hue: 120, glyph: "α" },
    { id: "img_tokyo", prompt: "Neon-drenched Tokyo alleyway after rain, anamorphic flare.", size: "1920x1080", model: "seedream-4-5-251128", seed: "random", ts: Date.now() - 360000, status: "done", hue: 210, glyph: "ψ" },
    { id: "img_stone", prompt: "Brutalist interior, concrete, single diagonal shaft of light.", size: "2048x2048", model: "seedream-5-0-lite", seed: "random", ts: Date.now() - 480000, status: "done", hue: 350, glyph: "◉" },
  ];
}

function ImageGallery({ jobs }) {
  return (
    <div>
      <GalleryHeader jobs={jobs} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {jobs.map(j => <ImageCard key={j.id} job={j} />)}
      </div>
    </div>
  );
}

function ImageCard({ job }) {
  const w = parseInt((job.size || "1x1").split("x")[0]);
  const h = parseInt((job.size || "1x1").split("x")[1]);
  const ratio = w && h ? `${w}/${h}` : "1/1";
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative" }}>
        {job.status === "done" ? (
          <PlaceholderTile ratio={ratio} hue={job.hue} label={job.id.toUpperCase()} meta={`${job.size} · seed ${job.seed}`} glyph={job.glyph} />
        ) : (
          <div style={{ aspectRatio: ratio, borderRadius: 12, border: "1px solid var(--line)", position: "relative", overflow: "hidden" }} className="shimmer">
            <div style={{ position: "absolute", left: 14, top: 14 }} className="mono" >
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "var(--accent)", marginRight: 8, verticalAlign: "middle", animation: "pulse 1.2s infinite" }} />
              <span style={{ fontSize: 10, color: "var(--ink)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Rendering…</span>
            </div>
            <div style={{ position: "absolute", right: 14, top: 14 }} className="mono" >
              <span style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.14em" }}>{job.id}</span>
            </div>
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
            <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: 2, background: "rgba(242,240,232,0.1)", borderRadius: 2, overflow: "hidden" }}>
              <div className="stripe" style={{ width: "60%", height: "100%" }} />
            </div>
          </div>
        )}
      </div>
      <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{timeAgo(job.ts)} · {job.model.replace("seedream-", "").replace("-251128", "")}</div>
          <div style={{ fontSize: 13, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.prompt}</div>
        </div>
        {job.status === "done" && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="chip" title="Save">↓</button>
            <button className="chip" title="Remix">↻</button>
            <button className="chip" title="More">⋯</button>
          </div>
        )}
      </figcaption>
    </figure>
  );
}

/* ==================== VIDEO STUDIO ==================== */
function VideoStudio() {
  const [model, setModel] = useState(VID_MODELS[0].id);
  const is20 = model === "seedance-2-0-pro";
  const [mode, setMode] = useState("t2v");
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [seed, setSeed] = useState("");
  const [cameraFixed, setCameraFixed] = useState(false);
  const [audio, setAudio] = useState(true);
  const [firstFrame, setFirstFrame] = useState(null);
  const [lastFrame, setLastFrame] = useState(null);
  const [jobs, setJobs] = useState(seedVideoJobs());

  function generate() {
    if (!prompt.trim()) return;
    const id = "vid_" + Math.random().toString(36).slice(2, 10);
    const job = { id, prompt, model, mode, resolution, duration, ratio, seed: seed || "random", ts: Date.now(), status: "queued", progress: 0 };
    setJobs(p => [job, ...p]);
    // Fake lifecycle: queued → running → succeeded
    const tick = (j) => {
      setTimeout(() => {
        setJobs(p => p.map(x => x.id === j.id ? { ...x, status: "running", progress: 0.08 } : x));
      }, 600);
      const iv = setInterval(() => {
        setJobs(p => p.map(x => {
          if (x.id !== j.id) return x;
          if (x.status !== "running") return x;
          const np = Math.min(1, (x.progress || 0) + 0.06 + Math.random() * 0.08);
          return { ...x, progress: np };
        }));
      }, 600);
      setTimeout(() => {
        clearInterval(iv);
        setJobs(p => p.map(x => x.id === j.id ? { ...x, status: "succeeded", progress: 1, hue: Math.floor(Math.random() * 360), glyph: glyphFor(prompt) } : x));
      }, 5200 + Math.random() * 1200);
    };
    tick(job);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 28, marginTop: 28 }}>
      {/* Controls */}
      <aside style={{ position: "sticky", top: 80, alignSelf: "start", display: "flex", flexDirection: "column", gap: 18 }}>
        <Panel title="§ 01 Engine" num="01">
          <ModelList models={VID_MODELS} value={model} onChange={v => { setModel(v); if (v !== "seedance-2-0-pro" && (duration === 15 || duration === -1)) setDuration(5); if (v !== "seedance-2-0-pro" && mode === "reference") setMode("t2v"); }} />
        </Panel>

        <Panel title="§ 02 Mode" num="02">
          <div style={{ display: "grid", gridTemplateColumns: is20 ? "repeat(4,1fr)" : "repeat(3,1fr)", gap: 8 }}>
            <ModeBtn active={mode === "t2v"} onClick={() => setMode("t2v")} label="Text" sub="to video" glyph="T" />
            <ModeBtn active={mode === "i2v"} onClick={() => setMode("i2v")} label="Image" sub="to video" glyph="I" />
            <ModeBtn active={mode === "first_last"} onClick={() => setMode("first_last")} label="First+Last" sub="keyframes" glyph="F" />
            {is20 && <ModeBtn active={mode === "reference"} onClick={() => setMode("reference")} label="Ref" sub="multimodal" glyph="R" />}
          </div>

          {(mode === "i2v" || mode === "first_last") && (
            <div style={{ display: "grid", gridTemplateColumns: mode === "first_last" ? "1fr 1fr" : "1fr", gap: 10, marginTop: 12 }}>
              <FrameSlot label={mode === "i2v" ? "Starting frame" : "First frame"} value={firstFrame} onChange={setFirstFrame} />
              {mode === "first_last" && <FrameSlot label="Last frame" value={lastFrame} onChange={setLastFrame} />}
            </div>
          )}
          {mode === "reference" && <ReferencePanel />}
        </Panel>

        <Panel title="§ 03 Prompt" num="03">
          <textarea className="fld" rows={5} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={mode === "reference" ? "Use @Image1 as subject, @Image2 as environment…" : "Action, camera, mood, pace…"} />
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VID_SUGGESTIONS.map((s, i) => <button key={i} className="chip" onClick={() => setPrompt(s)}>try #{i + 1}</button>)}
          </div>
        </Panel>

        <Panel title="§ 04 Parameters" num="04">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><Label>Res</Label><Select value={resolution} onChange={setResolution} options={[{ id: "480p", label: "480p" }, { id: "720p", label: "720p" }, { id: "1080p", label: "1080p" }]} /></div>
            <div><Label>Duration</Label>
              <Select value={String(duration)} onChange={v => setDuration(Number(v))} options={[
                { id: "5", label: "5 s" }, { id: "10", label: "10 s" },
                ...(is20 ? [{ id: "15", label: "15 s" }, { id: "-1", label: "Auto" }] : [])
              ]} />
            </div>
            <div><Label>Ratio</Label><Select value={ratio} onChange={setRatio} options={RATIOS.map(r => ({ id: r, label: r }))} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Label>Seed</Label>
            <input className="fld" placeholder="random" value={seed} onChange={e => setSeed(e.target.value)} />
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: is20 ? "1fr 1fr" : "1fr", gap: 8 }}>
            <Toggle pressed={cameraFixed} onClick={() => setCameraFixed(v => !v)} label="Fixed camera" hint="Disable pan / push-in" />
            {is20 && <Toggle pressed={audio} onClick={() => setAudio(v => !v)} label="Generate audio" hint="Native soundtrack" />}
          </div>
        </Panel>

        <button className="btn primary lg" style={{ justifyContent: "center" }} onClick={generate} disabled={!prompt.trim()}>
          Render video <span className="ital serif">↵</span>
        </button>
        <p className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.08em", margin: 0, lineHeight: 1.6 }}>
          Engine: <span style={{ color: "var(--ink)" }}>{VID_MODELS.find(m => m.id === model).label}</span>. Video renders async — typically 1–3 min for 5s @ 720p.
        </p>
      </aside>

      {/* Results */}
      <main>
        {jobs.length === 0 ? <EmptyCanvas kind="video" /> : <VideoQueue jobs={jobs} />}
      </main>
    </div>
  );
}

function seedVideoJobs() {
  return [
    { id: "vid_cliffrun", prompt: "Tracking shot of a woman walking along a windswept cliff, flowing red dress, ocean mist.", model: "seedance-1-5-pro-251215", mode: "t2v", resolution: "720p", duration: 10, ratio: "21:9", seed: "random", ts: Date.now() - 60000, status: "succeeded", progress: 1, hue: 8, glyph: "β" },
    { id: "vid_colony", prompt: "Close-up of a bee landing on lavender, slow motion, golden hour, macro lens.", model: "seedance-1-5-pro-251215", mode: "t2v", resolution: "1080p", duration: 5, ratio: "16:9", seed: "42", ts: Date.now() - 180000, status: "succeeded", progress: 1, hue: 64, glyph: "α" },
  ];
}

function VideoQueue({ jobs }) {
  return (
    <div>
      <GalleryHeader jobs={jobs} video />
      <div style={{ display: "grid", gap: 16 }}>
        {jobs.map(j => <VideoCard key={j.id} job={j} />)}
      </div>
    </div>
  );
}

function VideoCard({ job }) {
  const ratio = (job.ratio || "16:9").replace(":", "/");
  const statusColor = job.status === "succeeded" ? "oklch(0.8 0.18 145)" : job.status === "failed" ? "oklch(0.7 0.2 25)" : "var(--accent)";
  return (
    <article style={{ border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", background: "#07070d" }}>
      <div style={{ position: "relative" }}>
        {job.status === "succeeded" ? (
          <PlaceholderTile ratio={ratio} hue={job.hue} glyph={job.glyph} label={job.id.toUpperCase()} meta={`${job.resolution} · ${job.duration}s · ${job.ratio}`} />
        ) : (
          <div style={{ aspectRatio: ratio, position: "relative", overflow: "hidden", background: "linear-gradient(180deg, #0a0a11, #050508)" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(90deg, rgba(242,240,232,0.025) 0 1px, transparent 1px 80px), repeating-linear-gradient(0deg, rgba(242,240,232,0.025) 0 1px, transparent 1px 80px)" }} />
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <div style={{ textAlign: "center" }}>
                <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(242,240,232,0.1)" strokeWidth="2" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray={`${Math.round((job.progress || 0) * 113)} 113`} strokeLinecap="round" />
                </svg>
                <div className="mono" style={{ marginTop: 10, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink)" }}>
                  {job.status} · {Math.round((job.progress || 0) * 100)}%
                </div>
              </div>
            </div>
            <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
          </div>
        )}
      </div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="mono">
            <span style={{ width: 6, height: 6, borderRadius: 999, background: statusColor }} />
            <span style={{ fontSize: 10, color: "var(--ink)", letterSpacing: "0.16em", textTransform: "uppercase" }}>{job.status}</span>
            <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>{job.id}</span>
            <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>· {timeAgo(job.ts)}</span>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "10px 0 0", color: "var(--ink)" }}>{job.prompt}</p>
          <div className="mono" style={{ marginTop: 10, fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.1em" }}>
            {job.model.replace("seedance-", "")} · {job.mode} · {job.resolution} · {job.duration}s · {job.ratio} · seed {job.seed}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {job.status === "succeeded" && <>
            <button className="chip" title="Play">▶</button>
            <button className="chip" title="Save">↓</button>
            <button className="chip" title="Remix">↻</button>
          </>}
          {(job.status === "queued" || job.status === "running") && <button className="chip" title="Cancel">✕</button>}
        </div>
      </div>
    </article>
  );
}

/* ==================== Shared panel / fields ==================== */
function Panel({ title, num, children }) {
  return (
    <section style={{ border: "1px solid var(--line)", borderRadius: 14, background: "#07070d", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase" }}>{title}</div>
        <span className="serif ital" style={{ fontSize: 18, color: "var(--ink-mute)", lineHeight: 1 }}>{num}</span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function Label({ children }) {
  return <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find(o => o.id === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="fld" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", cursor: "pointer" }} onClick={() => setOpen(v => !v)}>
        <span>{cur?.label ?? value}</span>
        <span style={{ color: "var(--ink-dim)" }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 40, background: "#0c0c14", border: "1px solid var(--line-strong)", borderRadius: 10, padding: 4, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
          {options.map(o => (
            <button key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: o.id === value ? "var(--accent-soft)" : "transparent", color: "var(--ink)", borderRadius: 6, fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelList({ models, value, onChange }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {models.map(m => (
        <button key={m.id} onClick={() => onChange(m.id)}
          className="mode"
          aria-pressed={value === m.id}
          style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12 }}>
          <span className="mode-dot" />
          <span style={{ textAlign: "left" }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.label}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.1em", marginTop: 2 }}>{m.hint}</div>
          </span>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{value === m.id ? "ACTIVE" : ""}</span>
        </button>
      ))}
    </div>
  );
}

function ModeBtn({ active, onClick, label, sub, glyph }) {
  return (
    <button className="mode" aria-pressed={active} onClick={onClick}>
      <span className="serif" style={{ fontSize: 26, lineHeight: 1, color: active ? "var(--accent)" : "var(--ink)" }}>{glyph}</span>
      <span>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>{sub}</div>
      </span>
    </button>
  );
}

function Toggle({ pressed, onClick, label, hint }) {
  return (
    <button className="toggle" aria-pressed={pressed} onClick={onClick}>
      <span>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.1em", marginTop: 2, textTransform: "uppercase" }}>{hint}</div>
      </span>
      <span className="sw" />
    </button>
  );
}

function FrameSlot({ label, value, onChange }) {
  const inputRef = useRef(null);
  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(f);
  }
  return (
    <div>
      <Label>{label}</Label>
      <label style={{ position: "relative", display: "grid", placeItems: "center", aspectRatio: "16/9", border: "1px dashed var(--line-strong)", borderRadius: 10, background: "#0a0a11", cursor: "pointer", overflow: "hidden" }}>
        {value ? <>
          <img src={value} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <button onClick={(e) => { e.preventDefault(); onChange(null); }} style={{ position: "absolute", right: 6, top: 6, width: 22, height: 22, borderRadius: 999, background: "rgba(0,0,0,0.7)", color: "var(--ink)", border: "none", cursor: "pointer", fontSize: 11 }}>✕</button>
        </> : <>
          <div style={{ textAlign: "center", color: "var(--ink-dim)" }}>
            <div className="serif" style={{ fontSize: 34, lineHeight: 1 }}>+</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4 }}>Upload frame</div>
          </div>
        </>}
        <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
      </label>
    </div>
  );
}

function ReferencePanel() {
  const [refs, setRefs] = useState([{ url: "", role: "subject" }]);
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 10, background: "#0a0a11" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Label>References</Label>
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{refs.length}/9 · tag as @Image{"{n}"}</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {refs.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "44px 1fr 100px 28px", gap: 6, alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>@Image{i + 1}</span>
            <input className="fld" style={{ padding: "7px 10px", fontSize: 12 }} placeholder="https://image.url/…" value={r.url} onChange={e => setRefs(rs => rs.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            <Select value={r.role} onChange={v => setRefs(rs => rs.map((x, j) => j === i ? { ...x, role: v } : x))}
              options={[{ id: "subject", label: "Subject" }, { id: "environment", label: "Environment" }, { id: "motion", label: "Motion" }]} />
            <button className="chip" style={{ justifyContent: "center", padding: 0, width: 28, height: 28 }} onClick={() => refs.length > 1 && setRefs(rs => rs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => refs.length < 9 && setRefs(rs => [...rs, { url: "", role: "subject" }])} style={{ marginTop: 8, width: "100%", padding: "8px", border: "1px dashed var(--line-strong)", borderRadius: 8, background: "transparent", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Add reference</button>
    </div>
  );
}

function GalleryHeader({ jobs, video }) {
  const total = jobs.length;
  const running = jobs.filter(j => j.status === "rendering" || j.status === "running" || j.status === "queued").length;
  const done = jobs.filter(j => j.status === "done" || j.status === "succeeded").length;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 16px" }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase" }}>
        Session ledger · {video ? "video" : "image"}
      </div>
      <div style={{ display: "flex", gap: 14 }} className="mono">
        <Stat label="In queue" val={running} />
        <Stat label="Rendered" val={done} />
        <Stat label="Total" val={total} />
      </div>
    </div>
  );
}
function Stat({ label, val }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="serif" style={{ fontSize: 22, lineHeight: 1 }}>{String(val).padStart(2, "0")}</div>
      <div style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function EmptyCanvas({ kind }) {
  return (
    <div style={{ border: "1px dashed var(--line)", borderRadius: 16, padding: "80px 20px", textAlign: "center", background: "#07070d", position: "relative", overflow: "hidden" }}>
      <div className="serif ital" style={{ fontSize: 140, lineHeight: 1, color: "rgba(242,240,232,0.06)", position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)" }}>lumen</div>
      <div style={{ position: "relative" }}>
        <div className="plate mono" style={{ justifyContent: "center", display: "inline-flex" }}>§ awaiting input</div>
        <h3 className="serif" style={{ fontSize: 40, margin: "12px 0 6px", letterSpacing: "-0.02em" }}>The page is <span className="ital">blank.</span></h3>
        <p style={{ color: "var(--ink-dim)", fontSize: 14, maxWidth: 420, margin: "0 auto" }}>
          Write a prompt on the left. {kind === "video" ? "Seedance will render an async shot and deliver it here." : "Seedream will lay the still down in seconds."}
        </p>
      </div>
    </div>
  );
}

/* utils */
function glyphFor(p) {
  const letters = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "λ", "μ", "ν", "φ", "ψ", "Ω", "Λ", "Ξ", "☉", "✦", "◉"];
  const seed = (p || "").length + (p || "").charCodeAt(0 || 0);
  return letters[seed % letters.length];
}
function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  return Math.floor(d / 3600) + "h ago";
}

window.Lumen.Studio = Studio;
