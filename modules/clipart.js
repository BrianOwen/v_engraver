// Built-in vector clipart for V-Engraver
// Each entry is an SVG string that can be parsed by parseSVGString().

export const CLIPART_CATALOG = [
  {
    id: 'star-5',
    label: 'Star',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="50,5 61,35 95,35 68,57 79,90 50,70 21,90 32,57 5,35 39,35"/>
    </svg>`,
  },
  {
    id: 'heart',
    label: 'Heart',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50,88 C25,65 2,50 2,30 C2,14 14,2 30,2 C40,2 48,8 50,16
               C52,8 60,2 70,2 C86,2 98,14 98,30 C98,50 75,65 50,88 Z"/>
    </svg>`,
  },
  {
    id: 'diamond',
    label: 'Diamond',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="50,2 95,50 50,98 5,50"/>
    </svg>`,
  },
  {
    id: 'shield',
    label: 'Shield',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
      <path d="M50,2 L95,18 L95,55 C95,85 50,115 50,115 C50,115 5,85 5,55 L5,18 Z"/>
    </svg>`,
  },
  {
    id: 'circle-ring',
    label: 'Ring',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48"/>
      <circle cx="50" cy="50" r="36"/>
    </svg>`,
  },
  {
    id: 'arrow-right',
    label: 'Arrow',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
      <polygon points="0,25 75,25 75,5 115,40 75,75 75,55 0,55"/>
    </svg>`,
  },
  {
    id: 'cross',
    label: 'Cross',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35"/>
    </svg>`,
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    category: 'Shapes',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 87">
      <polygon points="25,0 75,0 100,43.5 75,87 25,87 0,43.5"/>
    </svg>`,
  },
  {
    id: 'anchor',
    label: 'Anchor',
    category: 'Nautical',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
      <path d="M50,0 C58,0 64,6 64,14 C64,20 60,25 54,27 L54,95 C70,93 82,82 86,68 L74,68
               L92,48 L110,68 L98,68 C94,90 74,107 50,110 C26,107 6,90 2,68 L-10,68
               L8,48 L26,68 L14,68 C18,82 30,93 46,95 L46,27 C40,25 36,20 36,14
               C36,6 42,0 50,0 Z
               M50,6 C46,6 42,10 42,14 C42,18 46,22 50,22 C54,22 58,18 58,14 C58,10 54,6 50,6 Z"/>
    </svg>`,
  },
  {
    id: 'fleur-de-lis',
    label: 'Fleur-de-lis',
    category: 'Decorative',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
      <path d="M50,0 C50,0 58,18 58,32 C62,26 72,18 80,18 C90,18 96,28 96,38
               C96,52 82,62 68,62 L72,68 L62,68 C60,78 58,90 58,100 L66,100
               C68,108 60,116 50,116 C40,116 32,108 34,100 L42,100
               C42,90 40,78 38,68 L28,68 L32,62 C18,62 4,52 4,38
               C4,28 10,18 20,18 C28,18 38,26 42,32 C42,18 50,0 50,0 Z"/>
    </svg>`,
  },
  {
    id: 'crown',
    label: 'Crown',
    category: 'Decorative',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
      <path d="M10,70 L2,20 L30,40 L60,5 L90,40 L118,20 L110,70 Z"/>
    </svg>`,
  },
  {
    id: 'leaf',
    label: 'Leaf',
    category: 'Nature',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120">
      <path d="M40,5 C60,5 78,25 78,55 C78,85 55,115 40,115
               C25,115 2,85 2,55 C2,25 20,5 40,5 Z"/>
      <path d="M40,20 L40,105 M40,35 L22,50 M40,35 L58,50
               M40,55 L18,70 M40,55 L62,70 M40,75 L24,88 M40,75 L56,88"
            fill="none" stroke="black" stroke-width="0.5"/>
    </svg>`,
  },
  {
    id: 'tree',
    label: 'Tree',
    category: 'Nature',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
      <path d="M50,2 L78,40 L66,40 L86,70 L72,70 L92,100 L8,100 L28,70 L14,70
               L34,40 L22,40 Z"/>
      <rect x="42" y="100" width="16" height="18"/>
    </svg>`,
  },
  {
    id: 'paw',
    label: 'Paw Print',
    category: 'Nature',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110">
      <ellipse cx="50" cy="72" rx="26" ry="22"/>
      <ellipse cx="26" cy="44" rx="12" ry="15"/>
      <ellipse cx="74" cy="44" rx="12" ry="15"/>
      <ellipse cx="14" cy="68" rx="10" ry="14"/>
      <ellipse cx="86" cy="68" rx="10" ry="14"/>
    </svg>`,
  },
  {
    id: 'music-note',
    label: 'Music Note',
    category: 'Symbols',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 100">
      <path d="M20,85 C10,85 2,78 2,70 C2,62 10,55 20,55 C25,55 29,57 32,60
               L32,8 L56,2 L56,14 L38,18 L38,65 C38,78 30,85 20,85 Z"/>
    </svg>`,
  },
  {
    id: 'compass',
    label: 'Compass',
    category: 'Symbols',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48"/>
      <circle cx="50" cy="50" r="44"/>
      <polygon points="50,8 54,44 50,40 46,44"/>
      <polygon points="50,92 46,56 50,60 54,56"/>
      <polygon points="8,50 44,46 40,50 44,54"/>
      <polygon points="92,50 56,54 60,50 56,46"/>
    </svg>`,
  },
  {
    id: 'welcome-border',
    label: 'Rect Border',
    category: 'Borders',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">
      <rect x="2" y="2" width="196" height="116" rx="8"/>
      <rect x="10" y="10" width="180" height="100" rx="4"/>
    </svg>`,
  },
  {
    id: 'oval-border',
    label: 'Oval Border',
    category: 'Borders',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">
      <ellipse cx="100" cy="60" rx="98" ry="58"/>
      <ellipse cx="100" cy="60" rx="88" ry="48"/>
    </svg>`,
  },
  {
    id: 'scroll-banner',
    label: 'Scroll Banner',
    category: 'Borders',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80">
      <path d="M20,10 L220,10 C230,10 238,18 238,28 L238,52 C238,62 230,70 220,70
               L20,70 C10,70 2,62 2,52 L2,28 C2,18 10,10 20,10 Z"/>
      <path d="M2,28 C2,22 8,16 14,20 L14,60 C8,64 2,58 2,52"/>
      <path d="M238,28 C238,22 232,16 226,20 L226,60 C232,64 238,58 238,52"/>
    </svg>`,
  },
];
