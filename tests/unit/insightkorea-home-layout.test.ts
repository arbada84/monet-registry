import { describe, expect, it } from "vitest";
import type { Article } from "@/types/article";
import { selectInsightHome } from "@/lib/insightkorea-home-layout";
const article=(id:number,patch:Partial<Article>={}):Article=>({id:String(id),no:id,title:`기사 ${id}`,category:"문화",date:`2026-11-${String(id).padStart(2,"0")}T00:00:00Z`,status:"게시",views:0,body:"",...patch});
describe("insight newspaper selection",()=>{
  it("allocates each article once across hero, bulletin, discovery, rail and sections",()=>{
    const source=Array.from({length:16},(_,i)=>article(i+1));const result=selectInsightHome(source);
    const visible=[...result.hero,result.bulletin!,...result.discovery,...result.picks,...result.sections.flatMap(s=>s.articles)];
    expect(visible.length).toBe(new Set(visible.map(a=>a.id)).size);expect(result.hero).toHaveLength(3);expect(result.bulletin?.id).toBe("13");expect(source[0].id).toBe("1");
  });
  it("does not publish drafts or deleted stories and removes duplicate IDs",()=>{
    const r=selectInsightHome([article(1),article(1),article(2,{status:"임시저장"}),article(3,{deletedAt:"2026-11-16"})]);expect(r.hero.map(a=>a.id)).toEqual(["1"]);
  });
  it("deduplicates a confirmed source with tracking differences but preserves meaningful query values",()=>{
    const r=selectInsightHome([article(1,{sourceUrl:"https://example.com/news?id=1&utm_source=a"}),article(2,{sourceUrl:"https://example.com/news?id=1&utm_source=b"}),article(3,{sourceUrl:"https://example.com/news?id=2"})]);expect(r.hero.map(a=>a.id)).toEqual(["3","2"]);
  });
  it("preserves distinct stories with similar titles or a shared image",()=>{
    const r=selectInsightHome([article(1,{title:"같은 제목",thumbnail:"/same.jpg"}),article(2,{title:"같은 제목",thumbnail:"/same.jpg"})]);expect(r.hero).toHaveLength(2);
  });
  it("selects recent remaining stories for the rail instead of the oldest tail",()=>{
    const r=selectInsightHome(Array.from({length:16},(_,i)=>article(i+1)));
    expect(r.picks.map(a=>a.id)).toEqual(["6","5","4"]);
  });
  it("hides configured discovery fields but keeps an unregistered actual field section",()=>{
    const source=Array.from({length:12},(_,i)=>article(i+1,{category:i<8?"문화":"공공"}));
    const r=selectInsightHome(source,[{name:"문화",order:0,visible:false}]);
    expect(r.discovery).toEqual([]);expect(r.sections.some(s=>s.name==="문화")).toBe(false);
    const extra=selectInsightHome(source,[{name:"비즈",order:0,visible:true}]);
    expect(extra.sections.some(s=>s.name==="문화")).toBe(true);
  });
  it("retains configured category order, hidden settings, and an empty state",()=>{
    const r=selectInsightHome([],[{name:"공공",order:2,visible:true},{name:"문화",order:0,visible:false},{name:"비즈",order:1,visible:true}]);expect(r.names).toEqual(["비즈","공공"]);expect(r.hero).toEqual([]);
  });
});
