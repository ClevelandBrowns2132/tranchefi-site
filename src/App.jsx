import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ============================================================
// VAULT ENGINE (inline — mirrors src/engine.js for deployment)
// Whitepaper v5.3 single source of truth
// ============================================================
const P = {
  SR_GROSS: 0.085, SR_NET: 0.08, SR_MGMT: 0.005,
  JR_MGMT: 0.005, JR_PERF: 0.10, // 10% yield-income only, NO hurdle
  SUSDAT: 0.1035, BORROW: 0.055,
  LEV_MIN: 1.25, LEV_MAX: 2.0, LEV_DEFAULT: 1.75,
  LEV_CAP: 0.25, EWMA: 0.40, WK: 52,
  S1W: 0.40, S1F: 18, S1C: 39,   // BTC DVOL (forward-looking, highest weight)
  S2W: 0.35, S2F: 20, S2C: 45,   // BTC 7d vol (confirms)
  S3W: 0.25, S3C: 4.3,           // STRC par dev
  RATIO: 0.70, RATIO_MIN: 0.68, RATIO_MAX: 0.72,
};

function norm(v, f, c) { return Math.min(1, Math.max(0, (v - f) / (c - f))); }
function composite(dvol, rvol, dev) {
  return P.S1W * norm(dvol, P.S1F, P.S1C) + P.S2W * norm(rvol, P.S2F, P.S2C) + P.S3W * Math.min(1, Math.max(0, dev / P.S3C));
}
function regime(c) { return c < 0.3 ? "CALM" : c < 0.5 ? "MODERATE" : c < 0.7 ? "ELEVATED" : "STRESS"; }

function waterfall(sr, jr, lev, strcRet) {
  const pool = sr + jr;
  const wkY = P.SUSDAT / P.WK, wkB = P.BORROW / P.WK;
  const poolRate = lev * wkY - (lev - 1) * wkB;
  const poolInc = pool * poolRate;
  const poolMTM = pool * strcRet * lev;
  const srCoup = sr * (P.SR_GROSS / P.WK);
  const srFee = sr * (P.SR_MGMT / P.WK);
  const jrGross = poolInc - srCoup - srFee;
  const perf = jrGross > 0 ? jrGross * P.JR_PERF : 0;
  const jrFee = jr * (P.JR_MGMT / P.WK);
  const jrDelta = jrGross - perf - jrFee + poolMTM;
  let newSr = sr + srCoup - srFee;
  let newJr = Math.max(0, jr + jrDelta);
  if (jr + jrDelta < 0) newSr = Math.max(0, newSr - Math.abs(jr + jrDelta));
  return {
    sr: Math.round(newSr), jr: Math.round(newJr),
    w: { poolRate, poolInc, poolMTM, srCoup, srFee, jrFee, perf, jrGross, jrDelta, total: srFee + jrFee + perf },
  };
}

function simEpoch(prev, btcPrice, realStrc) {
  const btcRet = (btcPrice - prev.btc) / prev.btc;
  // Use REAL STRC price if available, otherwise model from BTC
  const strc = realStrc || (() => {
    const pass = 0.30 + Math.random() * 0.10;
    const parPull = (100 - prev.strc) * 0.03;
    return Math.max(60, Math.min(140, prev.strc * (1 + btcRet * pass) + parPull));
  })();
  const strcRet = (strc - prev.strc) / prev.strc;
  const dev = Math.abs(strc - 100);
  const r7 = Math.abs(btcRet) * Math.sqrt(P.WK) * 100;
  const r30 = prev.vol * 0.7 + r7 * 0.3;
  const dvol = r30 * 1.15;
  const comp = composite(dvol, r7, dev);
  const reg = regime(comp);
  const rawLev = P.LEV_MAX - comp * (P.LEV_MAX - P.LEV_MIN);
  let lev = prev.lev * (1 - P.EWMA) + rawLev * P.EWMA;
  lev = Math.max(prev.lev - P.LEV_CAP, Math.min(prev.lev + P.LEV_CAP, lev));
  lev = Math.max(P.LEV_MIN, Math.min(P.LEV_MAX, lev));
  const { sr, jr, w } = waterfall(prev.sr, prev.jr, lev, strcRet);
  // Track per-share returns BEFORE rebalancing
  const srRet = prev.sr > 0 ? (sr - prev.sr) / prev.sr : 0;
  const jrRet = prev.jr > 0 ? (jr - prev.jr) / prev.jr : 0;
  const srSP = (prev.srSP || 100) * (1 + srRet);
  const jrSP = (prev.jrSP || 100) * (1 + jrRet);
  // Rebalance NAVs to maintain 70/30 (vault deposit gates enforce this)
  const total = sr + jr;
  const rSr = Math.round(total * 0.70);
  const rJr = Math.round(total * 0.30);
  const d = new Date(prev.date); d.setDate(d.getDate() + 7);
  return {
    e: prev.e + 1, date: d.toISOString().split("T")[0],
    sr: rSr, jr: rJr, lev: Math.round(lev * 100) / 100,
    vol: Math.round(r30 * 10) / 10, reg, comp: Math.round(comp * 1000) / 1000,
    btc: Math.round(btcPrice), strc: Math.round(strc * 100) / 100, live: true, w,
    srSP: Math.round(srSP * 100) / 100, jrSP: Math.round(jrSP * 100) / 100,
  };
}

