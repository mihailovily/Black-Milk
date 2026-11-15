'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, errorCode } from './api-client';
export function useRemote<T>(url: string | null, retainData = false) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    url: string | null;
    version: number;
    data?: T;
    error?: string;
  }>({ url: null, version: -1 });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    api<T>(url, 'GET', undefined, controller.signal)
      .then((data) => setState({ url, version, data }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            url,
            version,
            error: errorCode(error),
            ...(retainData && previous.url === url
              ? { data: previous.data }
              : {}),
          }));
      });
    return () => controller.abort();
  }, [url, version, retainData]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const current = state.url === url && state.version === version;
  return {
    data: current || (retainData && state.url === url) ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: Boolean(url && !current),
    reload,
  };
}
