import { useState, useEffect, useRef, useMemo } from "react";

const RESULTS = ["Pending", "Win", "Loss", "Push", "Cashout"];
const BET_TYPES = {
  PrizePicks: ["Power play", "Flex play"],
  Robinhood: ["Prediction market", "Stock trade"],
  _default: ["Standard bet"],
};

const DEFAULT_UNITS = ["Points", "Rebounds", "Assists", "PRA", "Fantasy Score", "3PTM", "Steals", "Blocks", "Turnovers", "Pts+Rebs", "Pts+Asts", "Rebs+Asts"];
const TEAM_COLORS = {
  ATL: "#E03A3E", BOS: "#007A33", BKN: "#000000", CHA: "#1D1160", CHI: "#CE1141",
  CLE: "#860038", DAL: "#00538C", DEN: "#0E2240", DET: "#C8102E", GSW: "#1D428A",
  HOU: "#CE1141", IND: "#002D62", LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9",
  MIA: "#98002E", MIL: "#00471B", MIN: "#0C2340", NOP: "#0C2340", NYK: "#F58426",
  OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#1D1160", POR: "#E03A3E",
  SAC: "#5A2D81", SAS: "#C4CED4", TOR: "#CE1141", UTA: "#002B5C", WAS: "#002B5C",
};

const T = {
  bg: "#17171E", surface: "#1F1F28", card: "#262630", cardHover: "#2C2C38",
  border: "rgba(255,255,255,0.07)", borderLight: "rgba(255,255,255,0.12)",
  text: "#EAEAF0", textSec: "#8A8A9E", textTer: "#5A5A6E",
  accent: "#7C6CFF", accentSoft: "rgba(124,108,255,0.12)", accentText: "#B4A8FF",
  green: "#34D399", greenSoft: "rgba(52,211,153,0.12)", greenText: "#6EE7B7",
  red: "#F87171", redSoft: "rgba(248,113,113,0.12)", redText: "#FCA5A5",
  yellow: "#FBBF24", yellowSoft: "rgba(251,191,36,0.12)", yellowText: "#FDE68A",
};

const PCOLORS = [
  { bg: "rgba(124,108,255,0.15)", text: "#B4A8FF" },
  { bg: "rgba(52,211,153,0.15)", text: "#6EE7B7" },
  { bg: "rgba(251,146,60,0.15)", text: "#FDBA74" },
  { bg: "rgba(248,113,113,0.15)", text: "#FCA5A5" },
  { bg: "rgba(56,189,248,0.15)", text: "#7DD3FC" },
  { bg: "rgba(251,191,36,0.15)", text: "#FDE68A" },
  { bg: "rgba(232,121,249,0.15)", text: "#F0ABFC" },
  { bg: "rgba(148,163,184,0.15)", text: "#CBD5E1" },
];

