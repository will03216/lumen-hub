/* Landing — cinematic editorial home */
const { PlaceholderTile, SectionHead, Ticker } = window.Lumen;

function Landing({ setRoute }) {
  return (
    <div>
      {/* HERO */}
      <section style={{ position: "relative", padding: "48px 28px 40px", maxWidth: 1440, margin: "0 auto" }}>
        <div className="glow" />
        {/* Top meta rail */}
        <div className="rise" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 36 }}>
          <span>Vol. 04 · 2026</span>
          <span style={{ textAlign: "center" }}>A Studio for Synthetic Cinema</span>
          <span style={{ textAlign: "right" }}>SEEDREAM × SEEDANCE</span>
        </div>

        {/* The mega headline */}
        <h1 className="mega rise rise-2" style={{ textAlign: "center", marginTop: 0, marginBottom: 0 }}>
          Direct <span style={{ color: "var(--accent)" }}>light</span><br />
          into <span className="ital" style={{ fontFamily: "Instrument Serif, serif" }}>motion.</span>
        </h1>

        <div className="rise rise-3" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", gap: 24, marginTop: 48, paddingBottom: 24, borderBottom: "1px solid var(--line)" }}>
          <p style={{ maxWidth: 360, color: "var(--ink-dim)", fontSize: 14, lineHeight: 1.55, margin: 0 }}>
            Lumen Hub is a self-hosted atelier for generative imagery &amp; video. Seedream renders stills at four-thousand pixels. Seedance stages ten-second shots with native motion.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn primary lg" onClick={() => setRoute("studio")}>
              Enter the studio
              <span style={{ fontFamily: "Instrument Serif, serif", fontStyle: "italic" }}>→</span>
            </button>
            <button className="btn lg">Watch reel</button>
          </div>
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Latest frame</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>task_ff29a1 · 07s ago</div>
          </div>
        </div>

        {/* Mosaic grid */}
        <div className="rise rise-4" style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 5" }}>
            <PlaceholderTile label="CANYON / SEEDREAM 5.0" meta="2048×2048" hue={28} ratio="4/5" glyph="☉" />
          </div>
          <div style={{ gridColumn: "span 4", display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}>
            <PlaceholderTile label="DESERT STRIDE" meta="i2v · 720p" hue={64} ratio="auto" glyph="α" />
            <PlaceholderTile label="NEON ALLEY" meta="t2v · 1080p" hue={210} ratio="auto" glyph="ψ" />
          </div>
          <div style={{ gridColumn: "span 3", display: "grid", gridTemplateRows: "1fr 1fr", gap: 12 }}>
            <PlaceholderTile label="UNDERWATER BLOOM" meta="5.0 LITE" hue={190} ratio="auto" glyph="✦" />
            <PlaceholderTile label="STATUE / 9:16" meta="SEED 42" hue={10} ratio="auto" glyph="Λ" />
          </div>
        </div>

        {/* Footnote rail */}
        <div className="mono" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span>Fig. 01 · cinematic-wide</span>
          <span>Fig. 02 · handheld-loose</span>
          <span>Fig. 03 · anamorphic-2.39</span>
          <span>Fig. 04 · tripod-static</span>
        </div>
      </section>

      {/* TICKER */}
      <Ticker items={[
        { n: "01", t: "Seedream 5.0 Lite — text to image, 4K, adaptive ratio" },
        { n: "02", t: "Seedance 1.5 Pro — t2v · i2v · first+last frame" },
        { n: "03", t: "Seedance 2.0 — multi-reference · 15s · native audio" },
        { n: "04", t: "self-hosted · no tracking · BYO key" },
        { n: "05", t: "Vol. 04 — released April 2026" },
      ]} />

      {/* CAPABILITIES */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "0 28px" }}>
        <SectionHead
          index="§01"
          title="INSTRUMENTS"
          sub={<>Two engines. One <span className="ital serif">atelier</span>.</>}
          right={<div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 10 }}>Swap freely · keep your prompt</div>}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gap: 16, padding: "28px 0 64px" }}>
          <InstrumentCard
            idx="A"
            name="Seedream"
            version="5.0 Lite"
            kicker="Still images"
            desc="Photoreal subjects, product plates, illustration. Responds to art direction in plain language — lenses, stocks, lighting, wardrobe, era."
            bullets={["Text → Image", "Image editing", "Multi-image fusion", "Up to 4K"]}
            glyph="S"
            hue={18}
            onGo={() => setRoute("studio")}
          />
          <InstrumentCard
            idx="B"
            name="Seedance"
            version="1.5 Pro / 2.0"
            kicker="Moving images"
            desc="Cinematic motion with camera control. Stage a ten-second shot from a single frame, or fill the gap between a first and last keyframe."
            bullets={["Text → Video", "Image → Video", "First + last frame", "Multi-reference · audio (2.0)"]}
            glyph="D"
            hue={210}
            onGo={() => setRoute("studio")}
          />
        </div>

        {/* Feature strip */}
        <SectionHead
          index="§02"
          title="METHOD"
          sub={<>Language is the <span className="ital serif">lens.</span></>}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, padding: "28px 0 56px" }}>
          {[
            { n: "i.", t: "Prompt, directed", b: "Camera, ratio, duration and motion live inside your sentence. No UI switching — only intention." },
            { n: "ii.", t: "Async by design", b: "Video renders in the background. Stage the next shot while the last one bakes. Progress streams back to the dock." },
            { n: "iii.", t: "Keyframe control", b: "Hand Seedance a first frame, a last frame, or both. It fills in the motion between — respecting your composition." },
          ].map((f, i) => (
            <div key={i} style={{ padding: "28px 28px 28px 0", borderLeft: i === 0 ? "none" : "1px solid var(--line)", paddingLeft: i === 0 ? 0 : 28 }}>
              <div className="serif" style={{ fontSize: 44, color: "var(--accent)", lineHeight: 1 }}>{f.n}</div>
              <h3 className="serif" style={{ fontSize: 28, margin: "12px 0 10px", letterSpacing: "-0.015em" }}>{f.t}</h3>
              <p style={{ color: "var(--ink-dim)", fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 340 }}>{f.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BIG QUOTE STRIP */}
      <section style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", background: "#07070d" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "80px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
          <div>
            <div className="plate mono">§03 — MANIFEST</div>
            <p className="serif" style={{ fontSize: "clamp(28px, 3.4vw, 48px)", lineHeight: 1.08, margin: "18px 0 0", letterSpacing: "-0.015em", textWrap: "balance" }}>
              A studio should feel like a <span className="ital">room</span> — dim, quiet, attentive. The tools should recede. Only the <span className="ital">picture</span> should speak.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PlaceholderTile label="COLOR / 3200K" meta="#1 of 4" hue={36} ratio="3/4" glyph="φ" />
            <PlaceholderTile label="MOTION / 24FPS" meta="#2 of 4" hue={260} ratio="3/4" glyph="μ" />
          </div>
        </div>
      </section>

      {/* SHOT LIST */}
      <section style={{ maxWidth: 1440, margin: "0 auto", padding: "0 28px" }}>
        <SectionHead
          index="§04"
          title="SHOT LIST"
          sub={<>Recently <span className="ital serif">developed.</span></>}
          right={<button className="btn sm">All frames →</button>}
        />
        <div style={{ padding: "28px 0", display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
          {[
            ["HUMMINGBIRD", "MACRO · 5.0", 12, "3/4", "α"],
            ["TOKYO TUNNEL", "i2v · 720P", 200, "3/4", "Ω"],
            ["RED DRESS CLIFF", "t2v · 21:9", 60, "3/4", "β"],
            ["BRUTALIST INTERIOR", "STILL · 4K", 340, "3/4", "◉"],
            ["ICE SHARD MACRO", "STILL · 1080", 195, "3/4", "λ"],
            ["PARADE, NIGHT", "t2v · 10s", 18, "3/4", "ε"],
          ].map(([l, m, h, r, g], i) => (
            <PlaceholderTile key={i} label={l} meta={m} hue={h} ratio={r} glyph={g} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ borderTop: "1px solid var(--line)", padding: "80px 28px 96px", maxWidth: 1440, margin: "0 auto", textAlign: "center" }}>
        <div className="plate mono" style={{ justifyContent: "center", display: "inline-flex" }}>§05 — Go</div>
        <h2 className="mega" style={{ fontSize: "clamp(56px, 10vw, 160px)", margin: "12px 0 24px" }}>
          Your <span className="ital" style={{ color: "var(--accent)" }}>first frame</span> awaits.
        </h2>
        <button className="btn primary lg" onClick={() => setRoute("studio")}>
          Begin a session <span className="ital serif">→</span>
        </button>
        <div className="mono" style={{ marginTop: 16, fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          No account · keys stay on your machine · <kbd>G</kbd> to skip the tour
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "36px 28px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 24 }}>
          <div>
            <div className="serif" style={{ fontSize: 32, letterSpacing: "-0.02em" }}>Lumen Hub</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4, letterSpacing: "0.1em" }}>est. 2026 · self-hosted · no tracking</div>
          </div>
          {[
            { h: "Instruments", l: ["Seedream", "Seedance", "Reference", "Keyframes"] },
            { h: "Method", l: ["Docs", "Prompt atlas", "Changelog", "Status"] },
            { h: "Credits", l: ["Built on BytePlus", "Next.js 16", "Source on GitHub", "License · MIT"] },
          ].map((c, i) => (
            <div key={i}>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase" }}>{c.h}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 8 }}>
                {c.l.map((x, j) => <li key={j} style={{ fontSize: 13 }}><a href="#" onClick={e => e.preventDefault()}>{x}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--line)", padding: "16px 28px", maxWidth: 1440, margin: "0 auto", display: "flex", justifyContent: "space-between" }} className="mono">
          <span style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.1em" }}>© LUMEN · VOL. 04 · MMXXVI</span>
          <span style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.1em" }}>RENDERED IN THE DARK</span>
        </div>
      </footer>
    </div>
  );
}

function InstrumentCard({ idx, name, version, kicker, desc, bullets, glyph, hue, onGo }) {
  return (
    <div style={{ gridColumn: "span 6", position: "relative", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 16, background: "#07070d" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr" }}>
        <div style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: 16, minHeight: 380 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Instrument {idx}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.1em" }}>{kicker.toUpperCase()}</div>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 64, lineHeight: 0.95, letterSpacing: "-0.025em" }}>{name}</div>
            <div className="serif ital" style={{ fontSize: 24, color: "var(--ink-dim)", marginTop: 4 }}>{version}</div>
          </div>
          <p style={{ color: "var(--ink-dim)", fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 420 }}>{desc}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto" }}>
            {bullets.map((b, i) => <span key={i} className="chip">{b}</span>)}
          </div>
          <button className="btn" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={onGo}>
            Open instrument <span className="ital serif">→</span>
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <PlaceholderTile ratio="auto" hue={hue} glyph={glyph} label={name.toUpperCase()} meta={version} />
        </div>
      </div>
    </div>
  );
}

window.Lumen.Landing = Landing;
