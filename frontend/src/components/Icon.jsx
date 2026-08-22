const paths = {
  home: <><path d="m3 10.5 9-7 9 7"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
  walk: <><circle cx="12" cy="4.5" r="2"/><path d="m10.5 8-2 5 3.5 2 2 6M10 10l4 2 2-3M8.5 13 5 18"/></>,
  route: <><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 0-3-3h-1a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h6"/></>,
  monitor: <><path d="M3 12h4l2-5 4 10 2-5h6"/><path d="M20 7.5V5l-3-2H7L4 5v2.5M4 16.5V19l3 2h10l3-2v-2.5"/></>,
  sos: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></>,
  light: <><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-1 .8-1.5 1.6-1.5 2.5h-4c0-.9-.5-1.7-1.5-2.5Z"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  phone: <><path d="M6.5 3h3l1.5 5-2 1.5a15 15 0 0 0 5.5 5.5l1.5-2 5 1.5v3A2.5 2.5 0 0 1 18.5 21C10 20.5 3.5 14 3 5.5A2.5 2.5 0 0 1 5.5 3h1Z"/></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></>,
  refresh: <><path d="M20 6v5h-5"/><path d="M18.5 15a8 8 0 1 1 .7-7.5L20 11"/></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
};

export default function Icon({ name, size = 20, className = "", strokeWidth = 1.8 }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name] || paths.shield}
    </svg>
  );
}
