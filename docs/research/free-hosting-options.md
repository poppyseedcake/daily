# Darmowe opcje hostingu dla Daily

Stan rozpoznania: 2026-08-02 (Europe/Warsaw). Źródła zewnętrzne w tym raporcie prowadzą wyłącznie do oficjalnej dokumentacji danego dostawcy; ceny, limity i funkcje należy sprawdzić ponownie przed wdrożeniem.

## Wniosek w skrócie

Najlepszym miejscem dla obecnej wersji Daily jest **Oracle Cloud Infrastructure Always Free**, na jednej VM z Ubuntu/Oracle Linux, trwałym storage blokowym i systemd. Ta opcja zachowuje aktualny model wdrożenia: Node.js 22.15.0, SvelteKit `adapter-node`, plik SQLite, osobny worker co minutę i codzienny backup.

Jeżeli priorytetem jest prostszy panel wdrożeniowy, a dopuszczalna jest zmiana bazy z lokalnego SQLite na usługę zewnętrzną, warto rozważyć **Google Cloud Run + Cloud Run Job + Cloud Scheduler** albo migrację do **Cloudflare Workers + D1**. Nie są to jednak wdrożenia „drop-in”.

**Railway Free** jest użyteczny do krótkiego prototypu, ale nie rekomenduję go jako trwałego darmowego hostingu tej aplikacji: miesięczny kredyt to tylko 1 USD, wolumen ma 0,5 GB, a worker i web nie mogą bezpiecznie współdzielić jednego lokalnego pliku SQLite jako dwóch niezależnych usług. **Render Free**, **Koyeb Free**, **Vercel Hobby** i **Netlify Free** nie zapewniają trwałego lokalnego filesystemu odpowiedniego dla produkcyjnego SQLite. **Fly.io** nie oferuje obecnie darmowego planu dla nowych organizacji.

## Kontekst repozytorium

Przeanalizowane zostały przede wszystkim [`package.json`](../../package.json), [`docs/production-deployment.md`](../production-deployment.md), [`docs/supported-runtime.md`](../supported-runtime.md), ADR-y dotyczące SQLite i workera oraz jednostki systemd w `deploy/systemd/`.

Wymagania wdrożeniowe wynikające z repo:

| Obszar | Ustalenie |
|---|---|
| Web | SvelteKit SSR z `@sveltejs/adapter-node`; produkcyjny start to `node build`. |
| Runtime | Node.js 22.15.0 i npm 10.9.2. |
| Baza | `better-sqlite3` + Drizzle; `DATABASE_URL` wskazuje na plik SQLite. |
| Trwałość | Plik bazy musi przetrwać restart, redeploy i odtworzenie procesu; backup jest osobnym wymaganiem. |
| Worker | `build/worker/runScheduledDailySummaryWorker.js`, uruchamiany co minutę przez `daily-scheduled-worker.timer`; worker i web używają tej samej bazy. |
| Backup | `daily-backup.timer` uruchamia zweryfikowany backup SQLite raz dziennie. |
| Sekrety | OAuth Google, Better Auth, Google Maps i Resend są przekazywane przez zmienne środowiskowe. |
| OAuth | Potrzebny jest publiczny adres HTTPS, zgodny z `ORIGIN`, `BETTER_AUTH_URL` i callbackami zarejestrowanymi w Google. |
| Mail | Aplikacja wywołuje API Resend przez HTTPS; hosting musi pozwolić na wychodzące połączenia HTTPS, a `RESEND_API_KEY` i `RESEND_FROM_EMAIL` muszą być skonfigurowane. |

Ocena „pasuje bez przepisywania” oznacza więc jednocześnie: pełny proces Node, trwały zapis plikowy, uruchamianie procesu/cron workera i bezpieczne sekrety. Samo uruchomienie SSR nie wystarcza.

## Porównanie

