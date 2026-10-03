# 03 — Design System

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
