//+------------------------------------------------------------------+
//| Nextrade AI MT5 Expert Advisor                                   |
//| BOS/CHoCH + retest + closed-candle confirmation                   |
//| Approval-only execution; default risk = 0.25% of account balance  |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "Nextrade AI: structure-break retest EA. Approval is always required."

#include <Trade/Trade.mqh>
CTrade trade;

input ulong  InpMagicNumber       = 5111901;
input double InpRiskPercent       = 0.25;       // Risk per trade (% of account balance)
input double InpRewardRisk        = 2.0;        // Take-profit in R
input int    InpSwingLookback     = 120;        // Search depth for confirmed swing points
input int    InpSwingLeftRight    = 2;          // Fractal confirmation bars on each side
input int    InpRetestExpiryBars  = 6;          // Cancel setup if not retested in this many bars
input int    InpATRPeriod         = 14;
input double InpRetestATRBuffer   = 0.15;       // Retest tolerance / stop buffer as ATR fraction
input double InpMinStopATR        = 0.50;       // Reject stops tighter than this ATR multiple
input double InpMaxStopATR        = 3.00;       // Reject stops wider than this ATR multiple
input int    InpMaxDeviationPts   = 30;
input bool   InpShowChartButtons  = true;

enum SetupDirection { SETUP_NONE=0, SETUP_BUY=1, SETUP_SELL=-1 };

int      g_atrHandle = INVALID_HANDLE;
datetime g_lastBarTime = 0;
int      g_structureBias = 0; // +1 bullish, -1 bearish, 0 not established
bool     g_pending = false;
int      g_pendingDirection = SETUP_NONE;
string   g_pendingType = "";
double   g_breakLevel = 0.0;
int      g_barsSinceBreak = 0;
datetime g_signalBarTime = 0;
double   g_signalStop = 0.0;
string   BTN_APPROVE = "NEXTRADE_APPROVE";
string   BTN_REJECT  = "NEXTRADE_REJECT";
string   LBL_STATUS  = "NEXTRADE_STATUS";

//+------------------------------------------------------------------+
int OnInit()
{
   if(InpRiskPercent <= 0.0 || InpRiskPercent > 2.0 ||
      InpRewardRisk <= 0.0 || InpSwingLeftRight < 1 ||
      InpSwingLookback < 20 || InpRetestExpiryBars < 1 ||
      InpATRPeriod < 2 || InpMinStopATR <= 0.0 ||
      InpMaxStopATR <= InpMinStopATR)
   {
      Print("Nextrade AI: invalid input parameters.");
      return INIT_PARAMETERS_INCORRECT;
   }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpMaxDeviationPts);
   trade.SetTypeFillingBySymbol(_Symbol);

   g_atrHandle = iATR(_Symbol, _Period, InpATRPeriod);
   if(g_atrHandle == INVALID_HANDLE)
   {
      Print("Nextrade AI: failed to create ATR indicator handle.");
      return INIT_FAILED;
   }

   if(InpShowChartButtons)
      CreateApprovalPanel();

   Print("Nextrade AI initialized on ", _Symbol, " / ", EnumToString(_Period),
         ". Approval is required for every trade. Risk: ",
         DoubleToString(InpRiskPercent, 2), "% of balance.");
   UpdateStatus("Waiting for a confirmed structure break...");
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);
   ObjectDelete(0, BTN_APPROVE);
   ObjectDelete(0, BTN_REJECT);
   ObjectDelete(0, LBL_STATUS);
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   if(!IsNewBar())
      return;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int needed = MathMax(InpSwingLookback + InpSwingLeftRight + 5, 250);
   int copied = CopyRates(_Symbol, _Period, 0, needed, rates);
   if(copied < InpSwingLeftRight * 2 + 30)
   {
      UpdateStatus("Waiting: insufficient candle history.");
      return;
   }

   double atr = GetClosedATR();
   if(atr <= 0.0)
   {
      UpdateStatus("Waiting: ATR data is not ready.");
      return;
   }

   // Existing position management is delegated to broker-side SL/TP.
   if(HasOurPosition())
   {
      if(g_pending)
         ClearPending("Existing Nextrade position detected.");
      return;
   }

   if(g_pending)
   {
      ProcessRetest(rates, copied, atr);
      return;
   }

   DetectStructureBreak(rates, copied, atr);
}

