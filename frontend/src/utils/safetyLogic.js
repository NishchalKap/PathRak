export const getBackendWeekday = (date = new Date()) => (date.getDay() + 6) % 7;

export const isSafeWalkDue = ({ active, etaTime, nowMs, alreadyHandled }) => (
  Boolean(active && etaTime && !alreadyHandled && nowMs >= new Date(etaTime).getTime())
);

export const recordShake = ({ count, lastShakeMs }, magnitude, nowMs, options = {}) => {
  const threshold = options.threshold ?? 25;
  const requiredShakes = options.requiredShakes ?? 3;
  const timeoutMs = options.timeoutMs ?? 2000;

  if (!Number.isFinite(magnitude) || magnitude <= threshold) {
    return { count, lastShakeMs, shouldTrigger: false };
  }

  const nextCount = nowMs - lastShakeMs > timeoutMs ? 1 : count + 1;
  return {
    count: nextCount,
    lastShakeMs: nowMs,
    shouldTrigger: nextCount >= requiredShakes,
  };
};
