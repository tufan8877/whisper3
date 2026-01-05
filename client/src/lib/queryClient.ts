import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 10, // 10 Sekunden
    },
    mutations: {
      retry: 0,
    },
  },
});

export async function apiRequest(
  method: string,
  url: string,
  body?: any,
  extraHeaders?: Record<string, string>
) {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {
    ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders || {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`API ${method} ${url} failed: ${msg}`);
  }

  return res;
}