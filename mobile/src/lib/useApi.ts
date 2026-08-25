import { useCallback, useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "./api";

/**
 * Fetch-on-mount with loading, error and pull-to-refresh state.
 *
 * On the web each page repeated this by hand — a useState triple plus a
 * useEffect. That was tolerable there; here every screen also needs a refresh
 * handler for pull-to-refresh, and repeating it across the ported screens
 * would be a lot of identical code with a lot of places to get it subtly
 * wrong.
 *
 * `select` pulls the payload out of the response body. It is required rather
 * than optional because this backend is not uniform about the shape it
 * returns — some routes answer with a bare array, others wrap it as
 * { success, vehicles: [...] } — so there is no default worth guessing.
 */
export function useApi<T>(
  path: string | null,
  select: (data: any) => T,
  fallback: string = "Could not load this."
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against setting state after the screen has gone away, which RN
  // warns about and which happens routinely when a user navigates back before
  // a slow request finishes.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // `select` is almost always an inline arrow, so it is a new reference on
  // every render. Holding it in a ref keeps it out of the dependency array —
  // otherwise load() would be rebuilt each render and the effect below would
  // refetch in a loop.
  const selectRef = useRef(select);
  selectRef.current = select;

  const load = useCallback(
    async (isRefresh = false) => {
      // A null path means the screen does not know what to fetch yet — for
      // example a detail screen whose route param has not resolved.
      if (!path) return;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await api.get(path);
        if (!alive.current) return;
        setData(selectRef.current(res.data));
      } catch (err) {
        if (!alive.current) return;
        setError(getErrorMessage(err, fallback));
      } finally {
        if (!alive.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path, fallback]
  );

  useEffect(() => {
    load();
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    /** Re-fetch showing the pull-to-refresh spinner. */
    refresh: () => load(true),
    /** Re-fetch showing the full-screen spinner. */
    reload: () => load(false),
    /** Apply a local change without a round-trip (e.g. after a PATCH). */
    setData,
  };
}
