/* Nextrade AI V5.1 — deterministic, analysis-only Donchian research engine.
 * Entry: 20-bar close breakout with completed 4H EMA50/EMA200 trend filter.
 * Execution: next 1H candle open; initial stop 2 x ATR(14); exit on 10-bar
 * opposite-channel close (filled at next candle open) or stop. Costs are
 * modelled as 0.05 ATR per completed trade. Historical simulation only.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VolatilityStrategy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONFIG = Object.freeze({entryLookback:20,exitLookback:10,atrPeriod:14,trendFast:50,trendSlow:200,stopAtr:2,costAtr:0.05});
  function cleanCandles(input) {
    if (!Array.isArray(input)) return [];
    const byTime = new Map();
    for (const c of input) {
      if (!c) continue;
      const x={epoch:Number(c.epoch),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close)};
      if (!Object.values(x).every(Number.isFinite)||x.epoch<0||x.open<=0||x.high<=0||x.low<=0||x.close<=0||
        x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high)) continue;
      byTime.set(x.epoch,x);
    }
    return [...byTime.values()].sort((a,b)=>a.epoch-b.epoch);
  }
  function emaSeries(values,period) {
    const out=new Array(values.length).fill(null);
    if(values.length<period)return out;
    const k=2/(period+1);let sum=0;
    for(let i=0;i<period;i++)sum+=values[i];
    let v=sum/period;out[period-1]=v;
    for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v;}
    return out;
  }
  function atrSeries(cs,period) {
    const tr=new Array(cs.length).fill(null);
    for(let i=1;i<cs.length;i++){const c=cs[i],p=cs[i-1];tr[i]=Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close));}
    const out=new Array(cs.length).fill(null);if(cs.length<=period)return out;
    let sum=0;for(let i=1;i<=period;i++)sum+=tr[i];
    let v=sum/period;out[period]=v;
    for(let i=period+1;i<cs.length;i++){v=(v*(period-1)+tr[i])/period;out[i]=v;}
    return out;
  }
  function summarize(trades) {
    const wins=trades.filter(t=>t.netR>0),losses=trades.filter(t=>t.netR<0);
    const gp=wins.reduce((s,t)=>s+t.netR,0),gl=-losses.reduce((s,t)=>s+t.netR,0);
    const netR=trades.reduce((s,t)=>s+t.netR,0);let eq=0,peak=0,dd=0;
    for(const t of trades){eq+=t.netR;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
    return {trades:trades.length,wins:wins.length,losses:losses.length,winRate:trades.length?wins.length/trades.length*100:0,
      profitFactor:gl>0?gp/gl:(gp>0?Infinity:0),expectancyR:trades.length?netR/trades.length:0,netR,maxDrawdownR:dd,
      averageWinR:wins.length?gp/wins.length:0,averageLossR:losses.length?-gl/losses.length:0,
      grossProfitR:gp,grossLossR:gl,totalCostsR:trades.reduce((s,t)=>s+t.costR,0)};
  }
  function closePosition(p,fill,epoch,reason,trades) {
    const gross=(p.side==='LONG'?fill-p.entry:p.entry-fill)/p.initialRisk;
    const costR=(CONFIG.costAtr*p.entryAtr)/p.initialRisk;
    trades.push({side:p.side,entry:p.entry,exit:fill,stop:p.stop,signalEpoch:p.signalEpoch,entryEpoch:p.entryEpoch,
      exitEpoch:epoch,reason,grossR:gross,costR,netR:gross-costR});
  }
  function backtest(options={}) {
    const entry=cleanCandles(options.entryCandles),trend=cleanCandles(options.trendCandles);
    if(entry.length<37||trend.length<202)return {summary:{...summarize([]),insufficientData:true,
      reason:'Need at least 37 valid 1H candles and 202 valid 4H candles for configured indicators.'},trades:[],config:{...CONFIG}};
    const fast=emaSeries(trend.map(c=>c.close),50),slow=emaSeries(trend.map(c=>c.close),200),atr=atrSeries(entry,14);
    const trades=[];let pos=null,ti=0;
    for(let i=1;i<entry.length-1;i++){
      const c=entry[i],next=entry[i+1];
      while(ti+1<trend.length&&trend[ti+1].epoch<=c.epoch)ti++;
      const ready=trend[ti]&&trend[ti].epoch<=c.epoch&&fast[ti]!==null&&slow[ti]!==null,atrNow=atr[i];
      if(!Number.isFinite(atrNow)||atrNow<=0)continue;
      if(pos){
        const touched=pos.side==='LONG'?c.low<=pos.stop:c.high>=pos.stop;
        if(touched){const gap=pos.side==='LONG'?c.open<pos.stop:c.open>pos.stop;closePosition(pos,gap?c.open:pos.stop,c.epoch,'initial stop',trades);pos=null;continue;}
        const ch=entry.slice(Math.max(0,i-10),i);
        if(ch.length===10){
          const exitLong=pos.side==='LONG'&&c.close<Math.min(...ch.map(x=>x.low));
          const exitShort=pos.side==='SHORT'&&c.close>Math.max(...ch.map(x=>x.high));
          if(exitLong||exitShort){closePosition(pos,next.open,next.epoch,'10-bar channel exit',trades);pos=null;}
        }
        continue;
      }
      if(!ready||i<20)continue;
      const prior=entry.slice(i-20,i),upper=Math.max(...prior.map(x=>x.high)),lower=Math.min(...prior.map(x=>x.low));
      const up=fast[ti]>slow[ti],down=fast[ti]<slow[ti];
      const side=c.close>upper&&up?'LONG':c.close<lower&&down?'SHORT':null;
      if(!side)continue;
      const fill=next.open,risk=2*atrNow,stop=side==='LONG'?fill-risk:fill+risk;
      if(!Number.isFinite(fill)||fill<=0||stop<=0)continue;
      pos={side,entry:fill,stop,initialRisk:risk,entryEpoch:next.epoch,signalEpoch:c.epoch,entryAtr:atrNow};
    }
    if(pos){const last=entry.at(-1);closePosition(pos,last.close,last.epoch,'end of sample',trades);}
    const summary=summarize(trades);
    return {summary:{...summary,insufficientData:false,sampleStart:entry[0].epoch,sampleEnd:entry.at(-1).epoch,
      entryBars:entry.length,trendBars:trend.length,costModel:'0.05 ATR per completed trade; model assumption, not observed spread or commission.'},
      trades,config:{...CONFIG}};
  }
  return Object.freeze({backtest,cleanCandles,emaSeries,atrSeries,config:CONFIG});
});
