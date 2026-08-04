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
A single email message generated for a User at their configured local time, containing the four fixed Summary Sections needed to plan that day.
_Avoid_: Alert, notification, digest, reminder

**Delivery Record**:
A minimal record that a scheduled or test Daily Summary was attempted or sent, without storing the full email content. Delivery Records are kept for the last 30 days.
_Avoid_: Email archive, message copy

**Cancelled Delivery Record**:
A Scheduled Delivery Record whose remaining attempts stopped because the User disabled Summary Delivery before it was sent.
_Avoid_: Failed delivery, deleted record, Stopped Delivery Record

**Daily Summary Appearance**:
The single visual presentation shared by every User's Daily Summary, using the color palette established by the Daily Grid design.
_Avoid_: Summary Theme, custom template, light theme, dark theme

**Summary Recipient**:
The current verified email address from the User's Google account where their Daily Summary is sent.
_Avoid_: Alternate recipient, forwarding address

**Summary Configuration**:
The User's optional choices and data that determine whether each fixed Summary Section contains live content or a status explaining why it does not.
_Avoid_: Required setup, onboarding completion

**Summary Delivery**:
The User-controlled state that determines whether Daily Summaries are sent at all, independent of the state of individual Summary Sections. When enabled, a Daily Summary is sent even when every section is paused, unconfigured, empty, or unavailable. Summary Delivery is enabled by default.
_Avoid_: Section toggle, unsubscribe

**Summary Section**:
A fixed part of every delivered Daily Summary that can be active or paused independently from whether the User has configured data for it. Summary Sections always appear in the order Weather, Commute, Calendar, Todo and show a status instead of live content when necessary.
_Avoid_: Optional section, feature, widget, module

**Unavailable Section**:
An enabled Summary Section that cannot be generated for a specific Daily Summary and is represented by a brief unavailable state instead of blocking the whole message, even when it is the only enabled section.
_Avoid_: Failed summary, skipped email

**Paused Section**:
A Summary Section the User has explicitly paused. Its paused status takes precedence over whether it is configured, empty, or temporarily unavailable.
_Avoid_: Disabled feature, Unavailable Section

**Unconfigured Section**:
An active Summary Section for which the User has not supplied or connected the data required to generate its content.
_Avoid_: Empty Section, Unavailable Section

**Empty Section**:
An active, configured Summary Section that has no items relevant to its time window, such as no scheduled Commute Routes today, no Calendar Events in the Week Ahead, or no active Todo Tasks.
_Avoid_: Unconfigured Section, Unavailable Section

**Calendar Section**:
The Summary Section for Calendar Events from the User's selected Google calendars. It always presents the seven dates of the Week Ahead, lists every event without a limit, and remains visible with an empty-week message when no events exist.
_Avoid_: Schedule widget

**Selected Calendar**:
A Google calendar chosen by the User to contribute Calendar Events to the Calendar Section. The User's primary Google calendar is selected by default.
_Avoid_: Connected calendar, all calendars

**Weather Section**:
The Summary Section for the weather at the User's chosen Weather Location. It presents the current temperature at generation time, an icon representing the day's weather, minimum and maximum temperature, chance of precipitation, wind, and a short summary of today's forecast.
_Avoid_: Forecast widget

**Commute Section**:
The Summary Section for the Commute Estimate of each enabled Commute Route scheduled for the current weekday. It remains visible with a status when no Commute Route is scheduled for that day.
_Avoid_: Traffic widget, route widget

**Commute Day**:
A weekday selected on a Commute Route when that route should appear in the Daily Summary. Each new Commute Route defaults to Monday through Friday and can use its own set of Commute Days.
_Avoid_: Route day, workday

**Todo Section**:
The Summary Section for the User's active Todo Tasks. It remains visible with an empty status when the User has no active Todo Tasks.
_Avoid_: Task widget

**Weather Location**:
The User-chosen city used only for the Weather Section.
_Avoid_: Home, commute origin, user location

**Saved Weather City**:
A city a User or Visitor keeps for quick selection as a Weather Location. Saved Weather Cities are independent from Saved Commute Addresses.
_Avoid_: Saved Location, commute address, route point

**Commute Route**:
A User-named driving route with an origin, destination, enabled state, and its own Commute Days that can appear in the Commute Section. Its name serves as the destination label in the Daily Summary. A User can keep up to five Commute Routes; every enabled route scheduled for the current weekday appears in the summary.
_Avoid_: Commute rule, work location

**Commute Origin**:
The specific map point where a Commute Route starts. Each route has its own Commute Origin, while the Daily Summary temporarily presents every origin under the generic label “Home.”
_Avoid_: Weather Location, shared home address

**Commute Destination**:
The specific map point where a Commute Route ends. The Daily Summary presents the Commute Route name above the selected destination address.
_Avoid_: Weather Location, work

**Saved Commute Address**:
An exact map point a User or Visitor keeps for quick selection as a Commute Origin or Commute Destination. Saved Commute Addresses are independent from Saved Weather Cities.
_Avoid_: Saved Location, saved city, Weather Location

**Commute Estimate**:
The estimated travel time for a Commute Route at the moment the Daily Summary is generated, including current traffic conditions, together with the travel time calculated without traffic conditions.
_Avoid_: Scheduled commute time, planned departure time

**Commute Traffic Level**:
The green, yellow, or red condition of a Commute Route derived from the relative delay of its traffic-aware travel time against its traffic-free travel time. Green is below 10%, yellow is from 10% to below 25%, and red is 25% or more.
_Avoid_: Google Maps traffic color, absolute delay

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
