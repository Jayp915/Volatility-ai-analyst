const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('donchian-engine.js', 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const engine = context.globalThis.VolatilityStrategy;

function candles(count, step, start=0, fn) {
  return Array.from({length:count},(_,i)=>{
    const close=fn?fn(i):100+i*step;
    return {epoch:start+i*3600,open:close,high:close+0.5,low:close-0.5,close};
  });
}
test('EMA series withholds values until its full period is available',()=>{
  const values=engine.emaSeries([1,2,3,4],3);
  assert.equal(values[0],null);assert.equal(values[1],null);assert.ok(Number.isFinite(values[2]));
});
test('backtest rejects bullish breakouts when the 4H trend is bearish',()=>{
  const entry=candles(900,0,0,i=>i<400?100:100+(i%3)*0.1);
  entry[400]={epoch:400*3600,open:100,high:105,low:99.8,close:104};
  const trend=candles(260,-1,0,i=>500-i);
  const result=engine.backtest({entryCandles:entry,trendCandles:trend,config:{fastEma:10,slowEma:30}});
  assert.equal(result.trades.length,0);
});
test('backtest produces a completed trade when a breakout later exits its channel',()=>{
  const entry=candles(1000,0,0,()=>100);
  for(let i=0;i<1000;i++)entry[i]={epoch:i*3600,open:100,high:101,low:99,close:100};
  entry[350]={epoch:350*3600,open:100,high:105,low:99.8,close:104};
  entry[351]={epoch:351*3600,open:104,high:105,low:103,close:104.5};
  for(let i=352;i<365;i++)entry[i]={epoch:i*3600,open:104,high:107,low:103,close:106};
  entry[365]={epoch:365*3600,open:106,high:106.2,low:97,close:98};
  const trend=candles(260,1,0,i=>100+i);
  const result=engine.backtest({entryCandles:entry,trendCandles:trend,config:{fastEma:10,slowEma:30,stopAtr:20,costAtr:0}});
  assert.ok(result.trades.length>=1);
  assert.equal(result.trades[0].side,'BUY');
  assert.equal(result.trades[0].exitReason,'10-candle channel exit');
});
test('transaction-cost assumption reduces net expectancy',()=>{
  const trades=[{grossR:2,atr:1,riskPrice:2},{grossR:-1,atr:1,riskPrice:2}];
  const free=engine.summarize(trades,0),costed=engine.summarize(trades,0.1);
  assert.ok(costed.expectancyR<free.expectancyR);
});
test('empty history returns a safe zero-trade report',()=>{
  const result=engine.backtest({entryCandles:[],trendCandles:[]});
  assert.equal(result.summary.trades,0);
  assert.equal(result.summary.expectancyR,0);
});