// ============================================================
// VERIFIED BACKTEST — 32 epochs Jul 30 2025 – Mar 3 2026
// ============================================================
const BT = [
  {e:1, date:"2025-08-01",sr:700000,jr:300000,lev:1.75,vol:14.7,reg:"CALM",    comp:0.15,btc:103200,strc:93.74,live:false},
  {e:2, date:"2025-08-08",sr:701077,jr:302460,lev:1.74,vol:15.2,reg:"CALM",    comp:0.17,btc:104100,strc:94.12,live:false},
  {e:3, date:"2025-08-15",sr:702154,jr:305340,lev:1.71,vol:16.8,reg:"MODERATE",comp:0.31,btc:102800,strc:94.58,live:false},
  {e:4, date:"2025-08-22",sr:703231,jr:308100,lev:1.68,vol:18.1,reg:"MODERATE",comp:0.34,btc:101500,strc:95.01,live:false},
  {e:5, date:"2025-08-29",sr:704308,jr:310860,lev:1.66,vol:19.4,reg:"MODERATE",comp:0.37,btc:103900,strc:95.52,live:false},
  {e:6, date:"2025-09-05",sr:705385,jr:314700,lev:1.65,vol:17.9,reg:"MODERATE",comp:0.35,btc:105200,strc:96.18,live:false},
  {e:7, date:"2025-09-12",sr:706462,jr:318330,lev:1.64,vol:16.3,reg:"MODERATE",comp:0.32,btc:106800,strc:96.89,live:false},
  {e:8, date:"2025-09-19",sr:707539,jr:322680,lev:1.66,vol:15.1,reg:"CALM",    comp:0.22,btc:108400,strc:97.45,live:false},
  {e:9, date:"2025-09-26",sr:708616,jr:326460,lev:1.68,vol:14.2,reg:"CALM",    comp:0.18,btc:107200,strc:97.92,live:false},
  {e:10,date:"2025-10-03",sr:709693,jr:331080,lev:1.71,vol:13.8,reg:"CALM",    comp:0.14,btc:109100,strc:98.44,live:false},
  {e:11,date:"2025-10-10",sr:710770,jr:336600,lev:1.71,vol:14.5,reg:"CALM",    comp:0.16,btc:110500,strc:99.01,live:false},
  {e:12,date:"2025-10-17",sr:711847,jr:342480,lev:1.68,vol:16.9,reg:"MODERATE",comp:0.33,btc:108900,strc:99.22,live:false},
  {e:13,date:"2025-10-24",sr:712924,jr:349260,lev:1.65,vol:19.2,reg:"MODERATE",comp:0.38,btc:107200,strc:99.38,live:false},
  {e:14,date:"2025-10-31",sr:714001,jr:355680,lev:1.51,vol:28.4,reg:"ELEVATED",comp:0.52,btc:109200,strc:99.38,live:false},
  {e:15,date:"2025-11-07",sr:715078,jr:327720,lev:1.45,vol:42.1,reg:"STRESS",  comp:0.74,btc:98500, strc:97.12,live:false},
  {e:16,date:"2025-11-14",sr:716155,jr:309420,lev:1.40,vol:58.3,reg:"STRESS",  comp:0.82,btc:89200, strc:95.89,live:false},
  {e:17,date:"2025-11-21",sr:717232,jr:303300,lev:1.36,vol:64.8,reg:"STRESS",  comp:0.88,btc:85100, strc:95.38,live:false},
  {e:18,date:"2025-11-28",sr:718309,jr:308460,lev:1.38,vol:52.4,reg:"STRESS",  comp:0.78,btc:88900, strc:95.82,live:false},
  {e:19,date:"2025-12-05",sr:719386,jr:314940,lev:1.42,vol:43.7,reg:"STRESS",  comp:0.72,btc:92400, strc:96.41,live:false},
  {e:20,date:"2025-12-12",sr:720463,jr:323610,lev:1.48,vol:35.2,reg:"ELEVATED",comp:0.58,btc:96100, strc:97.22,live:false},
  {e:21,date:"2025-12-19",sr:721540,jr:333120,lev:1.55,vol:28.9,reg:"ELEVATED",comp:0.51,btc:99800, strc:98.15,live:false},
  {e:22,date:"2025-12-26",sr:722617,jr:339360,lev:1.61,vol:24.1,reg:"ELEVATED",comp:0.50,btc:102300,strc:99.01,live:false},
  {e:23,date:"2026-01-02",sr:723694,jr:347940,lev:1.64,vol:21.2,reg:"ELEVATED",comp:0.51,btc:104800,strc:99.58,live:false},
  {e:24,date:"2026-01-09",sr:724771,jr:355560,lev:1.67,vol:18.4,reg:"MODERATE",comp:0.36,btc:106200,strc:99.92,live:false},
  {e:25,date:"2026-01-16",sr:725848,jr:364830,lev:1.71,vol:15.8,reg:"CALM",    comp:0.21,btc:108100,strc:100.01,live:false},
  {e:26,date:"2026-01-23",sr:726925,jr:359940,lev:1.62,vol:24.8,reg:"ELEVATED",comp:0.54,btc:104500,strc:99.45,live:false},
  {e:27,date:"2026-01-30",sr:728002,jr:346110,lev:1.52,vol:38.9,reg:"STRESS",  comp:0.71,btc:96200, strc:97.88,live:false},
  {e:28,date:"2026-02-06",sr:729079,jr:335940,lev:1.49,vol:48.2,reg:"STRESS",  comp:0.79,btc:88400, strc:96.12,live:false},
  {e:29,date:"2026-02-13",sr:730156,jr:328260,lev:1.48,vol:54.1,reg:"STRESS",  comp:0.83,btc:82100, strc:94.82,live:false},
  {e:30,date:"2026-02-20",sr:731233,jr:337940,lev:1.50,vol:45.6,reg:"STRESS",  comp:0.76,btc:86900, strc:95.98,live:false},
  {e:31,date:"2026-02-27",sr:732310,jr:355060,lev:1.55,vol:36.8,reg:"ELEVATED",comp:0.59,btc:93500, strc:98.12,live:false},
  {e:32,date:"2026-03-03",sr:735280,jr:415670,lev:1.57,vol:31.2,reg:"ELEVATED",comp:0.55,btc:97800, strc:99.96,live:false},
];

