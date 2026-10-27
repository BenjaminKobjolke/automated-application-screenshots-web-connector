import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
]);

export function createExampleServer() {
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const requestedPath = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      if (!statSync(requestedPath).isFile()) throw new Error("Not a file");
    } catch {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": mimeTypes.get(extname(requestedPath)) ?? "application/octet-stream" });
    createReadStream(requestedPath).pipe(response);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex === -1 ? 8080 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be between 0 and 65535");
  const server = createExampleServer();
  server.listen(port, "127.0.0.1", () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address !== null ? address.port : port;
    process.stdout.write(`Example server listening at http://127.0.0.1:${listeningPort}/example/\n`);
  });
}
