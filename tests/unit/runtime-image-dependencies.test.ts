import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime image dependencies", () => {
  it("ships sharp as a production dependency for server image routes", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.dependencies?.sharp).toBeTruthy();
    expect(packageJson.devDependencies?.sharp).toBeUndefined();
    expect(packageJson.optionalDependencies?.["@img/sharp-linux-x64"]).toBeTruthy();
    expect(packageJson.optionalDependencies?.["@img/sharp-libvips-linux-x64"]).toBeTruthy();
    expect(packageJson.optionalDependencies["@img/sharp-linux-x64"]).toBe(packageJson.pnpm.overrides.sharp);
  });

  it("traces sharp's Linux runtime into Vercel API functions", () => {
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(nextConfig).toContain('"./node_modules/@img/sharp-linux-x64/**/*"');
    expect(nextConfig).toContain('"./node_modules/@img/sharp-libvips-linux-x64/**/*"');
    expect(nextConfig).toContain('"./node_modules/.pnpm/@img+sharp-linux-x64@*/node_modules/@img/sharp-linux-x64/**/*"');
    expect(nextConfig).toContain('"./node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/node_modules/@img/sharp-libvips-linux-x64/**/*"');
  });

  it("does not load sharp while importing non-image cron handlers", () => {
    for (const file of [
      "src/lib/server-upload-image.ts",
      "src/lib/watermark.ts",
      "src/app/api/upload/image/route.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/^import\s+sharp\s+from\s+["']sharp["']/m);
      expect(source).toContain('await import("sharp")');
    }
  });
});
