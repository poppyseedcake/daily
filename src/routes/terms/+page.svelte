<script lang="ts">
  import PublicPage from '$lib/components/PublicPage.svelte';
</script>

<PublicPage
  eyebrow="Daily Terms of Service"
  title="Terms of Service"
  intro="These Terms describe the free Daily service and the rules for using it."
>
  {#snippet children()}
    <div class="public-callout">
      <p>
        These Terms do not remove rights that the law gives you and do not make a blanket exclusion
        of responsibility.
      </p>
    </div>

    <h2>1. Operator and service</h2>
    <p>
      Daily is operated by Wojciech Makowiec, an individual in Poland. Daily is a free web service
      that helps you prepare a personal Daily Summary from your chosen Todo, weather, commute, and
      Google Calendar settings. Daily is available at <a href="https://dailykickoff.eu">dailykickoff.eu</a>.
    </p>
    <p>
      Questions, complaints, and service notices can be sent to
      <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>.
    </p>

    <h2>2. Eligibility and account</h2>
    <p>
      You must be at least 16 years old to use Daily. Before a new account is created, you must
      confirm that you are at least 16 and accept these Terms. Existing accounts must complete the
      same confirmation before continued use. The confirmation is a self-declaration, not verified
      proof of age. Daily does not ask for a full date of birth or an identity document for this
      step.
    </p>
    <p>
      You sign in with Google. You must provide accurate information, keep control of your Google
      account, and keep your sign-in information secure. You are responsible for activity under
      your account that you authorise.
    </p>

    <h2>3. Acceptable use</h2>
    <p>You may use Daily only for a lawful personal purpose. You must not:</p>
    <ul>
      <li>break a law or another person's rights;</li>
      <li>access an account, data, provider, or system without permission;</li>
      <li>interfere with Daily, its providers, or another person's use of the service;</li>
      <li>use Daily to send unwanted or unlawful messages; or</li>
      <li>attempt to bypass age, access, rate, or security controls.</li>
    </ul>
    <p>
      You decide which calendar, location, Todo, and delivery data to connect. Do not connect data
      that you are not allowed to use or share with Daily.
    </p>

    <h2>4. External services and information quality</h2>
    <p>
      Daily depends on Google, Resend, weather services, map and route services, and other network
      providers. A provider can be unavailable, change its API, delay a response, or reject a
      request. Daily may therefore be unable to show a Calendar Section, send an email, find a
      location, or calculate a route.
    </p>
    <p>
      Calendar, weather, travel-time, and route information can be missing, delayed, incomplete,
      or wrong. Calendar changes may not appear at once. Weather and travel conditions can change
      after a Daily Summary is prepared. Check the source service and use your own judgement for
      travel, safety, health, work, or other important decisions. Daily is not a replacement for
      an emergency service or a guaranteed source of current information.
    </p>

    <h2>5. Your data and Google access</h2>
    <p>
      Daily handles personal data as described in the <a href="/privacy">Daily Privacy Policy</a>.
      You can disconnect Google Calendar from Daily. You can delete your Daily account from the
      account settings. Account deletion removes Daily's live account records and attempts to
      revoke linked Google tokens. Backup copies and provider-held email copies may remain until
      their normal retention or deletion process.
    </p>
    <p>
      Daily does not create, edit, or delete Google Calendar events. You can revoke access from
      your Google Account settings at any time. A revocation can make Calendar features stop
      working until you reconnect.
    </p>

    <h2>6. Suspension and account deletion</h2>
    <p>
      Wojciech Makowiec may suspend or limit access when needed to protect Daily, its users, a provider,
      or the public; to address suspected misuse; or to comply with law. Daily may also suspend a
      feature when an external provider is unavailable or its requirements change.
    </p>
    <p>
      You may stop using Daily and request account deletion through the available account action.
      Daily may change, pause, or stop the free service. If a change affects an existing account or
      a legal right, Daily will handle it as required by applicable law.
    </p>

    <h2>7. Changes to these Terms</h2>
    <p>
      Daily may update these Terms when the service or the law changes. Daily will publish the new
      version at <a href="/terms">dailykickoff.eu/terms</a>. If a new version needs acceptance for
      continued use, Daily will ask you to accept it before the affected use continues.
    </p>

    <h2>8. Complaints and mandatory rights</h2>
    <p>
      Send service complaints to
      <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>. These Terms do not waive
      consumer rights or other mandatory rights that apply to you.
    </p>

    <h2>9. Contact</h2>
    <p>
      Contact Wojciech Makowiec at <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>.
    </p>
  {/snippet}
</PublicPage>
