/* Shared primitives for Lumen Hub — placeholders, tiles, ticker, header */
const { useState, useEffect, useRef, useMemo } = React;

/* ---------- Placeholder tile (striped / duotone / scanline) ---------- */
function PlaceholderTile({ label, meta, hue = 28, ratio = "3/4", kind, glyph, children, dark = false }) {
  const mode = kind || document.documentElement.dataset.hero || "stripes";
  const [h] = useState(hue);
  const bg = useMemo(() => {
    if (mode === "duotone") {
      return {
        background: `
          radial-gradient(circle at 30% 20%, oklch(0.55 0.18 ${h}) 0%, transparent 60%),
          radial-gradient(circle at 80% 90%, oklch(0.2 0.12 ${(h + 180) % 360}) 0%, transparent 55%),
          linear-gradient(180deg, oklch(0.18 0.08 ${h}), oklch(0.08 0.04 ${h}))
        `
      };
    }
    if (mode === "scan") {
      return {
        background: `
          linear-gradient(180deg, oklch(0.22 0.08 ${h}), oklch(0.08 0.03 ${h}))
        `
      };
    }
    // stripes (default)
    return {
      background: `
        repeating-linear-gradient(100deg, oklch(0.16 0.06 ${h}) 0 18px, oklch(0.11 0.05 ${h}) 18px 36px)
      `
    };
  }, [mode, h]);

  return (
    <div className="tile" style={{ position: "relative", aspectRatio: ratio, overflow: "hidden", borderRadius: 12, border: "1px solid var(--line)", ...bg }}>
      {/* scanline overlay for scan mode */}
      {mode === "scan" && <div className="scan" style={{ position: "absolute", inset: 0 }} />}
      {/* faint grid */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.55))",
        mixBlendMode: "multiply"
      }} />
      {/* corners */}
      <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
      {/* big glyph placeholder */}
      {glyph && <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        fontFamily: "Instrument Serif, serif", fontSize: "clamp(56px, 14vw, 180px)",
        color: "rgba(242,240,232,0.88)", lineHeight: 1, fontStyle: "italic"
      }}>{glyph}</div>}
      {children}
      {label && <div className="tilelabel">{label}</div>}
      {meta && <div className="tilemeta">{meta}</div>}
    </div>
  );
}

/* ---------- Lumen wordmark ---------- */
function Wordmark({ size = 20 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, letterSpacing: "-0.01em" }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="4.5" fill="var(--accent)" />
        <circle cx="12" cy="12" r="1.2" fill="var(--bg)" />
      </svg>
      <span className="serif" style={{ fontSize: size + 6, letterSpacing: "-0.02em" }}>Lumen</span>
      <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: "0.16em", textTransform: "uppercase", marginLeft: 2 }}>HUB</span>
    </div>
  );
}

/* ---------- Header ---------- */
function Header({ route, setRoute }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 60,
      backdropFilter: "blur(14px)",
      background: "rgba(5,5,10,0.65)",
      borderBottom: "1px solid var(--line)"
    }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "14px 28px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 24 }}>
        <a onClick={() => setRoute("landing")} style={{ cursor: "pointer" }}>
          <Wordmark />
        </a>
        <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="railtab" aria-selected={route === "landing"} onClick={() => setRoute("landing")}>Index</button>
          <button className="railtab" aria-selected={route === "studio"} onClick={() => setRoute("studio")}>Studio</button>
          <button className="railtab">Reels</button>
          <button className="railtab">Log</button>
        </nav>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.08em" }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "oklch(0.8 0.18 145)", marginRight: 6, verticalAlign: "middle" }} />
            ENGINE ONLINE
          </span>
          <button className="btn sm">
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em" }}>⌘K</span>
          </button>
          <button className="btn primary sm" onClick={() => setRoute("studio")}>Enter Studio →</button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Ticker ---------- */
function Ticker({ items }) {
  return (
    <div className="ticker">
      <div className="marquee-track">
        {[0, 1].map(dup => (
          <div key={dup} style={{ display: "flex", gap: 72 }}>
            {items.map((it, i) => (
              <span key={i} className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                {it.n && <span style={{ color: "var(--accent)", marginRight: 10 }}>{it.n}</span>}
                {it.t}
                <span className="dot" style={{ marginLeft: 72, marginRight: -44, transform: "translateY(-2px)" }} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Section head ---------- */
function SectionHead({ index, title, sub, right }) {
  return (
    <div className="section-head">
      <div>
        <div className="plate mono">{index} — {title}</div>
        <h2 className="serif" style={{ fontSize: "clamp(32px, 4.4vw, 56px)", margin: "8px 0 0", letterSpacing: "-0.02em", lineHeight: 1, textWrap: "pretty" }}>
          {sub}
        </h2>
      </div>
      {right}
    </div>
  );
}

window.Lumen = window.Lumen || {};
Object.assign(window.Lumen, { PlaceholderTile, Wordmark, Header, Ticker, SectionHead });
