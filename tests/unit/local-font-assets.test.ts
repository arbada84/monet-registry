import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { verifyLocalFonts } from "../../scripts/verify-local-fonts.mjs";

describe("offline font assets", () => {
  it("verifies actual WOFF2 bytes, hashes, local CSS and all five licenses without network access", () => {
    expect(verifyLocalFonts()).toMatchObject({ ok: true, families: 5, errors: [] });
  });

  it("fails if a declared font is corrupted", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "culpi-font-test-"));
    try {
      fs.mkdirSync(path.join(root, "public/fonts"), { recursive: true });
      fs.mkdirSync(path.join(root, "src/app"), { recursive: true });
      const file = "0".repeat(64) + ".woff2";
      fs.writeFileSync(path.join(root, "public/fonts", file), "not-a-font");
      fs.writeFileSync(path.join(root, "public/fonts/manifest.json"), JSON.stringify({ families: [], files: [{ file, sha256: "0".repeat(64), bytes: 10 }] }));
      fs.writeFileSync(path.join(root, "src/app/fonts.css"), `@font-face {src: url('/fonts/${file}') format('woff2');}`);
      expect(verifyLocalFonts(root).ok).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
