"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Menu, Search, X } from "lucide-react";
import Link from "@/components/ui/PublicLink";
import type { Article } from "@/types/article";
import { selectInsightHome, type InsightCategory } from "@/lib/insightkorea-home-layout";
import PopupRenderer from "@/components/ui/PopupRenderer";
import CoupangAutoAd from "@/components/ui/CoupangAutoAd";
import InsightKoreaFooter from "./InsightKoreaFooter";
import s from "./InsightKoreaNewsHome.module.css";

interface Props { articles: Article[]; initialCategories?: InsightCategory[]; initialSiteSettings?: {siteName?:string;slogan?:string}; adSlots?:Record<string,React.ReactNode> }
const articleUrl = (a:Article)=>`/article/${a.no??a.id}`;
const categoryUrl = (name:string)=>`/category/${encodeURIComponent(name)}`;
function Meta({article:a}:{article:Article}) {
  const date=new Date(a.date);
  return <p className={s.meta}><b>{a.category}</b> · <time dateTime={a.date}>{Number.isNaN(date.getTime())?"":new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)}</time></p>;
}
function Photo({article:a,priority=false,small=false}:{article:Article;priority?:boolean;small?:boolean}) {
  return <div className={`${s.photo} ${small?s.smallPhoto:""}`}>{a.thumbnail?<Image src={a.thumbnail} alt={a.thumbnailAlt||a.title} fill priority={priority} sizes={small?"90px":priority?"(max-width:760px) 100vw, 820px":"(max-width:760px) 110px, 360px"}/>:<span className={s.fallback}>CULTURE PEOPLE</span>}</div>;
}
export default function InsightKoreaNewsHome({articles,initialCategories=[],initialSiteSettings,adSlots={}}:Props) {
  const {hero,bulletin,discovery,picks,sections,names}=selectInsightHome(articles,initialCategories);
  const [today,setToday]=useState("");const [searchOpen,setSearchOpen]=useState(false);const [menuOpen,setMenuOpen]=useState(false);
  const searchTrigger=useRef<HTMLButtonElement>(null);const menuTrigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{setToday(new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",weekday:"long"}).format(new Date()));},[]);
  const closeSearch=()=>{setSearchOpen(false);searchTrigger.current?.focus();};
  const siteName=initialSiteSettings?.siteName||"컬처피플";
  return <div className={s.home}>
    <PopupRenderer/>
    <header><div className={s.masthead}>
      <button ref={menuTrigger} className={`${s.icon} ${s.mobileMenu}`} type="button" aria-label="전체 분야 메뉴" aria-controls="insight-home-menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X/>:<Menu/>}</button>
      <Link className={s.brand} href="/" aria-label={`${siteName} 홈`}><Image src="/logo-symbol.svg" width={66} height={66} alt="" className={s.mark}/><span className={s.word}>{siteName}<small>THE CULTURE PEOPLE</small></span></Link>
      <div className={s.edition}><time>{today}</time><p>{initialSiteSettings?.slogan||"문화와 사람, 오늘의 흐름을 읽다"}</p></div>
      <button ref={searchTrigger} className={s.icon} type="button" aria-label={searchOpen?"검색 닫기":"기사 검색"} aria-controls="insight-home-search" aria-expanded={searchOpen} onClick={()=>searchOpen?closeSearch():setSearchOpen(true)}>{searchOpen?<X/>:<Search/>}</button>
    </div>
    {searchOpen&&<form className={s.search} id="insight-home-search" action="/search" method="get" onKeyDown={e=>{if(e.key==="Escape")closeSearch();}}><label htmlFor="insight-home-query">기사 검색</label><input id="insight-home-query" name="q" type="search" autoFocus required placeholder="검색어를 입력하세요"/><button type="submit">검색</button></form>}
    <nav className={s.nav} aria-label="주요 분야"><Link href="/" aria-current="page">전체</Link>{names.map(name=><Link key={name} href={categoryUrl(name)}>{name}</Link>)}</nav>
    {menuOpen&&<nav id="insight-home-menu" className={s.menu} aria-label="전체 분야" onKeyDown={e=>{if(e.key==="Escape"){setMenuOpen(false);menuTrigger.current?.focus();}}}>{names.map(name=><Link key={name} href={categoryUrl(name)}>{name}</Link>)}</nav>}
    </header>
    <main className={s.main}><div className={s.pageTitle}><h1 className={s.homeTitle}>컬처피플 최신 뉴스</h1><span>문화 · 산업 · 사람의 이야기를 한눈에</span></div>
    {hero[0]?<section className={`${s.topGrid} ${hero.length===1?s.solo:""}`} aria-label="주요 기사"><article className={s.lead}><Link href={articleUrl(hero[0])}><Photo article={hero[0]} priority/><div className={s.scrim}/><div className={s.leadCopy}><Meta article={hero[0]}/><h2>{hero[0].title}</h2></div></Link></article>{hero.length>1&&<div className={s.heroSides}>{hero.slice(1).map(a=><article className={s.heroSide} key={a.id}><Link href={articleUrl(a)}><Photo article={a}/><div className={s.scrim}/><span className={s.sideLabel}>{a.category}</span><h3>{a.title}</h3></Link></article>)}</div>}</section>:<p className={s.empty}>현재 표시할 기사가 없습니다.</p>}
    {bulletin&&<section className={s.newsStrip} aria-label="최신 기사"><strong>최신 기사</strong><Link href={articleUrl(bulletin)}>{bulletin.title}</Link><Meta article={bulletin}/></section>}
    {adSlots.top}
    <div className={s.body}><div className={s.mainColumn}>
      {discovery.length>0&&<section className={s.discovery}><div className={s.heading}><h2>문화 현장 ›</h2><span>컬처피플이 전하는 소식</span></div><div className={s.cards}>{discovery.map(a=><article key={a.id}><Link href={articleUrl(a)}><Photo article={a}/><div><Meta article={a}/><h3>{a.title}</h3></div></Link></article>)}</div></section>}
      {adSlots["home-mid-1"]}
      <div className={s.topics}>{sections.map(section=><section className={s.topic} key={section.name}><h2><Link href={categoryUrl(section.name)}>{section.name}<span>›</span></Link></h2>{section.articles.map(a=><article key={a.id}><Link href={articleUrl(a)}><Photo article={a} small/><h3>{a.title}</h3></Link></article>)}<Link className={s.more} href={categoryUrl(section.name)}>{section.name} 기사 더보기 ›</Link></section>)}</div>
      {adSlots["home-mid-2"]}
    </div><aside className={s.rail} aria-label="함께 읽기와 분야 탐색">
      {picks.length>0&&<section className={s.readNext}><h2>함께 읽을 이야기</h2>{picks.map(a=><article key={a.id}><Link href={articleUrl(a)}><Meta article={a}/><h3>{a.title}</h3></Link></article>)}</section>}
      <section className={s.railLinks}><h2>분야 바로가기</h2>{names.map(name=><Link key={name} href={categoryUrl(name)}>{name}<span>›</span></Link>)}</section>
      <section className={s.railContact}><h2>현장의 이야기를 듣습니다</h2><p>문화와 사람의 소식을 전해주세요.</p><Link href="/contact">기사제보 ›</Link></section>
    </aside></div>
    <CoupangAutoAd keyword="베스트셀러" limit={4} layout="grid" className="my-8"/>
    {adSlots.bottom}
    </main><InsightKoreaFooter homeEdition/>
  </div>;
}