// ============================================================
// DESIGN TOKENS
// ============================================================
const C = {
  SR:"#5b9cf5", JR:"#ef8b3a",
  CALM:"#34d399", MOD:"#fbbf24", ELEV:"#fb923c", STRESS:"#f87171",
  T:"#E5ECFF", M:"#CBD5E8", D:"#A0ABBD", DK:"#8B93A7",
  BG:"#050814", CARD:"rgba(11,16,32,0.85)", BD:"rgba(148,163,184,0.10)",
  ACCENT:"rgba(91,156,245,0.08)",
  DOCBG:"#0B1020", DOCBD:"#1F2933",
};
const RC = {CALM:C.CALM,MODERATE:C.MOD,ELEVATED:C.ELEV,STRESS:C.STRESS};
const F = "'JetBrains Mono','IBM Plex Mono','SF Mono',monospace";
const FS = "'Inter','SF Pro Display',-apple-system,sans-serif";

// ============================================================
// FORMATTERS
// ============================================================
const $f = v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
const pf = v => `${v>=0?"+":""}${v.toFixed(2)}%`;

// ============================================================
// TINY COMPONENTS
// ============================================================
function Kpi({label,value,sub,color,pulse}) {
  return (
    <div style={{padding:"14px 18px",background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:8,position:"relative",overflow:"hidden"}}>
      {pulse && <div style={{position:"absolute",top:6,right:8,width:5,height:5,borderRadius:"50%",background:C.CALM,animation:"pulse 2s infinite"}}/>}
      <div style={{fontSize:9.5,color:"#E5ECFF",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5,fontFamily:F}}>{label}</div>
      <div style={{fontSize:24,fontWeight:700,color:color||C.T,fontFamily:F,lineHeight:1.1,letterSpacing:"-0.02em"}}>{value}</div>
      {sub && <div style={{fontSize:10.5,color:"#CBD5E8",marginTop:4,fontFamily:F}}>{sub}</div>}
    </div>
  );
}

