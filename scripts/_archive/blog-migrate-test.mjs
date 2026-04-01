// 네이버 블로그 마이그레이션 테스트 스크립트
const BLOG_ID = 'curpy';

async function fetchPost(logNo) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: `https://blog.naver.com/${BLOG_ID}` }
  });
  const html = await r.text();

  // Title
  const title = html.match(/class="se-title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]*>/g, '').trim()
    || html.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/ : 네이버 블로그$/, '').trim() || '';

  // Date - various formats
  const date = html.match(/class="se_publishDate[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim()
    || html.match(/"publishDateText"\s*:\s*"([^"]*)"/)?.[1]
    || html.match(/class="date"[^>]*>(.*?)<\//)?.[1]?.trim()
    || html.match(/class="blog_date[^"]*"[^>]*>(.*?)<\//)?.[1]?.trim() || '';

  // Images - all blog content images
  const allImgs = [...html.matchAll(/(?:data-lazy-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp)[^"]*)"/gi)];
  const images = allImgs.map(m => m[1]).filter(u => {
    // 프로필/아이콘/UI 이미지 제외, 포스트 본문 이미지만
    if (u.includes('static.naver.net')) return false;
    if (u.includes('blogimgs.naver.net')) return false;
    if (u.includes('dthumb-phinf')) return false;
    if (u.includes('profile')) return false;
    return true;
  });
  // Deduplicate
  const uniqueImages = [...new Set(images)];

  // Body HTML
  const bodyMatch = html.match(/class="se-main-container"[^>]*>([\s\S]*?)(?=<div class="(?:post-btn|comment_area|blog2_series))/);
  const bodyHtml = bodyMatch ? bodyMatch[1] : '';

  console.log('Title:', title);
  console.log('Date:', date);
  console.log('Images found:', uniqueImages.length);
  uniqueImages.slice(0, 5).forEach(u => console.log('  IMG:', u.substring(0, 120)));
  console.log('Body HTML length:', bodyHtml.length);
  console.log('Body text preview:', bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 200));
  console.log('---');

  return { title, date, images: uniqueImages, bodyHtml };
}

// Test with first post
const result = await fetchPost('223754235036');
// Test with another
await fetchPost('223604071010');
