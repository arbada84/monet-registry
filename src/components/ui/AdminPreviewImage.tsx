/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from "react";

type AdminPreviewImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src"> & {
  alt: string;
  src: string;
};

export function AdminPreviewImage({
  alt,
  decoding = "async",
  loading = "lazy",
  referrerPolicy = "no-referrer",
  src,
  ...props
}: AdminPreviewImageProps) {
  return (
    <img
      {...props}
      alt={alt}
      decoding={decoding}
      loading={loading}
      referrerPolicy={referrerPolicy}
      src={src}
    />
  );
}
