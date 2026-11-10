import { createContext, useContext } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDeskHealth } from '../hooks/useDeskHealth';

const DeskShellContext = createContext(null);

export function DeskShellProvider({ children, healthPollMs = 15000 }) {
  const ws = useWebSocket();
  const health = useDeskHealth(healthPollMs);

  const rmsOk = health.connectivity?.rms === 'ok';
  const toeOk = health.connectivity?.toe === 'ok';
  const redisOk = health.connectivity?.redis === 'ok';
  const pipelineOk = rmsOk && toeOk && redisOk;

  const strategyWorkerStatus = health.connectivity?.strategy_worker;
  const strategyWorkerOk =
    strategyWorkerStatus == null || strategyWorkerStatus === 'ready';

  const value = {
    ...ws,
    ...health,
    rmsOk,
    toeOk,
    redisOk,
    strategyWorkerStatus,
    strategyWorkerOk,
    pipelineOk,
  };

  return <DeskShellContext.Provider value={value}>{children}</DeskShellContext.Provider>;
}

export function useDeskShell() {
  const ctx = useContext(DeskShellContext);
  if (!ctx) {
    throw new Error('useDeskShell must be used within DeskShellProvider');
  }
  return ctx;
}
