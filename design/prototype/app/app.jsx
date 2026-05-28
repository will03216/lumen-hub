/* App shell — route between landing & studio */
const { Header, Landing, Studio } = window.Lumen;

function App() {
  const [route, setRoute] = React.useState(() => {
    return (window.__lumen_initial_route) || document.documentElement.dataset.route || "landing";
  });

  React.useEffect(() => {
    function onState(e) {
      if (e.detail && e.detail.route && e.detail.route !== route) setRoute(e.detail.route);
    }
    window.addEventListener("__lumen_state", onState);
    return () => window.removeEventListener("__lumen_state", onState);
  }, [route]);

  function go(next) {
    setRoute(next);
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { route: next } }, '*'); } catch (_) { }
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <Header route={route} setRoute={go} />
      {route === "landing" ? <Landing setRoute={go} /> : <Studio />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

/* pulse keyframe */
const styl = document.createElement("style");
styl.textContent = "@keyframes pulse{0%{opacity:1}50%{opacity:0.4}100%{opacity:1}}";
document.head.appendChild(styl);
