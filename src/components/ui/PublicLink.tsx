"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

// News lists can contain hundreds of links; render only the page the reader opens.
export default function PublicLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />;
}
