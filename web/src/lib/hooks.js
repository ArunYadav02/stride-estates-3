import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data fetching with the three states that actually happen, plus a reload
 * handle so a mutation can refresh the view without a page bounce.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    setState((current) => ({ ...current, loading: true, error: null }));

    Promise.resolve(fn())
      .then((data) => {
        // Ignore a response that arrived after a newer request started.
        if (run === latest.current) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (run === latest.current) setState({ loading: false, error, data: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Waits for typing to stop before letting a value through. */
export function useDebounced(value, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/** Global keyboard shortcut. `combo` looks like 'mod+k' or 'escape'. */
export function useHotkey(combo, handler) {
  useEffect(() => {
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needsMod = parts.includes('mod');

    const onKey = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (needsMod && !mod) return;
      if (event.key.toLowerCase() !== key) return;
      event.preventDefault();
      handler(event);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}

/** Copy with feedback, because a copy button that says nothing feels broken. */
export function useCopy(resetAfter = 2000) {
  const [copied, setCopied] = useState(null);

  const copy = useCallback(async (text, key = 'default') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), resetAfter);
      return true;
    } catch (error) {
      return false;
    }
  }, [resetAfter]);

  return { copied, copy };
}
