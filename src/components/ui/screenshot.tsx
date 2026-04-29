"use client";

import Image from "next/image";

interface ScreenshotProps {
  srcLight: string;
  srcDark?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export default function Screenshot({
  srcLight,
  alt,
  width,
  height,
  className,
}: ScreenshotProps) {
  return (
    <Image
      src={srcLight}
      alt={alt}
      width={width}
      height={height}
      className={className}
    />
  );
}
