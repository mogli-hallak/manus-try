import {
  ChecklistItemDoc,
  RankedCardResult,
  RoomDoc,
  TimeOptionSummary,
} from '../types/meetup';

export interface CalendarEventPayload {
  summary: string;
  location: string;
  description: string;
  startIso: string;
  endIso: string;
  timeZone: string;
}

function resolveEventTimes(winningTime: TimeOptionSummary | null): {
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  let startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  startDate.setHours(20, 0, 0, 0);

  if (winningTime?.option.dateIso && winningTime.option.startTime) {
    const parsed = new Date(
      `${winningTime.option.dateIso}T${winningTime.option.startTime}:00`
    );
    if (!Number.isNaN(parsed.getTime())) {
      startDate = parsed;
    }
  } else if (winningTime?.option.startTime) {
    const [hh, mm] = winningTime.option.startTime.split(':').map(Number);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      startDate = new Date(now);
      startDate.setHours(hh, mm, 0, 0);
      if (startDate.getTime() < now.getTime()) {
        startDate.setDate(startDate.getDate() + 1);
      }
    }
  }

  const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
  return { startDate, endDate };
}

function formatGoogleTemplateDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildSummaryTextDetails(
  room: RoomDoc,
  winningTime: TimeOptionSummary | null,
  winningCard: RankedCardResult | null,
  checklist: ChecklistItemDoc[]
): string {
  const lines: string[] = [];
  lines.push(`מפגש: ${room.title}`);
  if (winningTime) {
    lines.push(`מועד נבחר: ${winningTime.option.label}`);
  }
  if (winningCard) {
    lines.push(
      `הפעילות שנבחרה: ${winningCard.card.title} (${winningCard.card.subtitle} · ${winningCard.consensusPercent}% הסכמה)`
    );
  }
  if (checklist.length > 0) {
    lines.push('');
    lines.push('חלוקת ציוד:');
    checklist.forEach((item) => {
      if (item.claimedByName) {
        lines.push(`- ${item.label}: ${item.claimedByName}`);
      } else {
        lines.push(`- ${item.label}: טרם שויך`);
      }
    });
  }
  return lines.join('\n');
}

export function buildCalendarEventPayload(
  room: RoomDoc,
  winningTime: TimeOptionSummary | null,
  winningCard: RankedCardResult | null,
  checklist: ChecklistItemDoc[]
): CalendarEventPayload {
  const { startDate, endDate } = resolveEventTimes(winningTime);
  const location = winningCard ? winningCard.card.title : room.title;
  const description = buildSummaryTextDetails(room, winningTime, winningCard, checklist);

  return {
    summary: room.title,
    location,
    description,
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem',
  };
}

export function buildGoogleCalendarUrl(
  room: RoomDoc,
  winningTime: TimeOptionSummary | null,
  winningCard: RankedCardResult | null,
  checklist: ChecklistItemDoc[]
): string {
  const { startDate, endDate } = resolveEventTimes(winningTime);
  const details = buildSummaryTextDetails(room, winningTime, winningCard, checklist);
  const location = winningCard ? winningCard.card.title : '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: room.title,
    dates: `${formatGoogleTemplateDate(startDate)}/${formatGoogleTemplateDate(endDate)}`,
    details,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  payload: CalendarEventPayload
): Promise<{ htmlLink?: string; id?: string }> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: payload.summary,
        location: payload.location,
        description: payload.description,
        start: {
          dateTime: payload.startIso,
          timeZone: payload.timeZone,
        },
        end: {
          dateTime: payload.endIso,
          timeZone: payload.timeZone,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Calendar API error (${response.status}): ${errText}`);
  }

  return (await response.json()) as { htmlLink?: string; id?: string };
}

export function buildWhatsAppSummary(
  room: RoomDoc,
  winningTime: TimeOptionSummary | null,
  winningCard: RankedCardResult | null,
  checklist: ChecklistItemDoc[]
): string {
  const parts: string[] = [];
  parts.push(`סיכום מפגש — ${room.title}`);
  parts.push('------------------------');
  if (winningTime && room.mode !== 'quick') {
    parts.push(`מתי נפגשים: ${winningTime.option.label}`);
  }
  if (winningCard) {
    parts.push(
      `ההחלטה שנבחרה: ${winningCard.card.title} (${winningCard.consensusPercent}% הסכמה)`
    );
  }
  if (checklist.length > 0 && room.mode !== 'quick') {
    parts.push('');
    parts.push('מי מביא מה:');
    checklist.forEach((item) => {
      parts.push(
        item.claimedByName
          ? `• ${item.label} — ${item.claimedByName}`
          : `• ${item.label} — פנוי`
      );
    });
  }
  return parts.join('\n');
}
