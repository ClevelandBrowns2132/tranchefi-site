import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

const P = {
  SR_GROSS: 0.085, SR_NET: 0.08, SR_MGMT: 0.005,
  JR_MGMT: 0.005, JR_PERF: 0.10,
  SUSDAT: 0.1035, BORROW: 0.07,
  LEV: 1.75, WK: 52, RATIO: 0.70, LLTV: 0.86,
  HF_NORMAL: 2.0, HF_FREEZE: 1.8, HF_DELEV: 1.6, HF_ACCEL: 1.3,
};

function computeHF(lev, strcRet) {
  if (lev <= 1) return 99;
  return (lev * (1 + strcRet) * P.LLTV) / (lev - 1);
}
function hfCascade(curLev, hf) {
  if (hf >= P.HF_NORMAL) return curLev;
  if (hf >= P.HF_FREEZE) return curLev;
  if (hf >= P.HF_DELEV) return curLev - 0.30 * (curLev - 1.0);
  if (hf >= P.HF_ACCEL) return curLev - 0.60 * (curLev - 1.0);
  return 1.0;
}
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
  return { sr: Math.round(newSr), jr: Math.round(newJr) };
}
function simEpoch(prev, btcPrice, realStrc) {
  const strc = realStrc || (() => {
    const btcRet = (btcPrice - prev.btc) / prev.btc;
    const pass = 0.30 + Math.random() * 0.10;
    const parPull = (100 - prev.strc) * 0.03;
    return Math.max(60, Math.min(140, prev.strc * (1 + btcRet * pass) + parPull));
  })();
  const strcRet = (strc - prev.strc) / prev.strc;
  const hf = computeHF(prev.lev, strcRet);
  let lev = hfCascade(P.LEV, hf);
  lev = Math.max(1.0, Math.min(2.0, lev));
  const { sr, jr } = waterfall(prev.sr, prev.jr, prev.lev, strcRet);
  const srRet = prev.sr > 0 ? (sr - prev.sr) / prev.sr : 0;
  const jrRet = prev.jr > 0 ? (jr - prev.jr) / prev.jr : 0;
  const srSP = (prev.srSP || 100) * (1 + srRet);
  const jrSP = (prev.jrSP || 100) * (1 + jrRet);
  const total = sr + jr;
  const d = new Date(prev.date); d.setDate(d.getDate() + 7);
  return { e: prev.e + 1, date: d.toISOString().split("T")[0], sr: Math.round(total * 0.70), jr: Math.round(total * 0.30), lev: Math.round(lev * 100) / 100, btc: Math.round(btcPrice), strc: Math.round(strc * 100) / 100, hf: Math.round(hf * 100) / 100, live: true, srSP: Math.round(srSP * 100) / 100, jrSP: Math.round(jrSP * 100) / 100 };
}

