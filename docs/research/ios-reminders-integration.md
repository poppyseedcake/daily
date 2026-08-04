# Integracja Daily z Apple Przypomnienia (iOS)

> Sprawdzono: 2026-08-01. Źródła zewnętrzne użyte w opracowaniu pochodzą wyłącznie z dokumentacji Apple lub Apple Developer Support. Wnioski dotyczące produktu są wyraźnie oznaczone jako wnioski projektowe.

## Werdykt

Tak, natywna aplikacja iOS może opcjonalnie zastąpić listę todo Daily danymi z Apple Przypomnienia: po uzyskaniu pełnego dostępu przez EventKit może czytać przypomnienia, tworzyć je, aktualizować, oznaczać jako wykonane i usuwać. Do odczytu istniejących przypomnień potrzebny jest pełny dostęp — Apple nie udostępnia trybu tylko do odczytu przypomnień. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01), [Apple: EKReminder](https://developer.apple.com/documentation/eventkit/ekreminder) (sprawdzono: 2026-08-01).

Sama aplikacja webowa/SvelteKit działająca na serwerze ani zwykła strona w Safari, PWA czy aplikacja dodana do ekranu początkowego nie może bezpośrednio uzyskać dostępu do lokalnej bazy Przypomnień. Udokumentowaną granicą jest natywny framework EventKit; potrzebny jest natywny komponent iOS albo sterowany przez użytkownika skrót Shortcuts. To ostatnie zdanie jest wnioskiem z udokumentowanego zakresu API Apple, a nie cytatem negatywnej deklaracji Apple o każdym możliwym środowisku webowym. [Apple: EventKit](https://developer.apple.com/documentation/eventkit) (sprawdzono: 2026-08-01), [Apple: Safari web apps](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) (sprawdzono: 2026-08-01), [Apple: WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) (sprawdzono: 2026-08-01).

Jeśli „zastąpić” ma oznaczać ciągłą, dwukierunkową i możliwie niezawodną synchronizację, rekomendowanym wariantem jest mała natywna aplikacja/kompanion iOS z EventKit oraz API Daily. Najtańszy prototyp to skrót Shortcuts wysyłający do serwera migawkę przypomnień, ale nie daje on takiej samej kontroli ani gwarancji świeżości. [Wniosek projektowy na podstawie: Apple: requestFullAccessToReminders](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders%28completion%3A%29) (sprawdzono: 2026-08-01), [Apple Support: Get Contents of URL](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios) (sprawdzono: 2026-08-01), [Apple: background tasks](https://developer.apple.com/documentation/UIKit/using-background-tasks-to-update-your-app) (sprawdzono: 2026-08-01).

## Kontekst obecnej aplikacji

Obecny model Daily przechowuje dla zadania `title`, `categoryId`, `urgency`, `position` i `completed`; ukończenie zadania usuwa je z tablicy. Nie ma w nim terminu, notatek, lokalizacji, alarmów, reguł powtarzania, daty modyfikacji ani identyfikatora zewnętrznego. To ustalenia z kodu repozytorium, nie z dokumentacji Apple: [src/lib/todo.ts](../../src/lib/todo.ts) (sprawdzono: 2026-08-01).

Wniosek projektowy: bez rozszerzenia modelu można bezstratnie odwzorować tylko podstawowy podzbiór przypomnienia. W szczególności synchronizacja ukończenia wymaga zmiany obecnego założenia „ukończone = usunięte” albo świadomego prezentowania w Daily wyłącznie nieukończonych elementów.

## Fakty ze źródeł Apple

### 1. Co może zrobić natywna aplikacja iOS

`EKEventStore` jest punktem dostępu aplikacji do danych kalendarzy i przypomnień. Apple wymaga uzyskania zgody przed pobieraniem lub zapisywaniem danych; aplikacja nie modyfikuje bazy systemowej bezpośrednio. [Apple: EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore) (sprawdzono: 2026-08-01), [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01).

| Operacja | Czy jest możliwa? | Udokumentowany mechanizm i ograniczenie |
| --- | --- | --- |
| Odczyt nieukończonych przypomnień | Tak | `fetchReminders` z predykatem dla nieukończonych elementów; wymaga pełnego dostępu do przypomnień. [Apple: Retrieving events and reminders](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders) (sprawdzono: 2026-08-01), [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01). |
| Odczyt ukończonych przypomnień | Tak | Apple udostępnia osobny predykat dla przypomnień ukończonych oraz predykat wszystkich przypomnień w wybranych listach. [Apple: Retrieving events and reminders](https://developer.apple.com/documentation/eventkit/retrieving-events-and-reminders) (sprawdzono: 2026-08-01). |
| Tworzenie | Tak | Utworzyć `EKReminder(eventStore:)`, ustawić co najmniej tytuł i listę (`calendar`), a następnie zapisać przez `EKEventStore.save(_:commit:)`. [Apple: Creating events and reminders](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders) (sprawdzono: 2026-08-01), [Apple: save(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/save%28_%3Acommit%3A%29) (sprawdzono: 2026-08-01). |
| Aktualizacja | Tak | Zmienić właściwości istniejącego `EKReminder` i ponownie użyć `save(_:commit:)`; `commit: true` zapisuje natychmiast, a `false` pozwala zgrupować zmiany przed `commit()`. [Apple: save(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/save%28_%3Acommit%3A%29) (sprawdzono: 2026-08-01). |
| Oznaczenie jako wykonane | Tak | Ustawić `isCompleted = true`; EventKit ustawia wtedy datę ukończenia. Można też ustawić `completionDate`; wyzerowanie tej właściwości oznacza przypomnienie jako nieukończone. [Apple: isCompleted](https://developer.apple.com/documentation/eventkit/ekreminder/iscompleted) (sprawdzono: 2026-08-01), [Apple: completionDate](https://developer.apple.com/documentation/eventkit/ekreminder/completiondate) (sprawdzono: 2026-08-01). |
| Usunięcie | Tak | `EKEventStore.remove(_:commit:)`; operacja może być natychmiastowa albo częścią grupy zmian. [Apple: remove(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/remove%28_%3Acommit%3A%29) (sprawdzono: 2026-08-01). |

Apple opisuje pełny dostęp do przypomnień jako dostęp pozwalający aplikacji tworzyć, przeglądać, edytować i usuwać dane. Nie ma osobnego poziomu „read-only” dla przypomnień; aby je odczytać, aplikacja musi mieć pełny dostęp. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01).

### 2. Zgody, `Info.plist`, SDK i entitlementy

Dla aplikacji zlinkowanej z iOS 17 lub nowszym należy użyć `requestFullAccessToReminders(completion:)`. Ta metoda prosi użytkownika o zgodę na odczyt i zapis przypomnień. [Apple: requestFullAccessToReminders](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders%28completion%3A%29) (sprawdzono: 2026-08-01).

W `Info.plist` trzeba opisać cel dostępu:

- [`NSRemindersFullAccessUsageDescription`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsremindersfullaccessusagedescription) — dla pełnego odczytu i zapisu na iOS 17+;
- [`NSRemindersUsageDescription`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsremindersusagedescription) — starszy klucz potrzebny przy obsłudze iOS 10–16; przy wsparciu starszych systemów należy go zachować obok nowego klucza;
- `NSContactsUsageDescription` jest potrzebny tylko wtedy, gdy używany interfejs EventKit/EventKit UI potrzebuje dostępu do kontaktów, na przykład do wyboru nazwy lub awatara kontaktu; nie jest częścią podstawowego bezpośredniego CRUD przypomnień. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01).

Brak odpowiednich opisów prywatności powoduje odmowę dostępu na iOS 17+, a przy aplikacji zlinkowanej z iOS 10–16 brak starszych kluczy może spowodować awarię. Apple wskazuje `NSRemindersUsageDescription` jako fallback dla starszego modelu dostępu, ale w aplikacji wspierającej iOS 17+ należy dodać nowy klucz pełnego dostępu. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01), [Apple: NSRemindersFullAccessUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsremindersfullaccessusagedescription) (sprawdzono: 2026-08-01), [Apple: TN3152](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels) (sprawdzono: 2026-08-01).

`requestAccess(to:completion:)` jest metodą starego modelu. Po zlinkowaniu aplikacji z SDK iOS 17, jeśli użyje się tej deprecated metody, nie wyświetli ona promptu i zgłosi błąd; dla przypomnień trzeba użyć nowej metody pełnego dostępu. [Apple: requestAccess(to:completion:)](https://developer.apple.com/documentation/eventkit/ekeventstore/requestaccess%28to%3Acompletion%3A%29) (sprawdzono: 2026-08-01), [Apple: TN3152](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels) (sprawdzono: 2026-08-01).

Apple zaleca sprawdzanie statusu autoryzacji przy korzystaniu z chronionych zasobów, ponieważ użytkownik może później zmienić zgodę w Ustawieniach. Aplikacja musi obsłużyć odmowę, cofnięcie zgody i błąd bez zakładania, że dane są dostępne. [Apple: Requesting access to protected resources](https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources) (sprawdzono: 2026-08-01).

W dokumentacji ścieżki iOS dla EventKit konfiguracja przypomnień obejmuje opis w `Info.plist` i zgodę użytkownika. Apple wymienia osobny entitlement `com.apple.security.personal-information.calendars` dla aplikacji macOS działających w App Sandbox; nie jest to entitlement do dodania do celu iOS. To ograniczone twierdzenie wynika z dokumentacji dostępu EventKit — nie oznacza, że każda funkcja innego celu Apple ma identyczne wymagania. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01), [Apple: macOS calendar entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.personal-information.calendars) (sprawdzono: 2026-08-01).

### 3. Wersje i platformy

`EKEventStore` jest dostępny na iOS od wersji 4.0, a `EKReminder` od iOS 6.0. Dokumentacja obu klas obejmuje także iPadOS, macOS, Mac Catalyst, visionOS i watchOS, z osobnymi wersjami dostępności. [Apple: EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore) (sprawdzono: 2026-08-01), [Apple: EKReminder](https://developer.apple.com/documentation/eventkit/ekreminder) (sprawdzono: 2026-08-01).

Nowy podział poziomów dostępu dotyczy iOS 17, iPadOS 17, macOS 14, Mac Catalyst 17 i watchOS 10. Apple zaleca budowanie z Xcode 15/SDK odpowiadającym platformie oraz warunkowe użycie starego API dla starszych systemów. [Apple: TN3152](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels) (sprawdzono: 2026-08-01).

Wniosek projektowy: minimalna wersja iOS nie musi od razu wynosić 17, ale warstwa EventKit powinna mieć dwie ścieżki autoryzacji: nową dla iOS 17+ i kompatybilną ze starymi systemami. Jeśli produkt wybierze wyższy deployment target, kod i testy upraszczają się, lecz funkcja obejmie mniej urządzeń.

### 4. Listy, pola przypomnienia i identyfikatory

Przypomnienie należy do listy reprezentowanej przez `EKCalendar`. Aplikacja może pobrać listy obsługujące encję przypomnienia, użyć domyślnej listy dla nowych przypomnień i filtrować listy, które pozwalają na modyfikację (`allowsContentModifications`). [Apple: EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore) (sprawdzono: 2026-08-01), [Apple: EKCalendar](https://developer.apple.com/documentation/eventkit/ekcalendar) (sprawdzono: 2026-08-01), [Apple: allowsContentModifications](https://developer.apple.com/documentation/eventkit/ekcalendar/allowscontentmodifications) (sprawdzono: 2026-08-01).

`EKReminder` udostępnia między innymi tytuł odziedziczony po `EKCalendarItem`, notatki, alarmy, reguły powtarzania, termin rozpoczęcia i termin wykonania, priorytet, status wykonania oraz datę ukończenia. Priorytet EventKit ma wartości `none`, `high`, `medium` i `low`. [Apple: EKReminder](https://developer.apple.com/documentation/eventkit/ekreminder) (sprawdzono: 2026-08-01), [Apple: EKCalendarItem](https://developer.apple.com/documentation/eventkit/ekcalendaritem) (sprawdzono: 2026-08-01), [Apple: EKReminderPriority](https://developer.apple.com/documentation/eventkit/ekreminderpriority) (sprawdzono: 2026-08-01).

Apple dokumentuje `calendarItemIdentifier` jako lokalny identyfikator przypomnienia, używany do ponownego pobrania elementu przez `calendarItem(withIdentifier:)`. Pełna synchronizacja kalendarza może jednak unieważnić taki identyfikator; aplikacja powinna zachować inne właściwości potrzebne do ponownego dopasowania. `calendarIdentifier` listy ma podobne zastrzeżenie. [Apple: calendarItemIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier) (sprawdzono: 2026-08-01), [Apple: calendarItem(withIdentifier:)](https://developer.apple.com/documentation/eventkit/ekeventstore/calendaritem%28withidentifier%3A%29) (sprawdzono: 2026-08-01), [Apple: calendarIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendar/calendaridentifier) (sprawdzono: 2026-08-01).

`calendarItemExternalIdentifier` może pomóc rozpoznać element po stronie źródła serwerowego, ale Apple ostrzega między innymi przed założeniem, że jest jeden i zawsze identyczny w każdym przypadku; dla Exchange identyfikator może różnić się między urządzeniami. Nie powinien być jedynym kluczem synchronizacji. [Apple: calendarItemExternalIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier) (sprawdzono: 2026-08-01).

EventKit publikuje powiadomienie o zmianie bazy, gdy inny proces lub aplikacja zmieni dane. Powiadomienie nie jest kompletnym dziennikiem zmian: Apple zaleca po nim ponownie pobrać aktualne obiekty i zakres danych, ponieważ wcześniej pobrane obiekty mogą być nieaktualne. [Apple: Updating with notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications) (sprawdzono: 2026-08-01).

### 5. Dlaczego sam SvelteKit/Safari nie wystarczy

EventKit jest natywnym frameworkiem, a `EKEventStore` wymaga kodu aplikacji oraz systemowego promptu zgody i wpisów `Info.plist`. Serwer Node uruchamiający SvelteKit nie działa w procesie aplikacji iOS ani w kontekście użytkownika, któremu należy się dostęp do jego lokalnego store EventKit. W repozytorium Daily aplikacja używa adaptera Node, więc jest to rozdzielony proces serwerowy: [package.json](../../package.json) (sprawdzono: 2026-08-01). [Apple: EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore) (sprawdzono: 2026-08-01), [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01).

Apple opisuje `WKWebView` jako natywny widok osadzający treści webowe, a `WKScriptMessageHandler` jako mechanizm, przez który webowy JavaScript wysyła wiadomość do natywnego handlera. Taki most może więc przekazać żądanie z interfejsu Svelte do kodu Swift, który dopiero wywoła EventKit. Nie tworzy to jednak dostępu dla zwykłej strony w Safari. [Apple: WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) (sprawdzono: 2026-08-01), [Apple: WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler) (sprawdzono: 2026-08-01), [Apple: WKUserContentController](https://developer.apple.com/documentation/webkit/wkusercontentcontroller) (sprawdzono: 2026-08-01).

CloudKit nie jest alternatywnym API do systemowych Przypomnień: Apple opisuje go jako usługę przechowywania i synchronizacji danych własnej aplikacji w jej kontenerach iCloud. Wniosek projektowy: nie należy próbować podłączać Daily do prywatnej bazy iCloud/nieudokumentowanego formatu Reminders ani udawać, że CloudKit daje taki dostęp. [Apple: CloudKit](https://developer.apple.com/documentation/cloudkit) (sprawdzono: 2026-08-01), [Apple: CloudKit JS](https://developer.apple.com/documentation/cloudkitjs/cloudkit) (sprawdzono: 2026-08-01).

## Realne warianty architektury

Poniższe oceny są wnioskami projektowymi opartymi na faktach z poprzedniej sekcji. Każdy wariant ma inny poziom integracji; żaden mechanizm webowy nie omija zgody EventKit, jeśli finalnie ma czytać systemowe przypomnienia.

### A. Natywna aplikacja-kompanion iOS — rekomendacja dla pełnej integracji

Mała aplikacja Swift/SwiftUI:

1. prosi o pełny dostęp dopiero po włączeniu funkcji przez użytkownika;
2. pozwala wybrać jedną lub kilka zapisywalnych list;
3. pobiera przypomnienia przez EventKit;
4. wysyła do API Daily tylko dane potrzebne do listy i podsumowania;
5. odbiera z serwera kolejkę poleceń, gdy użytkownik zmienia zadanie w webowym Daily;
6. reaguje na powiadomienia EventKit i wykonuje ponowną rekonsyliację.

To jedyny z rozważanych wariantów, który daje aplikacji kontrolę nad pełnym odczytem, zapisem i rozwiązywaniem konfliktów. Nadal wymaga natywnego targetu i mechanizmu logowania Daily; obecny projekt nie zawiera targetu iOS. EventKit, zgoda i powiadomienia są opisane przez Apple tutaj: [EKEventStore](https://developer.apple.com/documentation/eventkit/ekeventstore) (sprawdzono: 2026-08-01), [Updating with notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications) (sprawdzono: 2026-08-01).

Wariant z natywną powłoką `WKWebView` może ponownie wykorzystać część interfejsu SvelteKit: web wysyła przez bridge polecenie `readReminders`/`completeReminder`, a natywna powłoka wykonuje EventKit. To wciąż jest aplikacja iOS, nie „czysta” aplikacja webowa; bridge musi walidować komunikaty i nie powinien przekazywać do JavaScript niepotrzebnych danych. [Apple: WKScriptMessageHandler](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler) (sprawdzono: 2026-08-01), [Apple: WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) (sprawdzono: 2026-08-01).

### B. Share Extension — dobry kanał do pojedynczego dodania, nie do synchronizacji

Share Extension jest uruchamiane z systemowego arkusza udostępniania i dostaje dane przekazane przez aplikację gospodarza, na przykład zaznaczony tekst lub URL. Rozszerzenia mają osobny kontener i zwykle kończą pracę niedługo po obsłużeniu żądania. [Apple: Share extensions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html) (sprawdzono: 2026-08-01), [Apple: Extension overview](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html) (sprawdzono: 2026-08-01), [Apple: NSExtensionContext](https://developer.apple.com/documentation/foundation/nsextensioncontext) (sprawdzono: 2026-08-01).

Praktyczny wariant to: użytkownik udostępnia stronę lub tekst z Safari, extension zapisuje dane do App Group albo przekazuje je aplikacji zawierającej, a ta aplikacja wykonuje operację EventKit. App Groups są mechanizmem współdzielenia kontenera między aplikacją i jej rozszerzeniami. [Apple: Extension scenarios](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html) (sprawdzono: 2026-08-01), [Apple: App Groups entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.application-groups) (sprawdzono: 2026-08-01).

Wniosek projektowy: Share Extension dobrze nadaje się do „dodaj ten element do wybranej listy Przypomnień” albo do jednorazowego importu. Nie jest dobrym silnikiem stałego mirrorowania całej listy: ma krótki cykl życia, nie rozwiązuje synchronizacji zmian wykonanych gdzie indziej i nie daje serwerowi dostępu do danych, gdy extension nie jest uruchomione. Nie należy zakładać bez osobnych testów, że bezpośredni EventKit z każdego typu extension będzie działał jak w głównej aplikacji.

### C. Safari Web Extension — natywna instalacja z komponentem webowym

Safari Web Extension na iOS jest częścią aplikacji zawierającej; może zawierać JavaScript/HTML/CSS oraz natywną extension i komunikować się z aplikacją. Apple opisuje osobne sandboxy i mechanizmy komunikacji, a nie dostęp zwykłej strony do EventKit. [Apple: Safari Web Extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions) (sprawdzono: 2026-08-01), [Apple: Messaging between the app and JavaScript in a Safari web extension](https://developer.apple.com/documentation/safariservices/messaging-between-the-app-and-javascript-in-a-safari-web-extension) (sprawdzono: 2026-08-01), [Apple: Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) (sprawdzono: 2026-08-01).

Wniosek projektowy: ten wariant może wygodnie przechwytywać dane z przeglądanej strony, ale nadal wymaga instalacji iOS app/extension oraz natywnego miejsca, w którym wywołany zostanie EventKit. Nie zastępuje natywnego kompana jako warstwy synchronizacji.

### D. Shortcuts — szybki pilot i integracja sterowana przez użytkownika

Apple Shortcuts ma akcje pracujące na treściach urządzenia, w tym na przypomnieniach, oraz akcję `Get Contents of URL`, która może wykonać żądanie HTTP do API Daily. Użytkownik może więc zbudować skrót w rodzaju:

```text
Find Reminders
  -> wybór pól i filtrów
  -> Get Contents of URL (POST migawki do Daily)
```

Możliwy jest też kierunek odwrotny: skrót pobiera zadania z API Daily i używa akcji Reminders do utworzenia lub zmiany elementów na urządzeniu. Apple dokumentuje zarówno wysyłanie żądań HTTP z Shortcuts, jak i akcje `Find Reminders`/filtrowania oraz akcje innych aplikacji wymagające zgody użytkownika. [Apple Support: Get Contents of URL](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios) (sprawdzono: 2026-08-01), [Apple Support: Find and Filter actions](https://support.apple.com/guide/shortcuts/intro-to-find-and-filter-actions-apd3c845e881/ios) (sprawdzono: 2026-08-01), [Apple Support: Navigate the action list](https://support.apple.com/guide/shortcuts/navigate-the-action-list-apdc33e4f4da/ios) (sprawdzono: 2026-08-01).

Strona Daily może uruchomić zainstalowany skrót przez URL scheme `shortcuts://run-shortcut`, przekazując mu wejście. Uruchomienie skrótu nie oznacza jednak, że strona otrzyma bezpośredni dostęp do wyników; przepływ danych trzeba zaprojektować w skrócie, zwykle przez wywołanie API. [Apple Support: Run a shortcut using a URL scheme](https://support.apple.com/guide/shortcuts/run-a-shortcut-using-a-url-scheme-apd624386f42/ios) (sprawdzono: 2026-08-01).

Wniosek projektowy: Shortcuts jest sensownym eksperymentem bez budowania aplikacji natywnej i może wystarczyć do jednokierunkowej migawki. Ograniczenia to konfiguracja po stronie użytkownika, jego zgody, zależność od uruchomienia skrótu oraz brak gwarancji, że skrót wykona się przed serwerowym podsumowaniem.

### E. App Intents — natywne akcje dostępne w Shortcuts/Siri

`AppIntent` pozwala aplikacji natywnej opisać akcję, którą system może udostępnić w Shortcuts, Siri i innych miejscach. Intent może być wykonywany w aplikacji lub rozszerzeniu, także w odpowiednim trybie tła, ale kod intentu nadal należy do aplikacji natywnej. [Apple: AppIntent](https://developer.apple.com/documentation/appintents/appintent) (sprawdzono: 2026-08-01), [Apple: App Intents](https://developer.apple.com/documentation/appintents/app-intents) (sprawdzono: 2026-08-01), [Apple: App extension](https://developer.apple.com/documentation/appintents/app-extension) (sprawdzono: 2026-08-01).

Wniosek projektowy: App Intents może być dobrym API automatyzacji dla natywnego kompana, na przykład `SyncDailyReminders` lub `CompleteDailyTask`. Sam App Intent nie nadaje stronie webowej dostępu do Przypomnień i nie zastępuje zgody EventKit; implementacja, która czyta systemowe przypomnienia, nadal musi użyć EventKit. Apple’owe schematy domenowe „reminders” opisują także akcje aplikacji udostępniającej własne obiekty Siri/Apple Intelligence, a nie przyznają dostępu do bazy systemowej Reminders. [Apple: App Shortcuts](https://developer.apple.com/documentation/appintents/app-shortcuts) (sprawdzono: 2026-08-01), [Apple: Reminders schema](https://developer.apple.com/documentation/appintents/app-schema-domain-reminders) (sprawdzono: 2026-08-01).

### F. Ręczny import/eksport

Można zaoferować ręczne przeklejenie, udostępnienie tekstu albo import pliku przygotowanego przez użytkownika. Ten wariant nie wymaga zgody EventKit i może być awaryjnym fallbackiem, ale jest jednokierunkowy, nie ma stabilnego powiązania z `EKReminder` i nie synchronizuje późniejszych zmian. Jest to propozycja produktowa, nie funkcja udokumentowana w Apple API.

## Wnioski projektowe dla synchronizacji

### Źródło prawdy

Najpierw trzeba wybrać tryb funkcji, bo „zastąpienie listy” i „synchronizacja dwóch list” to różne produkty:

1. **Apple jako źródło prawdy** — Daily pokazuje migawkę z wybranych list; zmiany z webu trafiają do kolejki i są wykonywane przez kompana iOS.
2. **Daily jako źródło prawdy** — Daily pozostaje kanoniczne, a natywna aplikacja tylko publikuje zadania do wybranej listy Przypomnień.
3. **Synchronizacja dwukierunkowa** — obie strony mogą zmienić tytuł, priorytet i status; wymaga wersjonowania, wykrywania konfliktów i obsługi stanu offline.

Rekomendacja: zacząć od trybu 1 w wersji read-only albo od trybu 2. Dopiero po zebraniu danych o użyciu dodać dwukierunkowe zapisy. Pełny dostęp EventKit obejmuje operacje destrukcyjne, więc przełącznik funkcji powinien być wyraźną decyzją użytkownika. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01).

### Mapowanie modelu

| Daily | Apple Przypomnienia | Decyzja |
| --- | --- | --- |
| `title` | `EKCalendarItem.title` | Bezpośrednie mapowanie. [Apple: EKCalendarItem](https://developer.apple.com/documentation/eventkit/ekcalendaritem) (sprawdzono: 2026-08-01). |
| `completed` | `EKReminder.isCompleted` i `completionDate` | Technicznie bezpośrednie; obecne Daily usuwa ukończone zadanie, więc adapter musi zachować status albo świadomie pobierać tylko aktywne. [Apple: isCompleted](https://developer.apple.com/documentation/eventkit/ekreminder/iscompleted) (sprawdzono: 2026-08-01). |
| `urgency` | `EKReminder.priority` | Możliwe mapowanie `low/medium/high`; znaczenie priorytetu nie musi być identyczne z pilnością Daily. [Apple: EKReminderPriority](https://developer.apple.com/documentation/eventkit/ekreminderpriority) (sprawdzono: 2026-08-01). |
| `categoryId` | wybrany `EKCalendar`/lista | Nie ma jednego pola kategorii w `EKReminder`; można mapować kategorię na listę tylko po jawnej konfiguracji. [Apple: EKCalendar](https://developer.apple.com/documentation/eventkit/ekcalendar) (sprawdzono: 2026-08-01). |
| `position` | brak udokumentowanego odpowiednika w `EKReminder`/`EKCalendarItem` | Trzymać kolejność wyłącznie po stronie Daily albo ustalić własne sortowanie; nie obiecywać round-trip kolejności z aplikacji Przypomnienia. [Apple: EKReminder](https://developer.apple.com/documentation/eventkit/ekreminder) (sprawdzono: 2026-08-01), [Apple: EKCalendarItem](https://developer.apple.com/documentation/eventkit/ekcalendaritem) (sprawdzono: 2026-08-01). |
| termin, notatka, lokalizacja, alarmy, powtarzanie | pola EventKit | Obecny model Daily ich nie przechowuje; przed synchronizacją dwukierunkową trzeba zdecydować, czy je dodać, ignorować, czy zachować wyłącznie po stronie natywnej. [Apple: EKReminder](https://developer.apple.com/documentation/eventkit/ekreminder) (sprawdzono: 2026-08-01), [Apple: EKCalendarItem](https://developer.apple.com/documentation/eventkit/ekcalendaritem) (sprawdzono: 2026-08-01). |

### Identyfikatory i rekonsyliacja

Rekomendowany rekord integracji po stronie serwera powinien rozdzielać:

- stabilny identyfikator zadania Daily;
- identyfikator użytkownika Daily;
- `calendarIdentifier` wybranej listy i jej metadane jako wskazówkę;
- `calendarItemIdentifier` jako podstawowy klucz lokalnej instancji EventKit;
- `calendarItemExternalIdentifier` jako dodatkową wskazówkę;
- ostatni znany snapshot pól oraz `lastModifiedDate`;
- czas ostatniej udanej synchronizacji i ewentualny błąd.

Przy każdym pełnym odświeżeniu trzeba wykonać rekonsyliację, bo lokalny identyfikator elementu lub listy może przestać działać. Po `EventStoreChanged` należy ponownie pobrać stan z EventKit, zamiast próbować odtworzyć zmianę wyłącznie z powiadomienia. [Apple: calendarItemIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier) (sprawdzono: 2026-08-01), [Apple: calendarItemExternalIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier) (sprawdzono: 2026-08-01), [Apple: Updating with notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications) (sprawdzono: 2026-08-01).

Wniosek projektowy: nie wolno używać tytułu jako klucza. Przy utracie identyfikatora należy użyć kombinacji listy, tytułu, terminu, statusu i innych pól tylko do znalezienia kandydata, a nie automatycznie scalać niejednoznacznych elementów. W przypadku kilku kandydatów lepiej poprosić użytkownika o potwierdzenie.

### Konflikty

Przed zapisem z webu natywna aplikacja powinna ponownie pobrać bieżące `EKReminder` i porównać je z ostatnim snapshotem. Jeśli użytkownik zmienił tytuł lub status w Apple Przypomnienia od czasu snapshotu, a Daily ma własną zmianę, rekord należy oznaczyć jako konflikt i zaproponować wybór. Apple opisuje `lastModifiedDate` jako właściwość elementu kalendarzowego, ale EventKit nie dostarcza gotowej polityki konfliktów dla aplikacji integrującej własny serwer; poniższa procedura jest wnioskiem projektowym. [Apple: EKCalendarItem](https://developer.apple.com/documentation/eventkit/ekcalendaritem) (sprawdzono: 2026-08-01), [Apple: Updating with notifications](https://developer.apple.com/documentation/eventkit/updating-with-notifications) (sprawdzono: 2026-08-01).

Polecenia zapisu warto wysyłać przez kolejkę z kluczem idempotencji, przechowywać wynik operacji i retryować tylko błędy przejściowe. Operacje `save` i `remove` mogą zgłaszać błędy, a obiekt z innego `EKEventStore` nie może być użyty w bieżącym store. [Apple: save(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/save%28_%3Acommit%3A%29) (sprawdzono: 2026-08-01), [Apple: remove(_:commit:)](https://developer.apple.com/documentation/eventkit/ekeventstore/remove%28_%3Acommit%3A%29) (sprawdzono: 2026-08-01).

### Prywatność

Pełny dostęp jest wrażliwy: aplikacja może przeglądać, zmieniać i usuwać przypomnienia. Zgoda powinna być proszona dopiero po świadomym włączeniu integracji, z jasnym opisem zakresu. Na serwer powinny trafiać tylko potrzebne pola; notatki, lokalizacje, alarmy i dane innych list należy pomijać, jeśli nie są potrzebne do funkcji. To rekomendacje projektowe oparte na zakresie pełnego dostępu opisanym przez Apple. [Apple: Accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store) (sprawdzono: 2026-08-01), [Apple: NSRemindersFullAccessUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsremindersfullaccessusagedescription) (sprawdzono: 2026-08-01).

Należy zaprojektować usunięcie snapshotów i powiązań po usunięciu konta, szyfrowanie transmisji i ograniczenie logów. Cofnięcie zgody musi wyłączyć synchronizację i jasno pokazać, że dane na serwerze mogą być tylko ostatnią migawką, nie aktualnym stanem urządzenia. Apple wymaga, by aplikacja obsługiwała zmianę zgody i odmowę. [Apple: Requesting access to protected resources](https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources) (sprawdzono: 2026-08-01).

### Niezawodność i praca w tle

Natywna aplikacja może odświeżyć dane po uruchomieniu, po powiadomieniu EventKit albo w zadaniu tła. `BGAppRefreshTask` jest przeznaczone dla krótkich odświeżeń, a zadanie jest planowane przez system; Apple podaje, że opóźnienie od zaplanowania do uruchomienia może wynosić wiele godzin. `earliestBeginDate` oznacza najwcześniejszy termin, nie gwarantowaną godzinę. [Apple: BGAppRefreshTask](https://developer.apple.com/documentation/backgroundtasks/bgapprefreshtask) (sprawdzono: 2026-08-01), [Apple: Using background tasks to update your app](https://developer.apple.com/documentation/UIKit/using-background-tasks-to-update-your-app) (sprawdzono: 2026-08-01), [Apple: Starting and terminating tasks during development](https://developer.apple.com/documentation/backgroundtasks/starting-and-terminating-tasks-during-development) (sprawdzono: 2026-08-01).

`BGProcessingTask` jest przeznaczone dla cięższej pracy, w tym synchronizacji, ale nadal podlega decyzji systemu i limitom wykonania. Rozszerzenie aplikacji ma dodatkowo krótki cykl życia. [Apple: Using background tasks to update your app](https://developer.apple.com/documentation/UIKit/using-background-tasks-to-update-your-app) (sprawdzono: 2026-08-01), [Apple: Extension overview](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html) (sprawdzono: 2026-08-01).

Wniosek projektowy: serwerowy worker generujący podsumowanie o ściśle określonej godzinie nie może czekać na świeży odczyt z iPhone’a. Powinien korzystać z ostatniej udanej migawki, przechowywać `syncedAt`, oznaczać dane jako nieaktualne po przekroczeniu ustalonego TTL i — zależnie od decyzji produktu — pokazywać sekcję Todo jako niedostępną zamiast udawać aktualność. Jeśli świeżość jest krytyczna, użytkownik musi otworzyć aplikację/uruchomić skrót przed podsumowaniem albo produkt musi zaakceptować opóźnienie.

## Rekomendowana ścieżka wdrożenia

### Etap 1: ograniczony pilot

Najmniejszy eksperyment bez nowego targetu iOS:

1. przygotować instrukcję skrótu Shortcuts `Find Reminders -> POST snapshot to Daily`;
2. przyjmować tylko tytuł, status, priorytet, listę i identyfikatory przekazane przez skrót;
3. pokazywać w Daily czas ostatniej migawki i stan „nieaktualne”;
4. nie wykonywać automatycznych zapisów z Daily do Apple Przypomnień;
5. zostawić ręczny import jako fallback.

To zweryfikuje, czy użytkownicy chcą zastąpić Todo przypomnieniami, bez kosztu pełnej aplikacji natywnej. Nie powinno być komunikowane jako ciągła synchronizacja.

### Etap 2: natywny companion

Jeśli pilot potwierdzi potrzebę, dodać osobny iOS target z:

- warstwą EventKit i testami na iOS 16 oraz iOS 17+;
- ekranem wyboru listy i statusem zgody;
- lokalną kolejką operacji i rekonsyliacją;
- API Daily dla snapshotów, komend i wyników konfliktów;
- opcjonalnym WKWebView/bridge, jeśli chcemy ponownie wykorzystać część UI Svelte;
- App Intents jako wygodnym wejściem do synchronizacji z Shortcuts, ale nie jako zamiennikiem EventKit.

W tej wersji najpierw wdrożyć mirror read-only lub jednokierunkowe publikowanie. Dwukierunkowe aktualizacje i oznaczanie jako ukończone dodać po zdefiniowaniu konfliktów, usuwania i zachowania po cofnięciu zgody.

## Ostateczna decyzja

- **Możliwe technicznie:** tak, przez natywny iOS/EventKit.
- **Możliwe bezpośrednio z obecnego serwera SvelteKit:** nie.
- **Możliwe bez natywnej aplikacji jako pilot:** tak, przez skonfigurowany przez użytkownika Shortcuts albo ręczny import, ale jako migawka/jednokierunkowy przepływ.
- **Rekomendacja:** nie zastępować obecnego Todo od razu globalnie. Dodać opcjonalny tryb źródła „Apple Przypomnienia”, zacząć od migawki read-only, a pełną dwukierunkową synchronizację budować dopiero z natywnym companionem i jawnie zaprojektowaną polityką konfliktów.
