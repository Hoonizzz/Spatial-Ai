import { readFile, writeFile } from "node:fs/promises";
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("../../index.html", import.meta.url),
  html.replaceAll('="./assets/', '="./maze-perception/dist/assets/'),
);
console.log("Published Perception in a Maze homepage");
