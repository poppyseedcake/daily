# Daily — propozycje Open Graph (PROTOTYP)

Pytanie: który obraz najlepiej przedstawia Daily w zajawce udostępnionego linku?

Trzy propozycje wygenerowano wbudowanym narzędziem `imagegen`. Obrazy mają faktycznie 1730 × 909 px (około 1,903:1); prompt prosił o 1200 × 630 px. Zachowano oryginalne pliki PNG bez kadrowania. Tekst każdej grafiki: „Daily”, „your everyday kickoff”, „dailykickoff.eu”.

| Wariant | Kierunek | Plik |
| --- | --- | --- |
| A | Spokojny poranek | [01-spokojny-poranek.png](../../static/og/prototype/01-spokojny-poranek.png) |
| B | Jedna wiadomość | [02-jedna-wiadomosc.png](../../static/og/prototype/02-jedna-wiadomosc.png) |
| C | Cztery części dnia | [03-cztery-czesci-dnia.png](../../static/og/prototype/03-cztery-czesci-dnia.png) |

Strona podglądu `/prototype/open-graph` i komenda `prototype:og` zostały usunięte z aplikacji. Pliki PNG pozostają zapisem propozycji.

Propozycja A rozwija obecną lekką estetykę Daily. B najszybciej komunikuje dostarczanie podsumowania w jednym mailu. C nawiązuje do geometrycznego znaku czterech sekcji. W B generator zaproponował szeryfową typografię zamiast sans-serif ze specyfikacji — to wariant kierunku graficznego, nie zmiana fontu aplikacji.

Status: trzy propozycje do wyboru; żadna nie została zatwierdzona. Metadane aplikacji nadal wskazują dotychczasowy obraz. Po wyborze można wdrożyć zwycięski plik, a komplet prototypów zachować na osobnej gałęzi zgodnie z umiejętnością `prototype`.

## Prompty

### A — Spokojny poranek

```text
Use case: ads-marketing
Asset type: finished Open Graph image for the Daily web app, landscape 1200 x 630 px, 1.905:1 aspect ratio.
Primary request: Create a premium editorial brand poster about a calm start to the day. Daily sends a personal email combining Weather, Commute, Calendar and Todo. This is proposal A, a spacious light composition with tactile paper sculpture.
Scene/backdrop: warm off-white #f7f8f5, subtle natural paper texture, abundant breathing room.
Subject: enormous confident navy "Daily" typography occupies the left half. Beneath it is "your everyday kickoff". The right half contains one cohesive cut-paper morning still life: a muted warm sun lifting above a sage horizon, a soft cloud, an elegant short winding route with two points, a small calendar sheet and a checked task. Arrange the four motifs as a sculptural scene, not four UI cards. Restrained shallow paper relief and gentle real shadows; clean forms, no busy scenery.
Style/medium: refined editorial design, tactile cut paper, Swiss sans-serif typography; contemporary European independent product branding, composed and friendly.
Composition/framing: asymmetric horizontal layout, strong typographic left half and one integrated illustration on the right. Keep every word and important object inside a 70px safe margin at 1200 x 630 scale. Domain small at bottom left.
Color palette: navy #172d52, sage #c7d6b8, olive #587542, off-white #f7f8f5; limited pale warm-yellow sun and muted pale-blue cloud.
Text (verbatim): "Daily", "your everyday kickoff", "dailykickoff.eu". Use these three strings exactly, in crisp legible sans-serif type. Daily very large, tagline large enough to read in a 600px-wide link preview. No other text.
Constraints: deliver one complete full-bleed opaque landscape poster; no frame, no watermarks, no fake app screenshots, no phone, no human figures, no extra slogans, no generic stock illustration, no invented logo mark.
```

### B — Jedna wiadomość

