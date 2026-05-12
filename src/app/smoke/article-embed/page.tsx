import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleBody from "@/app/article/[id]/components/ArticleBody";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Smoke Article Embed Fixture",
  robots: {
    index: false,
    follow: false,
  },
};

const fixtureHtml = [
  "<p>Public article embed sanitizer smoke fixture.</p>",
  '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-top-navigation allow-scripts" srcdoc="<p>bad</p>"></iframe>',
  '<iframe src="https://www.google.com/maps/embed?pb=smoke" sandbox="allow-top-navigation allow-scripts" srcdoc="<p>bad</p>"></iframe>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe src="https://evil.example/embed"></iframe>',
].join("");

export default function SmokeArticleEmbedPage() {
  if (process.env.SMOKE_PUBLIC_ARTICLE_FIXTURE !== "1") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-bold">Smoke Article Embed Fixture</h1>
      <ArticleBody html={fixtureHtml} />
    </main>
  );
}
