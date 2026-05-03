import { cleanEmptyImageWrappers, filterPressImageUrls } from "@/lib/press-image-policy";

const IMG_SRC_RE = /<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;
const TEXT_IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|gif|webp)(?:\?[^\s"'<>]*)?/gi;
const FIGURE_WITH_IMAGE_RE = /<figure\b[^>]*>[\s\S]*?<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>[\s\S]*?<\/figure>/i;
const IMG_TAG_RE = /<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>/i;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function extractPressBodyImageUrls(bodyHtml: string): string[] {
  const urls = [...String(bodyHtml || "").matchAll(IMG_SRC_RE)].map((match) => match[2]);
  return filterPressImageUrls(urls, { maxImages: 0 });
}

export function extractPressImageUrlsFromText(text: string): string[] {
  const urls = String(text || "").match(TEXT_IMAGE_URL_RE) ?? [];
  return filterPressImageUrls(urls, { maxImages: 0 });
}

export function getPressImageCandidates(input: {
  bodyHtml?: string | null;
  images?: string[] | null;
  bodyText?: string | null;
  maxImages?: number;
}): string[] {
  return filterPressImageUrls(
    unique([
      ...extractPressBodyImageUrls(input.bodyHtml ?? ""),
      ...filterPressImageUrls(input.images ?? [], { maxImages: 0 }),
      ...extractPressImageUrlsFromText(input.bodyText ?? ""),
    ]),
    { maxImages: input.maxImages ?? 0 },
  );
}

export function hasPressBodyImage(bodyHtml: string): boolean {
  return extractPressBodyImageUrls(bodyHtml).length > 0;
}

export function hasPressCandidateImage(input: {
  bodyHtml?: string | null;
  images?: string[] | null;
  bodyText?: string | null;
}): boolean {
  return getPressImageCandidates({ ...input, maxImages: 1 }).length > 0;
}

function escapeHtmlAttribute(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildPressImageFigure(imageUrl: string, altText: string): string {
  return `<figure style="margin:1.5em 0;text-align:center;"><img src="${escapeHtmlAttribute(imageUrl)}" alt="${escapeHtmlAttribute(altText)}" style="max-width:100%;height:auto;border-radius:6px;" /></figure>`;
}

export function insertPressImageIntoBody(bodyHtml: string, imageUrl: string, altText: string): string {
  const figure = buildPressImageFigure(imageUrl, altText);
  const body = String(bodyHtml || "").trim();
  if (!body) return figure;

  const firstParagraphEnd = body.indexOf("</p>");
  const secondParagraphEnd = firstParagraphEnd >= 0
    ? body.indexOf("</p>", firstParagraphEnd + 4)
    : -1;
  const insertAt = secondParagraphEnd >= 0 ? secondParagraphEnd + 4 : firstParagraphEnd + 4;
  if (insertAt > 3) return `${body.slice(0, insertAt)}${figure}${body.slice(insertAt)}`;
  return `${figure}${body}`;
}

export function ensurePressBodyImage(input: {
  bodyHtml: string;
  candidateImages: string[];
  altText: string;
}): { ok: boolean; bodyHtml: string; insertedImageUrl?: string } {
  if (hasPressBodyImage(input.bodyHtml)) {
    return { ok: true, bodyHtml: input.bodyHtml };
  }

  const [imageUrl] = filterPressImageUrls(input.candidateImages ?? [], { maxImages: 1 });
  if (!imageUrl) {
    return { ok: false, bodyHtml: cleanEmptyImageWrappers(input.bodyHtml || "") };
  }

  return {
    ok: true,
    bodyHtml: insertPressImageIntoBody(input.bodyHtml, imageUrl, input.altText),
    insertedImageUrl: imageUrl,
  };
}

export function promoteFirstPressBodyImage(bodyHtml: string): {
  bodyHtml: string;
  thumbnailUrl: string;
  removedFromBody: boolean;
} {
  const body = String(bodyHtml || "");
  const figureMatch = body.match(FIGURE_WITH_IMAGE_RE);
  const tagMatch = figureMatch ? null : body.match(IMG_TAG_RE);
  const match = figureMatch ?? tagMatch;
  const thumbnailUrl = match?.[2] ?? "";
  const [validThumbnail] = filterPressImageUrls(thumbnailUrl ? [thumbnailUrl] : [], { maxImages: 1 });

  if (!validThumbnail || !match?.[0]) {
    return { bodyHtml: cleanEmptyImageWrappers(body), thumbnailUrl: "", removedFromBody: false };
  }

  const withoutFirstImage = cleanEmptyImageWrappers(body.replace(match[0], ""));
  if (!hasPressBodyImage(withoutFirstImage)) {
    return { bodyHtml: cleanEmptyImageWrappers(body), thumbnailUrl: validThumbnail, removedFromBody: false };
  }

  return {
    bodyHtml: withoutFirstImage,
    thumbnailUrl: validThumbnail,
    removedFromBody: true,
  };
}