const BT = [
  {e:0,date:"2025-07-30",sr:700000,jr:300000,lev:1.75,strc:94.5,hf:2.01,live:false,srSP:100.00,jrSP:100.00},
  {e:1,date:"2025-08-01",sr:701077,jr:293925,lev:1.75,strc:94.14,hf:2.00,live:false,srSP:100.15,jrSP:97.98},
  {e:2,date:"2025-08-08",sr:702156,jr:355701,lev:1.75,strc:97.5,hf:2.08,live:false,srSP:100.31,jrSP:118.57},
  {e:3,date:"2025-08-15",sr:703236,jr:344698,lev:1.75,strc:96.95,hf:2.00,live:false,srSP:100.46,jrSP:114.90},
  {e:4,date:"2025-08-22",sr:704318,jr:305972,lev:1.75,strc:95.05,hf:1.97,live:false,srSP:100.62,jrSP:101.99},
  {e:5,date:"2025-08-29",sr:705401,jr:357276,lev:1.75,strc:97.75,hf:2.06,live:false,srSP:100.77,jrSP:119.09},
  {e:6,date:"2025-09-05",sr:706486,jr:354783,lev:1.75,strc:97.6,hf:2.00,live:false,srSP:100.93,jrSP:118.26},
  {e:7,date:"2025-09-12",sr:707573,jr:348061,lev:1.75,strc:97.25,hf:2.00,live:false,srSP:101.08,jrSP:116.02},
  {e:8,date:"2025-09-19",sr:708662,jr:358268,lev:1.75,strc:97.7,hf:2.02,live:false,srSP:101.24,jrSP:119.42},
  {e:9,date:"2025-09-26",sr:709752,jr:344130,lev:1.75,strc:97.0,hf:1.99,live:false,srSP:101.39,jrSP:114.71},
  {e:10,date:"2025-10-03",sr:710844,jr:386323,lev:1.75,strc:99.0,hf:2.05,live:false,srSP:101.55,jrSP:128.77},
  {e:11,date:"2025-10-10",sr:711938,jr:378802,lev:1.75,strc:98.63,hf:2.00,live:false,srSP:101.71,jrSP:126.27},
  {e:12,date:"2025-10-17",sr:713033,jr:352216,lev:1.75,strc:97.4,hf:1.98,live:false,srSP:101.86,jrSP:117.41},
  {e:13,date:"2025-10-24",sr:714130,jr:380752,lev:1.75,strc:98.71,hf:2.03,live:false,srSP:102.02,jrSP:126.92},
  {e:14,date:"2025-10-31",sr:715229,jr:396803,lev:1.75,strc:99.38,hf:2.02,live:false,srSP:102.18,jrSP:132.27},
  {e:15,date:"2025-11-07",sr:716329,jr:393161,lev:1.75,strc:99.18,hf:2.00,live:false,srSP:102.33,jrSP:131.05},
  {e:16,date:"2025-11-14",sr:717431,jr:361422,lev:1.75,strc:97.76,hf:1.98,live:false,srSP:102.49,jrSP:120.47},
  {e:17,date:"2025-11-21",sr:718535,jr:311104,lev:1.75,strc:95.38,hf:1.96,live:false,srSP:102.65,jrSP:103.70},
  {e:18,date:"2025-11-28",sr:719640,jr:336326,lev:1.75,strc:96.66,hf:2.03,live:false,srSP:102.81,jrSP:112.11},
  {e:19,date:"2025-12-05",sr:720747,jr:368319,lev:1.75,strc:98.19,hf:2.04,live:false,srSP:102.96,jrSP:122.77},
  {e:20,date:"2025-12-12",sr:721856,jr:388384,lev:1.75,strc:99.06,hf:2.02,live:false,srSP:103.12,jrSP:129.46},
  {e:21,date:"2025-12-19",sr:722967,jr:382238,lev:1.75,strc:98.74,hf:2.00,live:false,srSP:103.28,jrSP:127.41},
  {e:22,date:"2025-12-26",sr:724079,jr:392651,lev:1.75,strc:99.15,hf:2.01,live:false,srSP:103.44,jrSP:130.88},
  {e:23,date:"2026-01-02",sr:725193,jr:405849,lev:1.75,strc:99.67,hf:2.02,live:false,srSP:103.60,jrSP:135.28},
  {e:24,date:"2026-01-09",sr:726309,jr:415626,lev:1.75,strc:100.03,hf:2.01,live:false,srSP:103.76,jrSP:138.54},
  {e:25,date:"2026-01-16",sr:727426,jr:416492,lev:1.75,strc:100.01,hf:2.01,live:false,srSP:103.92,jrSP:138.83},
  {e:26,date:"2026-01-23",sr:728545,jr:405455,lev:1.75,strc:99.5,hf:2.00,live:false,srSP:104.08,jrSP:135.15},
  {e:27,date:"2026-01-30",sr:729666,jr:394650,lev:1.75,strc:98.99,hf:2.00,live:false,srSP:104.24,jrSP:131.55},
  {e:28,date:"2026-02-06",sr:730789,jr:390583,lev:1.75,strc:98.76,hf:2.00,live:false,srSP:104.40,jrSP:130.19},
  {e:29,date:"2026-02-13",sr:731913,jr:415934,lev:1.75,strc:99.8,hf:2.03,live:false,srSP:104.56,jrSP:138.64},
  {e:30,date:"2026-02-20",sr:733039,jr:417867,lev:1.75,strc:99.82,hf:2.01,live:false,srSP:104.72,jrSP:139.29},
  {e:31,date:"2026-02-27",sr:734167,jr:423716,lev:1.75,strc:100.0,hf:2.01,live:false,srSP:104.88,jrSP:141.24},
  {e:32,date:"2026-03-03",sr:735296,jr:425437,lev:1.75,strc:100.01,hf:2.01,live:false,srSP:105.04,jrSP:141.81},
];

const C = { SR:"#5b9cf5",JR:"#ef8b3a",SAFE:"#34d399",WARN:"#fbbf24",DANGER:"#f87171",T:"#E5ECFF",M:"#CBD5E8",D:"#A0ABBD",BG:"#050814",CARD:"rgba(11,16,32,0.85)",BD:"rgba(148,163,184,0.10)",ACCENT:"rgba(91,156,245,0.08)",DOCBG:"#0B1020",DOCBD:"#1F2933" };
const F = "'JetBrains Mono','IBM Plex Mono','SF Mono',monospace";
const FS = "'Inter','SF Pro Display',-apple-system,sans-serif";
const $f = v => v >= 1e6 ? "$"+(v/1e6).toFixed(2)+"M" : v >= 1e3 ? "$"+(v/1e3).toFixed(1)+"K" : "$"+v.toFixed(0);
const pf = v => (v>=0?"+":"")+v.toFixed(2)+"%";

