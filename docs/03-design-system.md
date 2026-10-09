# 03 — Design System

> **Redesign "scuro premium" (dopo lo Sprint 4)** — prevale su quanto segue
> dove in conflitto. Mockup approvati in Figma (file `iTFdPZJIhQyqta1b5RxJBw`).
>
> - **Tema scuro di default** (`DEFAULT_THEME_PREFERENCE = 'dark'`), chiaro
>   disponibile. Canvas `#0a0b0f`, surface `#13151b`, surface-2 `#1a1d25`,
>   testo `#f3f4f6`; l'azione primaria è bianca su scuro.
> - **Colori delle banche** (token `--bank-revolut`, `--bank-ing`, `--bank-tr`,
>   validati per daltonismo): Revolut viola `#9F53F0`, ING arancione `#E2560A`,
>   Trade Republic blu `#2CA0D4` (in chiaro `#8E44EC`, `#E35D0F`, `#1C8DC4`).
>   Il colore segue la banca (`lib/banks.ts`), non il conto: tutti i conti ING
>   sono arancioni. Le tre banche hanno "carte" sfumate (`BankCard`), gli altri
>   conti righe con barretta colorata (`AccountRow`).
> - **Navigazione a 5 voci**: Home, Movimenti, Importa (il "+" centrale),
>   Conti, Business. Impostazioni dall'icona in alto (mobile) o in basso nella
>   sidebar (desktop).
> - **Linguaggio semplice**: "Ti restano", "Da sistemare", "Dove vanno i soldi".
>   Un movimento si sistema con due tocchi (scelte rapide,
>   `lib/transactions/quick-choices.ts`) e "Ricorda" crea una regola.
> - Raggi: controlli 12px, card 20px. App installabile (manifest + icone).

Carattere: **premium, minimal, tecnico, data-driven**. Lo strumento di un
ingegnere che tiene ai numeri: superfici calme, tipografia precisa, colore
usato solo per significato.

## Tipografia

| Ruolo | Font | Uso |
|---|---|---|
| UI / testo | **Inter** (variabile, `font-feature-settings: "cv11", "ss01"`) | Etichette, paragrafi |
| Numeri | Inter con `tabular-nums` + `slashed-zero` | Ogni importo e percentuale: le colonne restano allineate |
| Display | Inter Display 600, tracking −2% | Hero patrimonio, titoli pagina |
| Codice/ID | JetBrains Mono | IBAN mascherati, hash, dettagli import |

Scala (rem): 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.5 · 2 · 3 (hero).
L'importo hero usa centesimi in peso minore e dimensione 60%: `€ 48.215`,`32`.

## Colore (token CSS, definiti per light e dark)

Neutri a base grigio-ardesia leggermente freddo; un solo accento.

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--bg` | `#F7F8FA` | `#0B0D10` | Sfondo app |
| `--surface` | `#FFFFFF` | `#12151A` | Card |
| `--surface-2` | `#F1F3F6` | `#181C22` | Hover, input |
| `--border` | `#E4E7EC` | `#232830` | Bordi 1px |
| `--text` | `#0E1116` | `#ECEEF2` | Testo primario |
| `--text-muted` | `#5B6472` | `#8A93A3` | Etichette |
| `--accent` | `#4F5BD5` | `#7C86F0` | Azioni primarie, focus, selezione |
| `--positive` | `#1F8A5B` | `#3DD68C` | Entrate, variazioni favorevoli |
| `--negative` | `#D1393F` | `#FF6369` | Spese, variazioni sfavorevoli |
| `--warning` | `#B7791F` | `#F5B544` | Possibili duplicati, bassa confidenza |

Regole: rosso/verde mai come unico segnale (anche segno `+/−` e icona freccia);
"più spesa" è sfavorevole anche se il numero sale. Palette categorie: 10 tinte
desaturate (Radix Colors step 9) assegnate dall'utente; grafici con massimo 6
serie + "Altro". Contrasto testo ≥ 4.5:1 verificato in entrambi i temi.

> **Sprint 12 — contrasto verificato con axe (WCAG 2.1 AA) su tutte le pagine.**
> Valori corretti in `app/globals.css`: `--fg-subtle` light `#646C7C`, dark
> `#858C99`; light `--positive` `#177048`, `--negative` `#BF2F37`,
> `--warning` `#94600F` (≥ 4.5:1 anche sulle superfici `-soft` e `surface-2`).
> Gli importi con centesimi piccoli (`Money emphasizeUnits`) hanno
> `role="img"` e l'importo intero come `aria-label`.

