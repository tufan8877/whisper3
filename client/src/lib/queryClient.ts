import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Wir wollen auf Render + lokal + iOS Safari + Android immer sauber arbeiten.
 * Deshalb: API Calls IMMER über relative Pfade wie "/api/login".
 */

function normalizeApiPath(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("Invalid URL: empty");
  }

  // wenn jemand "api/login" übergibt -> fix auf "/api/login"
  if (url.startsWith("api/")) return "/" + url;

  // wenn jemand "http://..." übergibt -> in SAME-ORIGIN umwandeln (nur pathname+query)
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      throw new Error("Invalid URL");
    }
  }

  // relative ohne leading slash kann auf subpages falsch werden (z.B. /chat -> chat/api/login)
  if (!url.startsWith("/")) {
    return "/" + url;
  }

  return url;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data: any = await res.json();
      return data?.message || data?.error || JSON.stringify(data);
    }
    const text = await res.text();
    return text || res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(`${res.status}: ${msg}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const finalUrl = normalizeApiPath(url);

  const res = await fetch(finalUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * ✅ postJson: der Helper den du wolltest.
 * Nutze den in WelcomePage für Login & Register.
 */
export async function postJson<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest("POST", url, data);
  return res.json() as Promise<T>;
}

/**
 * Optional helper für GET JSON, falls du es brauchst.
 */
export async function getJson<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  return res.json() as Promise<T>;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    const rawUrl = String(queryKey[0]);
    const url = normalizeApiPath(rawUrl);

    const res = await fetch(url, { credentials: "include" });

    if (on401 === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return (await res.json()) as T;
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
