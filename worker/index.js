export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    if (request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }

    return response;
  },
};
