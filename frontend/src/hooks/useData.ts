import { useEffect, useState } from "react";

type DataState<T> = {
  data?: T;
  loading: boolean;
  error?: string;
};

export function useData<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<DataState<T>>({ loading: true });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    setState({ loading: true });
    loader()
      .then((data) => active && setState({ data, loading: false }))
      .catch(
        (error) => active && setState({ loading: false, error: error.message }),
      );

    return () => {
      active = false;
    };
  }, [...deps, retry]);

  return {
    ...state,
    retry: () => setRetry((value) => value + 1),
  };
}