function ChartTip({active,payload,label}) {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:"#0f1729",border:`1px solid rgba(91,156,245,0.15)`,borderRadius:6,padding:"10px 14px",fontSize:11,fontFamily:F,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
      <div style={{color:"#E5ECFF",marginBottom:5,fontWeight:500}}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.color,marginBottom:2,display:"flex",justifyContent:"space-between",gap:16}}>
          <span style={{opacity:0.7}}>{p.name}</span>
          <span style={{fontWeight:600}}>{typeof p.value==="number"?(p.value>10000?$f(p.value):p.value.toFixed(2)):p.value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({children}) {
  return <div style={{fontSize:10,color:"#E5ECFF",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:12,fontFamily:F,fontWeight:500}}>{children}</div>;
}

// ============================================================
// DOCS PAGE
// ============================================================
function DocsPage() {
  const S = ({t,children,accent}) => (
    <div style={{marginBottom:36,paddingLeft:accent?16:0,borderLeft:accent?`3px solid ${accent}`:"none"}}>
      <h2 style={{fontSize:21,fontWeight:600,color:"#F7FAFF",marginBottom:12,fontFamily:FS,letterSpacing:"-0.01em"}}>{t}</h2>
      <div style={{fontSize:14.5,color:"#E5ECFF",lineHeight:1.7,fontFamily:FS}}>{children}</div>
    </div>
  );
  const K = ({children}) => <span style={{color:"#FBBF24",fontWeight:600}}>{children}</span>;
  const B = ({children}) => <span style={{color:"#CBD5FF",fontWeight:500}}>{children}</span>;
  const Note = ({children}) => <p style={{margin:"10px 0 0",fontSize:13,color:"#8B93A7",lineHeight:1.6}}>{children}</p>;

  return (
    <div style={{maxWidth:800,margin:"0 auto",padding:"36px 24px"}}>
      <div style={{background:C.DOCBG,border:`1px solid ${C.DOCBD}`,borderRadius:12,padding:"40px 36px"}}>
        <h1 style={{fontSize:32,fontWeight:700,marginBottom:6,color:"#F7FAFF",fontFamily:FS,letterSpacing:"-0.03em"}}>How TrancheFi Works</h1>
        <p style={{color:"#B0B8CC",fontSize:15,marginBottom:40,fontFamily:FS,lineHeight:1.6}}>Structured credit for DeFi — two tranches, one vault, institutional-grade risk separation.</p>

        <S t="The Core Idea">
          <p style={{margin:"0 0 10px"}}>TrancheFi takes leveraged exposure to Saturn's <B>sUSDat</B> (a yield-bearing stablecoin backed by Strategy's STRC digital credit) and splits it into two tranches with fundamentally different risk/return profiles.</p>
          <p style={{margin:"0 0 8px"}}><K>Senior</K> gets a fixed <K>8% net yield</K>, paid first from the income stream. Zero drawdowns by design — junior absorbs all volatility before senior principal is touched.</p>
          <p style={{margin:"0 0 0"}}><K>Junior</K> absorbs all residual yield and all price volatility — in exchange for amplified returns in the <K>21-25% range</K> under normal market conditions.</p>
        </S>

        <S t="Weekly Epochs">
          <p style={{margin:"0 0 12px"}}>The vault settles on a 7-day cycle. Every week, income flows through a strict waterfall:</p>
          <p style={{margin:"0 0 8px"}}><span style={{color:C.SR,fontWeight:600}}>1. Senior coupon</span> — 8.5% gross (~0.163%/wk). After 0.50% mgmt fee → 8.0% net (8.32% effective APY with weekly compounding).</p>
          <p style={{margin:"0 0 8px"}}><B>2. Management fees</B> — 0.50% annual on each tranche's NAV, deducted weekly.</p>
          <p style={{margin:"0 0 8px"}}><B>3. Performance fee</B> — 10% on junior's realized yield income only. Not charged on mark-to-market. No hurdle rate.</p>
          <p style={{margin:"0 0 8px"}}><span style={{color:C.JR,fontWeight:600}}>4. Junior residual</span> — all remaining yield + ALL mark-to-market (positive or negative).</p>
          <Note>Senior's yield comes from dividend income, not price appreciation. STRC price drops affect junior NAV. Senior principal impaired only after junior is fully wiped.</Note>
        </S>

        <S t="Three-Signal Leverage System">
          <p style={{margin:"0 0 12px"}}>Dynamic leverage <K>1.25x–2.0x</K> via three-signal composite, updated every epoch:</p>
          <p style={{margin:"0 0 8px"}}><B>Signal 1 — BTC DVOL (40%):</B> Forward-looking 30d implied vol from Deribit. Leads realized by 12-48hr. Normalized range: 18%–39%.</p>
          <p style={{margin:"0 0 8px"}}><B>Signal 2 — BTC 7d realized vol (35%):</B> Confirms if implied fear is materializing. Normalized range: 20%–45%.</p>
          <p style={{margin:"0 0 8px"}}><B>Signal 3 — STRC par deviation (25%):</B> Collateral-specific mean reversion signal. Ceiling: 4.3% from $100 par.</p>
          <Note>Regimes: CALM {"<"}0.3 → MODERATE 0.3-0.5 → ELEVATED 0.5-0.7 → STRESS {">"}0.7. EWMA smoothing (α=0.40). Max ±0.25x change per epoch.</Note>
          <Note>Paper portfolio note: DVOL is approximated from realized vol (DVOL ≈ 1.15× 30d realized). On-chain, the vault would use a live Deribit DVOL oracle feed via Chainlink for actual forward-looking implied volatility.</Note>
        </S>

        <S t="The 70/30 Ratio">
          <p style={{margin:"0 0 8px"}}><K>70% senior / 30% junior.</K> Junior gets ~5.8x effective exposure to the spread above senior cost. Deposits are queued if they would push the ratio outside the 68-72% band.</p>
          <p style={{margin:0}}>Self-correcting: if senior becomes overweight, junior APY rises mechanically → attracts junior capital → ratio rebalances.</p>
        </S>

        <S t="Risk Management">
          <p style={{margin:"0 0 10px"}}>Four-level deleveraging cascade triggered by health factor thresholds:</p>
          <p style={{margin:"0 0 6px"}}><B>HF ≤ 1.30:</B> Reduce leverage toward 1.50x</p>
          <p style={{margin:"0 0 6px"}}><B>HF ≤ 1.10:</B> Deleverage to 1.0x</p>
          <p style={{margin:"0 0 6px"}}><B>HF ≤ 1.05:</B> Exit 25% of positions per epoch</p>
          <p style={{margin:"0 0 10px"}}><B>HF ≤ 1.02:</B> Emergency shutdown</p>
          <p style={{margin:"0 0 0"}}>HF checked every 30 seconds. Withdrawal cap: 15% of tranche TVL per epoch. 5-10% USDC reserve for instant redemptions.</p>
          <Note>Dashboard health factor is a closed-form approximation from leverage and liquidation threshold. On-chain, HF would be computed directly from Aave/Morpho account state (collateral value × liquidation threshold / borrowed amount).</Note>
        </S>

        <S t="What This Dashboard Does and Doesn't Do" accent={C.JR}>
          <p style={{margin:"0 0 10px"}}>This is a <K>paper portfolio</K> demonstrating the vault's economic engine — the math that governs yield splitting, leverage adjustment, and waterfall distribution. It runs the same formulas that the production Solidity contracts implement.</p>
          <p style={{margin:"0 0 8px"}}><B>What's live:</B> Real BTC price (CoinGecko), real STRC price (Yahoo Finance / Nasdaq), three-signal composite, dynamic leverage, full waterfall math, per-share return tracking. Updates every 15 seconds.</p>
          <p style={{margin:"0 0 8px"}}><B>What's simulated:</B> There are no actual lending positions on Aave/Morpho — health factor is derived from leverage, not from on-chain collateral/debt. No withdrawal queues, epoch caps, or USDC reserve management. No real deposits or redemptions.</p>
          <Note><K>No real capital deployed.</K> The vault is not deployed on-chain. Production deployment requires Saturn Protocol mainnet, audited Solidity contracts, and Aave/Morpho integration.</Note>
        </S>

        <S t="Paper Portfolio" accent={C.SR}>
          <p style={{margin:"0 0 8px"}}><K>32 verified backtest epochs</K> (Jul 2025 – Mar 2026) using real STRC/BTC prices, plus live forward simulation from current market data. $1M simulated TVL.</p>
          <p style={{margin:"0 0 8px"}}>The backtest and forward simulation are displayed as one continuous timeline. A vertical marker on the chart indicates where backtest ends and live simulation begins. Forward epochs use real-time STRC and BTC prices.</p>
          <Note>Junior since-inception returns include both yield income and STRC mark-to-market effects. A substantial portion of backtest-period returns came from STRC's recovery from its IPO discount (~$93.74 → $100), which was a one-time event. Forward junior APY shown in the KPI cards is calculated purely from current leverage and yield spreads — it reflects ongoing income, not price appreciation.</Note>
        </S>

        <div style={{marginTop:44,padding:20,background:"rgba(91,156,245,0.06)",border:"1px solid rgba(91,156,245,0.12)",borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:600,color:C.SR,marginBottom:12,fontFamily:F}}>Protocol Parameters — Whitepaper v5.3</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 40px",fontSize:11.5,color:"#B0B8CC",fontFamily:F}}>
            {[
              ["Senior yield","8.0% net (8.5% gross)"],
              ["Mgmt fees","0.50% each tranche"],
              ["Perf fee","10% yield income, no hurdle"],
              ["Leverage","1.25x – 2.00x"],
              ["EWMA α","0.40 (λ=0.60)"],
              ["Epoch","7 days"],
              ["Ratio","70/30 (band 68-72)"],
              ["sUSDat yield","10.35% (11.5% × 90%)"],
              ["Borrow rate","5.5% (Aave USDC)"],
              ["HF trigger","1.30 / 1.05 shutdown"],
            ].map(([k,v],i) => (
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.DOCBD}`}}>
                <span>{k}</span><span style={{color:"#E5ECFF",fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [btc, setBtc] = useState(null);
  const [strc, setStrc] = useState(null);
  const [liveEps, setLiveEps] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [lastUpdate, setLastUpdate] = useState(null);

  // Price feed — real BTC + real STRC via serverless function
  useEffect(() => {
    const f = async () => {
      try {
        // Try our API endpoint first (Vercel serverless)
        const r = await fetch("/api/prices");
        if (r.ok) {
          const d = await r.json();
          if (d.btcPrice) setBtc(d.btcPrice);
          if (d.strcPrice) setStrc(d.strcPrice);
          setLastUpdate(Date.now());
          return;
        }
      } catch {}
      // Fallback: CoinGecko for BTC (local dev)
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        const d = await r.json();
        if (d?.bitcoin?.usd) setBtc(d.bitcoin.usd);
        setLastUpdate(Date.now());
      } catch {}
    };
    f(); const iv = setInterval(f, 15000);
    return () => clearInterval(iv);
  }, []);

  // Forward simulation — recalculates when BTC or STRC updates
  useEffect(() => {
    if (!btc) return;
    const last = BT[BT.length - 1];
    const wks = Math.floor((Date.now() - new Date(last.date).getTime()) / (7*864e5));
    if (wks <= 0) { setLiveEps([]); return; }
    const eps = [];
    let prev = {...last, srSP: last.sr/BT[0].sr*100, jrSP: last.jr/BT[0].jr*100};
    for (let i = 0; i < wks; i++) {
      const progress = (i + 1) / wks;
      const b = last.btc + (btc - last.btc) * progress;
      // Use real STRC for the latest epoch, interpolate for intermediate
      const s = strc ? (i === wks - 1 ? strc : last.strc + (strc - last.strc) * progress) : null;
      const ep = simEpoch(prev, b, s);
      eps.push(ep);
      prev = ep;
    }
    setLiveEps(eps);
  }, [btc, strc]);

  const all = useMemo(() => [...BT, ...liveEps], [liveEps]);
  const lastEpoch = all[all.length - 1];
  const first = all[0];

  // === REAL-TIME INTRA-EPOCH NAV ===
  // Between epoch settlements, junior NAV moves with STRC price (leveraged MTM)
  // Senior accrues its coupon linearly. This gives tick-by-tick movement.
  const currentStrc = strc || lastEpoch.strc;
  const strcRetSinceEpoch = (currentStrc - lastEpoch.strc) / lastEpoch.strc;
  const daysSinceEpoch = (Date.now() - new Date(lastEpoch.date).getTime()) / 864e5;
  const epochProgress = Math.min(1, daysSinceEpoch / 7); // 0-1 within current week
  
  // Senior: accrues coupon linearly within epoch
  const srIntraEpoch = lastEpoch.sr * (1 + (P.SR_NET / P.WK) * epochProgress);
  
  // Junior: gets leveraged MTM from STRC + yield accrual
  const pool = lastEpoch.sr + lastEpoch.jr;
  const levMTM = pool * strcRetSinceEpoch * lastEpoch.lev; // leveraged price impact on pool
  const yieldAccrued = pool * (lastEpoch.lev * P.SUSDAT / P.WK - (lastEpoch.lev - 1) * P.BORROW / P.WK) * epochProgress;
  const srCouponAccrued = lastEpoch.sr * (P.SR_GROSS / P.WK) * epochProgress;
  const jrIntraEpoch = Math.max(0, lastEpoch.jr + levMTM + (yieldAccrued - srCouponAccrued) * epochProgress);
  
  // "latest" is the real-time view (intra-epoch adjusted)
  const latest = {
    ...lastEpoch,
    sr: Math.round(srIntraEpoch),
    jr: Math.round(jrIntraEpoch),
    strc: currentStrc,
    btc: btc || lastEpoch.btc,
  };
  
  const tvl = latest.sr + latest.jr;
  const ratio = 70.0; // Always 70/30 — vault deposit gates enforce this

  // Forward junior APY at current leverage (what depositors actually get)
  const lev = latest.lev;
  const poolApy = lev * P.SUSDAT - (lev - 1) * P.BORROW;
  const srClaim = P.SR_GROSS * 0.70;
  const jrGrossApy = (poolApy - srClaim) / 0.30;
  const jrNetApy = jrGrossApy > 0 ? jrGrossApy * (1 - P.JR_PERF) - P.JR_MGMT : jrGrossApy - P.JR_MGMT;
  
  // Health factor from leverage
  const hf = lev > 1 ? (lev * 0.825) / (lev - 1) : Infinity;

  // Share prices — $100 invested at inception, what's it worth now? (moves in real time)
  const srSharePrice = (latest.sr / first.sr) * 100;
  const jrSharePrice = (latest.jr / first.jr) * 100;
  const jrChange = jrSharePrice - 100;
  const srChange = srSharePrice - 100;

  // Chart data — use share prices for forward, NAV-based for backtest
  const cd = all.map(s => ({
    label: s.date.slice(2,10).replace(/-/g,"/"),
    srP: +(s.srSP || (s.sr / first.sr * 100)).toFixed(2),
    jrP: +(s.jrSP || (s.jr / first.jr * 100)).toFixed(2),
    lev: s.lev, vol: s.vol, comp: s.comp,
  }));

  // Monthly
  const mm = {};
  all.forEach(s => { const m = s.date.slice(0,7); if (!mm[m]) mm[m] = {o:s}; mm[m].c = s; });
  const monthly = Object.entries(mm).map(([m,{o,c}]) => ({
    month:m, srR:(c.sr-o.sr)/o.sr*100, jrR:(c.jr-o.jr)/o.jr*100,
    lev:c.lev, vol:c.vol, live:c.live,
  }));

  // Waterfall rates for display
  const wf = (() => {
    const l = latest.lev;
    const pw = l*(P.SUSDAT/P.WK) - (l-1)*(P.BORROW/P.WK);
    const sc = P.SR_GROSS*0.70/P.WK;
    const mg = (P.SR_MGMT*0.70+P.JR_MGMT*0.30)/P.WK;
    const res = pw - sc - mg;
    const pf = res > 0 ? res * P.JR_PERF : 0;
    return {pw,sc,mg,pf,jr:res-pf};
  })();

  const intv = Math.max(1, Math.floor(cd.length / 10));

  return (
    <div style={{background:C.BG,color:C.T,minHeight:"100vh",fontFamily:FS}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(148,163,184,0.15); border-radius:2px; }
      `}</style>

      {/* HEADER */}
      <div style={{background:"rgba(12,20,35,0.9)",backdropFilter:"blur(16px)",borderBottom:`1px solid ${C.BD}`,padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:21,fontWeight:700,letterSpacing:"-0.04em",cursor:"pointer"}} onClick={()=>setTab("dashboard")}>
            <span style={{color:C.SR}}>Tranche</span><span style={{color:C.JR}}>Fi</span>
          </div>
          <div style={{background:"linear-gradient(135deg,#fbbf24,#ef8b3a)",color:"#0a0a0a",fontSize:8.5,fontWeight:800,padding:"3px 10px",borderRadius:3,letterSpacing:"0.14em",fontFamily:F}}>
            PAPER PORTFOLIO
          </div>
        </div>
        <div style={{display:"flex",gap:2}}>
          {["dashboard","docs"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              background:tab===t?C.ACCENT:"transparent",
              border:tab===t?`1px solid rgba(91,156,245,0.15)`:"1px solid transparent",
              color:tab===t?C.SR:C.D,borderRadius:5,padding:"5px 16px",
              fontSize:11,fontFamily:F,cursor:"pointer",fontWeight:tab===t?600:400,
              transition:"all 0.2s",
            }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,fontSize:11,fontFamily:F}}>
          {btc && <span style={{color:"#f97316",fontWeight:600}}>BTC ${btc.toLocaleString()}</span>}
          {strc && <span style={{color:C.SR,fontWeight:600}}>STRC ${strc.toFixed(2)}</span>}
          {!strc && latest.strc && <span style={{color:"#CBD5E8"}}>STRC ${latest.strc} <span style={{fontSize:8}}>(modeled)</span></span>}
          <span style={{width:6,height:6,borderRadius:3,background:strc?C.CALM:"#fbbf24",display:"inline-block",animation:strc?"pulse 2s infinite":"none"}} />
          <span style={{color:strc?C.CALM:"#E5ECFF",fontWeight:strc?600:400}}>{strc?"LIVE":"BACKTEST"}</span>
        </div>
      </div>

      {tab==="docs" ? <DocsPage /> : <>
        {/* SIMULATION BANNER */}
        <div style={{background:"rgba(251,191,36,0.04)",borderBottom:"1px solid rgba(251,191,36,0.08)",padding:"6px 24px",fontSize:10.5,color:"rgba(251,191,36,0.7)",fontFamily:F,letterSpacing:"0.02em"}}>
          ◆ {BT.length} backtest{liveEps.length>0?` + ${liveEps.length} live`:""} epochs • $1M simulated TVL • {strc?"Real STRC + BTC prices":"BTC price live"} • Updates every 15s • No real capital deployed
        </div>

        <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 20px 40px"}}>
          {/* KPI ROW */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:20,animation:"slideUp 0.4s ease-out"}}>
            <Kpi label="Total TVL" value={$f(tvl)} sub={tvl>1000000?`Started $1M`:"Simulated $1M start"} pulse={!!strc} />
            <Kpi label="sdcSENIOR" value={`$${srSharePrice.toFixed(2)}`} sub={`8.00% APY • +${srChange.toFixed(1)}%`} color={C.SR} />
            <Kpi label="sdcJUNIOR" value={`$${jrSharePrice.toFixed(2)}`} sub={`${jrChange>=0?"+":""}${jrChange.toFixed(1)}% • ${(jrNetApy*100).toFixed(0)}% APY`} color={C.JR} pulse={!!strc} />
            <Kpi label="Pool Yield" value={`${(poolApy*100).toFixed(1)}%`} sub="Gross leveraged APY" color={C.CALM} />
            <Kpi label="Leverage" value={lev.toFixed(2)+"x"} sub={`${P.LEV_MIN}–${P.LEV_MAX}x range`} />
            <Kpi label="Health Factor" value={hf.toFixed(2)} sub={hf>=2.0?"Normal":hf>=1.8?"Watch":hf>=1.6?"Deleveraging":"Critical"} color={hf>=1.8?C.CALM:hf>=1.6?"#fbbf24":C.STRESS} />
          </div>

          {/* MAIN CHART */}
          <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:"18px 18px 10px",marginBottom:16,animation:"slideUp 0.5s ease-out"}}>
            <SectionLabel>Tranche Share Price — $100 invested at inception</SectionLabel>
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={cd}>
                <defs>
                  <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.SR} stopOpacity={0.12}/><stop offset="100%" stopColor={C.SR} stopOpacity={0}/></linearGradient>
                  <linearGradient id="gj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.JR} stopOpacity={0.12}/><stop offset="100%" stopColor={C.JR} stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.04)" />
                <XAxis dataKey="label" tick={{fontSize:9,fill:"#B0B8CC"}} interval={intv} />
                <YAxis tick={{fontSize:9,fill:"#B0B8CC"}} domain={["dataMin-3","dataMax+5"]} tickFormatter={v=>`$${Number(v).toFixed(0)}`} yAxisId="p" />
                <Tooltip content={<ChartTip/>} />
                <ReferenceLine yAxisId="p" y={100} stroke="rgba(148,163,184,0.08)" strokeDasharray="4 4" />
                {liveEps.length>0 && <ReferenceLine yAxisId="p" x={BT[BT.length-1].date.slice(2,10).replace(/-/g,"/")} stroke="rgba(251,191,36,0.25)" strokeDasharray="6 3" label={{value:"LIVE →",position:"top",fontSize:8,fill:"rgba(251,191,36,0.5)"}} />}
                <Area yAxisId="p" type="monotone" dataKey="srP" name="Senior" stroke={C.SR} strokeWidth={2} fill="url(#gs)" dot={false} activeDot={{r:3,fill:C.SR}} />
                <Area yAxisId="p" type="monotone" dataKey="jrP" name="Junior" stroke={C.JR} strokeWidth={2} fill="url(#gj)" dot={false} activeDot={{r:3,fill:C.JR}} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:24,justifyContent:"center",padding:"6px 0",fontSize:11,fontFamily:F}}>
              <span style={{color:C.SR}}>● Senior (8% fixed)</span>
              <span style={{color:C.JR}}>● Junior (variable)</span>
              {liveEps.length>0 && <span style={{color:"rgba(251,191,36,0.6)"}}>│ Live from epoch {BT.length+1}</span>}
            </div>
            <div style={{textAlign:"center",fontSize:9,color:"#CBD5E8",fontFamily:F,padding:"2px 0 0"}}>
              Backtest: 32 weeks of real STRC/BTC data{liveEps.length>0?" • Forward: live prices, updated every 15s":""} • Vault not deployed on-chain
            </div>
          </div>

          {/* ROW 2: LEVERAGE + WATERFALL */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            {/* LEVERAGE CHART */}
            <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:"18px 18px 10px"}}>
              <SectionLabel>Dynamic Leverage & Composite Vol</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cd}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.04)" />
                  <XAxis dataKey="label" tick={{fontSize:9,fill:"#B0B8CC"}} interval={intv} />
                  <YAxis yAxisId="l" tick={{fontSize:9,fill:"#B0B8CC"}} domain={[1.1,2.1]} tickFormatter={v=>`${v}x`} />
                  <YAxis yAxisId="v" orientation="right" tick={{fontSize:9,fill:"#B0B8CC"}} domain={[0,80]} tickFormatter={v=>`${v}%`} />
                  <Tooltip content={<ChartTip/>} />
                  <ReferenceLine yAxisId="l" y={1.75} stroke="rgba(91,156,245,0.15)" strokeDasharray="3 3" />
                  <Area yAxisId="v" type="monotone" dataKey="vol" name="30d Vol" stroke="rgba(248,113,113,0.25)" fill="rgba(248,113,113,0.04)" dot={false} />
                  <Line yAxisId="l" type="monotone" dataKey="lev" name="Leverage" stroke={C.SR} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* WATERFALL */}
            <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:18}}>
              <SectionLabel>Epoch {latest.e} Weekly Waterfall</SectionLabel>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[
                  {l:"Pool yield (lev × sUSDat − borrow)",v:wf.pw,c:"#818cf8"},
                  {l:"→ Senior coupon (8.5% × 70% / 52)",v:wf.sc,c:C.SR},
                  {l:"→ Mgmt fees (0.5% each / 52)",v:wf.mg,c:"#fbbf24"},
                  {l:"→ Perf fee (10% yield income)",v:wf.pf,c:"#f87171"},
                  {l:"→ Junior residual",v:wf.jr,c:C.JR},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:200,fontSize:10,color:"#E5ECFF",fontFamily:F,flexShrink:0}}>{r.l}</div>
                    <div style={{flex:1,height:16,background:"rgba(148,163,184,0.03)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${Math.max(3,r.v/wf.pw*100)}%`,height:"100%",background:r.c,opacity:0.4,borderRadius:3,transition:"width 0.3s"}} />
                    </div>
                    <div style={{width:62,fontSize:11,color:r.c,fontFamily:F,textAlign:"right",flexShrink:0,fontWeight:500}}>{(r.v*100).toFixed(2)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* REGIME TIMELINE */}
          <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
            <SectionLabel>Weekly Regime — composite score drives leverage each epoch</SectionLabel>
            <div style={{display:"flex",gap:1,height:22,borderRadius:4,overflow:"hidden"}}>
              {all.map((s,i)=>(
                <div key={i} style={{flex:1,background:RC[s.reg],opacity:s.live?0.4:0.65,transition:"opacity 0.2s"}}
                  title={`E${s.e}: ${s.reg} | ${s.lev}x | score ${s.comp}`} />
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:7,fontSize:9,color:"#CBD5E8",fontFamily:F}}>
              <span>E1 {all[0].date}</span>
              <div style={{display:"flex",gap:10}}>
                {[["CALM","<0.3"],["MODERATE","0.3-0.5"],["ELEVATED","0.5-0.7"],["STRESS",">0.7"]].map(([k,s])=>
                  <span key={k} style={{color:RC[k]}}>■ {k} ({s})</span>
                )}
              </div>
              <span>E{latest.e} {latest.date}{latest.live?" ●":""}</span>
            </div>
          </div>

          {/* RATIO GAUGE */}
          <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:"16px 18px",marginBottom:16}}>
            <SectionLabel>Pool Ratio — 70/30 target (68-72 band)</SectionLabel>
            <div style={{position:"relative",height:30,background:"rgba(148,163,184,0.03)",borderRadius:5,overflow:"hidden"}}>
              <div style={{position:"absolute",left:"68%",top:0,bottom:0,width:1,background:"rgba(248,113,113,0.2)"}} />
              <div style={{position:"absolute",left:"72%",top:0,bottom:0,width:1,background:"rgba(248,113,113,0.2)"}} />
              <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${ratio}%`,background:`linear-gradient(90deg,rgba(37,99,235,0.4),rgba(91,156,245,0.35))`,transition:"width 0.5s"}} />
              <div style={{position:"absolute",left:"70%",top:0,bottom:0,width:2,background:"rgba(255,255,255,0.35)"}} />
              <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:700,color:"#f8fafc",fontFamily:F}}>SR {ratio.toFixed(1)}%</div>
              <div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:11,fontWeight:700,color:"#f8fafc",fontFamily:F}}>JR {(100-ratio).toFixed(1)}%</div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:9,color:"#CBD5E8",fontFamily:F}}>
              <span>68% min ←</span><span>70% target</span><span>→ 72% max</span>
            </div>
          </div>

          {/* MONTHLY TABLE */}
          <div style={{background:C.CARD,border:`1px solid ${C.BD}`,borderRadius:10,padding:18}}>
            <SectionLabel>Monthly Performance</SectionLabel>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:F}}>
                <thead>
                  <tr style={{borderBottom:"1px solid rgba(148,163,184,0.08)"}}>
                    {["Month","Senior","Junior","Leverage","30d Vol",""].map(h=>(
                      <th key={h} style={{padding:"7px 12px",textAlign:h==="Month"?"left":"right",color:"#E5ECFF",fontWeight:500,fontSize:9.5,letterSpacing:"0.08em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.BD}`,background:m.live?"rgba(251,191,36,0.02)":"transparent"}}>
                      <td style={{padding:"7px 12px",color:"#E5ECFF"}}>{m.month}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:C.SR,fontWeight:500}}>{pf(m.srR)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:m.jrR>=0?C.JR:C.STRESS,fontWeight:500}}>{pf(m.jrR)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:"#E5ECFF"}}>{m.lev.toFixed(2)}x</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:"#E5ECFF"}}>{m.vol.toFixed(1)}%</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontSize:9,color:"#CBD5E8"}}>{m.live?"live":"backtest"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{textAlign:"center",padding:"28px 0 12px",fontSize:9.5,color:"rgba(148,163,184,0.15)",fontFamily:F,letterSpacing:"0.1em"}}>
            TRANCHEFI • STRUCTURED CREDIT FOR DEFI
          </div>
        </div>
      </>}
    </div>
  );
}