function pc(p, platforms) { return PCOLORS[(platforms.indexOf(p) >= 0 ? platforms.indexOf(p) : 0) % PCOLORS.length]; }
function fmt(n) { return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function calcPL(b) {
  if (b.result === "Win") return { pl: b.payout - b.stake, resolved: true };
  if (b.result === "Loss") return { pl: -b.stake, resolved: true };
  if (b.result === "Push") return { pl: 0, resolved: true };
  if (b.result === "Cashout") return { pl: (b.cashoutAmt || 0) - b.stake, resolved: true };
  return { pl: 0, resolved: false };
}

const STORE_KEY = "bet-tracker-data";
const API_KEY_KEY = "bet-tracker-api-key";
function loadData() { try { const r = localStorage.getItem(STORE_KEY); if (r) return JSON.parse(r); } catch {} return null; }
function saveData(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch {} }
function getApiKey() { try { return localStorage.getItem(API_KEY_KEY) || ""; } catch { return ""; } }
function setApiKeyStore(k) { try { localStorage.setItem(API_KEY_KEY, k); } catch {} }

const INIT = { platforms: ["Robinhood", "PrizePicks"], bets: [], transactions: [], players: [], units: [...DEFAULT_UNITS] };

function migrateData(d) {
  const out = { ...INIT, ...d };
  if (!out.players) out.players = [];
  if (!out.units) out.units = [...DEFAULT_UNITS];
  out.bets = out.bets.map(b => {
    if (!b.picks && b.description) return { ...b, picks: [{ player: b.description, direction: "Over", line: "", unit: "", team: "" }] };
    return { ...b, picks: b.picks || [] };
  });
  return out;
}

function AutoInput({ value, onChange, suggestions, placeholder, style: sty }) {
  const [focused, setFocused] = useState(false);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 6);
  const show = focused && value.length > 0 && filtered.length > 0;
  return (
    <div style={{ position: "relative" }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={sty}
        onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)} />
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: T.card, border: "1px solid " + T.borderLight, borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: "auto" }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => { onChange(s); setFocused(false); }}
              style={{ padding: "8px 12px", fontSize: 13, color: T.text, cursor: "pointer", borderBottom: "1px solid " + T.border }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(() => migrateData(loadData() || INIT));
  const [tab, setTab] = useState("bets");
  const [filterPlat, setFilterPlat] = useState("All");
  const [filterResult, setFilterResult] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showTxForm, setShowTxForm] = useState(false);
  const [showPlatForm, setShowPlatForm] = useState(false);
  const [newPlat, setNewPlat] = useState("");
  const [chartView, setChartView] = useState("monthly");
  const [expandedBet, setExpandedBet] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [apiKey, setApiKeyState] = useState(() => getApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerTeam, setNewPlayerTeam] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const blankPick = () => ({ player: "", direction: "Over", line: "", unit: "", team: "" });
  const blankBet = () => ({ date: new Date().toISOString().slice(0, 10), platform: data.platforms[0] || "", betType: "", picks: [blankPick()], legs: "", stake: "", payout: "", result: "Pending", cashoutAmt: "", notes: "" });
  const [form, setForm] = useState(blankBet());
  const blankTx = () => ({ date: new Date().toISOString().slice(0, 10), platform: data.platforms[0] || "", type: "Deposit", amount: "", notes: "" });
  const [txForm, setTxForm] = useState(blankTx());

  useEffect(() => { saveData(data); }, [data]);
  const update = (fn) => setData(prev => fn(prev));

  const playerSuggestions = useMemo(() => data.players.map(p => p.team ? p.name + " (" + p.team + ")" : p.name), [data.players]);

  const ensurePlayer = (name, team) => {
    if (!name) return;
    const clean = name.trim();
    update(d => {
      const ex = d.players.find(p => p.name.toLowerCase() === clean.toLowerCase());
      if (ex) { if (team && !ex.team) return { ...d, players: d.players.map(p => p.name.toLowerCase() === clean.toLowerCase() ? { ...p, team } : p) }; return d; }
      return { ...d, players: [...d.players, { name: clean, team: team || "" }] };
    });
  };
  const ensureUnit = (unit) => { if (!unit) return; const c = unit.trim(); update(d => d.units.some(u => u.toLowerCase() === c.toLowerCase()) ? d : { ...d, units: [...d.units, c] }); };

  const updatePick = (idx, field, value) => setForm(f => ({ ...f, picks: f.picks.map((p, i) => i === idx ? { ...p, [field]: value } : p) }));
  const addPick = () => setForm(f => ({ ...f, picks: [...f.picks, blankPick()] }));
  const removePick = (idx) => setForm(f => ({ ...f, picks: f.picks.filter((_, i) => i !== idx) }));

  const parsePlayerInput = (val) => { const m = val.match(/^(.+?)\s*\((\w+)\)$/); return m ? { name: m[1].trim(), team: m[2].trim() } : { name: val.trim(), team: "" }; };

  const addPlatform = () => { const n = newPlat.trim(); if (!n || data.platforms.includes(n)) return; update(d => ({ ...d, platforms: [...d.platforms, n] })); setNewPlat(""); setShowPlatForm(false); };
  const removePlatform = (p) => { if (!confirm("Remove " + p + "?")) return; update(d => ({ ...d, platforms: d.platforms.filter(x => x !== p) })); };

  const submitBet = () => {
    const stake = parseFloat(form.stake), payout = parseFloat(form.payout);
    if (!stake || stake <= 0 || !payout || payout <= 0 || !form.platform) return;
    form.picks.forEach(pk => { const { name, team } = parsePlayerInput(pk.player); ensurePlayer(name, pk.team || team); ensureUnit(pk.unit); });
    const cleanPicks = form.picks.map(pk => { const { name, team } = parsePlayerInput(pk.player); return { ...pk, player: name, team: pk.team || team }; }).filter(pk => pk.player);
    const bet = { ...form, picks: cleanPicks, stake, payout, id: editId || uid(), cashoutAmt: form.cashoutAmt ? parseFloat(form.cashoutAmt) : 0, legs: cleanPicks.length || (form.legs ? parseInt(form.legs) : 0) };
    delete bet.description;
    if (editId) { update(d => ({ ...d, bets: d.bets.map(b => b.id === editId ? bet : b) })); setEditId(null); }
    else { update(d => ({ ...d, bets: [...d.bets, bet].sort((a, b) => b.date.localeCompare(a.date)) })); }
    setForm(blankBet()); setShowForm(false);
  };
  const deleteBet = (id) => update(d => ({ ...d, bets: d.bets.filter(b => b.id !== id) }));
  const quickResult = (id, result) => update(d => ({ ...d, bets: d.bets.map(b => b.id === id ? { ...b, result } : b) }));

  const submitTx = () => {
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0 || !txForm.platform) return;
    update(d => ({ ...d, transactions: [...d.transactions, { ...txForm, amount, id: uid() }].sort((a, b) => b.date.localeCompare(a.date)) }));
    setTxForm(blankTx()); setShowTxForm(false);
  };
  const deleteTx = (id) => update(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "bet-tracker-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); URL.revokeObjectURL(url);
  };
  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => { try { const imp = JSON.parse(e.target.result); if (imp.bets && confirm("Import " + imp.bets.length + " bets? Replaces all data.")) setData(migrateData(imp)); } catch { alert("Could not read file."); } };
    reader.readAsText(file);
  };

  const scanBetslip = async (file) => {
    if (!apiKey) { setScanStatus("Add your API key in Settings first"); setTimeout(() => setScanStatus(""), 5000); return; }
    setScanning(true);
    try {
      setScanStatus("Reading image...");
      const rawBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => r.result ? res(r.result) : rej(new Error("Empty")); r.onerror = () => rej(new Error("Read failed")); r.readAsDataURL(file); });
      setScanStatus("Compressing...");
      const base64 = await new Promise((res, rej) => {
        const img = new window.Image();
        img.onload = () => { try { const MAX = 800; let w = img.naturalWidth, h = img.naturalHeight; if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); } const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); res(c.toDataURL("image/jpeg", 0.7).split(",")[1]); } catch (e) { rej(e); } };
        img.onerror = () => rej(new Error("Image load failed")); img.src = rawBase64;
      });
      setScanStatus("Analyzing betslip...");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: 'Extract betting slip info. Return ONLY valid JSON, no markdown or backticks. Return: {"platform":"PrizePicks","betType":"Flex play","picks":[{"player":"Name","team":"ABC","direction":"Over","line":14.5,"unit":"Points"}],"stake":1,"payout":7,"result":"Pending"}. "$1 to pay $7"=Pending. "$1 paid $7"=Win. "$1 for $6.50"+Loss=Loss. "N-Pick Flex Play"="Flex play". "N-Pick Power Play"="Power play". Team should be 3-letter abbreviation.',
          messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } }, { type: "text", text: "Extract bet details. Return only JSON." }] }]
        })
      });
      if (!resp.ok) { setScanStatus(resp.status === 401 ? "Invalid API key" : "API error " + resp.status); setScanning(false); return; }
      const apiData = await resp.json();
      if (apiData.error) { setScanStatus("API: " + (apiData.error.message || "Error")); setScanning(false); return; }
      const text = (apiData.content || []).map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n");
      const clean = text.replace(/```json\s?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      const picks = (parsed.picks || []).map(pk => ({ player: pk.team ? pk.player + " (" + pk.team + ")" : pk.player, team: pk.team || "", direction: pk.direction || "Over", line: pk.line != null ? pk.line.toString() : "", unit: pk.unit || "" }));
      setForm(f => ({
        ...f, platform: data.platforms.includes(parsed.platform) ? parsed.platform : f.platform,
        betType: parsed.betType || "", picks: picks.length > 0 ? picks : f.picks,
        legs: picks.length ? picks.length.toString() : "", stake: parsed.stake ? parsed.stake.toString() : "",
        payout: parsed.payout ? parsed.payout.toString() : "", result: RESULTS.includes(parsed.result) ? parsed.result : "Pending",
      }));
      setScanStatus("Betslip loaded — review and confirm");
      setShowForm(true); setScanning(false); setTimeout(() => setScanStatus(""), 8000); return;
    } catch (err) { setScanStatus("Error: " + (err.message || String(err))); }
    setScanning(false);
  };

  const filteredBets = data.bets.filter(b => (filterPlat === "All" || b.platform === filterPlat) && (filterResult === "All" || b.result === filterResult));
  const filteredTx = data.transactions.filter(t => filterPlat === "All" || t.platform === filterPlat);
  const resolvedBets = filteredBets.filter(b => calcPL(b).resolved);
  const grossPL = resolvedBets.reduce((s, b) => s + calcPL(b).pl, 0);
  const totalStaked = filteredBets.reduce((s, b) => s + b.stake, 0);
  const wins = resolvedBets.filter(b => b.result === "Win").length;
  const losses = resolvedBets.filter(b => b.result === "Loss").length;
  const winRate = resolvedBets.length > 0 ? Math.round((wins / resolvedBets.length) * 100) : 0;
  const pendingCount = filteredBets.filter(b => b.result === "Pending").length;
  const totalDep = filteredTx.filter(t => t.type === "Deposit").reduce((s, t) => s + t.amount, 0);
  const totalWith = filteredTx.filter(t => t.type === "Withdrawal").reduce((s, t) => s + t.amount, 0);

  const playerStats = useMemo(() => {
    const stats = {};
    data.bets.forEach(b => {
      if (!b.picks) return;
      b.picks.forEach(pk => {
        const name = pk.player; if (!name) return;
        if (!stats[name]) stats[name] = { name, team: pk.team || "", bets: 0, wins: 0, losses: 0, pl: 0 };
        if (!stats[name].team && pk.team) stats[name].team = pk.team;
        stats[name].bets++;
        const share = b.picks.length > 0 ? 1 / b.picks.length : 1;
        if (b.result === "Win") { stats[name].wins++; stats[name].pl += (b.payout - b.stake) * share; }
        if (b.result === "Loss") { stats[name].losses++; stats[name].pl -= b.stake * share; }
      });
    });
    return Object.values(stats).sort((a, b) => b.bets - a.bets);
  }, [data.bets]);

  const getKey = (d) => chartView === "weekly" ? (() => { const dt = new Date(d + "T12:00:00"); const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10); })() : d.slice(0, 7);
  const fmtKey = (k) => chartView === "weekly" ? new Date(k + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : new Date(k + "-15").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const chartGroups = {};
  resolvedBets.forEach(b => { const k = getKey(b.date); if (!chartGroups[k]) chartGroups[k] = { w: 0, l: 0, pl: 0 }; const { pl } = calcPL(b); chartGroups[k].pl += pl; if (b.result === "Win") chartGroups[k].w++; if (b.result === "Loss") chartGroups[k].l++; });
  const cPeriods = Object.keys(chartGroups).sort();
  let cRun = 0;
  const cumData = cPeriods.map(p => { cRun += chartGroups[p].pl; return { p, pl: chartGroups[p].pl, cum: cRun, w: chartGroups[p].w, l: chartGroups[p].l }; });
  const betTypes = BET_TYPES[form.platform] || BET_TYPES._default;

  const card = { background: T.card, borderRadius: 16, border: "1px solid " + T.border, padding: "16px 20px" };
  const input = { padding: "10px 14px", borderRadius: 12, border: "1px solid " + T.border, background: T.surface, color: T.text, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const inputSm = { ...input, padding: "8px 10px", fontSize: 13 };
  const btnP = { padding: "10px 22px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 12, background: T.accent, color: "#fff", cursor: "pointer" };
  const btnO = { padding: "10px 18px", fontSize: 13, fontWeight: 500, border: "1px solid " + T.border, borderRadius: 12, background: "transparent", color: T.text, cursor: "pointer" };
  const pill = (active) => ({ padding: "6px 14px", fontSize: 12, fontWeight: active ? 600 : 400, border: "1px solid " + (active ? T.accent : T.border), borderRadius: 20, background: active ? T.accentSoft : "transparent", color: active ? T.accentText : T.textSec, cursor: "pointer" });
  const metricCard = () => ({ background: T.surface, borderRadius: 14, padding: "14px 16px", border: "1px solid " + T.border });
  const resultBadge = (r) => {
    const m = { Win: { bg: T.greenSoft, c: T.greenText }, Loss: { bg: T.redSoft, c: T.redText }, Pending: { bg: T.yellowSoft, c: T.yellowText }, Push: { bg: "rgba(148,163,184,0.12)", c: "#CBD5E1" }, Cashout: { bg: T.accentSoft, c: T.accentText } };
    const s = m[r] || m.Pending; return { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8, background: s.bg, color: s.c, whiteSpace: "nowrap" };
  };
  const teamDot = (team) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: TEAM_COLORS[team?.toUpperCase()] || T.textTer, marginRight: 4, flexShrink: 0 });

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", padding: "env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 16px)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ padding: "20px 0 16px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.3px", color: T.text }}>Bet tracker</h1>
          <p style={{ fontSize: 13, color: T.textSec, margin: "4px 0 0" }}>P&L across all platforms</p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: T.surface, borderRadius: 14, padding: 4, border: "1px solid " + T.border, overflowX: "auto" }}>
          {[["bets","Bets"],["transactions","Money"],["players","Players"],["chart","Charts"],["settings","Settings"]].map(([k,label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: tab === k ? 600 : 400, border: "none", cursor: "pointer", borderRadius: 10, background: tab === k ? T.card : "transparent", color: tab === k ? T.text : T.textSec, whiteSpace: "nowrap", minWidth: 50 }}>{label}</button>
          ))}
        </div>

        {["bets","transactions","chart"].includes(tab) && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {["All", ...data.platforms].map(p => <button key={p} onClick={() => setFilterPlat(p)} style={pill(filterPlat === p)}>{p}</button>)}
            {tab === "bets" && <>
              <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
              {RESULTS.map(r => <button key={r} onClick={() => setFilterResult(filterResult === r ? "All" : r)} style={pill(filterResult === r)}>{r}</button>)}
            </>}
          </div>
        )}

        {/* BETS TAB */}
        {tab === "bets" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[["P&L", fmt(grossPL), grossPL >= 0 ? T.green : T.red],["Win rate", resolvedBets.length ? winRate+"%" : "—", T.text],["Record", wins+"W–"+losses+"L", T.text],["Staked", fmt(totalStaked), T.textSec],["Pending", pendingCount, T.yellow]].map(([l,v,c]) => (
              <div key={l} style={metricCard()}><div style={{ fontSize: 11, color: T.textSec, marginBottom: 2, fontWeight: 500 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div></div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => { setForm(blankBet()); setEditId(null); setShowForm(!showForm); }} style={btnP}>{showForm ? "Cancel" : "+ New bet"}</button>
            <button onClick={() => fileRef.current?.click()} disabled={scanning} style={{ ...btnO, opacity: scanning ? 0.5 : 1 }}>{scanning ? "Scanning..." : "Scan betslip"}</button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) scanBetslip(e.target.files[0]); e.target.value = ""; }} />
          </div>
          {scanStatus && <div style={{ fontSize: 13, color: T.accentText, marginBottom: 12, padding: "10px 14px", background: T.accentSoft, borderRadius: 12 }}>{scanStatus}</div>}

          {showForm && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{editId ? "Edit bet" : "Log a bet"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Platform</label><select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value, betType: "" }))} style={input}>{data.platforms.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Bet type</label><select value={form.betType} onChange={e => setForm(f => ({ ...f, betType: e.target.value }))} style={input}><option value="">Select...</option>{betTypes.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Picks</label>
                  <button onClick={addPick} style={{ fontSize: 12, color: T.accentText, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}>+ Add pick</button>
                </div>
                {form.picks.map((pk, idx) => (
                  <div key={idx} style={{ background: T.surface, borderRadius: 12, padding: "10px 12px", marginBottom: 6, border: "1px solid " + T.border }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8, marginBottom: 6 }}>
                      <AutoInput value={pk.player} onChange={v => updatePick(idx, "player", v)} suggestions={playerSuggestions} placeholder="Player name" style={inputSm} />
                      <input value={pk.team} onChange={e => updatePick(idx, "team", e.target.value)} placeholder="Team" maxLength={3} style={{ ...inputSm, textTransform: "uppercase", textAlign: "center" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 30px", gap: 8, alignItems: "center" }}>
                      <select value={pk.direction} onChange={e => updatePick(idx, "direction", e.target.value)} style={inputSm}><option>Over</option><option>Under</option></select>
                      <input type="number" step="0.5" placeholder="Line" value={pk.line} onChange={e => updatePick(idx, "line", e.target.value)} style={inputSm} />
                      <AutoInput value={pk.unit} onChange={v => updatePick(idx, "unit", v)} suggestions={data.units} placeholder="Stat" style={inputSm} />
                      {form.picks.length > 1 && <button onClick={() => removePick(idx)} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Stake ($)</label><input type="number" min="0" step="0.01" placeholder="1.00" value={form.stake} onChange={e => setForm(f => ({ ...f, stake: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>To pay ($)</label><input type="number" min="0" step="0.01" placeholder="7.00" value={form.payout} onChange={e => setForm(f => ({ ...f, payout: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Result</label><select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} style={input}>{RESULTS.map(r => <option key={r}>{r}</option>)}</select></div>
                {form.result === "Cashout" && <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Cashout ($)</label><input type="number" min="0" step="0.01" value={form.cashoutAmt} onChange={e => setForm(f => ({ ...f, cashoutAmt: e.target.value }))} style={input} /></div>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...input, flex: 1 }} />
                <button onClick={submitBet} style={btnP}>{editId ? "Save" : "Add"}</button>
              </div>
            </div>
          )}

          {filteredBets.length === 0 ? <div style={{ padding: "3rem 1rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>No bets yet</div> :
            filteredBets.map(b => {
              const { pl, resolved } = calcPL(b); const colors = pc(b.platform, data.platforms); const open = expandedBet === b.id;
              return (
                <div key={b.id} style={{ padding: "12px 0", borderBottom: "1px solid " + T.border }}>
                  <div onClick={() => setExpandedBet(open ? null : b.id)} style={{ cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: T.textTer, minWidth: 48, fontWeight: 500 }}>{new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span style={{ background: colors.bg, color: colors.text, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{b.platform}</span>
                      {b.betType && <span style={{ fontSize: 11, color: T.textTer }}>{b.betType}{b.legs ? " · "+b.legs+"L" : ""}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 12, color: T.textSec, fontWeight: 500 }}>{fmt(b.stake)} → {fmt(b.payout)}</span>
                      <span style={resultBadge(b.result)}>{b.result}</span>
                      {resolved && <span style={{ fontSize: 13, fontWeight: 700, color: pl >= 0 ? T.green : T.red, minWidth: 55, textAlign: "right" }}>{(pl >= 0 ? "+" : "")+fmt(pl)}</span>}
                    </div>
                    {b.picks && b.picks.length > 0 && <div style={{ paddingLeft: 4, marginTop: 4 }}>
                      {b.picks.map((pk, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSec, marginBottom: 2 }}>
                          {pk.team && <span style={teamDot(pk.team)} />}
                          <span style={{ color: T.text, fontWeight: 500 }}>{pk.player}</span>
                          {pk.team && <span style={{ color: T.textTer, fontSize: 11 }}>{pk.team}</span>}
                          {pk.direction && pk.line && <span style={{ color: pk.direction === "Over" ? T.greenText : T.redText, fontWeight: 500 }}>{pk.direction[0]} {pk.line}</span>}
                          {pk.unit && <span>{pk.unit}</span>}
                        </div>
                      ))}
                    </div>}
                  </div>
                  {open && <div style={{ marginTop: 10, paddingLeft: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {b.result === "Pending" ? <>
                      <button onClick={() => quickResult(b.id, "Win")} style={{ ...pill(false), background: T.greenSoft, color: T.greenText, border: "none" }}>Win</button>
                      <button onClick={() => quickResult(b.id, "Loss")} style={{ ...pill(false), background: T.redSoft, color: T.redText, border: "none" }}>Loss</button>
                      <button onClick={() => quickResult(b.id, "Push")} style={pill(false)}>Push</button>
                    </> : <button onClick={() => quickResult(b.id, "Pending")} style={pill(false)}>Back to pending</button>}
                    <button onClick={() => { setForm({ ...b, stake: b.stake.toString(), payout: b.payout.toString(), cashoutAmt: b.cashoutAmt ? b.cashoutAmt.toString() : "", legs: b.legs ? b.legs.toString() : "", picks: (b.picks||[]).map(pk => ({ ...pk, line: pk.line != null ? pk.line.toString() : "" })) }); setEditId(b.id); setShowForm(true); setExpandedBet(null); }} style={pill(false)}>Edit</button>
                    <button onClick={() => deleteBet(b.id)} style={{ ...pill(false), color: T.red }}>Delete</button>
                  </div>}
                </div>
              );
            })}
        </>}

        {/* TRANSACTIONS TAB */}
        {tab === "transactions" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[["Deposited", fmt(totalDep), T.text],["Withdrawn", fmt(totalWith), T.text],["Net", fmt(totalDep - totalWith), totalDep - totalWith > 0 ? T.red : T.green]].map(([l,v,c]) => (
              <div key={l} style={metricCard()}><div style={{ fontSize: 11, color: T.textSec, marginBottom: 2, fontWeight: 500 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div></div>
            ))}
          </div>
          <button onClick={() => setShowTxForm(!showTxForm)} style={btnP}>{showTxForm ? "Cancel" : "+ Deposit / Withdrawal"}</button>
          {showTxForm && <div style={{ ...card, marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              <input type="date" value={txForm.date} onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))} style={input} />
              <select value={txForm.platform} onChange={e => setTxForm(f => ({ ...f, platform: e.target.value }))} style={input}>{data.platforms.map(p => <option key={p}>{p}</option>)}</select>
              <select value={txForm.type} onChange={e => setTxForm(f => ({ ...f, type: e.target.value }))} style={input}><option>Deposit</option><option>Withdrawal</option></select>
              <input type="number" min="0" step="0.01" placeholder="Amount" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} style={input} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <input placeholder="Notes" value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} style={{ ...input, flex: 1 }} />
              <button onClick={submitTx} style={btnP}>Add</button>
            </div>
          </div>}
          <div style={{ marginTop: 16 }}>
            {filteredTx.length === 0 ? <div style={{ padding: "3rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>No transactions yet</div> :
              filteredTx.map(t => { const colors = pc(t.platform, data.platforms); return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid " + T.border, fontSize: 13 }}>
                  <span style={{ color: T.textTer, minWidth: 48, fontSize: 12, fontWeight: 500 }}>{new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span style={{ background: colors.bg, color: colors.text, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{t.platform}</span>
                  <span style={{ flex: 1, fontWeight: 600, color: t.type === "Deposit" ? T.red : T.green }}>{(t.type === "Deposit" ? "-" : "+")+fmt(t.amount)}</span>
                  {t.notes && <span style={{ fontSize: 12, color: T.textTer }}>{t.notes}</span>}
                  <button onClick={() => deleteTx(t.id)} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>x</button>
                </div>
              ); })}
          </div>
        </>}

        {/* PLAYERS TAB */}
        {tab === "players" && <>
          {playerStats.length > 0 && <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: T.text }}>Player breakdown</div>
            <div style={{ overflowX: "auto", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 400 }}>
                <thead><tr style={{ borderBottom: "1px solid " + T.borderLight }}>
                  {["Player","Bets","W","L","Win %","P&L"].map(h => <th key={h} style={{ textAlign: h === "Player" ? "left" : "right", padding: "8px 8px", fontSize: 11, fontWeight: 600, color: T.textSec }}>{h}</th>)}
                </tr></thead>
                <tbody>{playerStats.map(ps => {
                  const wr = ps.wins + ps.losses > 0 ? Math.round((ps.wins / (ps.wins + ps.losses)) * 100) : 0;
                  return (<tr key={ps.name} style={{ borderBottom: "1px solid " + T.border }}>
                    <td style={{ padding: "10px 8px" }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}>{ps.team && <span style={teamDot(ps.team)} />}<span style={{ fontWeight: 500, color: T.text }}>{ps.name}</span>{ps.team && <span style={{ fontSize: 11, color: T.textTer }}>{ps.team}</span>}</div></td>
                    <td style={{ textAlign: "right", padding: "10px 8px", color: T.textSec }}>{ps.bets}</td>
                    <td style={{ textAlign: "right", padding: "10px 8px", color: T.greenText }}>{ps.wins}</td>
                    <td style={{ textAlign: "right", padding: "10px 8px", color: T.redText }}>{ps.losses}</td>
                    <td style={{ textAlign: "right", padding: "10px 8px", color: wr >= 50 ? T.green : T.red, fontWeight: 500 }}>{wr}%</td>
                    <td style={{ textAlign: "right", padding: "10px 8px", fontWeight: 600, color: ps.pl >= 0 ? T.green : T.red }}>{(ps.pl >= 0 ? "+" : "")+fmt(ps.pl)}</td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                ["Most bet on", [...playerStats].slice(0, 3), ps => ps.bets, false],
                ["Highest profit", [...playerStats].sort((a, b) => b.pl - a.pl).slice(0, 3), ps => fmt(ps.pl), true],
                ["Most consistent", [...playerStats].filter(p => p.wins + p.losses >= 2).sort((a, b) => (b.wins/(b.wins+b.losses)) - (a.wins/(a.wins+a.losses))).slice(0, 3), ps => Math.round((ps.wins/(ps.wins+ps.losses))*100)+"%", false],
                ["Biggest losers", [...playerStats].sort((a, b) => a.pl - b.pl).slice(0, 3), ps => fmt(ps.pl), true],
              ].map(([title, list, valFn, colorPl]) => (
                <div key={title} style={metricCard()}>
                  <div style={{ fontSize: 11, color: T.textSec, marginBottom: 6, fontWeight: 500 }}>{title}</div>
                  {list.map((ps, i) => (
                    <div key={ps.name} style={{ fontSize: 13, color: T.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                      {ps.team && <span style={teamDot(ps.team)} />}
                      <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{ps.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 500, color: colorPl ? (ps.pl >= 0 ? T.green : T.red) : T.textSec }}>{valFn(ps)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>}
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: T.text }}>Saved players</div>
          <p style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>Auto-saved when you add bets. Add manually here too.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="Player name" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} style={{ ...input, flex: 1 }} />
            <input placeholder="Team" value={newPlayerTeam} onChange={e => setNewPlayerTeam(e.target.value)} maxLength={3} style={{ ...input, width: 70, flex: "none", textTransform: "uppercase", textAlign: "center" }} />
            <button onClick={() => { if (newPlayerName.trim()) { ensurePlayer(newPlayerName.trim(), newPlayerTeam.trim().toUpperCase()); setNewPlayerName(""); setNewPlayerTeam(""); } }} style={btnP}>Add</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {data.players.length === 0 ? <div style={{ color: T.textTer, fontSize: 13, padding: "1rem 0" }}>No saved players yet</div> :
              data.players.map(p => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + T.border, fontSize: 13 }}>
                  {p.team && <span style={teamDot(p.team)} />}
                  <span style={{ color: T.text, fontWeight: 500, flex: 1 }}>{p.name}</span>
                  {p.team && <span style={{ fontSize: 11, color: T.textTer, background: (TEAM_COLORS[p.team?.toUpperCase()] || T.surface) + "22", padding: "2px 8px", borderRadius: 6 }}>{p.team}</span>}
                  <button onClick={() => update(d => ({ ...d, players: d.players.filter(x => x.name !== p.name) }))} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>x</button>
                </div>
              ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10, color: T.text }}>Stat units</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input placeholder="New unit" value={newUnit} onChange={e => setNewUnit(e.target.value)} style={{ ...input, flex: 1 }} />
            <button onClick={() => { if (newUnit.trim()) { ensureUnit(newUnit.trim()); setNewUnit(""); } }} style={btnP}>Add</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.units.map(u => (
              <span key={u} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: T.surface, borderRadius: 8, fontSize: 12, color: T.textSec, border: "1px solid " + T.border }}>
                {u}{!DEFAULT_UNITS.includes(u) && <button onClick={() => update(d => ({ ...d, units: d.units.filter(x => x !== u) }))} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 11, padding: "0 0 0 2px" }}>×</button>}
              </span>
            ))}
          </div>
        </>}

        {/* CHARTS TAB */}
        {tab === "chart" && <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["weekly","monthly"].map(v => <button key={v} onClick={() => setChartView(v)} style={pill(chartView === v)}>{v}</button>)}
          </div>
          {cumData.length === 0 ? <div style={{ padding: "3rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>Resolve some bets to see charts</div> : <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: T.text }}>P&L by period</div>
            {cumData.map(d => { const maxAbs = Math.max(...cumData.map(x => Math.abs(x.pl)), 1); return (
              <div key={d.p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.textTer, minWidth: 48, fontWeight: 500 }}>{fmtKey(d.p)}</span>
                <div style={{ flex: 1, height: 22, background: T.surface, borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: d.pl >= 0 ? T.green : T.red, width: Math.max((Math.abs(d.pl) / maxAbs) * 100, 3)+"%", opacity: 0.8 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: d.pl >= 0 ? T.green : T.red, minWidth: 65, textAlign: "right" }}>{(d.pl >= 0 ? "+" : "")+fmt(d.pl)}</span>
                <span style={{ fontSize: 11, color: T.textTer, minWidth: 40 }}>{d.w}W {d.l}L</span>
              </div>
            ); })}
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10, color: T.text }}>Cumulative P&L</div>
            {(() => {
              const maxAbs = Math.max(...cumData.map(c => Math.abs(c.cum)), 1);
              const h = 200, mid = h/2, w = Math.max(cumData.length * 80, 320), step = w / cumData.length;
              const pts = cumData.map((c, i) => ({ x: step * i + step / 2, y: mid - (c.cum / maxAbs) * (mid - 30) }));
              const area = "M"+pts[0].x+","+mid+" L"+pts.map(p => p.x+","+p.y).join(" L")+" L"+pts[pts.length-1].x+","+mid+" Z";
              const line = pts.map((p, i) => (i === 0 ? "M" : "L")+p.x+","+p.y).join(" ");
              return (
                <div style={{ overflowX: "auto", background: T.surface, borderRadius: 14, padding: "16px 8px", border: "1px solid " + T.border }}>
                  <svg viewBox={"0 0 "+w+" "+h} style={{ width: "100%", minWidth: w, height: h }}>
                    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cRun >= 0 ? T.green : T.red} stopOpacity="0.2" /><stop offset="100%" stopColor={cRun >= 0 ? T.green : T.red} stopOpacity="0" /></linearGradient></defs>
                    <line x1="0" y1={mid} x2={w} y2={mid} stroke={T.border} strokeWidth="1" />
                    <path d={area} fill="url(#ag)" />
                    <path d={line} fill="none" stroke={cRun >= 0 ? T.green : T.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="5" fill={T.bg} stroke={cumData[i].cum >= 0 ? T.green : T.red} strokeWidth="2.5" />
                        <text x={p.x} y={p.y - 14} textAnchor="middle" fontSize="11" fontWeight="600" fill={cumData[i].cum >= 0 ? T.green : T.red}>{fmt(cumData[i].cum)}</text>
                        <text x={p.x} y={h - 6} textAnchor="middle" fontSize="10" fill={T.textTer}>{fmtKey(cumData[i].p)}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              );
            })()}
          </>}
        </>}

        {/* SETTINGS TAB */}
        {tab === "settings" && <>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: T.text }}>Platforms</div>
          {data.platforms.map((p, i) => { const colors = PCOLORS[i % PCOLORS.length]; const pBets = data.bets.filter(b => b.platform === p); const pRes = pBets.filter(b => calcPL(b).resolved); const pPL = pRes.reduce((s, b) => s + calcPL(b).pl, 0); return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", borderBottom: "1px solid " + T.border }}>
              <span style={{ background: colors.bg, color: colors.text, padding: "5px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{p}</span>
              <span style={{ flex: 1, fontSize: 12, color: T.textSec }}>{pBets.length} bets</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: pPL >= 0 ? T.green : T.red }}>{fmt(pPL)}</span>
              <button onClick={() => removePlatform(p)} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>remove</button>
            </div>
          ); })}
          {showPlatForm ? <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <input placeholder="Platform name" value={newPlat} onChange={e => setNewPlat(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlatform()} style={{ ...input, flex: 1 }} />
            <button onClick={addPlatform} style={btnP}>Add</button>
            <button onClick={() => setShowPlatForm(false)} style={btnO}>Cancel</button>
          </div> : <button onClick={() => setShowPlatForm(true)} style={{ ...btnO, marginTop: 14 }}>+ Add platform</button>}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid " + T.border }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: T.text }}>Betslip scanner</div>
            <p style={{ fontSize: 13, color: T.textSec, marginBottom: 12, lineHeight: 1.5 }}>Anthropic API key for scanning. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: T.accentText }}>Get one here</a>.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <input type={showApiKey ? "text" : "password"} placeholder="sk-ant-api03-..." value={apiKey} onChange={e => { setApiKeyState(e.target.value); setApiKeyStore(e.target.value); }} style={{ ...input, flex: 1, fontFamily: "monospace", fontSize: 13 }} />
              <button onClick={() => setShowApiKey(!showApiKey)} style={btnO}>{showApiKey ? "Hide" : "Show"}</button>
            </div>
            {apiKey && <p style={{ fontSize: 12, color: T.green, marginTop: 8 }}>Key saved — scanner ready</p>}
          </div>
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid " + T.border }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: T.text }}>Data</div>
            <p style={{ fontSize: 13, color: T.textSec, marginBottom: 12, lineHeight: 1.5 }}>Export to transfer between devices.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={exportData} style={btnO}>Export backup</button>
              <button onClick={() => importRef.current?.click()} style={btnO}>Import backup</button>
              <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) importData(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid " + T.border, paddingBottom: 40 }}>
            <button onClick={() => { if (confirm("Delete ALL data?")) { setData(INIT); localStorage.removeItem(STORE_KEY); } }} style={{ fontSize: 13, border: "none", background: "transparent", color: T.red, cursor: "pointer", fontWeight: 500 }}>Reset all data</button>
          </div>
        </>}
      </div>
    </div>
  );
}
