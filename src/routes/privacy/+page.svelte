<script lang="ts">
  import PublicPage from '$lib/components/PublicPage.svelte';
</script>

<PublicPage
  eyebrow="Daily Privacy Policy"
  title="Privacy Policy"
  intro="This Privacy Policy explains how Daily handles personal data when you use the free Daily service."
>
  {#snippet children()}
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
        <strong>Legal confirmations:</strong> Daily stores the statement that you confirmed the
        minimum age, the accepted Terms version, and the confirmation times. Daily does not ask
        for a full date of birth or an identity document for this step.
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
        Age and Terms records: contract administration and Daily's legitimate interest in keeping
        a record of the access condition that you accepted.
      </li>
    </ul>

    <h2>Google Sign-In and Google Calendar</h2>
    <p>
      The Google sign-in request uses <code>openid</code>, <code>email</code>, and
      <code>profile</code>. These scopes support account sign-in and the account email address.
      Daily requests Calendar access in a separate connection flow using
      <code>https://www.googleapis.com/auth/calendar.readonly</code>. This is read-only access;
      Daily uses it to list calendars and read live events for the Calendar Section and Daily
      Summary.
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

    <h2>Age requirement</h2>
    <p>
      Daily is for people aged 16 or older. A new account must include an unchecked confirmation
      that the person is at least 16 and an acceptance of the Daily Terms of Service. Existing
      accounts must complete the same step before continued use. This is a self-declaration, not
      verified proof of age.
    </p>

    <h2>Contact</h2>
    <p>
      Contact Wojciech Makowiec at <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>
      about this Privacy Policy, a privacy request, or a complaint about Daily.
    </p>
  {/snippet}
</PublicPage>
