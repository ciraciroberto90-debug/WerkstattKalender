# Roll-out-Liste

Was noch zu tun ist – Robertos Merkzettel. Diese Datei liegt im Git und
überlebt damit jede Sitzung.

**Auf Zuruf** („zeig mir die Liste") wird sie kurz vorgelesen: nur die offenen
Punkte, ohne Umschweife. Neue Aufgaben kommen unten dazu, erledigte wandern
nach unten in „Erledigt" statt gelöscht zu werden – so bleibt nachvollziehbar,
was schon durch ist.

Stand: 30.07.2026

---

## Auf den Rechnern einspielen

- [ ] **`cockpit-server.ps1` austauschen** – im Cockpit-Ordner. Bringt zwei
      Dinge: Dateien öffnen sich per Klick direkt (statt nur Pfad kopieren),
      und `127.0.0.1` wird auf `localhost` umgeleitet, damit der gemerkte
      Dateiverweis nie verlorengeht.
      **Danach das schwarze Fenster einmal schließen und neu starten** – sonst
      läuft der alte Dienst weiter.
- [ ] **Neue `Werkstatt_Kalender_TPM.html`** in den Netzwerkordner. Enthält die
      Linkreihe oben in der Übersicht (RC/AR). Kein Anwählen der JSON nötig,
      F5 genügt.

## Vor der Mail an die Kollegen

- [ ] **Ordnernamen prüfen:** In der Klickanleitung steht der geteilte
      OneDrive-Ordner als **`Werkstatt`**. Heißt er anders, eine Zeile ändern
      (`tools/klickanleitung.js`, Konstante `ORDNER`) und
      `node tools/klickanleitung.js` laufen lassen.
- [ ] **Cockpit-Ordner in den geteilten OneDrive-Ordner legen** – dorthin, wo
      `werkstatt-kalender-daten.json` liegt.
- [ ] **Einmal auf dem eigenen Rechner durchspielen** mit dem Paket aus dem
      OneDrive-Ordner, nicht mit dem lokalen. Dann erst die Mail.
- [ ] **Mail verschicken** – Text steht in
      `arbeitsplatz/EMAIL-AN-KOLLEGEN.md`, PDF anhängen
      (`doku/Werkstatt-Cockpit-Einrichtung.pdf`).

## Aufräumen im Datenordner

- [ ] **Zwei Sicherungsdateien `…_2026-07-28`** – vorher `Selbsttest.cmd`
      laufen lassen und die Eintragszahlen vergleichen. Erst wenn die aktuelle
      Datei mindestens so viele Einträge hat, können sie weg.
- [ ] **`werkstatt-stoerungen.json` ist rund 1 KB**, also praktisch leer.
      Prüfen, ob das so gewollt ist oder ob eine falsche Datei verbunden wurde.

## Offene Entscheidungen

- [ ] **Excel-Anbindung (OEE / Schichtpläne).** Gemessen ist: Chrome liest eine
      `.xlsx` ohne fremde Bibliothek (12 ms klein, 2,0 s bei 10 950 Zeilen).
      Gebraucht wird noch: die Datei oder ein Bild der obersten Zeilen, und was
      auf der Übersicht stehen soll (gestern? laufender Monat? Wochenverlauf?).
      Geplant: nur anzeigen, nicht zurückschreiben, Datei über den
      Ausliefer-Dienst statt Anwählen auf jedem Rechner.

---

## Erledigt

- [x] Klickanleitung als PDF, eine Seite, mit echten Bildschirmfotos
- [x] Autostart ist eine echte Wahl – „nein" nimmt ein früheres „ja" zurück
- [x] Zahnrad als festes Symbol der Verknüpfung (`shell32.dll,314`)
- [x] Startpaket-ZIP wird gebaut statt von Hand gepackt (`tools/startpaket-bauen.js`)
- [x] Linkbereich angelegt, je Kürzel eine Sammlung, nur für Bearbeiter
- [x] Linkbereich als Reihe runder Symbole oben in der Übersicht („Meine Links"),
      flach gehalten (gemessen 85 px), ein Klick pro Link
- [x] Dateien öffnen sich direkt über den Ausliefer-Dienst
- [x] 60 Symbole für die Links, nach Themen geordnet
