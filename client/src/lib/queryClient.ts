// client/src/lib/queryClient.ts
export async function apiRequest(method: string, url: string, body?: any) {
  const token = localStorage.getItem("token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    return res;
  } finally {
    clearTimeout(timeout);
  }
}