# Google API Services User Data Policy and OAuth verification research

Access date: 2026-09-21

This note uses only official Google sources. It covers a public web app that uses Google Sign-In and read access to Google Calendar data. It is a research summary. It is not legal advice and it is not a determination that Daily will pass Google verification.

## Scope of this research

The Google API Services User Data Policy expressly includes Google Sign-In. It applies when a developer requests access to Google user data. The policy page states that it was last updated on 2024-02-15. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

This note assumes that the public launch uses an external OAuth user type and is available to users outside one Google Workspace or Cloud Identity organisation. If Daily is configured for internal use only, some verification requirements may not apply. The internal-use exception is limited to users in the developer's own Google Workspace or Cloud Identity organisation. [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)

## Findings for Google Sign-In and Calendar read access

### Google Sign-In scopes

Google's OpenID Connect documentation describes these identity scopes:

| Scope | Google description and use |
| --- | --- |
| `openid` | Associates the user with personal information on Google. The OIDC scope value must be included in the authentication request. |
| `profile` | Requests personal information, including information the user made public. |
| `email` | Requests the primary Google Account email address. When this scope is present, the ID token includes `email` and `email_verified` claims. |

Sources: [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes) and [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

Google describes `openid`, `profile`, and `email` as authentication-only scopes. In testing, an external app that requests only these basic identity scopes is treated differently from an app that requests additional data scopes. This testing rule does not remove the public-production brand and homepage requirements. [How user authorization works](https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works) and [OAuth app state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)

### Calendar read scopes

Google's Calendar scope documentation gives these meanings:

| Scope | Access described by Google |
| --- | --- |
| `https://www.googleapis.com/auth/calendar.events.readonly` | View events on all calendars. |
| `https://www.googleapis.com/auth/calendar.readonly` | See and download any calendar the user can access. |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | See the list of calendars to which the user is subscribed. |
| `https://www.googleapis.com/auth/calendar.calendars.readonly` | See calendar title, description, default time zone, and other calendar properties. |
| `https://www.googleapis.com/auth/calendar.freebusy` | View availability in calendars. |

Sources: [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth) and [Calendar `events.list` authorization](https://developers.google.com/calendar/api/v3/reference/events/list).

Daily's final requested Calendar scopes are `calendar.calendarlist.readonly` for `calendarList.list` and `calendar.events.readonly` for `events.list`. Google's authorization tables explicitly accept these respective scopes. The former broad `calendar.readonly` scope is no longer requested. Previously granted broad tokens remain usable; changing the requested scopes does not itself revoke an existing grant. This is based on endpoint documentation and local tests; a fresh live Google OAuth consent still needs checking before verification submission. [Calendar `calendarList.list` authorization](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list) and [Calendar `events.list` authorization](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)

Google's sensitive-scope guide lists reading events stored in Google Calendar as an example of a sensitive scope. A read-only scope is not automatically free of verification requirements. The exact category shown for each scope must be checked in the Google Cloud OAuth configuration before submission. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes)

## Requirements from the Google API Services User Data Policy

### Accurate identity, data, and purpose

The developer must give Google and users clear and accurate information about:

- who requests the data;
- what data is requested; and
- why the data is requested, including secondary uses.

If the app later uses a type of Google user data for a purpose that was not disclosed when the user first authorised access, the developer must update the privacy policy and prompt the user to consent to the change before using the data for the new purpose. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

### Privacy disclosures

For a public app, Google requires a privacy policy URL in the OAuth client configuration. The policy and in-product notices must be accurate, comprehensive, and easy to find. They must disclose how the app accesses, uses, stores, and shares Google user data. The app's use of Google user data must stay within the practices disclosed in the published policy. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

### Minimum required permissions

The app must request only the permissions needed for its implemented features. Google prohibits requesting data for future features that are not implemented. Google recommends requesting access in context, using incremental authorisation where possible. The OAuth project configuration must match the scopes requested by the app. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)

For Daily, the verification submission should explain why each Calendar scope is required and why a narrower scope would not support the actual Calendar endpoints. Google states that an insufficient scope justification can cause a verification request to be rejected. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

### Limited Use and data transfers

For data obtained through sensitive or restricted product scopes, Google's Limited Use requirements apply to raw data and to aggregated, anonymised, or derived data. The data must be used only to provide or improve user-facing features that are prominent in the app.

Transfers are allowed only in the cases stated by Google:

- to provide or improve a visible user-facing feature, with the user's consent;
- for security purposes;
- to comply with applicable law; or
- as part of a merger, acquisition, or sale of assets after the user's explicit prior consent.

Google prohibits other transfers, uses, or sales, including transfers to advertising platforms, data brokers, or information resellers; use for advertising; and use to determine credit-worthiness or lending decisions. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

The policy also restricts human access to Google user data. Human access is allowed only in the cases listed by Google, such as the user's affirmative agreement to view specific data, security work, legal compliance, or approved internal use of aggregated data. Employees, agents, contractors, and successors must comply with the policy. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

This means that any Daily provider that receives Calendar data, or data derived from Calendar data, must be checked against the Limited Use rules and the published privacy disclosures. The policy does not allow a general statement that a provider may receive all Google data.

### Security and OAuth tokens

Google expects user data to be secure in transit and at rest, and requires reasonable and appropriate measures against unauthorised or unlawful access, use, destruction, loss, alteration, or disclosure. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)