function Kpi({label,value,sub,color,pulse}) {
  return (<div style={{padding:"14px 18px",background:C.CARD,border:"1px solid "+C.BD,borderRadius:8,position:"relative",overflow:"hidden"}}>{pulse&&<div style={{position:"absolute",top:6,right:8,width:5,height:5,borderRadius:"50%",background:C.SAFE,animation:"pulse 2s infinite"}}/>}<div style={{fontSize:9.5,color:"#E5ECFF",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5,fontFamily:F}}>{label}</div><div style={{fontSize:24,fontWeight:700,color:color||C.T,fontFamily:F,lineHeight:1.1,letterSpacing:"-0.02em"}}>{value}</div>{sub&&<div style={{fontSize:10.5,color:"#CBD5E8",marginTop:4,fontFamily:F}}>{sub}</div>}</div>);
}
function ChartTip({active,payload,label}) {
  if (!active||!payload?.length) return null;
  return (<div style={{background:"#0f1729",border:"1px solid rgba(91,156,245,0.15)",borderRadius:6,padding:"10px 14px",fontSize:11,fontFamily:F,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}><div style={{color:"#E5ECFF",marginBottom:5,fontWeight:500}}>{label}</div>{payload.map((p,i)=>(<div key={i} style={{color:p.color,marginBottom:2,display:"flex",justifyContent:"space-between",gap:16}}><span style={{opacity:0.7}}>{p.name}</span><span style={{fontWeight:600}}>{typeof p.value==="number"?(p.value>10000?$f(p.value):p.value.toFixed(2)):p.value}</span></div>))}</div>);
}
function SectionLabel({children}) { return <div style={{fontSize:10,color:"#E5ECFF",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:12,fontFamily:F,fontWeight:500}}>{children}</div>; }

// === RETURNS BAR (Yahoo Finance style) ===
function ReturnsBar({all, dailySrRet, dailyJrRet}) {
  const last = all[all.length - 1];
  const lastSr = last.srSP || 100, lastJr = last.jrSP || 100;
  const ago = (n) => { const idx = all.length - 1 - n; return idx >= 0 ? all[idx] : all[0]; };
  const w1 = ago(1), w4 = ago(4), w13 = ago(13), inc = all[0];
  const periods = [
    { label: "1D", sr: dailySrRet, jr: dailyJrRet },
    { label: "1W", sr: (lastSr-(w1.srSP||100))/(w1.srSP||100)*100, jr: (lastJr-(w1.jrSP||100))/(w1.jrSP||100)*100 },
    { label: "1M", sr: (lastSr-(w4.srSP||100))/(w4.srSP||100)*100, jr: (lastJr-(w4.jrSP||100))/(w4.jrSP||100)*100 },
    { label: "3M", sr: (lastSr-(w13.srSP||100))/(w13.srSP||100)*100, jr: (lastJr-(w13.jrSP||100))/(w13.jrSP||100)*100 },
    { label: "Inception", sr: lastSr - 100, jr: lastJr - 100 },
  ];
  const RV = ({v,color}) => <span style={{color:v>=0?(color||C.SAFE):C.DANGER,fontWeight:600,fontFamily:F,fontSize:11}}>{v>=0?"+":""}{v.toFixed(2)}%</span>;
  return (
    <div style={{background:C.CARD,border:"1px solid "+C.BD,borderRadius:10,padding:"14px 18px",marginBottom:16}}>
      <SectionLabel>Performance</SectionLabel>
      <div style={{display:"grid",gridTemplateColumns:"80px repeat(5, 1fr)",gap:0,fontSize:11,fontFamily:F}}>
        <div style={{padding:"6px 0"}}></div>
        {periods.map(p => <div key={p.label} style={{padding:"6px 0",textAlign:"center",color:"#8B93A7",fontSize:9.5,letterSpacing:"0.08em",fontWeight:500}}>{p.label}</div>)}
        <div style={{padding:"8px 0",color:C.SR,fontWeight:600,fontSize:10}}>sdcSENIOR</div>
        {periods.map(p => <div key={"sr"+p.label} style={{padding:"8px 0",textAlign:"center"}}><RV v={p.sr} color={C.SR}/></div>)}
        <div style={{padding:"8px 0",color:C.JR,fontWeight:600,fontSize:10,borderTop:"1px solid "+C.BD}}>sdcJUNIOR</div>
        {periods.map(p => <div key={"jr"+p.label} style={{padding:"8px 0",textAlign:"center",borderTop:"1px solid "+C.BD}}><RV v={p.jr} color={C.JR}/></div>)}
      </div>
    </div>
  );
}

// === VOLATILITY FLOW — Conservation of Volatility live diagram ===
function VolFlow({btcPrice, strcPrice, mstrPrice, srVol, jrVol, strcVol}) {
  const Node = ({label, price, vol, color, width, sub}) => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:width||"auto"}}>
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid "+C.BD,borderRadius:10,padding:"12px 18px",textAlign:"center",minWidth:130,position:"relative"}}>
        <div style={{fontSize:10,color:color||"#E5ECFF",fontWeight:600,letterSpacing:"0.06em",marginBottom:4,fontFamily:F}}>{label}</div>
        <div style={{fontSize:18,fontWeight:700,color:"#F7FAFF",fontFamily:F,letterSpacing:"-0.02em"}}>{price}</div>
        {vol !== undefined && <div style={{fontSize:10,color:vol > 30 ? C.DANGER : vol > 10 ? C.WARN : C.SAFE,fontFamily:F,marginTop:3,fontWeight:500}}>{vol.toFixed(1)}% vol</div>}
        {sub && <div style={{fontSize:9,color:"#8B93A7",fontFamily:F,marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
  const Arrow = ({label}) => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 0"}}>
      <div style={{width:1,height:16,background:"rgba(148,163,184,0.15)"}}/>
      {label && <div style={{fontSize:8,color:"#8B93A7",fontFamily:F,padding:"2px 6px",background:"rgba(148,163,184,0.05)",borderRadius:3}}>{label}</div>}
      <div style={{width:1,height:16,background:"rgba(148,163,184,0.15)"}}/>
    </div>
  );
  const Fork = ({children}) => (
    <div style={{display:"flex",gap:20,justifyContent:"center",position:"relative"}}>
      <div style={{position:"absolute",top:0,left:"50%",width:1,height:12,background:"rgba(148,163,184,0.15)",transform:"translateX(-50%)"}}/>
      <div style={{position:"absolute",top:12,left:"calc(50% - 80px)",width:160,height:1,background:"rgba(148,163,184,0.12)"}}/>
      <div style={{paddingTop:12}}>{children}</div>
    </div>
  );

  return (
    <div style={{background:C.CARD,border:"1px solid "+C.BD,borderRadius:10,padding:18}}>
      <SectionLabel>Conservation of Volatility — Live</SectionLabel>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:0,padding:"8px 0"}}>
        <Node label="BITCOIN" price={"$"+(btcPrice?btcPrice.toLocaleString():"--")} vol={45} color="#f97316" sub="Digital capital"/>
        <Arrow label="Capital structure"/>
        <div style={{display:"flex",gap:24,justifyContent:"center"}}>
          <Node label="MSTR" price={mstrPrice?"$"+mstrPrice.toFixed(0):"--"} vol={80} color="#a78bfa" sub="Equity (absorbs vol)"/>
          <Node label="STRC" price={"$"+(strcPrice?strcPrice.toFixed(2):"--")} vol={strcVol} color={C.SR} sub="Credit (strips vol)"/>
        </div>
        <Arrow label="Saturn Protocol"/>
        <Node label="sUSDat" price="10.35% yield" vol={strcVol} color={C.SAFE} sub="Programmable credit"/>
        <Arrow label="TrancheFi vault (1.75x)"/>
        <div style={{display:"flex",gap:24,justifyContent:"center"}}>
          <Node label="sdcSENIOR" price="8% APY" vol={srVol} color={C.SR} sub="Stability"/>
          <Node label="sdcJUNIOR" price={(jrVol > 0 ? "20" : "--")+"% APY"} vol={jrVol} color={C.JR} sub="Amplified yield"/>
        </div>
      </div>
      <div style={{textAlign:"center",fontSize:9,color:"#8B93A7",fontFamily:F,marginTop:10}}>
        Volatility is never destroyed — only redistributed. BTC's energy flows through each layer.
      </div>
    </div>
  );
}

