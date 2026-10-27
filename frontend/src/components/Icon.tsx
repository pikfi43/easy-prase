export type IconName = 'home' | 'tag' | 'map' | 'assistant' | 'profile' | 'bell' | 'heart' | 'search' | 'settings' | 'plus' | 'briefcase' | 'star' | 'check' | 'close'

const paths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9ZM8 21v-6h8v6',
  tag: 'm20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.4 7a2 2 0 0 1-.6 2.8ZM7.5 7.5h.01',
  map: 'M3 6.5 9 4l6 2.5L21 4v14.5L15 21l-6-2.5-6 2V6.5ZM9 4v14.5M15 6.5V21',
  assistant: 'M7 8h10a4 4 0 0 1 4 4v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-5a4 4 0 0 1 4-4Zm5-5v5M9 13h.01M15 13h.01M8 17h8',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  heart: 'M20.8 8.8c0 5.5-8.8 10.2-8.8 10.2S3.2 14.3 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z',
  search: 'm20 20-4.5-4.5M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-6v2m0 15v2M2.5 12h2m15 0h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4',
  plus: 'M12 5v14M5 12h14',
  briefcase: 'M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm4 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  star: 'm12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9L12 3Z',
  check: 'm5 13 4 4L19 7',
  close: 'M6 6l12 12M18 6 6 18',
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
