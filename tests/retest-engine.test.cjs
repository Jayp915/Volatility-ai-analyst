const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
assert.ok(scripts.length, 'index.html must contain its application script');
for (const script of scripts) new Function(script);

function between(name, next) {
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('\nfunction ' + next + '(', start);
  assert.ok(start >= 0 && end > start, 'could not extract ' + name);
  return html.slice(start, end);
}
const helpers = [
  between('atr', 'levels'),
  between('confirmedPivots', 'priorStructureBias'),
  between('priorStructureBias', 'detectRetestSetup'),
  between('detectRetestSetup', 'alignmentScore'),
  between('alignmentScore', 'recordSignal')
].join('\n');
const runEngine = new Function('cs', 'g', helpers + '\nreturn detectRetestSetup(cs, g);');
const runAlignment = new Function('side', 'biases', 'type',
  between('alignmentScore', 'recordSignal') + '\nreturn alignmentScore(side, biases, type);');

const baseEpoch = 1700000000;
function candle(i, open, close, high, low) {
  return { epoch: baseEpoch + i * 60, open, close, high, low };
}
function bosCandles(side = 'BUY') {
  const flip = p => side === 'BUY' ? p : 200 - p;
  const make = (i, o, c, h, l) => ({
    epoch: baseEpoch + i * 60,
    open: flip(o), close: flip(c),
    high: side === 'BUY' ? h : 200 - l,
    low: side === 'BUY' ? l : 200 - h
  });
  const a = Array.from({ length: 84 }, (_, i) => make(i, 100, 100.1, 101, 99));
  a[78] = make(78, 99.5, 99.8, 100.5, 98);
  a[80] = make(80, 100.5, 100.8, 102, 99);
  a[81] = make(81, 100.5, 100.8, 101, 99);
  a[82] = make(82, 100.5, 100.8, 101, 99);
  a[83] = make(83, 100.5, 100.8, 101.2, 99);
  a.push(make(84, 101.5, 102.8, 103, 101.4));
  a.push(make(85, 102.6, 102.2, 102.8, 101.95));
  a.push(make(86, 102.2, 103, 103.2, 102.1));
  return a;
}
function chochCandles() {
  const a = Array.from({ length: 84 }, (_, i) => candle(i, 100, 100.1, 101, 99));
  for (const [i, h] of [[60, 105], [70, 104], [80, 103]]) a[i] = candle(i, 100, 100.2, h, 99);
  for (const [i, l] of [[65, 95], [75, 94], [82, 93]]) a[i] = candle(i, 100, 99.8, 101, l);
  a[81] = candle(81, 100, 99.8, 101, 99);
  a[83] = candle(83, 100, 100, 101, 99);
  a.push(candle(84, 102, 104, 104.3, 101.8));
  a.push(candle(85, 103.8, 103.5, 104, 103.1));
  a.push(candle(86, 103.5, 104.5, 104.7, 103.4));
  return a;
}

test('confirms bullish BOS only after a later retest and confirmation candle', () => {
  const result = runEngine(bosCandles('BUY'), 60);
  assert.equal(result.side, 'BUY');
  assert.equal(result.type, 'BOS');
  assert.ok(result.breakout.epoch < result.retest.epoch);
  assert.ok(result.retest.epoch < result.confirmation.epoch);
});
test('confirms bearish BOS', () => {
  const result = runEngine(bosCandles('SELL'), 60);
  assert.equal(result.side, 'SELL');
  assert.equal(result.type, 'BOS');
});
test('recognises CHoCH against the prior bearish swing sequence', () => {
  const result = runEngine(chochCandles(), 60);
  assert.equal(result.side, 'BUY');
  assert.equal(result.type, 'CHoCH');
});
test('rejects a failed retest that closes through the invalidation zone', () => {
  const a = bosCandles();
  a[85] = candle(85, 102.6, 101, 102.8, 100.8);
  assert.equal(runEngine(a, 60).side, 'NONE');
});
test('rejects setups after the confirmation freshness window', () => {
  const a = bosCandles();
  for (let j = 0; j < 7; j++) a.push(candle(87 + j, 103, 103, 103.2, 102.8));
  assert.equal(runEngine(a, 60).side, 'NONE');
});
test('rejects setups invalidated after confirmation', () => {
  const a = bosCandles();
  a.push(candle(87, 101, 101, 101.2, 100.8));
  assert.equal(runEngine(a, 60).side, 'NONE');
});
test('rejects a setup after price has run too far from the confirmation close', () => {
  const a = bosCandles();
  a.push(candle(87, 105, 105, 105.3, 104.8));
  assert.equal(runEngine(a, 60).side, 'NONE');
});
test('does not require every timeframe to agree for a CHoCH', () => {
  assert.equal(runAlignment('BUY', ['BEARISH', 'BEARISH', 'BEARISH'], 'CHoCH'), 40);
  assert.equal(runAlignment('BUY', ['BEARISH', 'BEARISH', 'BEARISH'], 'BOS'), 0);
});
test('ignores an unclosed future candle', () => {
  const a = bosCandles();
  a.push({ ...candle(87, 103, 104, 104.2, 103), epoch: Math.floor(Date.now() / 60000) * 60 });
  assert.equal(runEngine(a, 60).side, 'BUY');
});