//+------------------------------------------------------------------+
bool IsNewBar()
{
   datetime current = iTime(_Symbol, _Period, 0);
   if(current <= 0 || current == g_lastBarTime)
      return false;
   g_lastBarTime = current;
   return true;
}

//+------------------------------------------------------------------+
double GetClosedATR()
{
   double values[];
   ArraySetAsSeries(values, true);
   if(CopyBuffer(g_atrHandle, 0, 1, 1, values) != 1)
      return 0.0;
   return values[0];
}

//+------------------------------------------------------------------+
bool IsSwingHigh(const MqlRates &rates[], const int index, const int wing)
{
   double value = rates[index].high;
   for(int j=1; j<=wing; j++)
   {
      if(value <= rates[index-j].high || value <= rates[index+j].high)
         return false;
   }
   return true;
}

bool IsSwingLow(const MqlRates &rates[], const int index, const int wing)
{
   double value = rates[index].low;
   for(int j=1; j<=wing; j++)
   {
      if(value >= rates[index-j].low || value >= rates[index+j].low)
         return false;
   }
   return true;
}

//+------------------------------------------------------------------+
bool FindLatestSwing(const MqlRates &rates[], const int copied,
                     const bool wantHigh, double &level)
{
   int wing = InpSwingLeftRight;
   int lastIndex = MathMin(InpSwingLookback, copied-wing-1);
   // Smallest eligible index is the most recently confirmed swing.
   for(int i=wing+1; i<=lastIndex; i++)
   {
      if(wantHigh && IsSwingHigh(rates, i, wing))
      {
         level = rates[i].high;
         return true;
      }
      if(!wantHigh && IsSwingLow(rates, i, wing))
      {
         level = rates[i].low;
         return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
void DetectStructureBreak(const MqlRates &rates[], const int copied, const double atr)
{
   double swingHigh=0.0, swingLow=0.0;
   bool haveHigh = FindLatestSwing(rates, copied, true, swingHigh);
   bool haveLow  = FindLatestSwing(rates, copied, false, swingLow);
   if(!haveHigh || !haveLow)
   {
      UpdateStatus("Waiting: confirmed swing highs/lows not available.");
      return;
   }

   // rates[1] is the most recently CLOSED candle. No intrabar signals.
   MqlRates closed = rates[1];
   bool bullishBreak = (closed.close > swingHigh && rates[2].close <= swingHigh);
   bool bearishBreak = (closed.close < swingLow && rates[2].close >= swingLow);

   if(bullishBreak)
   {
      g_pendingDirection = SETUP_BUY;
      g_pendingType = (g_structureBias < 0 ? "CHoCH" : "BOS");
      g_structureBias = 1;
      g_breakLevel = swingHigh;
      g_barsSinceBreak = 0;
      g_signalBarTime = closed.time;
      g_pending = true;
      UpdateStatus(g_pendingType + " bullish break at " + DoubleToString(g_breakLevel, _Digits) +
                   ". Waiting for retest and bullish close.");
      return;
   }

   if(bearishBreak)
   {
      g_pendingDirection = SETUP_SELL;
      g_pendingType = (g_structureBias > 0 ? "CHoCH" : "BOS");
      g_structureBias = -1;
      g_breakLevel = swingLow;
      g_barsSinceBreak = 0;
      g_signalBarTime = closed.time;
      g_pending = true;
      UpdateStatus(g_pendingType + " bearish break at " + DoubleToString(g_breakLevel, _Digits) +
                   ". Waiting for retest and bearish close.");
      return;
   }

   UpdateStatus("No confirmed BOS/CHoCH. Monitoring closed candles...");
}

//+------------------------------------------------------------------+
void ProcessRetest(const MqlRates &rates[], const int copied, const double atr)
{
   MqlRates c = rates[1];
   g_barsSinceBreak++;

   if(g_barsSinceBreak > InpRetestExpiryBars)
   {
      ClearPending("Setup expired: no valid retest in the allowed bars.");
      return;
   }

   double tolerance = atr * InpRetestATRBuffer;
   bool confirmed = false;
   double stop = 0.0;

   if(g_pendingDirection == SETUP_BUY)
   {
      // A close back below the broken level invalidates the bullish retest.
      if(c.close < g_breakLevel - tolerance)
      {
         ClearPending("Bullish retest invalidated by a closed candle.");
         return;
      }
      bool touched = (c.low <= g_breakLevel + tolerance);
      bool bullishClose = (c.close > c.open && c.close > g_breakLevel);
      if(touched && bullishClose)
      {
         stop = c.low - tolerance;
         confirmed = true;
      }
   }
   else if(g_pendingDirection == SETUP_SELL)
   {
      if(c.close > g_breakLevel + tolerance)
      {
         ClearPending("Bearish retest invalidated by a closed candle.");
         return;
      }
      bool touched = (c.high >= g_breakLevel - tolerance);
      bool bearishClose = (c.close < c.open && c.close < g_breakLevel);
      if(touched && bearishClose)
      {
         stop = c.high + tolerance;
         confirmed = true;
      }
   }

   if(!confirmed)
   {
      UpdateStatus(g_pendingType + " detected. Waiting for retest confirmation (" +
                   IntegerToString(g_barsSinceBreak) + "/" +
                   IntegerToString(InpRetestExpiryBars) + ").");
      return;
   }

   double stopDistance = MathAbs(c.close - stop);
   if(stopDistance < atr * InpMinStopATR || stopDistance > atr * InpMaxStopATR)
   {
      ClearPending("Retest confirmed, but stop distance is outside configured ATR limits.");
      return;
   }

   g_signalStop = NormalizeDouble(stop, _Digits);
   g_signalBarTime = c.time;
   UpdateStatus("CONFIRMED " + g_pendingType + " " +
                (g_pendingDirection == SETUP_BUY ? "BUY" : "SELL") +
                ". Review chart and press APPROVE to place the order.");
   Alert("Nextrade AI: ", g_pendingType, " ",
         (g_pendingDirection == SETUP_BUY ? "BUY" : "SELL"),
         " retest confirmed on ", _Symbol, " ", EnumToString(_Period),
         ". Approval required.");
}

//+------------------------------------------------------------------+
void CreateApprovalPanel()
{
   ObjectCreate(0, LBL_STATUS, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, LBL_STATUS, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, LBL_STATUS, OBJPROP_XDISTANCE, 12);
   ObjectSetInteger(0, LBL_STATUS, OBJPROP_YDISTANCE, 18);
   ObjectSetInteger(0, LBL_STATUS, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, LBL_STATUS, OBJPROP_FONTSIZE, 10);
   ObjectSetString(0, LBL_STATUS, OBJPROP_FONT, "Arial");

   CreateButton(BTN_APPROVE, "APPROVE TRADE", 12, 52, clrDarkGreen);
   CreateButton(BTN_REJECT, "REJECT SETUP", 145, 52, clrFireBrick);
   ChartRedraw();
}

void CreateButton(const string name, const string caption, const int x,
                  const int y, const color background)
{
   ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, 126);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, 26);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, background);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
   ObjectSetString(0, name, OBJPROP_TEXT, caption);
}

