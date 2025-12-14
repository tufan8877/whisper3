import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Robust JSON/Text error reader.
 * Works even if server sends HTML (Render / Vite fallback).
 */
async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(`${res.status}: ${body}`);
  }
}

/**
 * IMPORTANT:
 * - Always use relative API paths like "/api/login"
 * - Do NOT build absolute URLs with new URL() in the browser -> iOS can throw "Invalid URL"
 */
function normalizePath(url: string) {
  if (!url) return "/";

  // If it already starts with http(s), keep it
  if (url.startsWith("http://") || url.startsWith("https://")) return url;

  // Ensure leading slash for relative calls
  if (!url.startsWith("/")) return `/${url}`;
  return url;
}

/**
 * Generic request (kept for existing code).
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const safeUrl = normalizePath(url);

  const res = await fetch(safeUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  // Don’t read body twice; just throw with body once if needed
  await throwIfResNotOk(res);
  return res;
}

/**
 * ✅ New helper you asked for: postJson
 * Returns parsed JSON and throws clean errors.
 */
export async function postJson<TResponse = any>(
  url: string,
  data?: unknown,
  init?: RequestInit
): Promise<TResponse> {
  const safeUrl = normalizePath(url);

  const res = await fetch(safeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
    ...init,
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new Error(`${res.status}: ${body}`);
  }

  // In case server responds with empty body
  const txt = await res.text();
  if (!txt) return {} as TResponse;

  try {
    return JSON.parse(txt) as TResponse;
  } catch {
    // If backend returns non-json, still return text as any
    return { raw: txt } as any;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = normalizePath(queryKey[0] as string);

    const res = await fetch(url, { credentials: "include" });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);

    const txt = await res.text();
    if (!txt) return {} as T;

    return JSON.parse(txt) as T;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});