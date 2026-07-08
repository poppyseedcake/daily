import { z } from 'zod';

export const savedSelectedCalendarSchema = z.object({
  id: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  backgroundColor: z.string().nullable(),
  primary: z.boolean()
}).strict();

export const selectedCalendarIdSaveSchema = z.array(z.string().trim().min(1));

export type ProviderCalendarListEntry = {
  id: string;
  summary: string;
  backgroundColor?: string | null;
  primary?: boolean | null;
  [metadata: string]: unknown;
};

export type SavedSelectedCalendar = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
};

export type SelectedCalendarOption = SavedSelectedCalendar & {
  selected: boolean;
  unavailable?: true;
};

export type SelectedCalendarConfiguration = {
  calendars: SelectedCalendarOption[];
  selectedCalendarIds: string[];
};

const calendarDisplayMetadata = (calendar: ProviderCalendarListEntry): SavedSelectedCalendar => ({
  id: calendar.id,
  summary: calendar.summary,
  backgroundColor: calendar.backgroundColor ?? null,
  primary: calendar.primary === true
});

export const buildSelectedCalendarConfiguration = ({
  providerCalendars,
  savedCalendars
}: {
  providerCalendars: ProviderCalendarListEntry[];
  savedCalendars: SavedSelectedCalendar[];
}): SelectedCalendarConfiguration => {
  const selectedCalendarIds =
    savedCalendars.length > 0
      ? savedCalendars.map((calendar) => calendar.id)
      : providerCalendars.filter((calendar) => calendar.primary === true).map((calendar) => calendar.id);
  const selectedIds = new Set(selectedCalendarIds);
  const providerOptions = providerCalendars.map((calendar) => ({
    ...calendarDisplayMetadata(calendar),
    selected: selectedIds.has(calendar.id)
  }));
  const providerIds = new Set(providerCalendars.map((calendar) => calendar.id));
  const unavailableSavedOptions = savedCalendars
    .filter((calendar) => !providerIds.has(calendar.id))
    .map((calendar) => ({
      ...calendar,
      selected: true,
      unavailable: true as const
    }));

  return {
    calendars: [...providerOptions, ...unavailableSavedOptions],
    selectedCalendarIds
  };
};

export const buildSavedSelectedCalendars = ({
  providerCalendars,
  savedCalendars,
  selectedCalendarIds
}: {
  providerCalendars: ProviderCalendarListEntry[];
  savedCalendars: SavedSelectedCalendar[];
  selectedCalendarIds: string[];
}): SavedSelectedCalendar[] => {
  const selectedIds = new Set(selectedCalendarIds);
  const providerSelections = providerCalendars
    .filter((calendar) => selectedIds.has(calendar.id))
    .map(calendarDisplayMetadata);
  const providerIds = new Set(providerCalendars.map((calendar) => calendar.id));
  const unavailableSavedSelections = savedCalendars.filter(
    (calendar) => selectedIds.has(calendar.id) && !providerIds.has(calendar.id)
  );

  return [...providerSelections, ...unavailableSavedSelections];
};