| Dostawca / wariant | Node/SvelteKit SSR | Trwały SQLite | Cron / worker | Free tier i filesystem | Sekrety, OAuth, mail | Ocena dla obecnego repo |
|---|---|---|---|---|---|---|
| **Oracle Cloud Always Free VM** | Tak: własna VM, można zainstalować dokładny Node 22.15.0 i uruchomić obecny build. | **Tak**: lokalny dysk VM i block volume są trwałe; można użyć `/var/lib/daily` i `/var/backups/daily`. | **Tak**: systemd i timer z repo działają bez zmiany modelu. | Always Free przez czas życia konta w home region: do 2 OCPU/12 GB RAM na Ampere A1, 200 GB block volume i 20 GB Object Storage; potrzebna karta przy rejestracji, możliwy brak capacity. | Sekrety można trzymać poza checkoutem w pliku root-only albo użyć OCI Secret Management. Publiczny HTTPS i outbound HTTPS są do skonfigurowania na VM; callback Google i Resend są technicznie zgodne. | **Najlepsza opcja bez zmian w aplikacji.** Największy koszt to samodzielna administracja, aktualizacje i backupy. |
| **Railway Free** | Tak jako kontener/usługa Node; aplikację trzeba skonfigurować do uruchomienia na platformie zamiast obecnego systemd. | **Częściowo**: Free ma jeden wolumen 0,5 GB; bez wolumenu filesystem jest efemeryczny. Wolumen można zamontować pod ścieżką dla SQLite. | Cron service istnieje, ale zadanie uruchamia start command i kończy proces. Osobny web + cron wymagałyby współdzielenia bazy; jeden Railway volume nie jest bezpiecznym mechanizmem współdzielenia pliku SQLite między usługami. | Free: 0,5 GB RAM, 1 vCPU, 1 GB ephemeral storage i 0,5 GB volume storage; tylko 1 replica i 1 volume w projekcie; 1 USD kredytu/miesiąc. Nowe konto dostaje jednorazowo 5 USD na 30 dni, a trialowe wolumeny są usuwane po okresie triala. Opcjonalny Serverless może usypiać usługę po 10 min bez outbound traffic. | Zmienne i „sealed variables” są dostępne. Publiczna domena może służyć do callbacku; Resend przez HTTPS działa, o ile usługa nie śpi i limity/kredyt nie są wyczerpane. | **Tylko prototyp** albo wymaga połączenia z zewnętrzną bazą i zmiany architektury workera. Nie traktować jako bezterminowego, zawsze dostępnego free production. |
| **Google Cloud Run + Cloud Run Job + Cloud Scheduler** | Tak po spakowaniu aplikacji jako kontenera; pełny Node/SvelteKit SSR. | **Nie dla obecnego SQLite**: filesystem kontenera jest in-memory i traci dane przy zatrzymaniu instancji. Wymagana migracja do zewnętrznej bazy lub innego trwałego storage; GCS/FUSE nie powinien być używany jako zamiennik pliku SQLite bez osobnej walidacji modelu blokad. | **Tak po rozdzieleniu**: Cloud Run Job uruchamia worker i kończy się, a Cloud Scheduler może wywoływać job według cron. Trzeba rozwiązać współdzielenie trwałej bazy. | Cloud Run Free obejmuje miesięcznie m.in. 180 000 vCPU-sekund, 360 000 GiB-sekund i 2 mln requestów; Cloud Scheduler daje 3 joby/miesiąc na billing account. Billing account i konfiguracja IAM są wymagane. | Secret Manager jest wspierany jako env albo plik. URL usługi HTTPS dobrze pasuje do OAuth callbacku; wysyłka do Resend przez HTTPS jest możliwa. | **Dobra opcja po migracji bazy.** Czysty podział web/worker, ale większa złożoność GCP i ryzyko dodatkowych kosztów poza free quota. |
| **Cloudflare Workers / Pages + D1** | SvelteKit jest wspierany, ale oficjalna ścieżka używa `@sveltejs/adapter-cloudflare` i bundla do Workera; obecny `adapter-node` + proces Node nie jest wdrożeniem drop-in. | **Nie dla lokalnego SQLite**. D1 jest trwałą bazą SQLite-like, ale wymaga migracji warstwy dostępu z `better-sqlite3`/pliku na binding D1. Free: 500 MB na bazę, 5 GB łącznie, 5 mln rows read/dzień i 100 tys. rows written/dzień. | **Tak po przepisaniu workera** do `scheduled()`; Free ma 5 Cron Triggers na konto. Obecny binarny worker Node nie może być uruchomiony jako proces cron. | Workers Free: 100 tys. requestów/dzień, 10 ms CPU na request i 10 ms CPU na Cron Trigger, 128 MB RAM, 3 MB rozmiaru Workera. Pages Functions używają tych samych limitów Workers Free. | Encrypted Worker Secrets są wspierane. `workers.dev`/custom domain daje HTTPS; callback i Resend przez `fetch` są możliwe, ale trzeba przepisać integrację runtime i bazę. | **Najlepsza opcja serverless po dużej migracji**, nie dla obecnej implementacji. 10 ms CPU może być ciasne dla SSR/auth; D1 nie jest plikiem do montowania. |
| **Render Free** | Tak: darmowy Web Service obsługuje aplikacje Node. | **Nie**: darmowy web service ma efemeryczny filesystem; lokalne SQLite znika po redeployu, restarcie i sleep. Persistent disk jest tylko dla płatnych usług. | Cron Jobs istnieją, ale kosztują minimum 1 USD miesięcznie; darmowy web service nie obsługuje one-off jobs. Background worker z dyskiem wymaga płatnego planu. | Darmowy web service śpi po 15 min bez ruchu i budzi się około minutę; 750 godzin instancji/miesiąc; możliwe nieplanowane restarty. Darmowy Render Postgres wygasa po 30 dniach i nie zastępuje obecnego SQLite bez migracji. | Env vars i sekrety są dostępne. HTTPS/custom domain i outbound HTTPS wystarczają dla OAuth/Resend, ale sleep wpływa na dostępność callbacku i workera. | **Nie dla produkcji tej wersji.** Dobre do stateless preview/testu; z SQLite i cronem wymaga płatnego dysku/usługi albo zmiany bazy. |
| **Koyeb Free** | Web Service może uruchamiać Node/SvelteKit; kontener można zbudować z repo/Dockerfile. | **Nie**: Free Instance nie może używać Volumes, a lokalny SSD jest efemeryczny. | Free Instance nie może być Worker Service i skaluje się do zera po godzinie bez ruchu; brak użytecznego darmowego odpowiednika obecnego systemd workera. | Jedna Free Instance na organizację, 512 MB RAM, 0,1 vCPU, 2 GB SSD; tylko Frankfurt albo Washington, D.C.; scale-to-zero jest wymuszone. Volumes są w public preview i nie są dostępne dla Free Instance. | Sekrety i env vars są wspierane. Publiczna domena/HTTPS i outbound HTTPS są wystarczające dla OAuth/Resend, ale nie rozwiązują trwałości ani workera. | **Nie** dla obecnej aplikacji; nadaje się do stateless demo. |
| **Fly.io** | Tak: Dockerfile/Node i własny proces; obecny model web + osobny process group/worker jest możliwy. | **Tak technicznie** dzięki Fly Volumes, ale wolumen jest lokalny dla regionu/Machine, nie jest automatycznie replikowany i jest płatny. | Tak: własna VM/process groups, cron w systemie lub osobny proces. Nie wolno włączać autostopu dla jedynej Machine, jeśli worker ma działać co minutę. | **Brak free tier dla nowych organizacji**; płatne usage-based Machines i volume. Historyczne darmowe allowance dotyczą wyłącznie starych planów/organizacji. Auto-stop nie nalicza CPU/RAM, ale zatrzymałby proces workera; volume nadal kosztuje. | Szyfrowany `fly secrets` jest dostępny. `*.fly.dev`/custom HTTPS może obsłużyć OAuth; Resend przez HTTPS działa. | **Dobra technicznie, ale nie darmowa** dla nowych kont. Rozważyć jako tanią opcję płatną, nie jako odpowiedź na „za darmo”. |
| **Vercel Hobby** | Tak po użyciu adaptera Vercel; SvelteKit SSR działa jako Node.js Function. | **Nie**: Vercel dokumentuje brak persistent filesystemu dla Functions; do zapisu rekomenduje object storage. Native `better-sqlite3` dodatkowo zwiększa ryzyko problemów w środowisku funkcji. | Cron Jobs są dostępne, ale Hobby pozwala tylko raz dziennie i z dokładnością do godziny; obecny worker potrzebuje co minutę. | Hobby: 1 mln function invocations, 4 CPU-hours, 360 GB-hours pamięci i 100 GB-hours function duration; funkcje mają limit do 300 s, ale nie są procesem stale działającym. | Env vars/secrets i HTTPS są dostępne; callback Google i Resend przez HTTPS są możliwe. | **Nie** dla tej architektury; dobre dopiero po migracji DB i zmianie workera na endpoint/job, a i wtedy Hobby nie spełnia częstotliwości co minutę. |
| **Netlify Free** | Tak po zamianie na `@sveltejs/adapter-netlify`; SSR trafia do Node-based Netlify Function. Obecny `adapter-node` wymaga zmiany adaptera. | **Nie**: Functions są efemeryczne/serverless; obecny lokalny SQLite nie jest trwałym storage. | Scheduled Functions są dostępne na wszystkich planach, ale limit wykonania to 30 s i dokumentacja wspiera m.in. `@hourly`, nie gwarantuje cron co minutę. Background Functions są dostępne na planach credit-based, ale nadal nie udostępniają trwałego lokalnego dysku. | Free: 300 credits/miesiąc z twardym limitem; compute Functions/scheduled/background kosztuje 10 credits za GB-hour, a production deploy 15 credits. | Env vars i oznaczanie secret values są wspierane. HTTPS URL i outbound HTTPS wystarczą do OAuth/Resend. | **Nie** dla obecnego SQLite + workera co minutę; sensowne do stateless SSR po migracji bazy. |

