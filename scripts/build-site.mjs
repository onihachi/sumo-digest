import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const client = resolve(dist, "client");
const server = resolve(dist, "server");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(client, "data"), { recursive: true });
await mkdir(server, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await copyFile(resolve(root, file), resolve(client, file));
}

for (const file of ["bouts.js", "bouts.json"]) {
  await copyFile(resolve(root, "data", file), resolve(client, "data", file));
}

await copyFile(resolve(root, "worker", "index.js"), resolve(server, "index.js"));

console.log("公開用サイトを dist に生成しました");
