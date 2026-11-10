import { useMemo } from 'react';
import { fmtDeltaPct } from '../utils/formatters';

export function usePortfolioDerived(snapshot, utilization) {
  return useMemo(() => {
    const strategies = snapshot?.strategies || [];
    const pm = snapshot?.portfolio_metrics || {};
    const baseline = snapshot?.baseline_metrics || {};
    const capital = snapshot?.capital || {};
    const deployable = (capital.capital_available || 0) * (utilization ?? snapshot?.utilization ?? 0.8);
    const changesCount = strategies.filter((s) => s.delta_lots !== 0).length;

    // Prefer lots-scaled (deployed) figures; fall back to the 1-unit weighted ones.
    const optDailyPnl = pm.expected_daily_pnl_deployed ?? pm.expected_daily_pnl;
    const optVol = pm.portfolio_volatility_deployed ?? pm.portfolio_volatility;
    const baseDailyPnl = baseline.expected_daily_pnl_deployed ?? baseline.expected_daily_pnl;
    const baseVol = baseline.portfolio_volatility_deployed ?? baseline.portfolio_volatility;

    const optSharpe = pm.portfolio_sharpe_deployed ?? pm.portfolio_sharpe;
    const baseSharpe = baseline.portfolio_sharpe_deployed ?? baseline.portfolio_sharpe;
    const sharpeDelta = fmtDeltaPct(optSharpe, baseSharpe);
    const volDelta = fmtDeltaPct(optVol, baseVol);
    const pnlDelta = fmtDeltaPct(optDailyPnl, baseDailyPnl);

    const heatmapWeights = strategies.map((s) => (s.weight_pct != null ? s.weight_pct / 100 : 0));

    // Path MaxDD on recommended-lots equity curve (not additive Σ|MaxDD×Rec|).
    const pathDd = pm.max_drawdown_deployed ?? pm.max_drawdown ?? null;
    const totalDrawdownRec = pathDd == null ? 0 : Math.abs(Number(pathDd) || 0);
    const aggregateRisk = totalDrawdownRec;
    const totalLotsRec = strategies.reduce((sum, s) => sum + (Number(s.recommended_lots) || 0), 0);
    const totalPnlDeployed = pm.total_pnl_deployed ?? pm.total_pnl ?? null;

    return {
      strategies,
      pm,
      baseline,
      capital,
      deployable,
      changesCount,
      sharpeDelta,
      volDelta,
      pnlDelta,
      heatmapWeights,
      aggregateRisk,
      totalDrawdownRec,
      totalLotsRec,
      totalPnlDeployed,
      health: snapshot?.portfolio_health || {},
      insights: snapshot?.correlation_insights || {},
    };
  }, [snapshot, utilization]);
}