## Rekomendacja praktyczna

### 1. Oracle Cloud Always Free — rekomendacja główna

Proponowana topologia:

```text
OCI Always Free VM
├── daily-web.service                 -> node build
├── daily-scheduled-worker.timer      -> build/worker/... co minutę
├── daily-backup.timer                -> zweryfikowany backup raz dziennie
├── /var/lib/daily/daily.db           -> trwały Block Volume
└── /var/backups/daily                -> trwały Block Volume/Object Storage
```

Praktyczne uwagi:

1. Użyć jednej VM w home region, najlepiej Ampere A1 z zasobami wystarczającymi dla Node i kompilacji natywnego `better-sqlite3`; po wdrożeniu można budować release poza VM i kopiować gotowy artefakt albo budować bezpośrednio na VM.
2. Zainstalować dokładnie Node 22.15.0 i npm 10.9.2.
3. Zachować istniejący layout `/srv/daily`, `/var/lib/daily`, `/var/backups/daily`, `/etc/daily/daily.env` i obecne jednostki systemd.
4. Otworzyć tylko port SSH z ograniczeniem źródłowych adresów oraz port HTTP/HTTPS; terminować HTTPS przez Caddy/nginx albo użyć certyfikatu zarządzanego przez OCI. `ORIGIN` i `BETTER_AUTH_URL` muszą wskazywać końcowy publiczny adres.
5. Dodać kopię backupów poza samą VM. Sam lokalny block volume nie zastępuje kopii off-host.
6. Ustawić monitoring dostępności, aktualizacje systemu i limitowanie zasobów OCI; „Always Free” nie oznacza managed hosting.

