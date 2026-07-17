import { createServer } from 'node:http';

const port = Number.parseInt(process.env.PLAYWRIGHT_CALENDAR_PORT ?? '6173', 10);
const eventStart = new Date(Date.now() + 60 * 60 * 1000);
const eventEnd = new Date(eventStart.getTime() + 30 * 60 * 1000);

const calendars = [
  { id: 'primary', summary: 'Primary', backgroundColor: '#3f51b5', primary: true },
  { id: 'work', summary: 'Work', backgroundColor: '#0b8043', primary: false }
];

const events = {
  primary: [{ id: 'primary-planning', summary: 'Primary planning', start: { dateTime: eventStart.toISOString() }, end: { dateTime: eventEnd.toISOString() } }],
  work: [{ id: 'work-review', summary: 'Work review', start: { dateTime: eventStart.toISOString() }, end: { dateTime: eventEnd.toISOString() } }]
};

createServer((request, response) => {
  response.setHeader('content-type', 'application/json');

  if (request.url === '/' || request.url === '/index.html') {
    response.end(JSON.stringify({ status: 'ready' }));
    return;
  }

  if (request.url?.startsWith('/calendar/v3/users/me/calendarList')) {
    response.end(JSON.stringify({ items: calendars }));
    return;
  }

  const calendarId = request.url?.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events/)?.[1];
  if (calendarId) {
    response.end(JSON.stringify({ items: events[decodeURIComponent(calendarId)] ?? [] }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not-found' }));
}).listen(port, '127.0.0.1');
