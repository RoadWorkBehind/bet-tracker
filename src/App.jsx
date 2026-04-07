import { useState, useEffect, useCallback, useRef } from "react";

const RESULTS = ["Pending", "Win", "Loss", "Push", "Cashout"];
const BET_TYPES = {
  PrizePicks: ["Power play", "Flex play"],
  Robinhood: ["Prediction market", "Stock trade"],
  _default: ["Standard bet"],
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
  { bg: "rgba(124,108,255,0.15)", text: "#B4A8FF", dot: "#7C6CFF" },
  { bg: "rgba(52,211,153,0.15)", text: "#6EE7B7", dot: "#34D399" },
  { bg: "rgba(251,146,60,0.15)", text: "#FDBA74", dot: "#FB923C" },
  { bg: "rgba(248,113,113,0.15)", text: "#FCA5A5", dot: "#F87171" },
  { bg: "rgba(56,189,248,0.15)", text: "#7DD3FC", dot: "#38BDF8" },
  { bg: "rgba(251,191,36,0.15)", text: "#FDE68A", dot: "#FBBF24" },
  { bg: "rgba(232,121,249,0.15)", text: "#F0ABFC", dot: "#E879F9" },
  { bg: "rgba(148,163,184,0.15)", text: "#CBD5E1", dot: "#94A3B8" },
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

// localStorage helpers
const STORE_KEY = "bet-tracker-data";
const API_KEY_KEY = "bet-tracker-api-key";

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveData(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}

function getApiKey() {
  try { return localStorage.getItem(API_KEY_KEY) || ""; } catch { return ""; }
}

function setApiKey(key) {
  try { localStorage.setItem(API_KEY_KEY, key); } catch {}
}

const INIT = { platforms: ["Robinhood", "PrizePicks"], bets: [], transactions: [] };

export default function App() {
  const [data, setData] = useState(() => loadData() || INIT);
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
  const fileRef = useRef(null);
  const importRef = useRef(null);

  const blankBet = () => ({ date: new Date().toISOString().slice(0, 10), platform: data.platforms[0] || "", betType: "", description: "", legs: "", stake: "", payout: "", result: "Pending", cashoutAmt: "", notes: "" });
  const [form, setForm] = useState(blankBet());
  const blankTx = () => ({ date: new Date().toISOString().slice(0, 10), platform: data.platforms[0] || "", type: "Deposit", amount: "", notes: "" });
  const [txForm, setTxForm] = useState(blankTx());

  // Save to localStorage whenever data changes
  useEffect(() => { saveData(data); }, [data]);

  const update = (fn) => setData(prev => fn(prev));

  const addPlatform = () => { const n = newPlat.trim(); if (!n || data.platforms.includes(n)) return; update(d => ({ ...d, platforms: [...d.platforms, n] })); setNewPlat(""); setShowPlatForm(false); };
  const removePlatform = (p) => { if (!confirm(`Remove ${p}?`)) return; update(d => ({ ...d, platforms: d.platforms.filter(x => x !== p) })); };

  const submitBet = () => {
    const stake = parseFloat(form.stake); const payout = parseFloat(form.payout);
    if (!stake || stake <= 0 || !payout || payout <= 0 || !form.platform) return;
    const bet = { ...form, stake, payout, id: editId || uid(), cashoutAmt: form.cashoutAmt ? parseFloat(form.cashoutAmt) : 0, legs: form.legs ? parseInt(form.legs) : 0 };
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

  // Export data as JSON
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bet-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Import data from JSON
  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported.platforms && imported.bets) {
          if (confirm(`Import ${imported.bets.length} bets and ${imported.transactions?.length || 0} transactions? This will replace all current data.`)) {
            setData({ ...INIT, ...imported });
          }
        } else { alert("Invalid backup file."); }
      } catch { alert("Could not read file."); }
    };
    reader.readAsText(file);
  };

  // Betslip scanner
  const scanBetslip = async (file) => {
    if (!apiKey) {
      setScanStatus("Add your Anthropic API key in Settings to use the scanner");
      setTimeout(() => setScanStatus(""), 5000);
      return;
    }
    setScanning(true);
    let step = "starting";
    try {
      step = "reading file";
      setScanStatus("Reading image...");
      const rawBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => reader.result ? resolve(reader.result) : reject(new Error("Empty"));
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(file);
      });

      step = "compressing";
      setScanStatus("Compressing...");
      const base64 = await new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const MAX = 800;
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
            const c = document.createElement("canvas");
            c.width = w; c.height = h;
            c.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL("image/jpeg", 0.7).split(",")[1]);
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = rawBase64;
      });

      step = "calling API";
      setScanStatus("Analyzing betslip...");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "You extract betting slip info from screenshots. Return ONLY a single valid JSON object. No markdown fences, no backticks, no explanation. PrizePicks slips show \"$X to pay $Y\" and \"N-Pick Flex Play\" or \"N-Pick Power Play\". They may show \"Win\" or \"Loss\". Each leg has a player, stat type, line. Return: {\"platform\":\"PrizePicks\",\"betType\":\"Flex play\" or \"Power play\",\"description\":\"Player1 over X stat, Player2 over X stat\",\"legs\":3,\"stake\":1,\"payout\":7,\"result\":\"Pending\" or \"Win\" or \"Loss\"}. \"$1 paid $7\" = Win. \"$1 for $6.50\" + Loss badge = Loss.",
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: "Extract bet details from this betslip. Return only JSON." }
            ]
          }]
        })
      });

      if (!resp.ok) {
        let errText = ""; try { errText = await resp.text(); } catch {}
        if (resp.status === 401) setScanStatus("Invalid API key — check Settings");
        else setScanStatus(`API error ${resp.status}: ${errText.slice(0, 80)}`);
        setScanning(false);
        return;
      }

      const apiData = await resp.json();
      if (apiData.error) { setScanStatus("API: " + (apiData.error.message || "Unknown error")); setScanning(false); return; }

      step = "parsing";
      setScanStatus("Processing...");
      const text = (apiData.content || []).map(i => i.type === "text" ? i.text : "").filter(Boolean).join("\n");
      if (!text) { setScanStatus("Empty response — try again"); setScanning(false); return; }

      const clean = text.replace(/```json\s?/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);

      setForm(f => ({
        ...f,
        platform: data.platforms.includes(parsed.platform) ? parsed.platform : f.platform,
        betType: parsed.betType || "",
        description: parsed.description || "",
        legs: parsed.legs ? parsed.legs.toString() : "",
        stake: parsed.stake ? parsed.stake.toString() : "",
        payout: parsed.payout ? parsed.payout.toString() : "",
        result: RESULTS.includes(parsed.result) ? parsed.result : "Pending",
      }));
      setScanStatus("Betslip loaded — review and confirm");
      setShowForm(true);
      setScanning(false);
      setTimeout(() => setScanStatus(""), 8000);
      return;
    } catch (err) {
      setScanStatus(`Failed at "${step}": ${err.message || String(err)}`);
    }
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

  const getKey = (d) => chartView === "weekly" ? (() => { const dt = new Date(d + "T12:00:00"); const s = new Date(dt); s.setDate(dt.getDate() - dt.getDay()); return s.toISOString().slice(0, 10); })() : d.slice(0, 7);
  const fmtKey = (k) => chartView === "weekly" ? new Date(k + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : new Date(k + "-15").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  const chartGroups = {};
  resolvedBets.forEach(b => { const k = getKey(b.date); if (!chartGroups[k]) chartGroups[k] = { w: 0, l: 0, pl: 0 }; const { pl } = calcPL(b); chartGroups[k].pl += pl; if (b.result === "Win") chartGroups[k].w++; if (b.result === "Loss") chartGroups[k].l++; });
  const cPeriods = Object.keys(chartGroups).sort();
  let cRun = 0;
  const cumData = cPeriods.map(p => { cRun += chartGroups[p].pl; return { p, pl: chartGroups[p].pl, cum: cRun, w: chartGroups[p].w, l: chartGroups[p].l }; });

  const betTypes = BET_TYPES[form.platform] || BET_TYPES._default;

  // Shared styles
  const card = { background: T.card, borderRadius: 16, border: `1px solid ${T.border}`, padding: "16px 20px" };
  const input = { padding: "10px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };
  const btnP = { padding: "10px 22px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 12, background: T.accent, color: "#fff", cursor: "pointer" };
  const btnO = { padding: "10px 18px", fontSize: 13, fontWeight: 500, border: `1px solid ${T.border}`, borderRadius: 12, background: "transparent", color: T.text, cursor: "pointer" };
  const pill = (active) => ({ padding: "6px 14px", fontSize: 12, fontWeight: active ? 600 : 400, border: `1px solid ${active ? T.accent : T.border}`, borderRadius: 20, background: active ? T.accentSoft : "transparent", color: active ? T.accentText : T.textSec, cursor: "pointer" });
  const metricCard = () => ({ background: T.surface, borderRadius: 14, padding: "14px 16px", border: `1px solid ${T.border}` });
  const resultBadge = (r) => {
    const m = { Win: { bg: T.greenSoft, c: T.greenText }, Loss: { bg: T.redSoft, c: T.redText }, Pending: { bg: T.yellowSoft, c: T.yellowText }, Push: { bg: "rgba(148,163,184,0.12)", c: "#CBD5E1" }, Cashout: { bg: T.accentSoft, c: T.accentText } };
    const s = m[r] || m.Pending;
    return { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8, background: s.bg, color: s.c };
  };

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", padding: "env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 16px)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ padding: "20px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.3px", color: T.text }}>Bet tracker</h1>
            <p style={{ fontSize: 13, color: T.textSec, margin: "4px 0 0" }}>P&L across all platforms</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: T.surface, borderRadius: 14, padding: 4, border: `1px solid ${T.border}` }}>
          {[["bets", "Bets"], ["transactions", "Money"], ["chart", "Charts"], ["settings", "Settings"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: tab === k ? 600 : 400, border: "none", cursor: "pointer",
              borderRadius: 10, background: tab === k ? T.card : "transparent", color: tab === k ? T.text : T.textSec,
            }}>{label}</button>
          ))}
        </div>

        {/* Filters */}
        {(tab === "bets" || tab === "transactions" || tab === "chart") && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {["All", ...data.platforms].map(p => <button key={p} onClick={() => setFilterPlat(p)} style={pill(filterPlat === p)}>{p}</button>)}
            {tab === "bets" && <>
              <div style={{ width: 1, height: 20, background: T.border, margin: "0 4px" }} />
              {RESULTS.map(r => <button key={r} onClick={() => setFilterResult(filterResult === r ? "All" : r)} style={pill(filterResult === r)}>{r}</button>)}
            </>}
          </div>
        )}

        {/* ═══════ BETS TAB ═══════ */}
        {tab === "bets" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              ["P&L", fmt(grossPL), grossPL >= 0 ? T.green : T.red],
              ["Win rate", resolvedBets.length ? `${winRate}%` : "—", T.text],
              ["Record", `${wins}W–${losses}L`, T.text],
              ["Staked", fmt(totalStaked), T.textSec],
              ["Pending", pendingCount, T.yellow],
            ].map(([l, v, c]) => (
              <div key={l} style={metricCard()}>
                <div style={{ fontSize: 11, color: T.textSec, marginBottom: 2, fontWeight: 500 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => { setForm(blankBet()); setEditId(null); setShowForm(!showForm); }} style={btnP}>{showForm ? "Cancel" : "+ New bet"}</button>
            <button onClick={() => fileRef.current?.click()} disabled={scanning} style={{ ...btnO, opacity: scanning ? 0.5 : 1 }}>
              {scanning ? "Scanning..." : "Scan betslip"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) scanBetslip(e.target.files[0]); e.target.value = ""; }} />
          </div>
          {scanStatus && <div style={{ fontSize: 13, color: T.accentText, marginBottom: 12, padding: "10px 14px", background: T.accentSoft, borderRadius: 12, lineHeight: 1.4 }}>{scanStatus}</div>}

          {showForm && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{editId ? "Edit bet" : "Log a bet"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 10 }}>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Platform</label>
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value, betType: "" }))} style={input}>{data.platforms.map(p => <option key={p}>{p}</option>)}</select></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Bet type</label>
                  <select value={form.betType} onChange={e => setForm(f => ({ ...f, betType: e.target.value }))} style={input}><option value="">Select...</option>{betTypes.map(t => <option key={t}>{t}</option>)}</select></div>
                {(form.platform === "PrizePicks" || form.betType?.includes("play")) && (
                  <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Legs</label><input type="number" min="2" max="12" placeholder="#" value={form.legs} onChange={e => setForm(f => ({ ...f, legs: e.target.value }))} style={input} /></div>
                )}
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Description</label>
                <input placeholder='e.g. "LeBron 25+ pts, Jokic 10+ reb"' value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={input} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Stake ($)</label><input type="number" min="0" step="0.01" placeholder="1.00" value={form.stake} onChange={e => setForm(f => ({ ...f, stake: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>To pay ($)</label><input type="number" min="0" step="0.01" placeholder="7.00" value={form.payout} onChange={e => setForm(f => ({ ...f, payout: e.target.value }))} style={input} /></div>
                <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Result</label>
                  <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} style={input}>{RESULTS.map(r => <option key={r}>{r}</option>)}</select></div>
                {form.result === "Cashout" && <div><label style={{ fontSize: 11, color: T.textSec, display: "block", marginBottom: 4, fontWeight: 500 }}>Cashout ($)</label><input type="number" min="0" step="0.01" value={form.cashoutAmt} onChange={e => setForm(f => ({ ...f, cashoutAmt: e.target.value }))} style={input} /></div>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...input, flex: 1 }} />
                <button onClick={submitBet} style={btnP}>{editId ? "Save" : "Add"}</button>
              </div>
            </div>
          )}

          {filteredBets.length === 0 ? (
            <div style={{ padding: "3rem 1rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>No bets yet</div>
          ) : filteredBets.map(b => {
            const { pl, resolved } = calcPL(b);
            const colors = pc(b.platform, data.platforms);
            const open = expandedBet === b.id;
            return (
              <div key={b.id} style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                <div onClick={() => setExpandedBet(open ? null : b.id)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: T.textTer, minWidth: 48, fontWeight: 500 }}>{new Date(b.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span style={{ background: colors.bg, color: colors.text, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{b.platform}</span>
                  {b.betType && <span style={{ fontSize: 11, color: T.textTer }}>{b.betType}{b.legs ? ` · ${b.legs}L` : ""}</span>}
                  <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.text }}>{b.description || "—"}</span>
                  <span style={{ fontSize: 12, color: T.textSec, fontWeight: 500 }}>{fmt(b.stake)} → {fmt(b.payout)}</span>
                  <span style={resultBadge(b.result)}>{b.result}</span>
                  {resolved && <span style={{ fontSize: 13, fontWeight: 700, color: pl >= 0 ? T.green : T.red, minWidth: 60, textAlign: "right" }}>{pl >= 0 ? "+" : ""}{fmt(pl)}</span>}
                </div>
                {open && (
                  <div style={{ marginTop: 10, paddingLeft: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {b.result === "Pending" ? <>
                      <button onClick={() => quickResult(b.id, "Win")} style={{ ...pill(false), background: T.greenSoft, color: T.greenText, border: "none" }}>Win</button>
                      <button onClick={() => quickResult(b.id, "Loss")} style={{ ...pill(false), background: T.redSoft, color: T.redText, border: "none" }}>Loss</button>
                      <button onClick={() => quickResult(b.id, "Push")} style={pill(false)}>Push</button>
                    </> : <button onClick={() => quickResult(b.id, "Pending")} style={pill(false)}>Back to pending</button>}
                    <button onClick={() => { setForm({ ...b, stake: b.stake.toString(), payout: b.payout.toString(), cashoutAmt: b.cashoutAmt ? b.cashoutAmt.toString() : "", legs: b.legs ? b.legs.toString() : "" }); setEditId(b.id); setShowForm(true); setExpandedBet(null); }} style={pill(false)}>Edit</button>
                    <button onClick={() => deleteBet(b.id)} style={{ ...pill(false), color: T.red }}>Delete</button>
                    {b.notes && <span style={{ fontSize: 12, color: T.textTer, marginLeft: 8 }}>{b.notes}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </>}

        {/* ═══════ TRANSACTIONS TAB ═══════ */}
        {tab === "transactions" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[["Deposited", fmt(totalDep), T.text], ["Withdrawn", fmt(totalWith), T.text], ["Net", fmt(totalDep - totalWith), totalDep - totalWith > 0 ? T.red : T.green]].map(([l, v, c]) => (
              <div key={l} style={metricCard()}><div style={{ fontSize: 11, color: T.textSec, marginBottom: 2, fontWeight: 500 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div></div>
            ))}
          </div>
          <button onClick={() => setShowTxForm(!showTxForm)} style={btnP}>{showTxForm ? "Cancel" : "+ Deposit / Withdrawal"}</button>
          {showTxForm && (
            <div style={{ ...card, marginTop: 12 }}>
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
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            {filteredTx.length === 0 ? <div style={{ padding: "3rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>No transactions yet</div> :
              filteredTx.map(t => {
                const colors = pc(t.platform, data.platforms);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                    <span style={{ color: T.textTer, minWidth: 48, fontSize: 12, fontWeight: 500 }}>{new Date(t.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span style={{ background: colors.bg, color: colors.text, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{t.platform}</span>
                    <span style={{ flex: 1, fontWeight: 600, color: t.type === "Deposit" ? T.red : T.green }}>{t.type === "Deposit" ? "-" : "+"}{fmt(t.amount)}</span>
                    {t.notes && <span style={{ fontSize: 12, color: T.textTer }}>{t.notes}</span>}
                    <button onClick={() => deleteTx(t.id)} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>x</button>
                  </div>
                );
              })}
          </div>
        </>}

        {/* ═══════ CHARTS TAB ═══════ */}
        {tab === "chart" && <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {["weekly", "monthly"].map(v => <button key={v} onClick={() => setChartView(v)} style={pill(chartView === v)}>{v}</button>)}
          </div>
          {cumData.length === 0 ? <div style={{ padding: "3rem", textAlign: "center", color: T.textTer, fontSize: 14 }}>Resolve some bets to see charts</div> : <>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: T.text }}>P&L by period</div>
            {cumData.map(d => {
              const maxAbs = Math.max(...cumData.map(x => Math.abs(x.pl)), 1);
              return (
                <div key={d.p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: T.textTer, minWidth: 48, fontWeight: 500 }}>{fmtKey(d.p)}</span>
                  <div style={{ flex: 1, height: 22, background: T.surface, borderRadius: 6, overflow: "hidden", display: "flex", alignItems: "center" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: d.pl >= 0 ? T.green : T.red, width: `${Math.max((Math.abs(d.pl) / maxAbs) * 100, 3)}%`, opacity: 0.8 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: d.pl >= 0 ? T.green : T.red, minWidth: 65, textAlign: "right" }}>{d.pl >= 0 ? "+" : ""}{fmt(d.pl)}</span>
                  <span style={{ fontSize: 11, color: T.textTer, minWidth: 40 }}>{d.w}W {d.l}L</span>
                </div>
              );
            })}

            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 24, marginBottom: 10, color: T.text }}>Cumulative P&L</div>
            {(() => {
              const maxAbs = Math.max(...cumData.map(c => Math.abs(c.cum)), 1);
              const h = 200; const mid = h / 2; const w = Math.max(cumData.length * 80, 320); const step = w / cumData.length;
              const pts = cumData.map((c, i) => ({ x: step * i + step / 2, y: mid - (c.cum / maxAbs) * (mid - 30) }));
              const area = `M${pts[0].x},${mid} L${pts.map(p => `${p.x},${p.y}`).join(" L")} L${pts[pts.length - 1].x},${mid} Z`;
              const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
              return (
                <div style={{ overflowX: "auto", background: T.surface, borderRadius: 14, padding: "16px 8px", border: `1px solid ${T.border}` }}>
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: w, height: h }}>
                    <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={cRun >= 0 ? T.green : T.red} stopOpacity="0.2" /><stop offset="100%" stopColor={cRun >= 0 ? T.green : T.red} stopOpacity="0" /></linearGradient></defs>
                    <line x1="0" y1={mid} x2={w} y2={mid} stroke={T.border} strokeWidth="1" />
                    <path d={area} fill="url(#areaGrad)" />
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

        {/* ═══════ SETTINGS TAB ═══════ */}
        {tab === "settings" && <>
          {/* Platforms */}
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: T.text }}>Platforms</div>
          {data.platforms.map((p, i) => {
            const colors = PCOLORS[i % PCOLORS.length];
            const pBets = data.bets.filter(b => b.platform === p);
            const pRes = pBets.filter(b => calcPL(b).resolved);
            const pPL = pRes.reduce((s, b) => s + calcPL(b).pl, 0);
            return (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ background: colors.bg, color: colors.text, padding: "5px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{p}</span>
                <span style={{ flex: 1, fontSize: 12, color: T.textSec }}>{pBets.length} bets</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: pPL >= 0 ? T.green : T.red }}>{fmt(pPL)}</span>
                <button onClick={() => removePlatform(p)} style={{ border: "none", background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>remove</button>
              </div>
            );
          })}
          {showPlatForm ? (
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <input placeholder="Platform name" value={newPlat} onChange={e => setNewPlat(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlatform()} style={{ ...input, flex: 1 }} />
              <button onClick={addPlatform} style={btnP}>Add</button>
              <button onClick={() => setShowPlatForm(false)} style={btnO}>Cancel</button>
            </div>
          ) : <button onClick={() => setShowPlatForm(true)} style={{ ...btnO, marginTop: 14 }}>+ Add platform</button>}

          {/* API Key */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: T.text }}>Betslip scanner</div>
            <p style={{ fontSize: 13, color: T.textSec, marginBottom: 12, lineHeight: 1.5 }}>
              Add your Anthropic API key to scan betslip screenshots. Get one free at{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: T.accentText }}>console.anthropic.com</a>.
              Your key stays in your browser — it's never sent anywhere except Anthropic's API.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type={showApiKey ? "text" : "password"}
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={e => { setApiKeyState(e.target.value); setApiKey(e.target.value); }}
                style={{ ...input, flex: 1, fontFamily: "monospace", fontSize: 13 }}
              />
              <button onClick={() => setShowApiKey(!showApiKey)} style={btnO}>{showApiKey ? "Hide" : "Show"}</button>
            </div>
            {apiKey && <p style={{ fontSize: 12, color: T.green, marginTop: 8 }}>Key saved — scanner is ready</p>}
          </div>

          {/* Export / Import */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: T.text }}>Data</div>
            <p style={{ fontSize: 13, color: T.textSec, marginBottom: 12, lineHeight: 1.5 }}>
              Export your data to transfer between devices. Import a backup to restore.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={exportData} style={btnO}>Export backup</button>
              <button onClick={() => importRef.current?.click()} style={btnO}>Import backup</button>
              <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) importData(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>

          {/* Reset */}
          <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}`, paddingBottom: 40 }}>
            <button onClick={() => { if (confirm("Delete ALL data? This cannot be undone.")) { setData(INIT); localStorage.removeItem(STORE_KEY); } }} style={{ fontSize: 13, border: "none", background: "transparent", color: T.red, cursor: "pointer", fontWeight: 500 }}>Reset all data</button>
          </div>
        </>}
      </div>
    </div>
  );
}