### 2. Jeśli ważniejsza jest prostota platformy niż brak zmian w kodzie

Wybrałbym **Google Cloud Run**, ale dopiero po migracji z pliku SQLite do usługi bazodanowej. Web service i worker job mogą mieć osobne lifecycle, a Cloud Scheduler daje darmowy limit wystarczający dla dwóch harmonogramów (worker i backup). Trzeba jednak pilnować billing account, IAM i limitów oraz zweryfikować koszt bazy — sam darmowy Cloud Run nie rozwiązuje trwałości danych.

### 3. Jeśli celem jest serverless i akceptujesz większy rewrite

**Cloudflare Workers + D1** ma najlepszy darmowy model dla stateless/edge, ale wymaga:

- zamiany `adapter-node` na `adapter-cloudflare`,
- zastąpienia `better-sqlite3` bindingiem D1,
- przeniesienia migracji Drizzle do D1,
- przepisania workera na `scheduled()` i ograniczenia jego pracy do limitu CPU,
- audytu Better Auth, OAuth i wszystkich użyć Node `fs`/native addons.

To raczej osobny wariant architektoniczny niż sposób wdrożenia bieżącej gałęzi.

## OAuth i wysyłka maili — wspólna checklista

Na każdym wariancie z publicznym HTTPS:

