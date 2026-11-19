const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../donchian-engine.js');
function candles(n,start,step,base=100){return Array.from({length:n},(_,i)=>{const close=base+i*step;return {epoch:start+i*3600,open:close-.2,high:close+.5,low:close-.5,close};});}
test('sorts candles and keeps the last duplicate timestamp',()=>{const r=engine.cleanCandles([{epoch:2,open:2,high:3,low:1,close:2},{epoch:1,open:2,high:3,low:1,close:2},{epoch:2,open:2,high:4,low:1,close:3}]);assert.deepEqual(r.map(x=>x.epoch),[1,2]);assert.equal(r[1].close,3);});
test('rejects malformed OHLC candles',()=>assert.equal(engine.cleanCandles([{epoch:1,open:5,high:3,low:4,close:4}]).length,0));
test('EMA waits for full seed period',()=>{const r=engine.emaSeries([1,2,3,4,5],3);assert.equal(r[0],null);assert.equal(r[2],2);assert.ok(r[4]>r[3]);});
test('fails closed with insufficient history',()=>{const r=engine.backtest({entryCandles:candles(80,1000,.1),trendCandles:candles(80,0,14400,200)});assert.equal(r.summary.insufficientData,true);assert.equal(r.trades.length,0);});
test('backtest is deterministic and produces valid risk metrics',()=>{const input={entryCandles:candles(500,100000,.03,100),trendCandles:candles(260,0,14400,100)};const a=engine.backtest(input),b=engine.backtest(input);assert.deepEqual(a,b);assert.equal(a.summary.insufficientData,false);assert.ok(Number.isFinite(a.summary.netR));assert.ok(Number.isFinite(a.summary.maxDrawdownR));for(const t of a.trades){assert.ok(Number.isFinite(t.netR));assert.ok(t.costR>=0);}});
