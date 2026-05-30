/**
 * دوال مساعدة لإنشاء slug من عنوان الكتاب واسم المؤلف
 */

/**
 * تحويل العنوان والمؤلف إلى slug صالح للURL
 */
export function createBookSlug(title: string, author: string): string {
  // نستخدم اسم الكتاب فقط لجعل الرابط أقصر وأفضل لـSEO
  // مثال الناتج: "رواية-رسائل-من-تحت-الأرض"
  void author; // محتفظ به للتوافق مع المستدعيات الحالية
  const cleanTitle = (title || '')
    .trim()
    .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const slug = cleanTitle
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return slug || 'كتاب';
}

/**
 * استخراج العنوان والمؤلف من slug
 */
export function parseBookSlug(slug: string): { title: string; author: string } | null {
  if (!slug) return null;
  
  const parts = slug.split('-');
  if (parts.length < 2) return null;
  
  // نعتبر أن آخر جزء هو اسم المؤلف والباقي هو العنوان
  const author = parts[parts.length - 1];
  const title = parts.slice(0, -1).join('-');
  
  return {
    title: title.replace(/-/g, ' '),
    author: author.replace(/-/g, ' ')
  };
}

/**
 * تنظيف النص من الأحرف الخاصة والمساحات الزائدة
 */
export function cleanText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s]/g, '');
}