//+------------------------------------------------------------------+
void UpdateStatus(const string message)
{
   string full = "NEXTRADE AI | " + _Symbol + " " + EnumToString(_Period) +
                 " | Risk " + DoubleToString(InpRiskPercent,2) + "% balance\n" + message;
   Comment(full);
   if(ObjectFind(0, LBL_STATUS) >= 0)
      ObjectSetString(0, LBL_STATUS, OBJPROP_TEXT, full);
   Print(full);
   ChartRedraw();
}

//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam,
                  const string &sparam)
{
   if(id != CHARTEVENT_OBJECT_CLICK)
      return;

   if(sparam == BTN_REJECT)
   {
      ClearPending("Setup rejected manually.");
      ObjectSetInteger(0, BTN_REJECT, OBJPROP_STATE, false);
   }
   else if(sparam == BTN_APPROVE)
   {
      ObjectSetInteger(0, BTN_APPROVE, OBJPROP_STATE, false);
      if(!g_pending || g_signalStop <= 0.0)
      {
         UpdateStatus("No confirmed setup is awaiting approval.");
         return;
      }
      PlaceApprovedTrade();
   }
}

//+------------------------------------------------------------------+
bool HasOurPosition()
{
   if(!PositionSelect(_Symbol))
      return false;
   return ((ulong)PositionGetInteger(POSITION_MAGIC) == InpMagicNumber);
}

