import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

export function usePersistentState<T>(
  key: string,
  initializer: () => T
): readonly [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initializer);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setState(JSON.parse(raw) as T);
    } catch (error) {
      console.warn(`Failed to read ${key} from localStorage`, error);
    } finally {
      setIsHydrated(true);
    }
  }, [key]);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Failed to write ${key} to localStorage`, error);
    }
  }, [isHydrated, key, state]);

  return [state, setState] as const;
}