Google's OAuth policy states that OAuth tokens must not be transmitted in plaintext, must be stored encrypted at rest, and must be revoked when access is no longer needed. After revocation, the tokens must be deleted permanently from the app or system. [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)

Google's OAuth web-server guidance also describes refresh tokens as long-term credentials that can obtain new access tokens and recommends secure long-term storage. [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)

### Other policy controls relevant to launch

The policy and OAuth rules also require the app to:

- use documented Google APIs and the documented access method;
- avoid misleading users or Google about the app, its identity, or its operating environment;
- use a secure browser flow rather than an embedded user-agent controlled by the developer; and
- stop using features that depend on a scope the user did not grant.

Sources: [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) and [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies).

## OAuth verification requirements for a public production app

### Brand verification

Google's verification requirements apply brand verification to apps that access Google APIs. The public homepage must:

- be hosted on a verified domain owned by the developer;
- identify the app or brand accurately;
- describe the app's functionality; and
- link to the privacy policy.

The homepage must not be only a login page. The privacy policy must be hosted on the same domain as the homepage, linked from the homepage, linked from the OAuth consent screen, and must disclose how the app accesses, uses, stores, and shares Google user data. Google also requires the privacy policy and in-product notices to remain current. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

Google's OAuth policy also says that every production app using OAuth 2.0 must have a publicly accessible homepage with a description of the app and links to terms of service and a privacy policy. The homepage must be on a verified domain. [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)

### Domain ownership

Google requires verification of all domains associated with the project's homepage, privacy policy, terms of service, authorised redirect URIs, or authorised JavaScript origins. A project owner or editor must verify ownership of the authorised domain in Google Search Console. [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) and [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

For Daily, the final OAuth configuration must therefore use the owned `dailykickoff.eu` domain for the public policy URLs and for any OAuth origin or redirect URL that is part of the production flow. The Cloud Console configuration must be checked; this note does not verify the domain or its current project settings.

### Consent-screen and project information

The OAuth consent-screen branding must accurately represent the app. Google lists the app name, support email, homepage URI, privacy policy URI, and related branding as information that must be accurate. Project owners, editors, user-support email, and developer contact information must remain current so Google can send required notices. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

The contact mailbox supplied for Daily must be active before launch. Google uses project contact information for verification and service notices, and the official guidance warns that missing timely contact can lead to loss of API access. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en) and [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

### Sensitive-scope verification

Google states that sensitive scopes require review before a Google Account can grant access. The sensitive-scope guide lists reading Google Calendar events as an example. A public production app that uses a sensitive scope must submit the scope for verification before including it in an authorisation request. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

The submission must declare all scopes used by the production app and provide a detailed justification. Google requires the narrowest scope needed, including an explanation of why narrower scopes do not work. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

Google's verification guide requires a demonstration video that:

- shows the end-to-end app flow, including the OAuth grant;
- shows the same app submitted for verification, including its name and branding;
- shows the complete OAuth consent screen with the same exact scopes submitted; and
- demonstrates the app functionality that uses the requested scopes.

The guide also says the consent screen language should be set to English for the video. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

### Restricted-scope security assessment

Google states that restricted scopes have extra secure-data-handling requirements, including an annual security assessment by a Google-empanelled assessor. The verification FAQ separately lists restricted-scope verification and the security assessment requirement. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en) and [OAuth verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en)

