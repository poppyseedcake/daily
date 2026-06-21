# Daily

Daily helps a person receive a private summary of their upcoming day at the time their day starts.

## Language

**User**:
A single person who signs in with their Google account and receives their own daily summary.
_Avoid_: Account, customer, member, household, team

**Administrator**:
A trusted operator who can inspect application health and operational usage without accessing private User content.
_Avoid_: Support user, superuser

**Admin Panel**:
A restricted interface for Administrators to inspect operational status, Google Maps usage, delivery health, and technical logs that exclude private User content.
_Avoid_: User dashboard, support inbox

**Visitor**:
A person exploring the application before signing in with Google. A Visitor can inspect and interact with the app, but cannot receive a Daily Summary.
_Avoid_: Anonymous user, guest account, trial user

**Local Setup**:
The configuration, Todo data, Weather Location, and Commute Routes a Visitor creates in their browser before signing in. Local Setup is automatically saved to the User after Google sign-in only when the User has no existing saved setup.
_Avoid_: Demo data, guest account data

**Demo Calendar**:
Clearly labeled sample Calendar Events shown to a Visitor so they can understand the Calendar Section before connecting their own Google Calendar.
_Avoid_: Selected Calendar, imported calendar

**Daily Summary**:
A single email message generated for a User at their configured local time, containing the information needed to plan that day.
_Avoid_: Alert, notification, digest, reminder

**Delivery Record**:
A minimal record that a scheduled or test Daily Summary was attempted or sent, without storing the full email content. Delivery Records are kept for the last 30 days.
_Avoid_: Email archive, message copy

**Summary Theme**:
The User-selected visual style for the Daily Summary email. A User can choose either the light theme or the dark theme; the light theme is the default.
_Avoid_: Custom template, brand theme

**Summary Recipient**:
The current verified email address from the User's Google account where their Daily Summary is sent.
_Avoid_: Alternate recipient, forwarding address

**Summary Configuration**:
The User's optional choices that determine which parts can appear in their Daily Summary. No Daily Summary is sent when the User has not configured and enabled any content part of it, but an enabled part can appear even when it has no items that day unless that part is Todo or Commute.
_Avoid_: Required setup, onboarding completion

**Summary Delivery**:
The User-controlled state that determines whether Daily Summaries are sent at all, independent of the enabled Summary Sections. Summary Delivery is enabled by default.
_Avoid_: Section toggle, unsubscribe

**Summary Section**:
An optional part of the Daily Summary that can be enabled or disabled independently from whether the User has configured data for it. Enabled Summary Sections appear in the fixed order Weather, Commute, Calendar, Todo.
_Avoid_: Feature, widget, module

**Unavailable Section**:
An enabled Summary Section that cannot be generated for a specific Daily Summary and is represented by a brief unavailable state instead of blocking the whole message, even when it is the only enabled section.
_Avoid_: Failed summary, skipped email

**Calendar Section**:
The Summary Section for Calendar Events from the User's selected Google calendars.
_Avoid_: Schedule widget

**Selected Calendar**:
A Google calendar chosen by the User to contribute Calendar Events to the Calendar Section. The User's primary Google calendar is selected by default.
_Avoid_: Connected calendar, all calendars

**Weather Section**:
The Summary Section for the weather at the User's chosen weather location, including a short daily description, minimum and maximum temperature, and chance of precipitation.
_Avoid_: Forecast widget

**Commute Section**:
The Summary Section for the Commute Estimate of each enabled Commute Route on the weekdays selected by the User. It is hidden on days that are not Commute Days or when there are no enabled Commute Routes.
_Avoid_: Traffic widget, route widget

**Commute Day**:
A weekday selected by the User when the Commute Section should appear in the Daily Summary. Commute Days default to Monday through Friday.
_Avoid_: Route day, workday

**Todo Section**:
The Summary Section for the User's active Todo Tasks. It is hidden from the Daily Summary when the User has no active Todo Tasks.
_Avoid_: Task widget

**Weather Location**:
The User-chosen city used only for the Weather Section.
_Avoid_: Home, commute origin, user location

**Commute Route**:
A User-named driving route with an origin, destination, and enabled state that can appear in the Commute Section. A User can keep up to five Commute Routes; all enabled Commute Routes appear together and routes are not assigned to specific days.
_Avoid_: Commute rule, work location

**Commute Origin**:
The specific map point where a Commute Route starts.
_Avoid_: Weather Location, home

**Commute Destination**:
The specific map point where a Commute Route ends.
_Avoid_: Weather Location, work

**Commute Estimate**:
The estimated travel time for a Commute Route at the moment the Daily Summary is generated, including current traffic conditions when available.
_Avoid_: Scheduled commute time, planned departure time

**Summary Time**:
The local time when a User's Daily Summary is sent. It defaults to 07:00 and can be changed by the User.
_Avoid_: Morning time, notification time

**User Time Zone**:
The local time zone used to decide when a User's day starts and which calendar date counts as today.
_Avoid_: Calendar time zone, server time, browser time

**Week Ahead**:
The seven local calendar dates starting with today and continuing for the next six days.
_Avoid_: Next week, following week, next seven days

**Todo Task**:
An unfinished titled item owned by a User, optionally assigned to a Todo Category, assigned an urgency, and ordered within its current grouping. Todo Tasks do not have descriptions, due dates, creation dates, or retained completed history.
_Avoid_: Calendar item, dated task, reminder

**Todo Category**:
A named folder-like grouping owned by a User that contains ordered Todo Tasks and has its own User-defined order. Empty Todo Categories are kept in the app but hidden from the Daily Summary. Deleting a Todo Category deletes its Todo Tasks.
_Avoid_: Tag, label, project

**Uncategorized Todo Task**:
A Todo Task that is not assigned to any Todo Category, has its own User-defined order among other uncategorized tasks, and appears before categorized Todo Tasks in the Daily Summary.
_Avoid_: Default category, inbox

**Urgency**:
The User-assigned indication of how urgent a Todo Task is. Urgency can be low, medium, or high and does not change the User-defined order of tasks.
_Avoid_: Priority, importance, severity

**Calendar Event**:
A dated event imported from the User's connected Google Calendar and shown separately from Todo Tasks. Declined events are excluded from the Daily Summary.
_Avoid_: Todo Task, reminder

**All-Day Event**:
A Calendar Event that applies to a whole local date and is shown separately from timed events.
_Avoid_: Timed event, Todo Task
