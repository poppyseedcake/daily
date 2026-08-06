import type { CalendarSection } from './calendar';
import {
  defaultSummaryConfiguration,
  type SummaryConfiguration
} from './summaryConfiguration';
import {
  buildTodoSection,
  type TodoCategory,
  type TodoTask
} from './todo';
import type { DailySummaryInput } from './dailySummaryRenderer';

const fixtureGeneratedAt = new Date('2026-07-31T05:00:00.000Z');

export const buildDailySummaryFixture = (): DailySummaryInput => {
  const todoSection = buildTodoSection(fixtureTodoCategories, fixtureTodoTasks);

  return {
    configuration: fixtureConfiguration,
    generatedAt: new Date(fixtureGeneratedAt),
    openDailyUrl: 'https://daily.example.test/?utm_source=fixture#fixture',
    sections: {
      weather: {
        status: 'active',
        label: 'Weather',
        detail: 'Partly cloudy · Warsaw · 18°C now · Low 14°C · High 23°C · 20% chance of precipitation · Wind 6 km/h.'
      },
      commute: {
        status: 'active',
        label: 'Commute',
        detail: 'Two scheduled Commute Routes.'
      },
      calendar: {
        status: 'active',
        label: 'Calendar',
        detail: 'Calendar Events for the Week Ahead.'
      },
      todo: {
        status: 'active',
        label: 'Todo',
        detail: 'Active Todo Tasks.'
      }
    },
    commuteSection: {
      label: 'Commute',
      estimates: [
        {
          routeName: 'Office',
          outcome: 'available',
          durationMinutes: 24,
          trafficLevel: 'light',
          trafficDescription: 'Light traffic'
        },
        {
          routeName: 'School run',
          outcome: 'available',
          durationMinutes: 41,
          trafficLevel: 'heavy',
          trafficDescription: 'Heavy traffic'
        }
      ]
    },
    calendarSection: fixtureCalendarSection,
    todoSection
  };
};

export const buildDailySummaryNarrowFixture = (): DailySummaryInput => buildDailySummaryFixture();

export const buildDailySummaryBlockedImageFixture = (): DailySummaryInput => {
  // Decorative image metadata is intentionally absent from the presentation model.
  return buildDailySummaryFixture();
};

export const buildDailySummaryExtremeContentFixture = (): DailySummaryInput => {
  const longValue = `Żółć & <script>alert("unsafe")</script> — ${'very long provider value '.repeat(12)}`;
  const fixture = buildDailySummaryFixture();

  return {
    ...fixture,
    sections: {
      ...fixture.sections,
      weather: {
        status: 'active',
        label: 'Weather <script>',
        detail: `${longValue} · 18°C now.`
      }
    },
    calendarSection: {
      ...fixture.calendarSection!,
      today: {
        ...fixture.calendarSection!.today!,
        timedEvents: [
          {
            ...fixture.calendarSection!.today!.timedEvents[0]!,
            title: longValue
          }
        ]
      }
    },
    todoSection: {
      label: 'Todo Tasks',
      uncategorizedTasks: [
        {
          ...fixture.todoSection!.uncategorizedTasks[0]!,
          title: longValue,
          urgency: 'high'
        }
      ],
      categoryGroups: []
    }
  };
};

export const buildDailySummaryStateMatrixFixtures = (): DailySummaryInput[] => {
  return stateCopy.weather.flatMap((weather) =>
    stateCopy.commute.flatMap((commute) =>
      stateCopy.calendar.flatMap((calendar) =>
        stateCopy.todo.map((todo) =>
          stateFixture({ weather, commute, calendar, todo })
        )
      )
    )
  );
};

const stateFixture = (states: StateMatrix): DailySummaryInput => {
  const fixture = buildDailySummaryFixture();
  const nextSections = {
    weather: stateFor('weather', states.weather, fixture.sections.weather),
    commute: stateFor('commute', states.commute, fixture.sections.commute),
    calendar: stateFor('calendar', states.calendar, fixture.sections.calendar),
    todo: stateFor('todo', states.todo, fixture.sections.todo)
  } as DailySummaryInput['sections'];

  return {
    ...fixture,
    sections: nextSections,
    commuteSection: states.commute === 'active' ? fixture.commuteSection : null,
    calendarSection: states.calendar === 'active' ? fixture.calendarSection : null,
    todoSection: states.todo === 'active' ? fixture.todoSection : null
  };
};

const stateFor = <Section extends keyof StateMatrix>(
  section: Section,
  status: StateMatrix[Section],
  activeState: DailySummaryInput['sections'][Section]
) => {
  if (status === 'active') return activeState;

  const detail = `${capitalize(section)} ${status}`;

  return status === 'unavailable'
    ? { status, label: capitalize(section), reason: `${detail}: provider unavailable.` }
    : { status, label: capitalize(section), detail };
};

const stateCopy = {
  weather: ['active', 'paused', 'unconfigured', 'unavailable'],
  commute: ['active', 'paused', 'unconfigured', 'empty', 'unavailable'],
  calendar: ['active', 'paused', 'unconfigured', 'empty', 'unavailable'],
  todo: ['active', 'paused', 'empty', 'unavailable']
} as const;

type StateMatrix = {
  [Section in keyof typeof stateCopy]: (typeof stateCopy)[Section][number];
};

const fixtureConfiguration: SummaryConfiguration = {
  ...defaultSummaryConfiguration,
  summaryTheme: 'light',
  userTimeZone: 'Europe/Warsaw',
  sections: { weather: true, commute: true, calendar: true, todo: true },
  sectionPauses: { weather: false, commute: false, calendar: false, todo: false }
};

const fixtureTodoCategories: TodoCategory[] = [];
const fixtureTodoTasks: TodoTask[] = [
  {
    id: 'fixture-todo-1',
    title: 'Send revised proposal',
    categoryId: null,
    urgency: 'high',
    position: 1,
    completed: false
  },
  {
    id: 'fixture-todo-2',
    title: 'Pick up the parcel',
    categoryId: null,
    urgency: 'low',
    position: 2,
    completed: false
  }
];

const fixtureCalendarSection: CalendarSection = {
  label: 'Calendar',
  today: {
    label: 'Today',
    allDayEvents: [],
    timedEvents: [
      {
        id: 'fixture-calendar-1',
        title: 'Design sync',
        calendarLabel: 'Work',
        calendarColor: '#4f6f9f',
        localStartTime: '09:30'
      }
    ]
  },
  weekAhead: [
    {
      label: 'Sun, Aug 2',
      allDayEvents: [
        {
          id: 'fixture-calendar-2',
          title: 'Focus block',
          calendarLabel: 'Work',
          calendarColor: '#4f6f9f'
        }
      ],
      timedEvents: []
    }
  ]
};

const capitalize = (value: string) => value[0]!.toUpperCase() + value.slice(1);