The official Google pages reviewed here identify Calendar event reading as a sensitive-scope example, but do not give a complete classification label beside every Calendar scope in the scope table. Daily must confirm the exact classification of every requested scope in the current Cloud Console before submission. Do not assume that a restricted-scope security assessment is needed unless the actual requested scope is classified as restricted or Google otherwise requires it.

### Exceptions and unverified-app limits

Google lists exceptions for personal-use apps with fewer than 100 users, development/testing/staging apps, service-owned data only, internal-use apps, and some administrator-trusted or Marketplace-installed apps. A public Daily launch is not treated as one of these exceptions merely because the operator is an individual. [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)

For an unverified app that requests sensitive or restricted scopes, Google may show an unverified-app warning and apply a 100-new-user cap. Google says the cap can eventually cause Google Sign-In to be disabled. [Unverified apps](https://support.google.com/cloud/answer/7454865?hl=en) and [OAuth verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en)

### Published review-time estimates

Google's official pages publish different estimates:

- the sensitive-scope guide says sensitive-scope review typically takes 3–5 business days;
- the FAQ table says brand verification is 2–3 business days, sensitive-scope verification is 10 business days, and restricted-scope verification is 6 weeks.

The FAQ says these estimates are not guaranteed and depend on developer responsiveness. The launch plan should use the longer estimate and allow more time. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) and [OAuth verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en)

## Conditional AI requirement

If Daily sends Google user data to an AI system, the current Google Cloud verification FAQ states that Google user data must not be used to train or improve foundation models or be stored with them. The FAQ describes permitted AI use as a personalised model used for the individual user or organisation to perform a user-facing feature or user-directed use case. If an app transfers data for personalised AI model training, Google's verification guide says the demonstration video must show the user's explicit consent to that use. [OAuth verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en) and [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)

This section is conditional. It does not establish that Daily has an AI integration or that Daily sends Google data to an AI provider.

## Application-specific questions to resolve before submission

These questions require inspection of Daily's implementation and Google Cloud project. The official sources do not answer them:

1. Which exact identity and Calendar scope strings does Daily send in each authorisation request?
2. Which Calendar API methods does Daily call, and can the requested scope be narrowed to an endpoint-specific read scope?
3. What scope category does Google Cloud currently show for each exact requested scope: non-sensitive, sensitive, or restricted?
4. Is the production OAuth project configured as External and In Production, or is it still in testing?
5. Are `dailykickoff.eu`, the homepage URL, `/privacy`, `/terms`, every production redirect URI, and every production JavaScript origin correctly listed and verified?
6. Does any service provider receive raw Calendar data, derived Calendar data, OAuth tokens, or only non-Google data? If a provider receives Google data, what user-facing feature and user consent support that transfer under Limited Use?
7. Are access and refresh tokens encrypted at rest, excluded from logs, revoked when no longer needed, and permanently deleted after revocation?
8. Is `daily@dailykickoff.eu` active and monitored for Google verification notices and user support?
9. If Daily uses AI, does its data flow meet the conditional AI rules above, and does the user-facing flow show the required explicit consent?

## Source list

All sources below are first-party Google pages. Accessed 2026-09-21.

1. [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
2. [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)
3. [OAuth 2.0 Scopes for Google APIs](https://developers.google.com/identity/protocols/oauth2/scopes)
4. [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
5. [How user authorization works](https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works)
6. [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
7. [Calendar `events.list` authorization](https://developers.google.com/calendar/api/v3/reference/events/list)
8. [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
9. [Comply with OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
10. [Verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
11. [OAuth verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en)
12. [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)
13. [Unverified apps](https://support.google.com/cloud/answer/7454865?hl=en)
14. [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
