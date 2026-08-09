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
import type { DailySummaryInput, RenderedDailySummary } from './dailySummaryRenderer';

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
  return {
    ...buildDailySummaryDenseAllActiveFixture(),
    weatherSection: null
  };
};

export const buildDailySummaryExtremeContentFixture = (): DailySummaryInput => {
  const longValue = `Żółć & <script>alert("unsafe")</script> — ${'very long provider value '.repeat(12)}`;
  const fixture = buildDailySummaryDenseAllActiveFixture();

  return {
    ...fixture,
    weatherSection: null,
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

export const buildDailySummaryDenseAllActiveFixture = (): DailySummaryInput => {
  const fixture = buildDailySummaryFixture();

  return {
    ...fixture,
    sections: {
      weather: {
        status: 'active',
        label: 'Weather',
        detail: 'Partly cloudy · Warszawa · Żółć and long summer forecast context for the release candidate.'
      },
      commute: {
        status: 'active',
        label: 'Commute',
        detail: 'Three scheduled routes with saved names, locations, traffic descriptions, and long labels.'
      },
      calendar: {
        status: 'active',
        label: 'Calendar',
        detail: 'Seven local dates with timed and all-day Calendar Events, including non-ASCII titles.'
      },
      todo: {
        status: 'active',
        label: 'Todo',
        detail: 'Uncategorized and categorized Todo Tasks with long titles and all urgency levels.'
      }
    },
    weatherSection: {
      observedAtLocal: '2026-07-31T07:00',
      currentTemperatureCelsius: 18,
      minimumTemperatureCelsius: 14,
      maximumTemperatureCelsius: 27,
      maximumPrecipitationProbabilityPercent: 35,
      maximumWindSpeedKmh: 24,
      dailyWeatherCode: 2,
      conditionText: 'Partly cloudy',
      conditionCategory: 'partly-cloudy',
      iconUrl: 'https://daily.example.test/weather-icons/partly-cloudy.png',
      summary: 'Żółć: chmury mogą ustąpić po południu; keep a light jacket for the evening.'
    },
    commuteSection: {
      label: 'Commute',
      estimates: [
        {
          routeName: 'Biuro i spotkania klientów',
          originLabel: 'Mokotów',
          destinationLabel: 'Rondo Daszyńskiego — centrum Warszawy',
          outcome: 'available',
          durationMinutes: 29,
          trafficLevel: 'moderate',
          trafficDescription: 'Moderate traffic'
        },
        {
          routeName: 'Lotnisko Ławica',
          originLabel: 'Jeżyce — Poznań',
          destinationLabel: 'Port lotniczy Poznań-Ławica',
          outcome: 'available',
          durationMinutes: 48,
          trafficLevel: 'heavy',
          trafficDescription: 'Heavy traffic'
        },
        {
          routeName: 'Żłobek i zakupy',
          originLabel: 'Home',
          destinationLabel: 'Rynek Starego Miasta',
          outcome: 'available',
          durationMinutes: 17,
          trafficLevel: 'light',
          trafficDescription: 'Light traffic'
        }
      ]
    },
    calendarSection: denseCalendarSection,
    todoSection: buildTodoSection(denseTodoCategories, denseTodoTasks)
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

export type DailySummaryVerificationFixture = {
  id: 'all-active' | 'rotate-01' | 'rotate-02' | 'rotate-03' | 'rotate-04';
  kind: 'all-active' | 'rotating';
  description: string;
  input: DailySummaryInput;
};

export const buildDailySummaryVerificationFixtures = (): DailySummaryVerificationFixture[] => [
  {
    id: 'all-active',
    kind: 'all-active',
    description: 'Dense all-active content with long, non-ASCII Weather, Commute, Calendar, and Todo values.',
    input: buildDailySummaryDenseAllActiveFixture()
  },
  ...rotatingVerificationStates.map((states, index) => ({
    id: `rotate-0${index + 1}` as DailySummaryVerificationFixture['id'],
    kind: 'rotating' as const,
    description: 'A fixed state rotation for the immutable client matrix.',
    input: stateFixture(states, buildDailySummaryDenseAllActiveFixture())
  }))
];

export type DailySummaryEncodedSize = {
  htmlBytes: number;
  textBytes: number;
  totalBytes: number;
};

export const measureDailySummaryEncodedSize = (
  rendered: RenderedDailySummary
): DailySummaryEncodedSize => {
  const encoder = new TextEncoder();
  const htmlBytes = encoder.encode(rendered.html).byteLength;
  const textBytes = encoder.encode(rendered.text).byteLength;

  return {
    htmlBytes,
    textBytes,
    totalBytes: htmlBytes + textBytes
  };
};

const stateFixture = (
  states: StateMatrix,
  baseFixture: DailySummaryInput = buildDailySummaryFixture()
): DailySummaryInput => {
  const fixture = baseFixture;
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
    calendarSection: states.calendar === 'active' || states.calendar === 'empty'
      ? fixture.calendarSection
      : null,
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

const rotatingVerificationStates = [
  { weather: 'paused', commute: 'unconfigured', calendar: 'empty', todo: 'unavailable' },
  { weather: 'unconfigured', commute: 'empty', calendar: 'unavailable', todo: 'paused' },
  { weather: 'unavailable', commute: 'paused', calendar: 'unconfigured', todo: 'empty' },
  { weather: 'active', commute: 'unavailable', calendar: 'paused', todo: 'active' }
] as const satisfies readonly StateMatrix[];

const fixtureConfiguration: SummaryConfiguration = {
  ...defaultSummaryConfiguration,
  userTimeZone: 'Europe/Warsaw',
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
      label: 'Sat, Aug 1',
      allDayEvents: [],
      timedEvents: []
    },
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
    },
    {
      label: 'Mon, Aug 3',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Tue, Aug 4',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Wed, Aug 5',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Thu, Aug 6',
      allDayEvents: [],
      timedEvents: []
    }
  ]
};

const denseTodoCategories: TodoCategory[] = [
  { id: 'dense-todo-work', name: 'Klienty i R&D — Warszawa', position: 1 },
  { id: 'dense-todo-home', name: 'Dom i sprawy osobiste — Łódź', position: 2 }
];

const denseTodoTasks: TodoTask[] = [
  {
    id: 'dense-todo-uncategorized',
    title: 'Przygotować plan wdrożenia — sprawdzić każdy krok, właściciela i termin przed wysyłką.',
    categoryId: null,
    urgency: 'high',
    position: 1,
    completed: false
  },
  {
    id: 'dense-todo-release',
    title: 'Potwierdzić źródło MIME i zrzuty dla każdej wersji klienta pocztowego.',
    categoryId: 'dense-todo-work',
    urgency: 'medium',
    position: 1,
    completed: false
  },
  {
    id: 'dense-todo-home',
    title: 'Kupić warzywa, kawę i prezent urodzinowy po drodze do domu.',
    categoryId: 'dense-todo-home',
    urgency: 'low',
    position: 1,
    completed: false
  }
];

const denseCalendarSection: CalendarSection = {
  label: 'Calendar',
  today: {
    label: 'Today',
    allDayEvents: [
      {
        id: 'dense-calendar-all-day',
        title: 'Święto rodzinne — pamiętać o telefonie i przygotowaniu kolacji.',
        calendarLabel: 'Osobisty',
        calendarColor: '#70519a'
      }
    ],
    timedEvents: [
      {
        id: 'dense-calendar-strategy',
        title: 'Réunion stratégique — préparation du lancement et risques ouverts',
        calendarLabel: 'Work — Europe',
        calendarColor: '#4f6f9f',
        localStartTime: '09:30'
      },
      {
        id: 'dense-calendar-review',
        title: 'Review Daily Grid rendering with the verification operator',
        calendarLabel: 'Work — Europe',
        calendarColor: '#4f6f9f',
        localStartTime: '14:15'
      }
    ]
  },
  weekAhead: [
    {
      label: 'Sat, Aug 1',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Sun, Aug 2',
      allDayEvents: [],
      timedEvents: [
        {
          id: 'dense-calendar-walk',
          title: 'Spacer nad Wisłą i planowanie następnego tygodnia',
          calendarLabel: 'Osobisty',
          calendarColor: '#70519a',
          localStartTime: '11:00'
        }
      ]
    },
    {
      label: 'Mon, Aug 3',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Tue, Aug 4',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Wed, Aug 5',
      allDayEvents: [],
      timedEvents: []
    },
    {
      label: 'Thu, Aug 6',
      allDayEvents: [],
      timedEvents: []
    }
  ]
};

const capitalize = (value: string) => value[0]!.toUpperCase() + value.slice(1);