//+------------------------------------------------------------------+
double CalculateVolume(const ENUM_ORDER_TYPE orderType, const double entry,
                       const double stop)
{
   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
   double oneLotProfit = 0.0;
   if(!OrderCalcProfit(orderType, _Symbol, 1.0, entry, stop, oneLotProfit))
   {
      Print("Nextrade AI: OrderCalcProfit failed. Error ", GetLastError());
      return 0.0;
   }

   double oneLotLoss = MathAbs(oneLotProfit);
   if(oneLotLoss <= 0.0 || riskMoney <= 0.0)
      return 0.0;

   double rawVolume = riskMoney / oneLotLoss;
   double minVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxVolume = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0.0 || minVolume <= 0.0)
      return 0.0;

   // Round DOWN so rounding never deliberately increases planned risk.
   double volume = MathFloor(rawVolume / step) * step;
   volume = MathMin(volume, maxVolume);
   volume = NormalizeDouble(volume, 8);
   if(volume < minVolume)
   {
      Print("Nextrade AI: calculated volume is below broker minimum. Trade skipped; ",
            "minimum lot would exceed the risk budget.");
      return 0.0;
   }
   return volume;
}

//+------------------------------------------------------------------+
void PlaceApprovedTrade()
{
   if(!g_pending || g_signalStop <= 0.0)
      return;
   if(HasOurPosition())
   {
      ClearPending("Trade not placed: a Nextrade position is already open on this symbol.");
      return;
   }

   // Approval can be delayed; reject stale signals rather than entering late.
   int signalShift = iBarShift(_Symbol, _Period, g_signalBarTime, true);
   if(signalShift < 1 || signalShift > InpRetestExpiryBars + 2)
   {
      ClearPending("Trade not placed: approved setup is stale.");
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      UpdateStatus("Trade not placed: unable to read current bid/ask.");
      return;
   }

   bool isBuy = (g_pendingDirection == SETUP_BUY);
   ENUM_ORDER_TYPE orderType = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double entry = isBuy ? tick.ask : tick.bid;
   double stop = g_signalStop;
   double riskDistance = isBuy ? entry - stop : stop - entry;
   double atr = GetClosedATR();

   if(riskDistance <= 0.0 || atr <= 0.0 ||
      riskDistance < atr * InpMinStopATR || riskDistance > atr * InpMaxStopATR)
   {
      ClearPending("Trade not placed: price moved or stop distance is no longer valid.");
      return;
   }

   double target = isBuy ? entry + riskDistance * InpRewardRisk
                         : entry - riskDistance * InpRewardRisk;
   int stopsLevel = (int)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDistance = stopsLevel * _Point;
   if(isBuy && (entry-stop < minDistance || target-entry < minDistance))
   {
      UpdateStatus("Trade not placed: broker minimum stop distance is not satisfied.");
      return;
   }
   if(!isBuy && (stop-entry < minDistance || entry-target < minDistance))
   {
      UpdateStatus("Trade not placed: broker minimum stop distance is not satisfied.");
      return;
   }

   double volume = CalculateVolume(orderType, entry, stop);
   if(volume <= 0.0)
   {
      UpdateStatus("Trade not placed: safe position size could not be calculated.");
      return;
   }

   stop = NormalizeDouble(stop, _Digits);
   target = NormalizeDouble(target, _Digits);
   bool sent = false;
   string comment = "Nextrade " + g_pendingType + " retest";
   if(isBuy)
      sent = trade.Buy(volume, _Symbol, 0.0, stop, target, comment);
   else
      sent = trade.Sell(volume, _Symbol, 0.0, stop, target, comment);

   uint retcode = trade.ResultRetcode();
   if(sent && (retcode == TRADE_RETCODE_DONE || retcode == TRADE_RETCODE_PLACED ||
               retcode == TRADE_RETCODE_DONE_PARTIAL))
   {
      UpdateStatus("ORDER ACCEPTED: " + (isBuy ? "BUY " : "SELL ") +
                   DoubleToString(volume, 2) + " lots. SL " +
                   DoubleToString(stop, _Digits) + " | TP " +
                   DoubleToString(target, _Digits) + ". Verify position in MT5.");
      g_pending = false;
      g_pendingDirection = SETUP_NONE;
      g_signalStop = 0.0;
   }
   else
   {
      UpdateStatus("ORDER REJECTED by broker: " + trade.ResultRetcodeDescription() +
                   ". Setup remains visible; review before trying again.");
      Print("Nextrade AI order error ", retcode, ": ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
void ClearPending(const string reason)
{
   g_pending = false;
   g_pendingDirection = SETUP_NONE;
   g_pendingType = "";
   g_breakLevel = 0.0;
   g_barsSinceBreak = 0;
   g_signalStop = 0.0;
   UpdateStatus(reason);
}
//+------------------------------------------------------------------+
