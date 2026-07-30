# Hinweise für die Arbeit an diesem Projekt

## Die Roll-out-Liste

Offene Aufgaben stehen in **[`ROLLOUT-LISTE.md`](ROLLOUT-LISTE.md)**, nicht im
Gedächtnis einer Sitzung.

- Fragt Roberto nach der Liste („zeig mir die Liste", „was ist noch offen"),
  **kurz** die offenen Punkte nennen – keine Wiederholung der Begründungen.
- Kommt im Gespräch eine neue Aufgabe auf, die nicht sofort erledigt wird,
  gehört sie **in dieselbe Sitzung** in die Datei und in denselben Push.
- Erledigtes wird nach unten in „Erledigt" verschoben, nicht gelöscht.

## Arbeitsweise, auf die Roberto Wert legt

- **Messen statt behaupten.** Jede Aussage über Verhalten (Browser, Dateien,
  Zeiten) wird nachgewiesen, nicht geschätzt. Was nicht gemessen wurde, wird
  als ungemessen gekennzeichnet.
- **Keine IT nötig.** Alles muss ohne Adminrechte, ohne Installation und ohne
  eine Anfrage an die IT laufen. Das ist eine Grundregel von Anfang an.
- **Sync- und Verbindungsfehler sind ein absolutes No-Go.** Änderungen am
  Zusammenführen, Speichern oder an der Dateiverbindung brauchen einen Test,
  der ohne die Änderung fehlschlägt.
- Kommentare und Oberfläche auf **Deutsch**, Kommentare erklären das *Warum*.

## Prüfen vor dem Push

```bash
cd app && npm run build                    # erzeugt Werkstatt_Kalender_TPM.html
bash tests/run-hardness-tests.sh           # Härtetests
node tools/startpaket-bauen.js             # nach jeder Änderung in arbeitsplatz/
```

Die vollständige Liste der Suiten steht im README unter „Für die Entwicklung".
