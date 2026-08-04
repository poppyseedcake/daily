# Oznaczanie Todo Task jako gotowego z Daily Summary

## Pytanie

Czy użytkownik może zaznaczać zadania jako gotowe bezpośrednio w mailu Daily Summary, a informacja może automatycznie trafić do aplikacji Daily?

Stan researchu: 2026-08-02.

## Odpowiedź w skrócie

Tak, jest to technicznie możliwe, ale trzeba rozdzielić dwa znaczenia „w mailu”:

1. **Link lub przycisk w zwykłym HTML maila** — działa jako najbardziej interoperacyjny wariant. Użytkownik klika `Gotowe`, przechodzi do endpointu Daily, a serwer oznacza konkretne zadanie jako ukończone.
2. **Prawdziwy interaktywny checkbox działający w treści skrzynki** — wymaga specjalnego formatu obsługiwanego tylko przez wybrane klienty: AMP for Email albo Outlook Actionable Messages. Nie jest to funkcja zwykłego HTML wysyłanego obecnie przez Daily.

Rekomendacja dla Daily: zacząć od zwykłego maila z osobnym, bezpiecznym linkiem `Gotowe` przy każdym zadaniu. Link powinien otworzyć małą stronę potwierdzenia, a dopiero formularz `POST` powinien zmienić stan zadania. AMP/Outlook warto rozważyć dopiero wtedy, gdy testy użytkowników potwierdzą, że dodatkowe kliknięcie i otwarcie strony są istotnym problemem.

## Kontekst obecnej aplikacji

