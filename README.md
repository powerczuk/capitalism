# Wielka Hossa

Przeglądarkowa gra ekonomiczna: zakładasz spółkę, otwierasz sklepy, budujesz
fabryki, farmy i kopalnie, rozwijasz marki i technologie, grasz na giełdzie —
a komputerowi rywale robią to samo, na czterech poziomach trudności.

Świat gry widać w **izometrycznym 3D**: mapa kraju z miastami, a w każdym
mieście ulice, działki, zabudowa i Twoje obiekty, które rosną razem z firmą.

Gra jest napisana w czystym JavaScripcie (moduły ES), **bez frameworka i bez
kroku budowania**. Cała symulacja działa także poza przeglądarką, więc można ją
testować i balansować z linii poleceń. Widok 3D rysuje
[three.js](https://threejs.org) dołączony do repozytorium jako jeden plik;
wszystkie modele powstają w kodzie — w grze nie ma ani jednej tekstury czy
pliku z modelem.

## Szybki start

```bash
npm start            # http://localhost:5173
```

Wystarczy dowolny serwer plików statycznych (np. `python3 -m http.server`) —
`npm start` uruchamia tylko mały serwer z `scripts/serve.mjs`. Gra nie ma
zależności do instalowania; `npm install` jest potrzebne wyłącznie do
opcjonalnej wersji jednoplikowej i do odświeżenia kopii three.js.

```bash
npm test             # testy silnika, zasad, zapisów, giełdy, AI, planu miast i modeli 3D
npm run sim          # symulacja AI kontra AI — stanowisko do balansu
npm run check        # tabela ekonomii produktów (koszty, ceny, marże)
npm run build        # dist/wielka-hossa.html — cała gra w jednym pliku
npm run test:e2e     # test w przeglądarce (wymaga Playwrighta, patrz niżej)
npm run vendor       # odświeża vendor/three.min.js z node_modules
```

Wersję z `npm run build` można otworzyć prosto z dysku, wysłać mailem albo
wrzucić na dowolny hosting.

**Hosting:** repozytorium jest gotową stroną statyczną — wystarczy opublikować
jego katalog główny (GitHub Pages, Vercel, Netlify, zwykły serwer WWW).
Niczego nie trzeba budować ani konfigurować.

## Jak się gra

1. Na **mapie** kliknij miasto, a w nim jedną z podświetlonych wolnych
   działek, i zbuduj sklep (supermarket, dom towarowy albo salon
   elektroniki).
2. Postaw towar na **półkach** — na początek z importu — i uruchom czas
   (przyciski tempa u góry, spacja, klawisze 1–4). Ceny możesz ustawiać sam
   albo włączyć **auto-cenę**: asystent codziennie szuka najbardziej
   opłacalnej ceny, reagując na podaż (własna produkcja, która nie nadąża),
   popyt (kolejki, mody, koniunktura) i ceny konkurencji, i pisze na półce,
   czym się kieruje.
3. Gdy sklepy zarabiają, zbuduj **fabrykę**, potem **farmy i kopalnie**:
   własny łańcuch dostaw obniża koszty i podnosi jakość.
4. **Reklama** buduje markę, **centrum badawcze** podnosi technologię.
5. Na **giełdzie** kupujesz akcje rywali, emitujesz lub skupujesz własne;
   kto zbierze ponad połowę akcji spółki, może ją przejąć.

Pełniejszy opis mechanik jest w grze, w widoku **Poradnik**.

### Świat 3D

| Co | Jak |
| --- | --- |
| Przesuwanie | przeciągnij myszą lub palcem; strzałki, gdy mapa ma fokus |
| Przybliżanie | kółko myszy, szczypnięcie, przyciski `+` `−` |
| Obrót o ćwierć | przyciski na pasku, klawisze `Q` i `E` |
| Wejście do miasta | kliknij miasto na mapie kraju; strzałka przy nazwie wraca |
| Budowa | kliknij wolną działkę (przycisk działek je podświetla) |
| Własny obiekt | kliknij go albo jego nazwę — otwiera się panel zarządzania |
| Obiekt rywala | kliknij — karta mówi, czyj jest (`Esc` ją zamyka) |
| Dane miasta | przycisk listy otwiera szufladę z dzielnicami i rynkiem |

Budynki mają kolor spółki, rosną z każdym poziomem rozbudowy, a w trakcie
budowy stoją w rusztowaniach. Miasto zabudowuje się wraz z liczbą
mieszkańców. Ciemny motyw interfejsu to w świecie gry noc.

Kliknięcie trafia w to, co widać: budynek łapie się po jego bryle, a działka
schowana za wieżowcem nie da się kliknąć „przez” niego — wystarczy obrócić
widok. Nazwy miast i własnych obiektów są też przyciskami dla klawiatury.

Przycisk mapy na pasku przełącza na **widok płaski** (2D) — ten sam, który
włącza się sam, gdy przeglądarka nie obsługuje WebGL. Wybór jest
zapamiętywany.

### Rywale

| Poziom | Jak gra |
| --- | --- |
| Nowicjusz | Powoli otwiera sklepy, handluje importem po stałej marży. |
| Przedsiębiorca | Dopasowuje ceny do rynku, stawia pierwsze fabryki, trochę reklamuje. |
| Rekin biznesu | Optymalizuje ceny, buduje pełne łańcuchy dostaw, bada, reklamuje, bierze kredyt. |
| Magnat | Wszystko powyższe szybciej i precyzyjniej, do tego wrogie przejęcia na giełdzie. |

Niezależnie od poziomu każdy rywal ma **charakter** (Kupiec, Przemysłowiec,
Innowator, Dyskonter, Kreator marek, Finansista), który decyduje o tym, w co
lubi inwestować. AI **nie oszukuje**: wydaje polecenia przez dokładnie ten sam
interfejs co gracz i płaci te same ceny.

Poziom i charakter każdego rywala (do siedmiu) wybierasz w formularzu nowej
gry. Opcja **Tylko obserwuj** uruchamia rozgrywkę bez własnej spółki — dobry
sposób, żeby zobaczyć, jak różne poziomy radzą sobie ze sobą.

## Struktura projektu

```
index.html              punkt wejścia (ładuje src/main.js)
src/
  engine/               jądro niezależne od tematu gry
    game.js             stan świata, pętla dnia, polecenia, zapis/odczyt
    content.js          rejestry treści + wyprowadzanie i walidacja danych
    registry.js rng.js events.js calendar.js util.js
  sim/                  zasady symulacji (systemy + polecenia)
    market.js           model popytu — czyste funkcje
    retail.js supply.js production.js construction.js
    finance.js accounting.js stocks.js brand.js research.js
    economy.js world.js worldEvents.js goals.js company.js
    diagnostics.js stats.js balance.js
  content/              dane gry: produkty, receptury, budynki, miasta,
                        wydarzenia, cele, nazwy spółek
  ai/                   komputerowi gracze
    difficulty.js       poziomy trudności
    personalities.js    charaktery
    controller.js       tura AI i kontekst decyzyjny
    analysis.js         wspólna „matematyka biznesowa”
    modules/            moduły zachowań (ceny, półki, zaopatrzenie,
                        inwestycje, fabryki, marketing, badania, giełda…)
  ui/                   interfejs: powłoka, widoki, wykresy, tłumaczenia
  geo/                  plan miasta (ulice, działki, zabudowa) — czyste dane
  ui3d/                 świat 3D
    stage.js            renderer, kamera izometryczna, światło, sterowanie
    kit.js palette.js   zestaw do modelowania w kodzie i paleta barw
    models/             modele: budynki gry, zabudowa miasta, rekwizyty
    infra.js            teren, woda, ulice, mosty, port
    cityScene.js        miasto zsynchronizowane ze stanem gry
    countryScene.js     mapa kraju
    world.js            spina sceny z interfejsem
  i18n/                 teksty interfejsu (pl, en)
  mods/                 mody ładowane z grą (przykład: coffee.js)
  styles/               arkusze stylów
  setup.js              składa treść + zasady + AI + mody w jedną całość
vendor/                 three.js (jeden plik ES, licencja MIT)
dev/                    podglądy do pracy nad grafiką: models.html, city.html
scripts/                serwer, symulator, tabela ekonomii, build, test e2e
tests/                  testy node:test
docs/MODDING.md         jak rozbudowywać grę
```

## Architektura w pigułce

- **Stan gry to zwykły obiekt JSON** (`game.state`). Zapis gry to jego kopia,
  a generator liczb losowych trzyma swój stan w tym samym obiekcie — to samo
  ziarno i te same polecenia zawsze dają tę samą rozgrywkę.
- **Systemy** (`content.systems`) przesuwają świat o jeden dzień:
  gospodarka → wydarzenia → budowa → produkcja → zaopatrzenie → handel →
  marka → badania → finanse → giełda → AI → cele.
- **Polecenia** (`content.commands`) to jedyna droga zmiany stanu przez
  gracza i przez AI: `game.exec(companyId, 'build', {...})`. Każde ma
  walidację (`check`) i wykonanie (`run`).
- **Treść jest danymi** w rejestrach: produkty, receptury, typy budynków,
  dzielnice, archetypy miast, wydarzenia, cele, poziomy i charaktery AI,
  moduły AI, widoki interfejsu. Gra bazowa sama jest zestawem takich
  wtyczek.
- **Interfejs** renderuje widoki jako HTML i nakłada zmiany na żywy DOM
  (`ui/dom.js`), bez frameworka. Nie przechowuje własnej kopii stanu gry.
- **Świat 3D nie ma własnych zasad.** Plan miasta (`geo/cityPlan.js`) wynika
  z ziarna gry i tożsamości miasta, więc działki nie zmieniają miejsca, gdy
  miasto rośnie; każdy budynek ma w stanie gry numer działki (`b.lot`).
  Scena tylko rysuje stan i zamienia kliknięcia na zwykłe polecenia
  (`build` z numerem działki, otwarcie panelu). Moduł 3D ładuje się dopiero
  przy pierwszym otwarciu mapy, a testy i symulator go nie potrzebują.
- **Modele to funkcje** rysujące z prostych brył (`ui3d/kit.js`), bez tekstur:
  kolory siedzą w wierzchołkach. Teren, ulice i cała zabudowa miasta między
  działkami to po jednej siatce, a każdy budynek spółki — kilka wywołań
  rysowania; metropolia po dziesięciu latach gry to ok. 200 tys. trójkątów.

## Rozbudowa

Wszystko, co da się dodać, dodaje się przez wtyczkę — obiekt
`{ id, install(content) }` dopisany do listy w `src/mods/index.js`:

```js
export const myMod = {
  id: 'my-mod',
  install(content) {
    content.products.register({
      id: 'pasta', type: 'consumer', category: 'food', icon: '🍝',
      spend: 20, weights: { price: 0.5, quality: 0.35, brand: 0.15 },
      name: { pl: 'Makaron', en: 'Pasta' },
    });
    content.recipes.register({ id: 'pasta', building: 'factory', output: 'pasta', inputs: { flour: 0.5 }, cost: 0.3 });
    content.tune({ retail: { exponent: 3 } }); // zmiana balansu
  },
};
```

Przewodnik z przykładami (nowe produkty i łańcuchy, budynki, wydarzenia,
cele, systemy, polecenia, poziomy i moduły AI, widoki interfejsu, modele 3D)
jest w [docs/MODDING.md](docs/MODDING.md). Działający przykład:
`src/mods/coffee.js`.

## Balans

Liczby strojące grę są w dwóch miejscach:

- `src/sim/balance.js` — reguły (elastyczność popytu, marże importu, kredyt,
  giełda, reklama, badania…),
- `src/content/*.js` — dane (ceny i zapotrzebowanie produktów, koszty
  budynków, rozmiary miast).

Po zmianie warto uruchomić:

```bash
npm run check                       # czy marże mają sens
npm run sim -- --runs 8 --years 10  # czy drabinka poziomów AI się trzyma
npm test
```

Opcje symulatora są opisane na początku pliku `scripts/simulate.mjs`
(`--years`, `--seed`, `--levels`, `--personas`, `--cities`, `--runs`, `--pnl`,
`--log`, `--no-takeovers`).

## Test w przeglądarce

`npm run test:e2e` przechodzi w bezgłowym Chromium ścieżkę nowego gracza
(z mapy kraju do miasta, kliknięcie działki, sklep), wszystkie widoki,
zarządzanie firmą (fabryka, dostawcy, ceny, giełda), świat 3D (narzędzia,
klikanie, etykiety, mapa płaska bez WebGL) oraz zabezpieczenia: zapis przy
opuszczeniu strony, import zapisu i ekrany awaryjne. Playwright celowo nie
jest zależnością projektu:

```bash
npm i -D playwright && npx playwright install chromium
npm run test:e2e -- --phone
```

## Zapis gry

Gra zapisuje się automatycznie co miesiąc i przy każdym opuszczeniu strony
(także gdy karta w telefonie trafia w tło) w `localStorage` przeglądarki;
z menu można też zapisać ręcznie oraz wyeksportować i zaimportować zapis jako
tekst (np. żeby przenieść grę na inne urządzenie).

Wczytywany zapis jest sprawdzany: plik uszkodzony albo zrobiony z modem,
którego w grze nie ma, zostaje odrzucony z komunikatem i nie rusza ani
trwającej rozgrywki, ani autozapisu. Gdyby w trakcie gry zawiodła któraś
z zasad, zegar się zatrzymuje, a ostatni dobry autozapis zostaje nietknięty.

## Praca nad grafiką

Dwie strony w `dev/` pokazują grafikę bez reszty gry (po `npm start`):

- `dev/models.html` — modele na płycie, na wszystkich poziomach rozbudowy:
  `?only=factory,lab&levels=1,2,3&night=1&rot=1&zoom=40`,
- `dev/city.html` — miasto albo kraj z wygenerowanej rozgrywki:
  `?seed=abc&city=0&days=500&night=1&lots=1` (`city=country` to mapa kraju).

Grafika jest oryginalna i powstaje w całości w kodzie.

## Czcionki i biblioteki

Big Shoulders Display, IBM Plex Sans i IBM Plex Mono (SIL Open Font License)
są serwowane z repozytorium — gra nie wysyła żądań do zewnętrznych serwerów.
Szczegóły: `assets/fonts/LICENSE.md`.

three.js (licencja MIT, `vendor/three.LICENSE`) leży w `vendor/` jako jeden
zminifikowany plik zbudowany skryptem `scripts/vendor-three.mjs` z wersji
przypiętej w `package.json`.
