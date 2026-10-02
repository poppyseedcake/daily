<script lang="ts">
  import PublicPage from '$lib/components/PublicPage.svelte';
</script>

<PublicPage
  eyebrow="Daily Privacy Policy"
  title="Privacy Policy"
  intro="This Privacy Policy explains how Daily handles personal data when you use the free Daily service."
>
  {#snippet children()}
    <p>Last updated: 2 October 2026.</p>

    <h2>Who runs Daily</h2>
    <p>
      Daily is operated by Wojciech Makowiec, an individual in Poland. Daily is free to use. For
      privacy questions or requests, contact <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>.
    </p>

    <h2>What Daily collects and why</h2>
    <p>Daily handles these data categories to provide its features:</p>
    <ul>
      <li>
        <strong>Google account data:</strong> the account identifier, name, email address, email
        verification state, and optional profile image returned by Google Sign-In. Daily uses this
        data to create and operate your account. The email address is the Daily Summary recipient.
      </li>
      <li>
        <strong>OAuth records:</strong> Google account identifiers, granted scopes, access tokens,
        refresh tokens, ID tokens, and token expiry values are stored in the Better Auth account
        tables. They support sign-in and, when you connect Calendar, live Calendar access.
      </li>
      <li>
        <strong>Daily setup:</strong> summary time, time zone, delivery and section settings, Todo
        categories and tasks, weather location and saved cities, commute addresses and routes,
        route days, and selected calendars.
      </li>
      <li>
        <strong>Google Calendar data:</strong> when you connect Calendar, Daily reads the calendar
        list and live event data for the calendars you select. Daily uses event titles, dates,
        times, and all-day information to show the Calendar Section and build a Daily Summary.
        Daily does not create, edit, or delete Calendar events, and the current code does not store
        event content in the Daily database.
      </li>
      <li>
        <strong>Delivery and technical records:</strong> Daily stores summary delivery status,
        provider status metadata, provider message identifiers, timestamps, retry data, and
        privacy-safe technical logs. Delivery records do not store the full email content. Better
        Auth session records also include expiry, IP address when supplied, user agent when
        supplied, and the account identifier.
      </li>
      <li>
        <strong>Terms acceptance:</strong> Daily stores the accepted Terms version and the
        acceptance time when you create an account. Older accounts may retain historical access
        confirmations from the previous registration flow. Daily does not collect new age
        confirmations, dates of birth, or identity documents.
      </li>
    </ul>

    <h2>Legal bases</h2>
    <p>
      Daily processes personal data on the following legal bases. Google OAuth authorisation is not,
      by itself, a GDPR legal basis.
    </p>
    <ul>
      <li>
        Account creation, sign-in, account settings, Calendar connection, and a requested Daily
        Summary: performance of the service agreement under Article 6(1)(b) GDPR.
      </li>
      <li>
        Service security, abuse prevention, privacy-safe operational logs, troubleshooting, and
        account deletion controls: Daily's legitimate interests under Article 6(1)(f) GDPR.
      </li>
      <li>
        Terms acceptance and historical access records: contract administration and Daily's legitimate interest in keeping
        a record of the access condition that you accepted.
      </li>
    </ul>

    <h2>Google Sign-In and Google Calendar</h2>
    <p>
      The Google sign-in request uses <code>openid</code>, <code>email</code>, and
      <code>profile</code>. These scopes support account sign-in and the account email address.
      Daily requests Calendar access in a separate connection flow using
      <code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code> to list calendars
      and <code>https://www.googleapis.com/auth/calendar.events.readonly</code> to read live events
      for the Calendar Section and Daily Summary.
    </p>
    <p>
      Daily requests only the Google permissions used by these features. Daily uses Google user
      data only to provide visible Daily features, does not sell it, does not use it for
      advertising or credit decisions, and does not transfer it to data brokers. If a Calendar
      event is included in an email that you requested, the generated email is sent to the email
      delivery provider described below. Daily does not send Calendar data to the optional weather
      AI provider.
    </p>
    <p>
      Google data is protected by the Google API Services User Data Policy and its Limited Use
      requirements. Daily must keep the published policy and OAuth configuration accurate and must
      use the minimum permissions needed.
    </p>

    <h2 id="data-protection">Data protection and security</h2>
    <p>
      Daily uses the following safeguards to protect personal and sensitive data, including Google
      account information, Google Calendar data, and OAuth credentials:
    </p>
    <ul>
      <li>
        <strong>Encryption in transit:</strong> the public Daily website uses HTTPS to encrypt
        data sent between your browser and the website. Daily communicates with Google's OAuth
        and Calendar API endpoints over HTTPS to protect credentials and Calendar data in transit.
      </li>
      <li>
        <strong>Access controls:</strong> account features require an authenticated session, and
        Daily uses the signed-in user's identifier to access their saved settings and connected
        Calendar data. Administrative features are restricted to explicitly allowed administrator
        accounts.
      </li>
      <li>
        <strong>Session protection:</strong> session cookies are HTTP-only to prevent browser
        scripts from reading them, use same-site restrictions, and use the Secure attribute on
        HTTPS. The Google sign-in flow checks temporary OAuth state to protect the sign-in process.
      </li>
      <li>
        <strong>Limited permissions:</strong> Daily uses Google OAuth so you do not provide your
        Google password to Daily. Calendar access requires a separate authorisation and uses
        read-only permissions; Daily cannot create, change, or delete your Calendar events.
      </li>
      <li>
        <strong>Data minimisation:</strong> Calendar events are fetched when needed and their
        content is not stored in Daily's database. Delivery records do not contain the generated
        email body. Daily's structured operational logs contain status and diagnostic metadata,
        rather than Calendar event content, email bodies, or OAuth tokens. A requested summary
        is shared with the email delivery provider as described below.
      </li>
      <li>
        <strong>Deletion controls:</strong> deleting your account stops further Daily work,
        attempts to revoke Google tokens, and removes your account and linked OAuth records from
        the live database. Backup retention and the limits of token revocation are explained below.
      </li>
    </ul>
    <p>
      Daily does not use data obtained through Google Workspace APIs, including Google Calendar
      data, to develop, improve, or train general-purpose or non-personalised AI or machine-learning
      models.
    </p>

    <h2>External providers</h2>
    <p>Daily's code can send the following data to external services:</p>
    <ul>
      <li>
        <strong>Google:</strong> identity data for sign-in, OAuth token exchanges, Calendar lists,
        and Calendar events. Google Maps Places receives address search text and selected place
        identifiers. Google Routes receives saved route coordinates to estimate travel time.
      </li>
      <li>
        <strong>Resend:</strong> the recipient address and the generated HTML and plain-text Daily
        Summary when email delivery is configured and enabled. The email may contain the weather,
        commute, Todo, and selected Calendar sections.
      </li>
      <li>
        <strong>Open-Meteo:</strong> weather search text for geocoding and the selected latitude,
        longitude, time zone, and forecast request values for weather data.
      </li>
      <li>
        <strong>Optional weather AI:</strong> only normalised weather values are sent to the
        configured OpenAI Responses endpoint to produce a short weather sentence. The current
        implementation does not send the user's name, email, Calendar events, Todo tasks, or
        commute route to that endpoint, and requests that the response is not stored.
      </li>
      <li>
        <strong>Cloudflare:</strong> the application code has no Cloudflare API integration. A
        production deployment may place Cloudflare or cloudflared in front of Daily. Any proxy
        logs or provider retention depend on the final production configuration and are not
        determined by this application code.
      </li>
    </ul>
    <p>
      Provider processing locations, contracts, retention, and international transfer safeguards
      are not fully determined by this repository. Daily does not state a specific provider data
      location or transfer mechanism until the operator verifies the production settings and legal
      documents.
    </p>

    <h2>Cookies and browser storage</h2>
    <p>
      Daily uses the Better Auth session cookie to keep a signed-in session. In the current
      configuration the cookie is normally named <code>better-auth.session_token</code>, with the
      secure prefix used by Better Auth on HTTPS. It is an HTTP-only, same-site session cookie.
      During the Google OAuth redirect, Better Auth also uses a short-lived signed state cookie,
      normally named <code>better-auth.state</code> with the secure prefix on HTTPS. The current
      database-backed Better Auth setup stores the matching temporary OAuth state in its
      verification table and removes it after the callback.
      The OAuth confirmation step also uses a short-lived, signed HTTP-only cookie containing only
      the confirmation values needed to complete the account creation flow.
    </p>
    <p>
      Before sign-in, Daily stores the visitor's local setup in browser local storage under
      <code>daily.visitorLocalSetup.v3</code>. This can include the local setup listed above. The
      application does not use the visitor setup cookie, session storage, IndexedDB, or a browser
      database for this purpose. The application does not add analytics cookies.
    </p>

    <h2>Retention</h2>
    <ul>
      <li>
        The Daily account, setup, OAuth records, connection metadata, and legal confirmation are
        kept while the account exists and are deleted from the live database during account
        deletion.
      </li>
      <li>
        The interface and health queries use a 30-day window for delivery records. The current
        code does not contain a separate live-database purge for old delivery records.
      </li>
      <li>
        Technical logs and scheduled worker run records use a configurable operational retention
        period with a 30-day default.
      </li>
      <li>
        Verified SQLite backups use a configurable retention period with a 30-day default. A
        backup can still contain deleted account data until that backup expires.
      </li>
      <li>
        An email accepted by Resend or delivered to a recipient cannot be recalled by Daily. The
        provider's retention and deletion rules must be checked separately.
      </li>
    </ul>

    <h2>Disconnecting Calendar and deleting an account</h2>
    <p>
      Disconnecting Google Calendar removes the Daily Calendar connection metadata and selected
      calendar settings. The current disconnect action does not revoke or delete the separate
      Better Auth Google account record. Account deletion is the removal path for the local account
      and its linked data. It marks the account as deleting, stops further Daily work, attempts to
      revoke unique Google tokens, and then deletes the live Daily and Better Auth records.
    </p>
    <p>
      Google token revocation is best effort. If Google or the network does not accept a revocation
      request, Daily still removes the local records during account deletion. Historical backups
      are not rewritten after deletion and remain restricted recovery artifacts until normal
      backup retention expires.
    </p>

    <h2>Your rights and complaints</h2>
    <p>
      Subject to the conditions in applicable data protection law, you may ask for access to,
      correction of, deletion of, restriction of, or portability of your personal data. You may
      also object to processing based on legitimate interests. Contact Daily first at
      <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>.
    </p>
    <p>
      You have the right to complain to the President of the Polish Personal Data Protection
      Office (UODO). See the official UODO information at
      <a href="https://uodo.gov.pl/en/680/1402">uodo.gov.pl/en/680/1402</a>.
    </p>

    <h2>Account registration</h2>
    <p>
      Creating a Daily account requires acceptance of the Terms of Service. Returning users do
      not need to repeat this step when signing in. Daily does not require an age declaration.
    </p>

    <h2>Contact</h2>
    <p>
      Contact Wojciech Makowiec at <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>
      about this Privacy Policy, a privacy request, or a complaint about Daily.
    </p>
  {/snippet}
</PublicPage>