- Daily wysyła Daily Summary przez Resend jako HTML i tekst. Decyzja architektoniczna jest opisana w [`docs/adr/0013-use-resend-for-email-delivery.md`](../../docs/adr/0013-use-resend-for-email-delivery.md), a ograniczony renderer maila w [`docs/adr/0019-render-email-with-typescript-template-functions.md`](../../docs/adr/0019-render-email-with-typescript-template-functions.md).
- Obecny adapter wysyłki przekazuje do Resend pola `html` i `text`; nie przekazuje osobnej części MIME dla AMP: [`src/lib/server/dailySummaryDelivery.ts`](../../src/lib/server/dailySummaryDelivery.ts).
- Model zadania ma `id` i pole `completed`, ale obecna funkcja ukończenia usuwa zadanie z aktywnej listy, a słownik domenowy nie zakłada przechowywania historii ukończonych zadań: [`src/lib/todo.ts`](../../src/lib/todo.ts), [`CONTEXT.md`](../../CONTEXT.md#L143-L145).
- Obecny renderer generuje zwykłe listy HTML bez kontrolek i bez endpointów akcji: [`src/lib/dailySummaryRenderer.ts`](../../src/lib/dailySummaryRenderer.ts).

Wniosek: po stronie domeny istnieje już podstawowa semantyka „ukończ zadanie”, ale potrzebna byłaby osobna warstwa identyfikowania akcji pochodzącej z maila.

## Wariant A — zwykły HTML i link do akcji

### Przepływ

```text
Daily Summary
  -> [Gotowe] przy konkretnym zadaniu
  -> GET /email-actions/todo/<token>  (bez zmiany stanu)
  -> strona potwierdzenia Daily
  -> POST /email-actions/todo/<token>
  -> serwer weryfikuje token i usuwa/oznacza zadanie jako ukończone
```

To jest wariant rekomendowany jako pierwszy. Nie wymaga specjalnego formatu wiadomości ani rejestracji nadawcy w Gmailu. Zwykła wersja HTML i wersja tekstowa mogą zawierać ten sam adres akcji.

### Dlaczego `GET` nie powinien od razu kończyć zadania

RFC 9110 definiuje `GET` jako metodę bezpieczną, zasadniczo tylko do odczytu, i wyjaśnia, że właśnie dzięki temu roboty, prefetching i automatyczne pobieranie linków mogą działać bez obawy o zmianę stanu. Specyfikacja mówi też wprost, że zasób wykonujący niebezpieczną akcję pod parametrem URI musi wyłączyć tę akcję dla bezpiecznej metody `GET`.

Źródło: [RFC 9110, sekcja 9.2.1 Safe Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1).

Dlatego samo otwarcie linku w mailu nie powinno usuwać zadania. W przeciwnym razie automatyczne pobranie linku przez narzędzie bezpieczeństwa lub podgląd wiadomości może oznaczyć zadanie jako gotowe bez świadomego działania użytkownika.

### Token i bezpieczeństwo

Link nie powinien zawierać wyłącznie przewidywalnych wartości typu `userId` i `taskId`. Rekomendowany jest losowy, krótko ważny token capability, powiązany po stronie serwera z:

- użytkownikiem;
- konkretnym zadaniem;
- opcjonalnie konkretną wysyłką/okazją Daily Summary;
- czasem wygaśnięcia i statusem unieważnienia.

Token należy traktować jak sekret typu „kto go posiada, może wykonać tę jedną akcję”. Warto przechowywać po stronie serwera jego hash, ograniczyć czas ważności, nie logować pełnego tokenu i unieważnić go po usunięciu konta lub zadania. Endpoint powinien być idempotentny: ponowne kliknięcie ma zwrócić „już gotowe” albo „zadanie nie jest już aktywne”, a nie wykonać inną operację.

Jeżeli Daily wymagałoby zalogowania użytkownika, token może tylko wskazywać zadanie, a właściwa operacja może wymagać bieżącej sesji. Jeżeli celem jest działanie bez logowania, token jest czasowym bearer credential i trzeba zaakceptować ryzyko przekazania go osobie, która uzyska dostęp do maila.

## Wariant B — AMP for Email

AMP for Email umożliwia formularze i akcje w samej wiadomości. Dokumentacja `amp-form` pokazuje formularz z `method="post"` i `action-xhr`, a odpowiedź serwera może wyświetlić stan sukcesu lub błędu w mailu: [AMP `amp-form`](https://amp.dev/documentation/components/amp-form).

AMP nie zastępuje zwykłego maila, tylko dodaje trzecią część MIME `text/x-amp-html` obok `text/plain` i `text/html`. Klient bez obsługi AMP używa fallbacku HTML/text: [struktura i rendering AMP email](https://amp.dev/documentation/guides-and-tutorials/learn/email-spec/amp-email-structure).

### Ograniczenia AMP

- Oficjalna lista AMP wymienia obecnie AOL Mail, FairEmail, Gmail, Mail.ru i Yahoo Mail jako wspierane klienty; nie należy traktować tego jako uniwersalnego zachowania całego ekosystemu pocztowego: [Supported Email Platforms](https://amp.dev/support/faq/email-support).
- Gmail wymaga rejestracji każdego adresu nadawcy osobno i produkcyjnego maila do weryfikacji: [rejestracja nadawcy dynamicznych maili](https://developers.google.com/workspace/gmail/ampemail/register).
- Gmail wymaga dla AMP m.in. poprawnej autentykacji DKIM/SPF, TLS oraz CORS dla endpointów `amp-list`/`amp-form`: [Gmail security requirements](https://developers.google.com/workspace/gmail/ampemail/security-requirements).
- Żądania XHR z AMP w Gmailu są proxy'owane i nie zawierają cookies. Google zaleca kryptograficznie bezpieczne tokeny ograniczone czasowo i zakresowo, przekazane w URL: [uwierzytelnianie żądań AMP](https://developers.google.com/workspace/gmail/ampemail/authenticating-requests).
- Gmail może przestać wyświetlać część AMP po określonym czasie; dokumentacja opisuje 30-dniowy okres używalności i wymaga fallbacku HTML/text.

W praktyce AMP pozwoliłby zrobić checkbox i aktualizację stanu bez opuszczania Gmaila, ale wymaga osobnego renderera AMP, trzeciej części MIME, endpointu CORS, tokenów oraz testów i rejestracji. Obecny adapter Resend nie wysyła takiej części — jego kod wysyła tylko `html` i `text`, a dokumentowany endpoint Resend opisuje te pola jako wersję HTML i plain text: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email). Jest to więc osobny projekt integracyjny, a nie mała zmiana w obecnym rendererze.

## Wariant C — Outlook Actionable Messages

Outlook ma osobny mechanizm kart Adaptive Card/Actionable Message. `Action.Http` może wykonać `GET` albo `POST` na publicznym endpointcie po akcji użytkownika; Microsoft zaleca, aby endpoint przyjmował `POST` i weryfikował JWT w nagłówku `Authorization`: [Action.Http i implementacja Web API](https://learn.microsoft.com/en-us/outlook/actionable-messages/adaptive-card#actionhttp).

Outlook może także odświeżyć kartę po zmianie stanu. Dokumentacja wskazuje wprost przypadek „task status” oraz opisuje nagłówki `CARD-UPDATE-IN-BODY` i `CARD-ACTION-STATUS`: [odświeżanie actionable message](https://learn.microsoft.com/en-us/outlook/actionable-messages/adaptive-card#refresh-cards).

To rozwiązanie jest ograniczone do wspieranych klientów i skrzynek Exchange Online/Outlook.com; Microsoft publikuje osobną tabelę dostępności dla Outlook Web, Microsoft 365 Apps, Mac, iOS i Android oraz zaznacza ograniczenia niektórych klientów mobilnych: [Outlook Actionable Messages — version requirements](https://learn.microsoft.com/en-us/outlook/actionable-messages/#outlook-version-requirements-for-actionable-messages).

Outlook Actionable Messages i AMP nie są tym samym formatem. Budowanie obu oznaczałoby dwa renderery, dwa modele uwierzytelniania i osobny fallback. Dla obecnego Daily, którego użytkownicy logują się przez Google, nie ma dobrego powodu, aby zaczynać od Outlook-specific integration bez potwierdzonego zapotrzebowania na Outlook.

## Porównanie

| Wariant | Działa w zwykłym HTML maila | Akcja bez opuszczania skrzynki | Zmiana po stronie Daily | Ocena dla pierwszej wersji |
| --- | --- | --- | --- | --- |
| Link `Gotowe` -> strona Daily -> `POST` | Tak, jako fallback linku | Nie | Mała/średnia | **Rekomendowany** |
| AMP for Email | Tylko fallback HTML/text | Tak, w obsługiwanych klientach | Duża: MIME, CORS, tokeny, rejestracja | Późniejszy eksperyment |
| Outlook Actionable Message | Tylko fallback HTML/text | Tak, w obsługiwanym Outlooku | Duża: Adaptive Card, JWT, rejestracja | Tylko przy popycie Outlook |
| Odpowiedź na maila `DONE <id>` | Zależne od inbound maila | Nie | Duża: odbiór, parser, antyspam, mapowanie | Nie rekomenduję |

## Rekomendacja projektowa dla Daily

### Etap 1 — mały, interoperacyjny MVP

1. Dodać do każdego aktywnego Todo Task wizualne `☐` i przycisk/link `Gotowe`.
2. Przy generowaniu maila wygenerować osobny token dla każdego zadania; nie wkładać do linku samego ID użytkownika i zadania.
3. Dodać endpoint `GET`, który pokazuje nazwę zadania i stronę potwierdzenia bez modyfikowania danych.
4. Dodać `POST`, który atomowo kończy zadanie, sprawdza token, użytkownika, wygaśnięcie i bieżący stan zadania.
5. Zwracać czytelne stany: `Gotowe`, `Już wykonane`, `Link wygasł`, `Zadanie nie istnieje`.
6. Zachować obecny HTML/text fallback i link do aplikacji dla użytkowników, którzy chcą wykonać kilka operacji naraz.

Najważniejszy efekt produktowy będzie taki, że użytkownik może wykonać akcję z maila i nie musi szukać zadania w aplikacji. Nie będzie jednak aktualizacji checkboxa w już otwartej statycznej wiadomości; po kliknięciu aktualny stan można pokazać na stronie Daily.

### Etap 2 — dopiero po potwierdzeniu potrzeby

Jeśli użytkownicy wyraźnie oczekują prawdziwego checkboxa w Gmailu, można dodać AMP MIME part i osobny renderer. Powinien on nadal używać tego samego bezpiecznego modelu tokenów i tego samego endpointu domenowego co wariant HTML.

Jeśli istotna będzie obsługa Microsoft 365/Outlook, trzeba przygotować osobny renderer Adaptive Card i endpoint weryfikujący token Microsoftu. Nie należy próbować udawać, że jeden interaktywny format będzie działał identycznie w Gmailu, Outlooku, Apple Mail i klientach mobilnych.

## Konkluzja

**Tak — informacja może automatycznie trafić do Daily.** Najlepszy pierwszy krok to bezpieczny link `Gotowe` przy każdym zadaniu, który prowadzi do kontrolowanego `POST` w aplikacji. **Checkbox bezpośrednio w mailu jest możliwy, ale tylko warunkowo** przez AMP lub Outlook Actionable Messages i wymaga osobnego toru wysyłki oraz obsługi klientów pocztowych.

Brak zmian w kodzie w ramach tego researchu.
