import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Strict URL allow-list: only http(s) URLs without quotes/whitespace
const safeUrl = (u: unknown): string => {
  if (typeof u !== 'string') return ''
  const s = u.trim()
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(s)) return ''
  return s
}
// Escape for embedding inside a <script>...</script> block
const jsonEncode = (v: unknown): string =>
  JSON.stringify(v ?? '').replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')


interface Database {
  public: {
    Tables: {
      authors: {
        Row: {
          id: string
          name: string
          bio: string | null
          avatar_url: string | null
          email: string | null
          website: string | null
          social_links: any | null
          books_count: number | null
          followers_count: number | null
          created_at: string
          slug: string | null
          country_code: string | null
          country_name: string | null
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const authorParam = url.searchParams.get('author')

    if (!authorParam) {
      return new Response('Author not found', { status: 404 })
    }

    // Initialize Supabase client
    const supabaseUrl = 'https://kydmyxsgyxeubhmqzrgo.supabase.co'
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0'
    
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    // Decode the author parameter for accurate matching
    const decodedAuthorParam = decodeURIComponent(authorParam)
    
    // Use the same optimized function that the website uses
    const { data: authorDataArray, error } = await supabase
      .from('authors')
      .select(`
        id,
        name,
        bio,
        avatar_url,
        books_count,
        followers_count,
        country_code,
        country_name,
        slug,
        social_links,
        website,
        user_id
      `)
      .or(`slug.eq.${authorParam},name.eq.${decodedAuthorParam}`)

    let author: {
      author_id: string;
      author_name: string;
      bio: string | null;
      avatar_url: string | null;
      profile_avatar: string | null;
      profile_bio: string | null;
      books_count: number | null;
      followers_count: number | null;
      country_name: string | null;
      social_links: any;
      website: string | null;
      user_id: string | null;
      slug?: string | null;
    } | null = null;
    
    if (authorDataArray && authorDataArray.length > 0) {
      const fallbackData = authorDataArray[0];
      author = {
        author_id: fallbackData.id,
        author_name: fallbackData.name,
        bio: fallbackData.bio,
        avatar_url: fallbackData.avatar_url,
        profile_avatar: null,
        profile_bio: null,
        books_count: fallbackData.books_count,
        followers_count: fallbackData.followers_count,
        country_name: fallbackData.country_name,
        social_links: fallbackData.social_links,
        website: fallbackData.website,
        user_id: fallbackData.user_id,
        slug: fallbackData.slug
      };
    }

    if (error || !author) {
      console.log('Author not found:', error)
      return new Response('Author not found', { status: 404 })
    }

    // Log author data for debugging
    console.log('Found author:', {
      name: author.author_name,
      bio: author.profile_bio || author.bio,
      avatar_url: author.profile_avatar || author.avatar_url,
      books_count: author.books_count,
      followers_count: author.followers_count
    })

    // Prefer profile data over author table data (same logic as website)
    const authorName = author.author_name;
    const authorBio = author.profile_bio || author.bio;
    const authorAvatar = author.profile_avatar || author.avatar_url;

    // Generate author description - use bio if available, otherwise create default
    const description = authorBio && authorBio.trim() 
      ? (authorBio.length > 160 ? `${authorBio.substring(0, 160)}...` : authorBio)
      : `اكتشف أعمال ${authorName} واقرأ كتبه مجاناً على منصة كتبي - المكتبة الرقمية العربية المجانية.`

    const authorUrl = `${url.origin}/author/${encodeURIComponent(author.slug || authorName)}`
    
    const rawImageUrl = authorAvatar && authorAvatar.trim()
      ? (authorAvatar.startsWith('http') ? authorAvatar : `${url.origin}${authorAvatar}`)
      : `${url.origin}/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png`
    const imageUrl = safeUrl(rawImageUrl) || `${url.origin}/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png`

    // 🔒 Escape every interpolated DB value
    const e = {
      name: escapeHtml(authorName),
      firstName: escapeHtml(String(authorName).split(' ')[0] ?? ''),
      lastName: escapeHtml(String(authorName).split(' ').slice(1).join(' ')),
      description: escapeHtml(description),
      authorUrl: escapeHtml(authorUrl),
      imageUrl: escapeHtml(imageUrl),
      country: escapeHtml(author.country_name ?? ''),
      books: escapeHtml(String(author.books_count ?? 0)),
      followers: escapeHtml(String(author.followers_count ?? 0)),
    }

    // Build sameAs from validated URLs only
    const sameAsUrls: string[] = []
    const w = safeUrl(author.website); if (w) sameAsUrls.push(w)
    const fb = author.social_links?.facebook; if (typeof fb === 'string' && /^[A-Za-z0-9_.-]+$/.test(fb)) sameAsUrls.push(`https://facebook.com/${fb}`)
    const tw = author.social_links?.twitter; if (typeof tw === 'string' && /^[A-Za-z0-9_.-]+$/.test(tw)) sameAsUrls.push(`https://twitter.com/${tw}`)
    const ig = author.social_links?.instagram; if (typeof ig === 'string' && /^[A-Za-z0-9_.-]+$/.test(ig)) sameAsUrls.push(`https://instagram.com/${ig}`)

    const ldJson = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: authorName,
      description,
      url: authorUrl,
      image: imageUrl,
      sameAs: sameAsUrls,
      jobTitle: 'مؤلف',
      worksFor: { '@type': 'Organization', name: 'منصة كتبي' },
      nationality: author.country_name || 'غير محدد',
      award: `${author.books_count} كتاب منشور`,
      follows: `${author.followers_count} متابع`,
    }

    // Generate HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- Basic Meta Tags -->
  <title>${e.name} | منصة كتبي</title>
  <meta name="description" content="${e.description}">
  <meta name="author" content="${e.name}">
  <meta name="keywords" content="${e.name}, مؤلف, كتب عربية, منصة كتبي${author.country_name ? ', ' + e.country : ''}">

  <!-- Open Graph Meta Tags for Social Media -->
  <meta property="og:title" content="${e.name} - مؤلف">
  <meta property="og:description" content="${e.description}">
  <meta property="og:image" content="${e.imageUrl}">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
  <meta property="og:image:alt" content="صورة المؤلف ${e.name}">
  <meta property="og:url" content="${e.authorUrl}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="منصة كتبي - المكتبة الرقمية العربية المجانية">
  <meta property="og:locale" content="ar_AR">

  <!-- Profile specific Open Graph -->
  <meta property="profile:first_name" content="${e.firstName}">
  <meta property="profile:last_name" content="${e.lastName}">
  <meta property="profile:username" content="${e.name}">

  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${e.name} - مؤلف">
  <meta name="twitter:description" content="${e.description}">
  <meta name="twitter:image" content="${e.imageUrl}">

  <!-- Author specific Schema.org structured data -->
  <script type="application/ld+json">${JSON.stringify(ldJson).replace(/</g, '\\u003c')}</script>

  <!-- Redirect to main app -->
  <script>
    setTimeout(function() {
      window.location.href = ${jsonEncode(authorUrl)};
    }, 500);
  </script>

  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { max-width: 600px; background: rgba(255, 255, 255, 0.1); padding: 40px; border-radius: 20px; backdrop-filter: blur(10px); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.2); }
    .author-avatar { width: 150px; height: 150px; border-radius: 50%; margin: 0 auto 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); object-fit: cover; }
    .author-name { font-size: 32px; font-weight: bold; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3); }
    .author-stats { font-size: 18px; margin-bottom: 20px; opacity: 0.9; }
    .author-bio { font-size: 16px; line-height: 1.6; margin-bottom: 20px; opacity: 0.8; }
    .loading-text { font-size: 14px; opacity: 0.7; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="container">
    <img src="${e.imageUrl}" alt="صورة المؤلف ${e.name}" class="author-avatar"
         onerror="this.src='/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png';">
    <h1 class="author-name">${e.name}</h1>
    <div class="author-stats">
      ${e.books} كتاب • ${e.followers} متابع
      ${author.country_name ? ' • ' + e.country : ''}
    </div>
    ${authorBio ? `<p class="author-bio">${e.description}</p>` : ''}
    <p class="loading-text">جاري توجيهك إلى صفحة المؤلف...</p>
  </div>
</body>
</html>`

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Content-Security-Policy': "default-src 'self'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response('Internal Server Error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
})