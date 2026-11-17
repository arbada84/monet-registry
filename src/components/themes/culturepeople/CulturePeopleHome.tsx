"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Menu, Search, X } from "lucide-react";
import Link from "@/components/ui/PublicLink";
import type { Article } from "@/types/article";
import { selectCulturePeopleHome, type HomeCategory } from "@/lib/culturepeople-home-layout";
import CulturePeopleFooter from "./CulturePeopleFooter";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";
import styles from "./CulturePeopleHome.module.css";

interface Props {
  articles: Article[];
  initialCategories?: HomeCategory[];
  initialSiteSettings?: { siteName?: string; slogan?: string };
  adSlots?: Record<string, React.ReactNode>;
}
const articleUrl = (article: Article) => `/article/${article.no ?? article.id}`;
const categoryUrl = (category: string) => `/category/${encodeURIComponent(category)}`;
function dateLabel(date: string) {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? "" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}
function ArticlePhoto({ article, priority = false }: { article: Article; priority?: boolean }) {
  return <div className={styles.photo}>{article.thumbnail
    ? <Image src={article.thumbnail} alt={article.thumbnailAlt || article.title} fill
      sizes={priority ? "(max-width: 760px) 100vw, 680px" : "(max-width: 760px) 110px, 360px"}
      priority={priority} />
    : <span className={styles.fallback}>CULTURE &amp; PEOPLE</span>}</div>;
}
function Meta({ article }: { article: Article }) {
  return <p className={styles.meta}><span>{article.category}</span> · <time dateTime={article.date}>{dateLabel(article.date)}</time></p>;
}

export default function CulturePeopleHome({ articles, initialCategories = [], initialSiteSettings, adSlots = {} }: Props) {
  const { lead, latest, sections, popular, names } = selectCulturePeopleHome(articles, initialCategories);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).format(new Date()));
  }, []);
  const siteName = initialSiteSettings?.siteName || "컬처피플";
  return <div className={styles.home}>
    <PopupRenderer />
    <header className={styles.header}>
      <div className={styles.top}>
        <button className={`${styles.icon} ${styles.mobileMenu}`} aria-label="분야 메뉴" aria-expanded={menuOpen} aria-controls="cp-home-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <Link href="/" className={styles.brand} aria-label={`${siteName} 홈`}>
          <Image src="/logo-symbol.svg" alt="" width={57} height={57} className={styles.mark} />
          <span className={styles.word}>{siteName}<small>THE CULTURE PEOPLE</small></span>
        </Link>
        <time className={styles.today}>{today}</time>
        <button className={styles.icon} aria-label={searchOpen ? "검색 닫기" : "기사 검색"} aria-expanded={searchOpen} aria-controls="cp-home-search" onClick={() => setSearchOpen(!searchOpen)}>{searchOpen ? <X /> : <Search />}</button>
      </div>
      {searchOpen && <form id="cp-home-search" action="/search" method="get" className={styles.search} onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}>
        <label htmlFor="cp-home-query">기사 검색</label><input id="cp-home-query" type="search" name="q" placeholder="관심 있는 이야기를 찾아보세요" autoFocus required /><button type="submit">검색</button>
      </form>}
      <nav className={styles.nav} aria-label="주요 분야"><Link href="/" aria-current="page">전체</Link>{names.map((name) => <Link key={name} href={categoryUrl(name)}>{name}</Link>)}</nav>
      {menuOpen && <nav id="cp-home-menu" className={styles.menu} aria-label="전체 분야">{names.map((name) => <Link key={name} href={categoryUrl(name)}>{name}</Link>)}</nav>}
    </header>
    <main className={styles.main}>
      <p className={styles.eyebrow}>THE CULTURE PEOPLE</p>
      <div className={styles.sectionHead}><h1>지금, 주목할 이야기</h1><a href="#cp-home-latest">최신 기사 보기 ↗</a></div>
      {lead ? <div className={styles.leadGrid}>
        <article className={styles.lead}><Link href={articleUrl(lead)}><ArticlePhoto article={lead} priority /><Meta article={lead} /><h2>{lead.title}</h2></Link></article>
        <section className={styles.latest} id="cp-home-latest"><h2>최신 이야기</h2>{latest.map((article) => <article key={article.id}><Link href={articleUrl(article)}><Meta article={article} /><h3>{article.title}</h3></Link></article>)}</section>
      </div> : <p className={styles.empty}>현재 표시할 기사가 없습니다.</p>}
      {adSlots.top}
      <div className={styles.sections}>{sections.map((section, index) => <section key={section.name} className={styles.section}>
        <div className={styles.sectionHead}><h2><Link href={categoryUrl(section.name)}>{section.name}</Link></h2><Link href={categoryUrl(section.name)}>더보기 ↗</Link></div>
        <div className={styles.cards}>{section.articles.map((article) => <article key={article.id} className={styles.card}><Link href={articleUrl(article)}><ArticlePhoto article={article} /><div><Meta article={article} /><h3>{article.title}</h3></div></Link></article>)}</div>
        {index === 1 && adSlots["home-mid-1"]}{index === 3 && adSlots["home-mid-2"]}
      </section>)}</div>
      {sections.length < 2 && adSlots["home-mid-1"]}{sections.length < 4 && adSlots["home-mid-2"]}
      {popular.length > 0 && <section className={styles.popular}><div className={styles.sectionHead}><h2>최근 기사 중 많이 본</h2></div><ol>{popular.map((article) => <li key={article.id}><Link href={articleUrl(article)}>{article.title}</Link></li>)}</ol></section>}
      <CoupangAutoAd keyword={names[0] || "문화"} limit={4} layout="grid" className="my-8" />
      {adSlots.bottom}
    </main>
    <CulturePeopleFooter />
    <div className={styles.footerStrip}><Link href="/" className={styles.footerBrand}>{siteName}</Link><span>문화와 사람을 잇는 이야기</span><div><Link href="/about">회사소개</Link> · <Link href="/contact">기사제보</Link> · <Link href="/privacy">개인정보처리방침</Link></div></div>
  </div>;
}