- ustawić `ORIGIN` i `BETTER_AUTH_URL` na dokładnie ten sam canonical URL, którego użytkownik używa;
- dodać właściwy callback Google OAuth dla tego URL (w tym ewentualny `www`/subdomenę);
- przechowywać `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` i klucze Google Maps jako sekrety platformy albo w root-only pliku na VM;
- ustawić `RESEND_FROM_EMAIL` dla zweryfikowanej domeny/adresu w Resend;
- wykonać test logowania po zimnym starcie/usypianiu usługi i test wysyłki z realnym adresem callbacku;
- nie zapisywać sekretów w repo ani w obrazie kontenera.

Ocena, że OAuth callback i Resend są „technicznie możliwe”, jest wnioskiem z tego, że dane warianty zapewniają publiczny endpoint HTTPS, zmienne/sekrety i wychodzące requesty HTTPS; nie oznacza to, że provider automatycznie skonfiguruje Google OAuth lub domenę nadawczą Resend.

## Źródła oficjalne

### Oracle Cloud Infrastructure

- [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) — zasoby VM, Ampere A1, block volume, Object Storage i warunki home region.
- [What Happens When the Promotion Expires](https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-What_Happens_When_the_Promotion_Expires.htm) — aktywność konta i zachowanie zasobów po trialu.
- [Managing Secrets](https://docs.oracle.com/en-us/iaas/Content/secret-management/Concepts/manage-secrets.htm) — OCI Secret Management.

### Railway

- [Pricing Plans](https://docs.railway.com/pricing/plans) — Free plan, kredyt, zasoby usługi i limity wolumenu.
- [Free Trial](https://docs.railway.com/pricing/free-trial) — jednorazowe 5 USD, trial i usuwanie trialowych wolumenów.
- [Volumes](https://docs.railway.com/volumes/reference) oraz [Using Volumes](https://docs.railway.com/volumes) — trwały mount, 0,5 GB na Free i jeden wolumen w projekcie.
- [Cron Jobs](https://docs.railway.com/cron-jobs) — uruchamianie start command według crontab.
- [Serverless](https://docs.railway.com/deployments/serverless) — usypianie po braku ruchu wychodzącego.
- [Using Variables](https://docs.railway.com/variables) — zmienne i sealed variables.

### Google Cloud

- [Cloud Run pricing](https://cloud.google.com/run/pricing) — miesięczny free tier Cloud Run.
- [Container runtime contract](https://docs.cloud.google.com/run/docs/container-contract) — in-memory filesystem i lifecycle kontenera.
- [Execute jobs on a schedule](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule) — Cloud Run Job + Cloud Scheduler.
- [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing) — 3 darmowe joby na billing account.
- [Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets) — Secret Manager jako env albo mount.

### Cloudflare

- [SvelteKit on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/sveltekit/) — adapter Cloudflare i bundlowanie SvelteKit do Workera.
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) — requests, CPU, RAM, rozmiar Workera i Cron Triggers.
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — `scheduled()` i cron UTC.
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — szyfrowane sekrety.
- [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) i [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) — limity bazy i darmowe rows/storage.
- [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) — tylko podzbiór API Node i zgodność przez `nodejs_compat`.
- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) — Pages Functions na limitach Workers Free.

### Render

- [Deploy for Free](https://render.com/docs/free) — sleep, efemeryczny filesystem, 750 godzin i ograniczenia darmowego web service.
- [Persistent Disks](https://render.com/docs/disks) — disk wyłącznie dla płatnych usług i ograniczenia współdzielenia.
- [Cron Jobs](https://render.com/docs/cronjobs) — cron, brak disków i minimalny miesięczny koszt.
- [Environment Variables and Secrets](https://render.com/docs/configure-environment-variables) — konfiguracja sekretów.

### Koyeb

- [Instances](https://www.koyeb.com/docs/reference/instances) — Free Instance, 512 MB, 0,1 vCPU, brak Worker/Volume i scale-to-zero.
- [Local SSD Storage](https://www.koyeb.com/docs/reference/storage) — efemeryczny filesystem.
- [Volumes](https://www.koyeb.com/docs/reference/volumes) — trwały storage w public preview i jego ograniczenia.
- [Scale-to-Zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) — usypianie Free Instance po godzinie.
- [Secrets](https://www.koyeb.com/docs/reference/secrets) i [Environment Variables](https://www.koyeb.com/docs/build-and-deploy/environment-variables) — sekrety i env vars.

### Fly.io

- [Fly.io Resource Pricing](https://fly.io/docs/about/pricing/) — brak planu dla nowych organizacji, ceny Machines/Volumes i legacy allowances.
- [Cost Management on Fly.io](https://fly.io/docs/about/cost-management/) — wprost: brak free account/free tier.
- [Deploy with a Dockerfile](https://fly.io/docs/languages-and-frameworks/dockerfile/) — Node/Dockerfile i konfiguracja sekretów.
- [Fly Volumes overview](https://fly.io/docs/volumes/overview/) — lokalna trwałość i brak automatycznej replikacji.
- [Autostop/autostart Machines](https://fly.io/docs/launch/autostop-autostart/) — zatrzymywanie Machine i wpływ na stale działającego workera.
- [Secrets and Fly Apps](https://fly.io/docs/apps/secrets/) — szyfrowany vault i env vars.

### Vercel

- [SvelteKit on Vercel](https://vercel.com/docs/frameworks/full-stack/sveltekit) — SSR SvelteKit w Node.js serverless runtime.
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations) — limity Node Functions i Hobby.
- [Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby tylko raz dziennie i dokładność godzinowa.
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) — darmowe limity miesięczne.
- [How can I use files in Vercel Functions?](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions) — pliki do odczytu/bundla i rekomendacja object storage dla zapisu.

### Netlify

- [SvelteKit on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/sveltekit/) — adapter Netlify i SSR jako Function.
- [Functions overview](https://docs.netlify.com/build/functions/overview/) — ephemeral runtime Functions.
- [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/) — dostępność na planach, cron i limit 30 sekund.
- [Credit-based pricing plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) — Free 300 credits i koszty compute/deploy.
- [Functions usage and billing](https://docs.netlify.com/build/functions/usage-and-billing/) — limity i rozliczanie Functions.
- [Environment variables overview](https://docs.netlify.com/build/environment-variables/overview/) — env vars i Secrets Controller.
