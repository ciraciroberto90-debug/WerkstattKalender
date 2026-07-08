# 🔧 WerkstattKalender

Ein Terminkalender für die Kfz-Werkstatt – gemacht für den Werkstattleiter.
Läuft komplett im Browser, **ohne Installation, ohne Internet, ohne Anmeldung**.

## So startest du das Programm

1. Die Datei `index.html` herunterladen (oder das ganze Repository).
2. Doppelklick auf `index.html` – fertig. Der Kalender öffnet sich im Browser.

Alle Daten werden **lokal im Browser** gespeichert (localStorage) und bleiben
auch nach dem Schließen erhalten – solange derselbe Browser auf demselben
Rechner verwendet wird.

> **Tipp:** Über GitHub Pages (Settings → Pages → Branch auswählen) lässt sich
> der Kalender auch als Webseite aufrufen, z. B. vom Tablet in der Werkstatt.

## Funktionen

- **Wochen-, Tages- und Listenansicht** mit Zeitraster von 7:00 bis 18:00 Uhr (Mo–Sa)
- **Termine anlegen** per Klick auf eine freie Zeit oder über „+ Neuer Termin":
  Kunde, Telefon, Fahrzeug, Kennzeichen, Art der Arbeit, Dauer, Mechaniker, Notizen
- **Arbeits-Kategorien** mit Farben: Inspektion, Reparatur, Reifen, HU/AU,
  Elektrik, Karosserie, Sonstiges
- **Status je Termin**: Geplant → In Arbeit → Fertig → Abgeholt
- **Mechaniker verwalten** und Terminen zuweisen – mit Warnung bei
  Doppelbelegung desselben Mechanikers
- **Suche** über Kunde, Kennzeichen, Fahrzeug, Mechaniker und Notizen
- **Tagesübersicht** oben: Termine heute, offen, fertig, Termine der Woche
- **Drucken** der aktuellen Ansicht (z. B. Tagesplan für die Werkstatt)
- **Datensicherung**: Alle Daten als Datei sichern (⬇) und wieder laden (⬆) –
  so lassen sich die Termine auch auf einen anderen Rechner übertragen

## Erste Schritte

Beim ersten Start sind drei Beispiel-Termine eingetragen, damit man sieht, wie
es aussieht. Einfach anklicken und löschen, sobald sie nicht mehr gebraucht
werden. Unter **👥 Mechaniker** die eigenen Mitarbeiter eintragen.

## Anpassen

Öffnungszeiten und Kategorien stehen am Anfang des `<script>`-Blocks in
`index.html`:

```js
const START_HOUR = 7;    // Werkstatt öffnet
const END_HOUR   = 18;   // Werkstatt schließt
```

Dort können auch die Kategorien (`KATEGORIEN`) mit Namen und Farben geändert
werden.
