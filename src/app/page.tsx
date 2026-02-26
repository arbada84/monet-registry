import { serverGetArticles } from "@/lib/db-server";
import CulturepeopleLanding from "@/components/pages/culturepeople-landing";

export default async function Home() {
  const articles = await serverGetArticles();
  return <CulturepeopleLanding articles={articles} />;
}