```text
Use case: ads-marketing
Asset type: finished Open Graph social-sharing image for Daily, landscape 1200 x 630 px, 1.905:1 aspect ratio.
Primary request: Create a visually distinctive premium product poster that explains Daily's core promise through a single physical email metaphor: the whole upcoming day arrives in one email. Daily combines Weather, Commute, Calendar and Todo.
Scene/backdrop: solid deep navy #172d52, understated matte material, clean studio lighting, generous empty space.
Subject: one oversized beautiful off-white open paper envelope in the center-right of the composition, seen frontally with a little depth. Four tall cream and sage paper inserts fan out of the envelope, visibly representing a sun behind a cloud, an elegant driving-route line between two dots, a calendar pictogram, and a checked task. The motifs are large and minimal, with no text on the inserts. The envelope and inserts form one strong silhouette.
Style/medium: sophisticated tactile paper object photography / handcrafted dimensional editorial illustration, subtle folds and paper grain, convincing soft directional light. Modern calm SaaS brand, no shiny plastic, no glossy 3D toy look.
Composition/framing: large off-white "Daily" wordmark in the upper left, the exact tagline below it; sculptural envelope is the main object spanning the lower center and right. Small "dailykickoff.eu" bottom left. Use a clearly different hierarchy from a simple text-left / icon-right poster: oversized envelope dominates the frame and the title sits in the upper left rather than vertically centered. Keep all lettering and essential object tips at least 70px from edges at 1200 x 630 scale.
Color palette: deep navy #172d52 background, off-white #f7f8f5 paper and lettering, sage #c7d6b8 inserts, olive #587542 pictograms, small muted warm-yellow weather accent.
Text (verbatim): "Daily", "your everyday kickoff", "dailykickoff.eu". Exactly these three strings, no labels or additional words. Typography must be very crisp and readable in small link previews.
Constraints: one complete full-bleed opaque wide poster, no border, no watermark, no screen or device mockup, no Gmail branding, no faces, no fake user content, no invented brand mark, no scattered decorative objects.
```

### C — Cztery części dnia

```text
Use case: ads-marketing
Asset type: finished Open Graph image for the Daily app, landscape 1200 x 630 px, 1.905:1 aspect ratio.
Primary request: Create a bold graphic brand poster inspired by Daily's existing four-part geometric identity. Four parts of the day — Weather, Commute, Calendar, Todo — form a single balanced composition. This is proposal C, a flat geometric poster, structurally unlike a sculptural still life or an envelope.
Scene/backdrop: full-bleed four large contiguous geometric fields, a disciplined 2 by 2 modular composition. Upper-left off-white #f7f8f5, upper-right pale sage #c7d6b8, lower-left navy #172d52, lower-right olive #587542. No gaps, no floating UI cards.
Subject: four oversized simplified editorial pictograms integrated into the four outer corners: weather sun/cloud, a winding travel route, calendar sheet, and a checked task. Use circles, arches, rounded squares and quarter-circle forms reminiscent of an existing four-shape brand mark. Keep pictograms at the outer corners and create a large uninterrupted light central horizontal band as a deliberate part of the composition, not a floating pill or badge. Center the enormous navy word "Daily" on this band, with the tagline directly below; domain small centered close to bottom with enough contrast.
Style/medium: crisp flat screen-printed editorial poster, very subtle paper texture, geometric modernist design, strongly typographic, confident and playful but mature. No 3D, no perspective, no realistic landscape.
Composition/framing: symmetrically balanced whole-canvas graphic system with centered headline; large corner geometry, strong center typography, generous central breathing room. All three strings fully inside a 70px safe margin at 1200 x 630 scale. Use sufficient central light area to render every letter and tagline clearly without crossing differently colored fields.
Color palette: only navy #172d52, sage #c7d6b8, olive #587542, off-white #f7f8f5; a tiny muted warm-yellow weather accent is acceptable.
Text (verbatim): "Daily", "your everyday kickoff", "dailykickoff.eu". Exactly these three strings, no extra text. Daily huge and legible at thumbnail size, clean Swiss sans-serif lettering.
Constraints: one complete opaque full-bleed wide poster, no frame, no watermark, no shadowed cards, no device, no UI screenshot, no extra slogan, no invented logo lockup, no human figures.
```
