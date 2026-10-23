'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'fumadocs-core/link';
import type { HistoryAuthor } from '../index';

export function safeURL(value?: string): string | undefined {
  // Reject control characters that could disguise a URL scheme.
  // oxlint-disable-next-line no-control-regex
  if (!value || /[\u0000-\u0020\\]/.test(value)) return undefined;
  return /^(https?:\/\/|\/(?!\/)|#)/i.test(value) ? value : undefined;
}

export function HistoryLink({
  href,
  children,
  className,
  title,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const safe = safeURL(href);
  return safe ? (
    <Link href={safe} className={className} title={title}>
      {children}
    </Link>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function Author({
  author,
  locale,
  compact = false,
}: {
  author: HistoryAuthor;
  locale: string;
  compact?: boolean;
}) {
  const avatar = safeURL(author.avatarUrl);
  const name = author.i18n?.[locale] ?? author.i18n?.[locale.split('-')[0]] ?? author.name;
  return (
    <HistoryLink
      href={author.url}
      title={name}
      className={`fgc-author ${compact ? 'fgc-author-compact' : ''}`}
    >
      {avatar ? (
        <img
          src={avatar}
          alt=""
          width={compact ? 22 : 28}
          height={compact ? 22 : 28}
          loading="lazy"
          className="fgc-avatar"
        />
      ) : (
        <span aria-hidden="true" className="fgc-avatar fgc-avatar-fallback">
          {Array.from(name)[0] ?? '?'}
        </span>
      )}
      <span className="fgc-author-name">{name}</span>
    </HistoryLink>
  );
}

/** Stable initial server/client output, then refresh relative dates once a minute. */
export function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** UTC keeps server and initial client output identical; mounted pages use the browser zone. */
export function useBrowserTimeZone() {
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  return timeZone;
}

// Formatters are costly to construct and every date re-renders once a minute.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function dateFormat(
  locale: string,
  timeZone: string,
  style: 'medium' | 'full',
): Intl.DateTimeFormat {
  const key = `${locale}\n${timeZone}\n${style}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(
      locale,
      style === 'medium'
        ? { dateStyle: 'medium', timeZone }
        : { dateStyle: 'full', timeStyle: 'long', timeZone },
    );
    dateFormats.set(key, format);
  }
  return format;
}

function relativeFormat(locale: string): Intl.RelativeTimeFormat {
  let format = relativeFormats.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormats.set(locale, format);
  }
  return format;
}

export function relativeDate(value: string, now: number, locale: string): string {
  const seconds = (Date.parse(value) - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ];
  const [unit, size] =
    units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
  return relativeFormat(locale).format(Math.round(seconds / size), unit);
}

/** Beyond a week, relative labels such as "last week" stop telling entries apart. */
const RECENT_CHANGE_MS = 7 * 86_400_000;

export function isFreshChange(date: string, now: number | null): boolean {
  const age = now === null ? Infinity : now - Date.parse(date);
  return age >= 0 && age < 86_400_000;
}

export function HistoryDate({
  value,
  locale,
  timeZone,
  relative,
  recentOnly = false,
  now,
}: {
  value: string;
  locale: string;
  timeZone: string;
  relative?: boolean;
  /** Use the relative form only within a week; older dates stay absolute. */
  recentOnly?: boolean;
  now: number | null;
}) {
  const parsed = new Date(value);
  const showRelative =
    relative &&
    now !== null &&
    (!recentOnly || Math.abs(now - parsed.getTime()) < RECENT_CHANGE_MS);
  return (
    <time
      dateTime={value}
      title={dateFormat(locale, timeZone, 'full').format(parsed)}
      // The server cannot know the reader's clock; the stylesheet hides this
      // absolute fallback until hydration instead of flashing it.
      data-pending={relative && now === null ? '' : undefined}
    >
      {showRelative
        ? relativeDate(value, now, locale)
        : dateFormat(locale, timeZone, 'medium').format(parsed)}
    </time>
  );
}