## Spazi, forme, profondità

- Griglia 4 px; padding card 20 (mobile) / 24 (desktop); gap sezioni 32.
- Raggi: 8 (controlli), 14 (card), 20 (sheet mobile).
- Ombre quasi assenti in dark; in light `0 1px 2px rgb(16 24 40 / .04)`.
  Profondità data da superficie + bordo, non da ombre pesanti.
- Layout: contenuto max 1280 px; dashboard a 12 colonne (desktop), 1 colonna (mobile).

## Movimento

- Durate 120 ms (hover), 200 ms (apertura sheet/dialog), 320 ms (ingresso grafici).
- Easing `cubic-bezier(.2, .8, .2, 1)`.
- Numeri hero: count-up una sola volta al primo caricamento, non a ogni filtro.
- `prefers-reduced-motion`: tutte le animazioni ridotte a dissolvenza istantanea.
- Ingresso pagina (Sprint 12): `animate-enter`, 260 ms, opacità + 6 px verso l'alto,
  da `app/(app)/template.tsx` a ogni cambio pagina.

## Grafici

- Assi minimi: nessuna griglia verticale, griglia orizzontale tratteggiata al 40%.
- Importi abbreviati sugli assi (`12k`), completi nei tooltip (`€ 12.430,50`).
- Tooltip: data/periodo, valore per serie, variazione rispetto al periodo precedente.
- Cash flow: area entrate (positive), area spese (negative), linea risparmio (accent).
- Donut spese: centro con totale; click su fetta o riga → transazioni filtrate.
- Stato vuoto esplicito ("Nessun dato nel periodo") invece di un grafico piatto.

## Responsive

- `< 1024 px`: bottom navigation a 5 voci (Home, Transazioni, Patrimonio,
  Analytics, Impostazioni), target touch ≥ 44 px, sheet dal basso per
  modifiche e filtri, FAB "Importa".
- `≥ 1024 px`: sidebar fissa 248 px (collassabile a 72), tabelle dense, drawer laterale.
- Safe area iOS (`env(safe-area-inset-*)`) per PWA installata.

## Accessibilità

Focus visibile (anello accent 2 px), navigazione da tastiera completa (Radix),
etichette ARIA sui grafici con riepilogo testuale, tabelle con intestazioni
reali, lingua `it`.

## Privacy in UI

Interruttore "nascondi importi" (scorciatoia `H`): `Money` sostituisce le cifre
con `••••` — utile mostrando l'app in pubblico.

## Implementazione (Sprint 1)

- Token in `app/globals.css`: variabili CSS su `:root` / `[data-theme='dark']`,
  esposte a Tailwind 4 con `@theme inline` (`bg-surface`, `text-fg-muted`,
  `text-positive`…). Variante `dark:` legata a `data-theme`.
- Tema: preferenza automatica/chiara/scura in `localStorage`, applicata prima
  del primo paint da uno script inline autorizzato dal nonce CSP.
- Font Inter Variable servito localmente (`@fontsource-variable/inter`): nessuna
  richiesta a Google Fonts.
- Importi: separatore delle migliaia sempre presente (`useGrouping: 'always'`),
  perché CLDR it-IT non raggruppa i numeri a 4 cifre ("1234,56").
- Primitivi in `components/ui`: `Button`, `Card`/`CardHeader`, `Badge`, `Field`,
  `Money`, `DeltaBadge`, `KpiCard`, `Skeleton`, `Spinner`, `EmptyState`,
  `ErrorState`, `PageHeader`. Layout in `components/layout`: `AppShell`,
  `Sidebar`, `BottomNav`, `ThemeToggle`, `UserBadge`, `SignOutButton`, `ComingSoon`.
- Grafico saldo (`features/accounts/components/balance-chart.tsx`): SVG
  disegnato in proprio, serie singola nel colore accent, linea a gradini da
  2px (il saldo cambia solo a fine giornata, nessuna interpolazione), area al
  10%, griglia hairline, punto finale con anello di superficie, mirino +
  tooltip al passaggio o con le frecce, tabella dati sempre disponibile. I
  grafici interattivi multi-serie della dashboard useranno Recharts (Sprint 6).
- Stati: `loading.tsx` (skeleton), `error.tsx` (con Riprova e riferimento
  opaco), `not-found.tsx`, `global-error.tsx`; "—" indica assenza di dati, mai zero.