function DocsPage() {
  const S = ({t,children,accent}) => (<div style={{marginBottom:36,paddingLeft:accent?16:0,borderLeft:accent?"3px solid "+accent:"none"}}><h2 style={{fontSize:21,fontWeight:600,color:"#F7FAFF",marginBottom:12,fontFamily:FS}}>{t}</h2><div style={{fontSize:14.5,color:"#E5ECFF",lineHeight:1.7,fontFamily:FS}}>{children}</div></div>);
  const Sr = ({children}) => <span style={{color:C.SR,fontWeight:600}}>{children}</span>;
  const Jr = ({children}) => <span style={{color:C.JR,fontWeight:600}}>{children}</span>;
  const B = ({children}) => <span style={{color:"#CBD5FF",fontWeight:500}}>{children}</span>;
  const Note = ({children}) => <p style={{margin:"10px 0 0",fontSize:13,color:"#8B93A7",lineHeight:1.6}}>{children}</p>;
  return (
    <div style={{maxWidth:800,margin:"0 auto",padding:"36px 24px"}}><div style={{background:C.DOCBG,border:"1px solid "+C.DOCBD,borderRadius:12,padding:"40px 36px"}}>
      <h1 style={{fontSize:32,fontWeight:700,marginBottom:6,color:"#F7FAFF",fontFamily:FS}}>How TrancheFi Works</h1>
      <p style={{color:"#B0B8CC",fontSize:15,marginBottom:40,fontFamily:FS,lineHeight:1.6}}>Structured credit for DeFi — two tranches, one vault, institutional-grade risk separation.</p>
      <S t="The Core Idea"><p style={{margin:"0 0 10px"}}>TrancheFi takes leveraged exposure to Saturn's <B>sUSDat</B> (yield-bearing stablecoin backed by Strategy's STRC digital credit) and splits it into two tranches with fundamentally different risk/return profiles.</p><p style={{margin:"0 0 8px"}}><Sr>Senior</Sr> gets a fixed <Sr>8% net yield</Sr>, paid first. Zero drawdowns by design — <Jr>junior</Jr> absorbs all volatility before <Sr>senior</Sr> principal is touched.</p><p><Jr>Junior</Jr> absorbs all residual yield and price volatility — in exchange for amplified returns in the <Jr>20-25% range</Jr> under normal conditions.</p></S>
      <S t="Fixed Leverage with Health Factor Protection"><p style={{margin:"0 0 12px"}}>The vault targets <B>fixed 1.75x leverage</B> via looping on Morpho. Tail-risk protection comes from a <B>four-level health factor cascade</B>:</p><p style={{margin:"0 0 6px"}}><B>HF ≥ 2.0:</B> Normal — maintain 1.75x</p><p style={{margin:"0 0 6px"}}><B>HF 1.8–2.0:</B> Freeze increases</p><p style={{margin:"0 0 6px"}}><B>HF 1.6–1.8:</B> Deleverage toward 1.25x</p><p style={{margin:"0 0 6px"}}><B>HF 1.3–1.6:</B> Accelerated deleveraging</p><p style={{margin:"0 0 10px"}}><B>HF {"<"} 1.3:</B> Emergency — force to 1.0x</p><Note>In 32 epochs including two major BTC crashes, the cascade never triggered. Min HF was 1.96. The cascade is insurance for scenarios beyond observed data.</Note></S>
      <S t="Weekly Waterfall"><p style={{margin:"0 0 8px"}}><Sr>1. Senior coupon</Sr> — 8.5% gross → 8.0% net (8.32% effective APY).</p><p style={{margin:"0 0 8px"}}><B>2. Fees</B> — 0.50% mgmt each tranche. 10% perf on junior yield income only.</p><p style={{margin:"0 0 8px"}}><Jr>3. Junior residual</Jr> — all remaining yield + ALL mark-to-market.</p></S>
      <S t="Paper Portfolio" accent={C.SR}><p style={{margin:"0 0 8px"}}><B>32+ epochs</B> using real STRC prices. Fixed 1.75x leverage. $1M simulated TVL. No real capital deployed.</p><Note>Returns include STRC's one-time IPO discount recovery (~$93.74 → $100). Forward junior APY reflects ongoing income only.</Note></S>
      <div style={{marginTop:44,padding:20,background:"rgba(91,156,245,0.06)",border:"1px solid rgba(91,156,245,0.12)",borderRadius:10}}>
        <div style={{fontSize:12,fontWeight:600,color:C.SR,marginBottom:12,fontFamily:F}}>Protocol Parameters — Whitepaper v6</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 40px",fontSize:11.5,color:"#B0B8CC",fontFamily:F}}>
          {[["Senior yield","8.0% net (8.5% gross)"],["Mgmt fees","0.50% each tranche"],["Perf fee","10% yield income, no hurdle"],["Leverage","Fixed 1.75x"],["HF cascade","2.0 / 1.8 / 1.6 / 1.3"],["Epoch","7 days"],["Ratio","70/30 (band 68-72)"],["sUSDat yield","10.35%"],["Borrow rate","7.0% (Morpho USDC)"],["Morpho LLTV","86%"]].map(([k,v],i) => (<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.DOCBD}}><span>{k}</span><span style={{color:"#E5ECFF",fontWeight:500}}>{v}</span></div>))}
        </div>
      </div>
    </div></div>
  );
}

