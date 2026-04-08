"""
Inventra AI Microservice — v1.0.0
FastAPI service implementing 4 AI modules:
  1. /anomalies          — Invisible inventory loss via Z-score
  2. /stockout-predictions — Sales-velocity stockout forecasting
  3. /demand-surges       — Moving-average demand surge detection
  4. /rebalance-suggestions — Greedy cross-distributor rebalancing
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import statistics
import math

app = FastAPI(title="Inventra AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class SalesRecord(BaseModel):
    date: str
    quantity: float
    productId: str
    productName: str
    distributorId: str
    distributorName: str

class InventoryRecord(BaseModel):
    date: str
    quantity: float
    productId: str
    productName: str
    distributorId: str
    distributorName: str
    expectedQuantity: Optional[float] = None

class AnomalyRequest(BaseModel):
    salesHistory: List[SalesRecord]
    inventoryLogs: List[InventoryRecord]

class StockoutItem(BaseModel):
    productId: str
    productName: str
    distributorId: str
    distributorName: str
    currentStock: float
    reorderLevel: Optional[float] = 10

class StockoutRequest(BaseModel):
    salesHistory: List[SalesRecord]
    currentInventory: List[StockoutItem]

class DemandSurgeRequest(BaseModel):
    orderHistory: List[Dict[str, Any]]
    windowDays: Optional[int] = 7

class DistributorStock(BaseModel):
    distributorId: str
    distributorName: str
    productId: str
    productName: str
    currentStock: float
    averageDailySales: float
    targetStock: float
    location: Optional[str] = None

class RebalanceRequest(BaseModel):
    distributorStocks: List[DistributorStock]

# ─── Math Utilities ───────────────────────────────────────────────────────────

def zscore(values: List[float]) -> List[float]:
    if len(values) < 2:
        return [0.0] * len(values)
    mean = statistics.mean(values)
    try:
        std = statistics.stdev(values)
    except statistics.StatisticsError:
        return [0.0] * len(values)
    if std == 0:
        return [0.0] * len(values)
    return [(v - mean) / std for v in values]

def moving_average(values: List[float], window: int) -> List[float]:
    result = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        chunk = values[start : i + 1]
        result.append(sum(chunk) / len(chunk))
    return result

def ols_slope(y: List[float]) -> float:
    """Ordinary-least-squares slope for a simple time-series."""
    n = len(y)
    if n < 2:
        return 0.0
    x = list(range(n))
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n))
    den = sum((x[i] - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0

# ─── 1. Anomaly Detection (Z-Score) ──────────────────────────────────────────

@app.post("/anomalies")
def detect_anomalies(req: AnomalyRequest):
    """
    For each (product, distributor) pair:
      - Measure daily inventory drops vs average daily sales.
      - Apply Z-score to discrepancy series.
      - Score > 0.5  → flagged anomaly.
    """
    # Build lookup groups
    groups: Dict[str, dict] = {}
    for inv in req.inventoryLogs:
        k = f"{inv.productId}_{inv.distributorId}"
        groups.setdefault(k, {
            "productId": inv.productId, "productName": inv.productName,
            "distributorId": inv.distributorId, "distributorName": inv.distributorName,
            "invLogs": [], "salesRecs": [],
        })["invLogs"].append(inv)

    for sale in req.salesHistory:
        k = f"{sale.productId}_{sale.distributorId}"
        if k in groups:
            groups[k]["salesRecs"].append(sale)

    results = []
    for k, g in groups.items():
        inv_logs = sorted(g["invLogs"], key=lambda x: x.date)
        sales    = sorted(g["salesRecs"], key=lambda x: x.date)

        if len(inv_logs) < 3:
            continue

        qtys       = [l.quantity for l in inv_logs]
        daily_drops = [max(0, qtys[i] - qtys[i + 1]) for i in range(len(qtys) - 1)]

        sale_qtys       = [s.quantity for s in sales] or [0.0]
        avg_daily_sales = sum(sale_qtys) / len(sale_qtys)

        discrepancies = [abs(d - avg_daily_sales) for d in daily_drops]
        disc_z = zscore(discrepancies)
        max_z = max((abs(z) for z in disc_z), default=0)
        anomaly_score = min(1.0, max_z / 3.0)

        total_drop    = sum(daily_drops)
        total_sales   = sum(sale_qtys)
        unexplained   = max(0.0, total_drop - total_sales)

        severity = (
            "critical" if anomaly_score > 0.80 else
            "high"     if anomaly_score > 0.60 else
            "medium"   if anomaly_score > 0.40 else
            "low"
        )

        reasons = []
        if unexplained > avg_daily_sales * 2:
            reasons.append(
                f"Inventory dropping {unexplained:.0f} units faster than sales explain"
            )
        if daily_drops and max(daily_drops) > avg_daily_sales * 3:
            reasons.append("Sudden large single-day inventory drop detected")
        if daily_drops and sum(1 for d in daily_drops if d > avg_daily_sales * 1.5) > len(daily_drops) * 0.3:
            reasons.append("Repeated unexplained stock decreases across multiple days")
        if not reasons:
            reasons.append("Statistical deviation from expected inventory consumption pattern")

        results.append({
            "productId":       g["productId"],
            "productName":     g["productName"],
            "distributorId":   g["distributorId"],
            "distributorName": g["distributorName"],
            "anomalyScore":    round(anomaly_score, 3),
            "severity":        severity,
            "isAnomaly":       anomaly_score > 0.50,
            "unexplainedLoss": round(unexplained, 1),
            "avgDailySales":   round(avg_daily_sales, 1),
            "explanation":     reasons[0],
            "reasons":         reasons,
            "confidenceScore": round(min(0.99, 0.50 + anomaly_score * 0.49), 2),
        })

    results.sort(key=lambda x: x["anomalyScore"], reverse=True)

    return {
        "status":          "success",
        "algorithm":       "Z-Score Statistical Analysis",
        "totalAnalyzed":   len(results),
        "anomaliesFound":  sum(1 for r in results if r["isAnomaly"]),
        "results":         results,
    }

# ─── 2. Stockout Prediction (Sales Velocity) ─────────────────────────────────

@app.post("/stockout-predictions")
def predict_stockouts(req: StockoutRequest):
    """
    days_to_stockout = current_stock / weighted_avg_daily_sales
    Recent sales weighted exponentially (recency bias).
    """
    # Build sales index
    sales_idx: Dict[str, List[SalesRecord]] = {}
    for s in req.salesHistory:
        k = f"{s.productId}_{s.distributorId}"
        sales_idx.setdefault(k, []).append(s)

    results = []
    for item in req.currentInventory:
        k  = f"{item.productId}_{item.distributorId}"
        recs = sorted(sales_idx.get(k, []), key=lambda x: x.date)

        if recs:
            qtys    = [r.quantity for r in recs]
            n       = len(qtys)
            weights = [math.exp(0.12 * i) for i in range(n)]
            tw      = sum(weights)
            avg_ds  = sum(w * q for w, q in zip(weights, qtys)) / tw
        else:
            avg_ds = max(1.0, (item.reorderLevel or 10) / 7.0)

        avg_ds = max(0.1, avg_ds)
        days   = item.currentStock / avg_ds

        urgency, color = (
            ("critical", "red")    if days <= 2  else
            ("high",     "orange") if days <= 5  else
            ("medium",   "yellow") if days <= 10 else
            ("low",      "green")
        )

        trend, slope = "stable", 0.0
        if len(recs) >= 4:
            slope = ols_slope([r.quantity for r in recs[-7:]])
            trend = "increasing" if slope > 0.1 else ("decreasing" if slope < -0.1 else "stable")

        adjusted = days * 0.85 if (trend == "increasing" and slope > 0) else days
        confidence = min(0.99, 0.40 + min(len(recs), 30) / 30 * 0.59)
        reorder_qty = max(0, int(avg_ds * 14 - item.currentStock))

        results.append({
            "productId":        item.productId,
            "productName":      item.productName,
            "distributorId":    item.distributorId,
            "distributorName":  item.distributorName,
            "currentStock":     item.currentStock,
            "avgDailySales":    round(avg_ds, 2),
            "daysToStockout":   round(adjusted, 1),
            "urgency":          urgency,
            "color":            color,
            "trend":            trend,
            "trendSlope":       round(slope, 3),
            "confidenceScore":  round(confidence, 2),
            "explanation":      (
                f"At {avg_ds:.1f} units/day, stock of {item.currentStock:.0f} "
                f"will deplete in ~{adjusted:.1f} days"
            ),
            "recommendation":   f"Reorder {reorder_qty} units to maintain a 2-week buffer",
        })

    results.sort(key=lambda x: x["daysToStockout"])

    return {
        "status":        "success",
        "algorithm":     "Exponentially-Weighted Sales Velocity",
        "totalProducts": len(results),
        "criticalCount": sum(1 for r in results if r["urgency"] == "critical"),
        "highCount":     sum(1 for r in results if r["urgency"] == "high"),
        "results":       results,
    }

# ─── 3. Demand Surge Detection (Moving Average + Slope) ──────────────────────

@app.post("/demand-surges")
def detect_demand_surges(req: DemandSurgeRequest):
    """
    For each (product, region):
      - Compute window-day moving-average baseline.
      - Compare recent window avg vs historical baseline.
      - growth_rate > 10 % + positive OLS slope → surge.
    """
    window = req.windowDays or 7

    groups: Dict[str, dict] = {}
    for order in req.orderHistory:
        pid    = order.get("productId", "")
        region = order.get("region") or order.get("distributorName", "Unknown")
        k      = f"{pid}_{region}"
        groups.setdefault(k, {
            "productId":   pid,
            "productName": order.get("productName", ""),
            "region":      region,
            "orders":      [],
        })["orders"].append({
            "date":     order.get("date", ""),
            "quantity": float(order.get("quantity", 0)),
        })

    results = []
    for k, g in groups.items():
        orders = sorted(g["orders"], key=lambda x: x["date"])
        if len(orders) < window + 2:
            continue

        qtys         = [o["quantity"] for o in orders]
        recent_qtys  = qtys[-window:]
        baseline_qtys = qtys[:-window]

        if not baseline_qtys:
            continue

        recent_avg   = sum(recent_qtys) / len(recent_qtys)
        baseline_avg = sum(baseline_qtys) / len(baseline_qtys)

        if baseline_avg == 0:
            continue

        growth_rate      = (recent_avg - baseline_avg) / baseline_avg
        slope            = ols_slope(recent_qtys)
        norm_slope       = slope / (baseline_avg + 1)
        surge_score      = min(1.0, max(0.0, growth_rate * 0.6 + norm_slope * 0.4))

        is_surge = surge_score > 0.15 and growth_rate > 0.10

        intensity = (
            "explosive" if surge_score > 0.50 else
            "strong"    if surge_score > 0.30 else
            "moderate"  if surge_score > 0.15 else
            "mild"
        )

        z_score = 0.0
        if len(qtys) >= 3:
            try:
                std = statistics.stdev(qtys)
                z_score = (recent_avg - baseline_avg) / (std + 0.001)
            except Exception:
                pass

        confidence = min(0.99, 0.30 + min(len(orders), 60) / 60 * 0.69)

        results.append({
            "productId":          g["productId"],
            "productName":        g["productName"],
            "region":             g["region"],
            "surgeScore":         round(surge_score, 3),
            "growthRate":         round(growth_rate * 100, 1),
            "intensity":          intensity,
            "isSurge":            is_surge,
            "recentAvgDemand":    round(recent_avg, 1),
            "baselineAvgDemand":  round(baseline_avg, 1),
            "trendSlope":         round(slope, 3),
            "zScore":             round(z_score, 2),
            "confidenceScore":    round(confidence, 2),
            "explanation": (
                f"Demand up {growth_rate*100:.0f}% vs {window}-day baseline "
                f"({baseline_avg:.0f} → {recent_avg:.0f} units/day)"
            ),
            "recommendation":     f"Pre-position additional stock in {g['region']} before demand peaks",
        })

    results.sort(key=lambda x: x["surgeScore"], reverse=True)

    return {
        "status":          "success",
        "algorithm":       "Moving Average Deviation + OLS Trend Slope",
        "windowDays":      window,
        "totalAnalyzed":   len(results),
        "surgesDetected":  sum(1 for r in results if r["isSurge"]),
        "results":         results,
    }

# ─── 4. Cross-Distributor Rebalancing (Greedy Matching) ──────────────────────

@app.post("/rebalance-suggestions")
def suggest_rebalancing(req: RebalanceRequest):
    """
    Group distributors by product.
    Tag each as surplus (stock > 120 % target) or deficit (stock < 80 % target).
    Greedily match highest surplus → most urgent deficit.
    """
    by_product: Dict[str, dict] = {}
    for s in req.distributorStocks:
        by_product.setdefault(s.productId, {
            "productId": s.productId, "productName": s.productName, "stocks": []
        })["stocks"].append(s)

    suggestions = []
    tid = 1

    for pid, product in by_product.items():
        surplus, deficit = [], []

        for s in product["stocks"]:
            days_cover = s.currentStock / max(s.averageDailySales, 0.1)
            if s.currentStock > s.targetStock * 1.20:
                surplus.append({"dist": s, "excess": s.currentStock - s.targetStock, "daysCover": round(days_cover, 1)})
            elif s.currentStock < s.targetStock * 0.80:
                deficit.append({"dist": s, "shortage": s.targetStock - s.currentStock, "daysCover": round(days_cover, 1)})

        surplus.sort(key=lambda x: x["excess"], reverse=True)
        deficit.sort(key=lambda x: x["daysCover"])

        si, di = 0, 0
        while si < len(surplus) and di < len(deficit):
            src, dst = surplus[si], deficit[di]
            qty = math.floor(min(src["excess"], dst["shortage"]))
            if qty <= 0:
                si += 1; di += 1; continue

            urgency = (
                "critical" if dst["daysCover"] <= 2 else
                "high"     if dst["daysCover"] <= 5 else
                "medium"
            )

            suggestions.append({
                "id":                  f"TRF-{tid:03d}",
                "productId":           pid,
                "productName":         product["productName"],
                "fromDistributorId":   src["dist"].distributorId,
                "fromDistributorName": src["dist"].distributorName,
                "toDistributorId":     dst["dist"].distributorId,
                "toDistributorName":   dst["dist"].distributorName,
                "transferQuantity":    qty,
                "fromCurrentStock":    src["dist"].currentStock,
                "fromStockAfter":      src["dist"].currentStock - qty,
                "toCurrentStock":      dst["dist"].currentStock,
                "toStockAfter":        dst["dist"].currentStock + qty,
                "costSaving":          round(qty * 0.80, 2),
                "urgency":             urgency,
                "fromDaysCover":       src["daysCover"],
                "toDaysCover":         dst["daysCover"],
                "explanation": (
                    f"Transfer {qty} units from {src['dist'].distributorName} "
                    f"(excess: {src['excess']:.0f}) to {dst['dist'].distributorName} "
                    f"(shortage: {dst['shortage']:.0f})"
                ),
                "status": "pending",
            })

            tid += 1
            src["excess"]   -= qty
            dst["shortage"] -= qty
            if src["excess"]   <= 0: si += 1
            if dst["shortage"] <= 0: di += 1

    priority = {"critical": 0, "high": 1, "medium": 2}
    suggestions.sort(key=lambda x: (priority.get(x["urgency"], 3), -x["transferQuantity"]))

    return {
        "status":                "success",
        "algorithm":             "Greedy Surplus-Deficit Matching",
        "suggestionsCount":      len(suggestions),
        "estimatedTotalSavings": round(sum(s["costSaving"] for s in suggestions), 2),
        "suggestions":           suggestions,
    }

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "Inventra AI Service", "version": "1.0.0"}

@app.get("/")
def root():
    return {
        "service":   "Inventra AI Microservice",
        "endpoints": ["/anomalies", "/stockout-predictions", "/demand-surges", "/rebalance-suggestions"],
    }
