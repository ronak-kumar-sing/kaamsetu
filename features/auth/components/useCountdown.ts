import { useCallback, useEffect, useState } from 'react';

/** Counts down once per second from `seconds`; `restart` begins again. */
export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const restart = useCallback(() => setRemaining(seconds), [seconds]);
  return { remaining, restart };
}
