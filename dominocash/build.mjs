import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });

const html = await readFile("index.html", "utf8");
const ogImage = (await readFile("public/og.png")).toString("base64");
const worker = `
const html = ${JSON.stringify(html)};
const ogImage = ${JSON.stringify(ogImage)};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/og.png") {
      return new Response(decodeBase64(ogImage), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" }
      });
    }
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }
    });
  }
};
`;

await writeFile("dist/server/index.js", worker);
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Domino Cash build ready");
