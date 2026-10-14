const PATHS: Record<string, string> = {
  leaf: "M5 19c0-8 6-14 14-14 0 8-6 14-14 14zm0 0l7-7",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3 M7.5 15h9",
  factory: "M3 21V10l6 4V10l6 4V6h6v15z M7 17h2M12 17h2M17 17h2",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  box: "M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10",
  truck: "M2 6h11v10H2z M13 10h5l3 3v3h-8 M6 19a2 2 0 100-4 2 2 0 000 4z M17 19a2 2 0 100-4 2 2 0 000 4z",
  badge: "M12 3l2.5 2 3-.5.5 3 2 2.5-2 2.5-.5 3-3-.5L12 17l-2.5-2-3 .5-.5-3L4 10l2-2.5.5-3 3 .5z M9 20l3 1 3-1",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18z M12 7v5l3 2",
  drop: "M12 3s6 7 6 11a6 6 0 01-12 0c0-4 6-11 6-11z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  users: "M9 11a3 3 0 100-6 3 3 0 000 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M16 5a3 3 0 010 6 M18 14c2 .8 3 3 3 6",
  beaker: "M6 3h12M7 3v15a3 3 0 003 3h4a3 3 0 003-3V3 M7 12h10",
  certificate: "M4 4h16v12H4z M8 8h8M8 12h5 M15 14l2 6 1.5-1.5L20 20l-1-6",
  handshake: "M3 12l4-4 4 2 3-2 4 1 3 3 M7 12l4 4 2-1 2 2 2-1-5-5",
  recycle: "M7 19H4l3-5 M17 19h3l-3-5 M12 4l2 3H10z M7 14l5-7 5 7",
  chat: "M4 5h16v11H9l-5 4z",
  document: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7M9 16h7",
};

export function Icon({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.badge} />
    </svg>
  );
}
