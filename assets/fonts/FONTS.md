# Self-hosted fonts, provenance

All files in this directory are SIL Open Font License (OFL) webfonts from
the Google Fonts latin subsets, served locally so the site makes zero
remote font requests.

V3 ships ONE family: Archivo, a modern grotesk with a variable width
axis. The condensed cut (font-stretch below 100%) sets headlines and the
wordmark; the regular cut sets data and body. Mono is the system mono
stack, reserved for scores, times, and the draft clock. Anton and Inter
left the shipped set in v3 (rotation 23, R23-D).

| file | family | style | axes | role here |
|---|---|---|---|---|
| archivo-latin-normal-var.woff2 | Archivo | normal | wght 100 to 900, wdth 62% to 125% (latin subset) | the whole type system |
| archivo-latin-ext-normal-var.woff2 | Archivo | normal | wght 100 to 900, wdth 62% to 125% (latin-ext subset) | names and words outside the latin subset |

## Rotation 140 addition: Saira, the Stage Profile voice (design consult, FA1)

| file | family | style | axes | role here |
|---|---|---|---|---|
| saira-latin-normal-var.woff2 | Saira | normal | wght 100 to 900, wdth 50% to 125% (latin subset) | the whole type system from rotation 140: status and wordmark at 125% width, reading at 100% |

- Source file: the latin subset woff2 served by the Google Fonts css2
  request the design draft pointed at
  (family=Saira:wdth,wght@75..125,400..800), fetched once at build
  time and self-hosted here, so the shipped site makes zero remote
  font requests. The @font-face in assets/css/profile.css declares
  the requested range (weight 400 to 800, stretch 75% to 125%); the
  file itself carries the family's full axes, measured below.
- File on the font CDN: memwYa2wxmKQyNknTZM.woff2 (saira v23).
  SHA-256: d5f1ee1ce85a2f6611d76bcd98738132f4706b099dc167f02c2093a1ec5eb975
- Metrics (fontTools): units per em 1000, hhea ascent 1135,
  descent -439; fvar axes wght 100 to 900, wdth 50% to 125%.
- License: SIL Open Font License 1.1.
- Archivo stays on disk and in this record; profile.css retires it
  from the presented site per the design ("Archivo goes"), it is not
  deleted.
