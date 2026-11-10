import localFont from 'next/font/local';

export const din = localFont({
  src: [
    {
      path: '../assets/fonts/din-pro/DINPro-CondensedRegular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/din-pro/DINPro-CondensedMedium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../assets/fonts/din-pro/DINPro-CondensedBlack.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-din',
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});

export const gotham = localFont({
  src: [
    {
      path: '../assets/fonts/gotham-pro/Gotham Pro Regular/Gotham Pro Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../assets/fonts/gotham-pro/Gotham Pro Medium/Gotham Pro Medium.ttf',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-gotham',
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});
