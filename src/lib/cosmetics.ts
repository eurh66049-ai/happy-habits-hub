// أدوات مشتركة لعرض التخصيصات المشتراة من المتجر (إطار الصورة، لون الاسم، الشارة، تمييز التعليق)
import type { CSSProperties } from 'react';



export const getAvatarFrameClass = (value?: string | null): string => {
  switch (value) {
    case 'gold':
      return 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-background shadow-[0_0_18px_rgba(250,204,21,0.55)]';
    case 'neon':
      return 'ring-4 ring-cyan-400 ring-offset-2 ring-offset-background shadow-[0_0_20px_rgba(34,211,238,0.7)]';
    case 'fire':
      return 'ring-4 ring-orange-500 ring-offset-2 ring-offset-background shadow-[0_0_22px_rgba(249,115,22,0.8)]';
    default:
      return '';
  }
};

export const getNameColorStyle = (value?: string | null): React.CSSProperties => {
  if (!value) return {};
  return { color: value, textShadow: '0 0 1px rgba(0,0,0,0.15)' };
};

export const getCommentHighlightStyle = (value?: string | null): React.CSSProperties => {
  if (!value) return {};
  if (value === 'highlight') {
    return {
      background: 'linear-gradient(135deg, rgba(250,204,21,0.45), rgba(249,115,22,0.40) 50%, rgba(244,114,182,0.40))',
      border: '2px solid rgba(250,204,21,0.85)',
      boxShadow: '0 0 20px rgba(250,204,21,0.55), inset 0 0 14px rgba(255,255,255,0.10)',
      borderRadius: '0.85rem',
    };
  }
  return { background: value };
};