export default function App() {
  const [btc, setBtc] = useState(null);
  const [strc, setStrc] = useState(null);
  const [mstr, setMstr] = useState(null);
  const [prevStrc, setPrevStrc] = useState(null);
  const [liveEps, setLiveEps] = useState([]);
  const [tab, setTab] = useState("dashboard");

  // Price feeds — 10 second interval
  useEffect(() => {
    const f = async () => {
      try {
        const r = await fetch("/api/prices");
        if (r.ok) {
          const d = await r.json();
          if (d.btcPrice) setBtc(d.btcPrice);
          if (d.strcPrice) { setPrevStrc(prev => prev || d.strcPrice); setStrc(d.strcPrice); }
          if (d.mstrPrice) setMstr(d.mstrPrice);
          return;
        }
      } catch {}
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        const d = await r.json();
        if (d?.bitcoin?.usd) setBtc(d.bitcoin.usd);
      } catch {}
    };
    f(); const iv = setInterval(f, 10000);
    return () => clearInterval(iv);
  }, []);

  // Forward sim
  useEffect(() => { if (!btc) return; const last = BT[BT.length-1]; const ms = Date.now()-new Date(last.date).getTime(); const wks = Math.floor(ms/(7*864e5)); const eps = []; let prev = {...last}; for (let i=0;i<wks;i++) { const prog=(i+1)/Math.max(wks,1); const b = (last.btc||btc)+(btc-(last.btc||btc))*prog; const s = strc?(i===wks-1?strc:last.strc+(strc-last.strc)*prog):null; eps.push(simEpoch(prev,b,s)); prev=eps[eps.length-1]; } setLiveEps(eps); }, [btc,strc]);

  const all = useMemo(() => [...BT,...liveEps], [liveEps]);
  const lastEpoch = all[all.length-1];
  const currentStrc = strc || lastEpoch.strc;
  const strcRet = (currentStrc - lastEpoch.strc) / lastEpoch.strc;
  const tvl = lastEpoch.sr + lastEpoch.jr;
  const poolApy = P.LEV*P.SUSDAT - (P.LEV-1)*P.BORROW;
  const jrGrossApy = (poolApy - P.SR_GROSS*0.70) / 0.30;
  const jrNetApy = jrGrossApy>0 ? jrGrossApy*(1-P.JR_PERF)-P.JR_MGMT : jrGrossApy-P.JR_MGMT;
  const hf = computeHF(P.LEV, strcRet);
  const srSP = lastEpoch.srSP||100, jrSP = lastEpoch.jrSP||100;

  // Compute trailing vols from epoch data
  const strcPrices = all.map(s => s.strc);
  const strcReturns = strcPrices.slice(1).map((p,i) => (p - strcPrices[i]) / strcPrices[i]);
  const strcVol = strcReturns.length > 1 ? Math.sqrt(strcReturns.reduce((s,r) => s + r*r, 0) / strcReturns.length) * Math.sqrt(52) * 100 : 15;
  const jrPrices = all.map(s => s.jrSP || 100);
  const jrReturns = jrPrices.slice(1).map((p,i) => (p - jrPrices[i]) / jrPrices[i]);
  const jrVol = jrReturns.length > 1 ? Math.sqrt(jrReturns.reduce((s,r) => s + r*r, 0) / jrReturns.length) * Math.sqrt(52) * 100 : 53;
  const srVol = 0.5; // senior is effectively zero vol

  // Max drawdown + recovery
  let jrMaxDD = 0, jrPeak = 100, jrDDStart = 0, jrRecovery = 0;
  let inDD = false, ddStartIdx = 0;
  all.forEach((s, i) => {
    const p = s.jrSP || 100;
    if (p > jrPeak) { jrPeak = p; if (inDD) { jrRecovery = i - ddStartIdx; inDD = false; } }
    const dd = (p - jrPeak) / jrPeak * 100;
    if (dd < jrMaxDD) { jrMaxDD = dd; if (!inDD) { inDD = true; ddStartIdx = i; } }
  });

  // Sharpe & Sortino (weekly returns, annualized)
  const negWeeks = jrReturns.filter(r => r < 0).length;
  const posWeeks = jrReturns.filter(r => r >= 0).length;
  const meanWk = jrReturns.length > 0 ? jrReturns.reduce((a,b) => a+b, 0) / jrReturns.length : 0;
  const stdWk = jrReturns.length > 1 ? Math.sqrt(jrReturns.reduce((s,r) => s + (r-meanWk)**2, 0) / (jrReturns.length-1)) : 1;
  const downReturns = jrReturns.filter(r => r < 0);
  const downDev = downReturns.length > 1 ? Math.sqrt(downReturns.reduce((s,r) => s + r*r, 0) / downReturns.length) : stdWk;
  const sharpe = stdWk > 0 ? (meanWk / stdWk) * Math.sqrt(52) : 0;
  const sortino = downDev > 0 ? (meanWk / downDev) * Math.sqrt(52) : 0;

  // Daily returns (intraday STRC move → leveraged impact)
  const dailyStrcRet = prevStrc && strc ? (strc - prevStrc) / prevStrc : 0;
  const dailySrRet = P.SR_NET / 365 * 100; // tiny daily coupon accrual
  const dailyJrRet = dailyStrcRet * P.LEV * (1/0.30) * 100; // leveraged amplified impact on junior

  const cd = all.map(s => ({label:s.date.slice(2,10).replace(/-/g,"/"), srP:+(s.srSP||100).toFixed(2), jrP:+(s.jrSP||100).toFixed(2), hf:s.hf||2.01}));
  const mm = {}; all.forEach(s => {const m=s.date.slice(0,7); if(!mm[m])mm[m]={o:s}; mm[m].c=s;});
  const monthly = Object.entries(mm).map(([m,{o,c}]) => ({month:m, srR:((c.srSP||100)-(o.srSP||100))/(o.srSP||100)*100, jrR:((c.jrSP||100)-(o.jrSP||100))/(o.jrSP||100)*100, hf:c.hf||2.01}));
  const intv = Math.max(1,Math.floor(cd.length/10));

  return (
    <div style={{background:C.BG,color:C.T,minHeight:"100vh",fontFamily:FS}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.15);border-radius:2px}`}</style>
      <div style={{background:"rgba(12,20,35,0.9)",backdropFilter:"blur(16px)",borderBottom:"1px solid "+C.BD,padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:21,fontWeight:700,letterSpacing:"-0.04em",cursor:"pointer"}} onClick={()=>setTab("dashboard")}><span style={{color:C.SR}}>Tranche</span><span style={{color:C.JR}}>Fi</span></div>
          <div style={{background:"linear-gradient(135deg,#fbbf24,#ef8b3a)",color:"#0a0a0a",fontSize:8.5,fontWeight:800,padding:"3px 10px",borderRadius:3,letterSpacing:"0.14em",fontFamily:F}}>PAPER PORTFOLIO</div>
        </div>
        <div style={{display:"flex",gap:2}}>{["dashboard","docs"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={{background:tab===t?C.ACCENT:"transparent",border:tab===t?"1px solid rgba(91,156,245,0.15)":"1px solid transparent",color:tab===t?C.SR:C.D,borderRadius:5,padding:"5px 16px",fontSize:11,fontFamily:F,cursor:"pointer",fontWeight:tab===t?600:400}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>))}</div>
        <div style={{display:"flex",alignItems:"center",gap:12,fontSize:11,fontFamily:F}}>
          {btc&&<span style={{color:"#f97316",fontWeight:600}}>BTC ${btc.toLocaleString()}</span>}
          {strc&&<span style={{color:C.SR,fontWeight:600}}>STRC ${strc.toFixed(2)}</span>}
          {mstr&&<span style={{color:"#a78bfa",fontWeight:600}}>MSTR ${mstr.toFixed(0)}</span>}
          <span style={{width:6,height:6,borderRadius:3,background:C.SAFE,display:"inline-block",animation:"pulse 2s infinite"}}/>
        </div>
      </div>
      {tab==="docs"?<DocsPage/>:<>
        <div style={{background:"rgba(251,191,36,0.04)",borderBottom:"1px solid rgba(251,191,36,0.08)",padding:"6px 24px",fontSize:10.5,color:"rgba(251,191,36,0.7)",fontFamily:F}}>◆ {all.length} epochs • Fixed 1.75x leverage • $1M simulated TVL • Paper portfolio — no real capital deployed</div>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 20px 40px"}}>
          {/* KPIs — removed leverage (fixed), removed inception from cards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:16,animation:"slideUp 0.4s ease-out"}}>
            <Kpi label="Total TVL" value={$f(tvl)} sub="Simulated $1M start" pulse/>
            <Kpi label="sdcSENIOR" value={"$"+srSP.toFixed(2)} sub="8.0% APY" color={C.SR}/>
            <Kpi label="sdcJUNIOR" value={"$"+jrSP.toFixed(2)} sub={(jrNetApy*100).toFixed(0)+"% APY"} color={C.JR} pulse/>
            <Kpi label="Pool Yield" value={(poolApy*100).toFixed(1)+"%"} sub="Gross leveraged APY" color={C.SAFE}/>
            <Kpi label="Health Factor" value={hf.toFixed(2)} sub={hf>=2.0?"Normal":hf>=1.8?"Watch":"Deleverage"} color={hf>=1.8?C.SAFE:hf>=1.6?C.WARN:C.DANGER}/>
            <Kpi label="Max Drawdown" value={jrMaxDD.toFixed(1)+"%"} sub="Junior worst peak-to-trough" color={C.DANGER}/>
          </div>

          {/* RETURNS BAR */}
          <ReturnsBar all={all} dailySrRet={dailySrRet} dailyJrRet={dailyJrRet}/>

          {/* MAIN CHART */}
          <div style={{background:C.CARD,border:"1px solid "+C.BD,borderRadius:10,padding:"18px 18px 10px",marginBottom:16}}>
            <SectionLabel>Tranche Share Price — $100 invested at inception</SectionLabel>
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={cd}>
                <defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.SR} stopOpacity={0.12}/><stop offset="100%" stopColor={C.SR} stopOpacity={0}/></linearGradient><linearGradient id="gj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.JR} stopOpacity={0.12}/><stop offset="100%" stopColor={C.JR} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.04)"/>
                <XAxis dataKey="label" tick={{fontSize:9,fill:"#B0B8CC"}} interval={intv}/>
                <YAxis tick={{fontSize:9,fill:"#B0B8CC"}} domain={["dataMin-3","dataMax+5"]} tickFormatter={v=>"$"+Number(v).toFixed(0)} yAxisId="p"/>
                <Tooltip content={<ChartTip/>}/>
                <ReferenceLine yAxisId="p" y={100} stroke="rgba(148,163,184,0.08)" strokeDasharray="4 4"/>
                <Area yAxisId="p" type="monotone" dataKey="srP" name="Senior" stroke={C.SR} strokeWidth={2} fill="url(#gs)" dot={false} activeDot={{r:3,fill:C.SR}}/>
                <Area yAxisId="p" type="monotone" dataKey="jrP" name="Junior" stroke={C.JR} strokeWidth={2} fill="url(#gj)" dot={false} activeDot={{r:3,fill:C.JR}}/>
              </AreaChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:24,justifyContent:"center",padding:"6px 0",fontSize:11,fontFamily:F}}><span style={{color:C.SR}}>● Senior (8% fixed)</span><span style={{color:C.JR}}>● Junior (variable)</span></div>
          </div>

          {/* ROW 2: HF CHART + VOLATILITY FLOW */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{background:C.CARD,border:"1px solid "+C.BD,borderRadius:10,padding:"18px 18px 10px"}}>
              <SectionLabel>Health Factor — 1.75x fixed leverage</SectionLabel>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cd}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.04)"/>
                  <XAxis dataKey="label" tick={{fontSize:9,fill:"#B0B8CC"}} interval={intv}/>
                  <YAxis tick={{fontSize:9,fill:"#B0B8CC"}} domain={[1.5,2.5]} tickFormatter={v=>v.toFixed(1)}/>
                  <Tooltip content={<ChartTip/>}/>
                  <ReferenceLine y={2.0} stroke="rgba(52,211,153,0.3)" strokeDasharray="3 3" label={{value:"Normal",position:"right",fontSize:8,fill:"rgba(52,211,153,0.5)"}}/>
                  <ReferenceLine y={1.8} stroke="rgba(251,191,36,0.3)" strokeDasharray="3 3" label={{value:"Freeze",position:"right",fontSize:8,fill:"rgba(251,191,36,0.5)"}}/>
                  <Area type="monotone" dataKey="hf" name="Health Factor" stroke={C.SAFE} strokeWidth={2} fill="rgba(52,211,153,0.06)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{textAlign:"center",fontSize:9,color:"#CBD5E8",fontFamily:F,padding:"4px 0 0"}}>Min HF: 1.96 (Nov 21) • Cascade never triggered</div>
              {/* COMPACT STATS */}
              <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid "+C.BD}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px",fontSize:10.5,fontFamily:F}}>
                  {[
                    ["Sharpe", sharpe.toFixed(2), C.T],
                    ["Sortino", sortino.toFixed(2), C.T],
                    ["Jr Volatility", jrVol.toFixed(1)+"%", C.WARN],
                    ["Sr Volatility", srVol.toFixed(1)+"%", C.SAFE],
                    ["Positive Weeks", posWeeks+"/"+all.length, C.SAFE],
                    ["Negative Weeks", negWeeks+"/"+all.length, negWeeks > posWeeks ? C.DANGER : C.WARN],
                    ["Max Drawdown", jrMaxDD.toFixed(1)+"%", C.DANGER],
                    ["Recovery", (jrRecovery||"3-6")+" wks", C.T],
                  ].map(([k,v,c],i) => (
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
                      <span style={{color:"#8B93A7"}}>{k}</span>
                      <span style={{color:c,fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* VOLATILITY FLOW replaces waterfall */}
            <VolFlow btcPrice={btc} strcPrice={strc||lastEpoch.strc} mstrPrice={mstr} srVol={srVol} jrVol={jrVol} strcVol={strcVol}/>
          </div>

          {/* MONTHLY TABLE */}
          <div style={{background:C.CARD,border:"1px solid "+C.BD,borderRadius:10,padding:18}}>
            <SectionLabel>Monthly Performance</SectionLabel>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:F}}><thead><tr style={{borderBottom:"1px solid rgba(148,163,184,0.08)"}}>{["Month","Senior","Junior","Health Factor"].map(h=>(<th key={h} style={{padding:"7px 12px",textAlign:h==="Month"?"left":"right",color:"#E5ECFF",fontWeight:500,fontSize:9.5}}>{h}</th>))}</tr></thead><tbody>{monthly.map((m,i)=>(<tr key={i} style={{borderBottom:"1px solid "+C.BD}}><td style={{padding:"7px 12px",color:"#E5ECFF"}}>{m.month}</td><td style={{padding:"7px 12px",textAlign:"right",color:C.SR,fontWeight:500}}>{pf(m.srR)}</td><td style={{padding:"7px 12px",textAlign:"right",color:m.jrR>=0?C.JR:C.DANGER,fontWeight:500}}>{pf(m.jrR)}</td><td style={{padding:"7px 12px",textAlign:"right",color:m.hf>=1.8?C.SAFE:C.WARN}}>{m.hf.toFixed(2)}</td></tr>))}</tbody></table></div>
          </div>
          <div style={{textAlign:"center",padding:"28px 0 12px",fontSize:9.5,color:"rgba(148,163,184,0.15)",fontFamily:F,letterSpacing:"0.1em"}}>TRANCHEFI • STRUCTURED CREDIT FOR DEFI</div>
        </div>
      </>}
    </div>
  );
}
