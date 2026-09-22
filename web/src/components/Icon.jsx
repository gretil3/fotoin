const paths = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  upload: 'M12 16V4m0 0L7 9m5-5l5 5M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  camera:
    'M4 8.5A2.5 2.5 0 016.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5v-8zM12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
  shield: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zm-3 9l2 2 4-4',
  store: 'M4 9l1.5-5h13L20 9M4 9v10h16V9M4 9h16M9 19v-5h6v5',
  chat: 'M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z',
  arrowRight: 'M5 12h14m-5-5l5 5-5 5',
  image: 'M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 10l4.5-4.5 3.5 3.5 2.5-2.5L20 18M15 9h.01',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16',
};

export default function Icon({ name, size = 20, strokeWidth = 1.8, className = 'icon' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
