import { describe, expect, test } from 'vitest';
import { buildSavedSelectedCalendars, buildSelectedCalendarConfiguration } from './selectedCalendars';

describe('Selected Calendar configuration', () => {
  test('selects the primary Google calendar by default when the User has no saved selection', () => {
    const configuration = buildSelectedCalendarConfiguration({
      providerCalendars: [
        {
          id: 'work',
          summary: 'Work',
          backgroundColor: '#0b8043',
          primary: false
        },
        {
          id: 'primary',
          summary: 'Ada Lovelace',
          backgroundColor: '#3f51b5',
          primary: true
        }
      ],
      savedCalendars: []
    });

    expect(configuration).toEqual({
      calendars: [
        {
          id: 'work',
          summary: 'Work',
          backgroundColor: '#0b8043',
          primary: false,
          selected: false
        },
        {
          id: 'primary',
          summary: 'Ada Lovelace',
          backgroundColor: '#3f51b5',
          primary: true,
          selected: true
        }
      ],
      selectedCalendarIds: ['primary']
    });
  });

  test('keeps saved selection for removed or renamed provider calendars without provider event content', () => {
    const configuration = buildSelectedCalendarConfiguration({
      providerCalendars: [
        {
          id: 'primary',
          summary: 'Personal',
          description: 'Dentist at 10:00',
          location: 'Home',
          backgroundColor: '#3f51b5',
          primary: true
        },
        {
          id: 'work',
          summary: 'Team Calendar',
          backgroundColor: '#0b8043',
          primary: false
        }
      ],
      savedCalendars: [
        {
          id: 'work',
          summary: 'Work',
          backgroundColor: '#0b8043',
          primary: false
        },
        {
          id: 'removed',
          summary: 'Old Project',
          backgroundColor: null,
          primary: false
        }
      ]
    });

    expect(configuration.selectedCalendarIds).toEqual(['work', 'removed']);
    expect(configuration.calendars).toEqual([
      {
        id: 'primary',
        summary: 'Personal',
        backgroundColor: '#3f51b5',
        primary: true,
        selected: false
      },
      {
        id: 'work',
        summary: 'Team Calendar',
        backgroundColor: '#0b8043',
        primary: false,
        selected: true
      },
      {
        id: 'removed',
        summary: 'Old Project',
        backgroundColor: null,
        primary: false,
        selected: true,
        unavailable: true
      }
    ]);
    expect(JSON.stringify(configuration)).not.toContain('Dentist');
    expect(JSON.stringify(configuration)).not.toContain('Home');
  });

  test('builds saved selections from provider metadata and only keeps unavailable saved metadata', () => {
    const savedSelections = buildSavedSelectedCalendars({
      providerCalendars: [
        {
          id: 'work',
          summary: 'Work From Provider',
          description: 'Budget review at 11:00',
          location: 'Office',
          backgroundColor: '#0b8043',
          primary: false
        },
        {
          id: 'primary',
          summary: 'Ada Lovelace',
          backgroundColor: '#3f51b5',
          primary: true
        }
      ],
      savedCalendars: [
        {
          id: 'work',
          summary: 'Client Supplied Work',
          backgroundColor: null,
          primary: true
        },
        {
          id: 'removed',
          summary: 'Old Project',
          backgroundColor: null,
          primary: false
        }
      ],
      selectedCalendarIds: ['work', 'removed']
    });

    expect(savedSelections).toEqual([
      {
        id: 'work',
        summary: 'Work From Provider',
        backgroundColor: '#0b8043',
        primary: false
      },
      {
        id: 'removed',
        summary: 'Old Project',
        backgroundColor: null,
        primary: false
      }
    ]);
    expect(JSON.stringify(savedSelections)).not.toContain('Budget');
    expect(JSON.stringify(savedSelections)).not.toContain('Office');
    expect(JSON.stringify(savedSelections)).not.toContain('Client Supplied Work');
  });
});
