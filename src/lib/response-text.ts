function normalizeCharset(label: string): string {
  const value = label.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!value) return "utf-8";
  if (value === "ks_c_5601-1987" || value === "x-windows-949" || value === "cp949") return "euc-kr";
  return value;
}

function charsetFromContentType(contentType: string): string {
  return normalizeCharset(contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1] || "");
}

function charsetFromXmlHead(bytes: Uint8Array): string {
  const head = new TextDecoder("ascii").decode(bytes.slice(0, 512));
  return normalizeCharset(head.match(/encoding\s*=\s*(["'])([^"']+)\1/i)?.[2] || "");
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function readResponseText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const charset = charsetFromContentType(response.headers.get("content-type") || "")
    || charsetFromXmlHead(bytes)
    || "utf-8";
  return decodeBytes(bytes, charset);
}
