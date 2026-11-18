(function(root){
'use strict';
function emaSeries(values, period){
  const out=new Array(values.length).fill(null);
  if(values.length<period)return out;
  const k=2/(period+1);let value=values[0];
  for(let i=0;i<values.length;i++){
    value=i===0?values[i]:values[i]*k+value*(1-k);
    if(i>=period-1)out[i]=value;
  }
  return out;
}
function atrSeries(candles, period){
  const out=new Array(candles.length).fill(null),trs=[];
  for(let i=0;i<candles.length;i++){
    const c=candles[i],prev=candles[i-1];
    const tr=i===0?c.high-c.low:Math.max(c.high-c.low,Math.abs(c.high-prev.close),Math.abs(c.low-prev.close));
    trs.push(tr);
    if(i>=period-1){
      const slice=trs.slice(i-period+1,i+1);
      out[i]=slice.reduce((a,b)=>a+b,0)/period;
    }
  }
  return out;
}
function trendSeries(candles, fast=50, slow=200){
  const closes=candles.map(c=>c.close),f=emaSeries(closes,fast),s=emaSeries(closes,slow);
  return candles.map((c,i)=>({end:c.epoch+14400,bias:f[i]===null||s[i]===null?'NEUTRAL':f[i]>s[i]?'BULLISH':f[i]<s[i]?'BEARISH':'NEUTRAL'}));
}
function summarize(trades,costAtr=0.05){
  const net=trades.map(t=>t.grossR-(costAtr*t.atr/t.riskPrice));
  const wins=net.filter(x=>x>0),losses=net.filter(x=>x<0);
  const grossWin=wins.reduce((a,b)=>a+b,0),grossLoss=-losses.reduce((a,b)=>a+b,0);
  let equity=0,peak=0,maxDrawdown=0;
  for(const r of net){equity+=r;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity)}
  return {
    trades:trades.length,wins:wins.length,losses:losses.length,
    winRate:trades.length?wins.length/trades.length*100:0,
    profitFactor:grossLoss?grossWin/grossLoss:(grossWin>0?Infinity:0),
    expectancyR:trades.length?net.reduce((a,b)=>a+b,0)/trades.length:0,
    netR:net.reduce((a,b)=>a+b,0),grossR:trades.reduce((a,t)=>a+t.grossR,0),
    maxDrawdownR:maxDrawdown,averageWinR:wins.length?grossWin/wins.length:0,
    averageLossR:losses.length?grossLoss/losses.length:0,costAtr
  };
}
function backtest(options){
  const entryCandles=(options.entryCandles||[]).filter(c=>[c.epoch,c.open,c.high,c.low,c.close].every(Number.isFinite));
  const trendCandles=(options.trendCandles||[]).filter(c=>[c.epoch,c.open,c.high,c.low,c.close].every(Number.isFinite));
  const cfg=Object.assign({lookback:20,exitLookback:10,atrPeriod:14,stopAtr:2,fastEma:50,slowEma:200,entrySeconds:3600,trendSeconds:14400,costAtr:0.05},options.config||{});
  const closes=trendCandles.map(c=>c.close),fast=emaSeries(closes,cfg.fastEma),slow=emaSeries(closes,cfg.slowEma);
  const trend=trendCandles.map((c,i)=>({end:c.epoch+cfg.trendSeconds,bias:fast[i]===null||slow[i]===null?'NEUTRAL':fast[i]>slow[i]?'BULLISH':fast[i]<slow[i]?'BEARISH':'NEUTRAL'}));
  const atr=atrSeries(entryCandles,cfg.atrPeriod),trades=[];
  let trendIndex=-1,i=Math.max(cfg.lookback,cfg.atrPeriod);
  while(i<entryCandles.length-1){
    const signal=entryCandles[i],signalCloseTime=signal.epoch+cfg.entrySeconds;
    while(trendIndex+1<trend.length&&trend[trendIndex+1].end<=signalCloseTime)trendIndex++;
    const bias=trendIndex>=0?trend[trendIndex].bias:'NEUTRAL';
    const av=atr[i];
    if(!Number.isFinite(av)||av<=0||bias==='NEUTRAL'){i++;continue}
    const prior=entryCandles.slice(i-cfg.lookback,i);
    const upper=Math.max(...prior.map(c=>c.high)),lower=Math.min(...prior.map(c=>c.low));
    const side=signal.close>upper&&bias==='BULLISH'?'BUY':signal.close<lower&&bias==='BEARISH'?'SELL':null;
    if(!side){i++;continue}
    const entryBar=entryCandles[i+1],direction=side==='BUY'?1:-1,entry=entryBar.open;
    const riskPrice=av*cfg.stopAtr,stop=entry-direction*riskPrice;
    let exit=null,exitIndex=-1,exitReason='';
    for(let j=i+1;j<entryCandles.length;j++){
      const c=entryCandles[j];
      const stopHit=side==='BUY'?c.low<=stop:c.high>=stop;
      if(stopHit){
        exit=side==='BUY'?(c.open<stop?c.open:stop):(c.open>stop?c.open:stop);
        exitIndex=j;exitReason='ATR stop';break;
      }
      if(j>=cfg.exitLookback){
        const trail=entryCandles.slice(j-cfg.exitLookback,j);
        const channelLow=Math.min(...trail.map(x=>x.low)),channelHigh=Math.max(...trail.map(x=>x.high));
        if(side==='BUY'?c.close<channelLow:c.close>channelHigh){
          exit=c.close;exitIndex=j;exitReason='10-candle channel exit';break;
        }
      }
    }
    if(exit===null)break;
    trades.push({side,signalEpoch:signal.epoch,entryEpoch:entryBar.epoch,exitEpoch:entryCandles[exitIndex].epoch,entry,exit,stop,atr:av,riskPrice,grossR:direction*(exit-entry)/riskPrice,exitReason});
    i=exitIndex+1;
  }
  return {trades,summary:summarize(trades,cfg.costAtr),config:cfg,bars:entryCandles.length,trendBars:trendCandles.length};
}
root.VolatilityStrategy={backtest,summarize,emaSeries,atrSeries};
})(typeof window!=='undefined'?window:globalThis);
