import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleLanding from "@/components/pages/culturepeople-landing";

export const revalidate = 60; // 60초 ISR 캐시

export default async function Home() {
  const articles = await serverGetArticles();
  return <CulturepeopleLanding articles={articles} />;
}
