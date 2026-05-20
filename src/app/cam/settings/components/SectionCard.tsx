"use client";

import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  children: ReactNode;
}

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section
      style={{
        background: "#FFFFFF",
        border: "1px solid #EEEEEE",
        borderRadius: 10,
        padding: 24,
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "#111",
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: "1px solid #EEEEEE",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
