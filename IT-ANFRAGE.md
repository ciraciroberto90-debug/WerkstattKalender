# Anfrage an die IT: Werkstatt-Cockpit über HTTPS bereitstellen

**Antragsteller:** Werkstattleitung
**Betrifft:** `Werkstatt_Kalender_TPM.html` auf `\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender\`

---

## Worum es geht

Die Werkstatt nutzt eine selbst erstellte Web-Anwendung (Instandhaltungsplanung,
Schichtbuch, Störungserfassung). Sie besteht aus **einer einzigen HTML-Datei**
ohne Server-Anteil: kein Backend, keine Datenbank, keine Installation. Die
Anwendung wird bisher direkt von der Netzwerkfreigabe geöffnet, also über eine
Adresse der Form

```
file://scheudc1/PSG_Gruppe/.../Werkstatt_Kalender_TPM.html
```

Ihre Daten legt sie in zwei JSON-Dateien ab, die im gewohnten Ordner liegen
bleiben. Es werden keine Daten nach außen übertragen.

## Das Problem

Seit dem Chrome-Update auf **Version 147** funktioniert der dauerhafte Dateizugriff
nicht mehr. Gemessen am Arbeitsplatz (Bericht liegt bei):

- Die Anwendung merkt sich die Datei weiterhin korrekt.
- Holt der Browser diesen gemerkten Verweis nach einem Neuladen wieder hervor,
  ist er unbrauchbar: `queryPermission`, `getFile` und `createWritable`
  antworten überhaupt nicht mehr — weder mit einer Freigabe noch mit einer
  Ablehnung noch mit einem Fehler.
- Ein **frisch ausgewählter** Verweis funktioniert dagegen einwandfrei.

Folge: Die Datei muss nach jedem Neuladen der Seite von Hand neu ausgewählt
werden. Ursache ist die Herkunft `file://`, die für den Browser keine feste
Website-Identität darstellt.

### Bereits geprüft und ausgeschlossen

Damit diese Punkte nicht doppelt untersucht werden — alles am betroffenen
Arbeitsplatz nachgemessen:

| Verdacht | Ergebnis |
|---|---|
| Gruppenrichtlinie blockiert den Dateizugriff | **Nein.** `chrome://policy` meldet durchgehend „Keine Richtlinien festgelegt". Der Rechner ist in `scheurich.local` verwaltet, die Richtlinien wurden wenige Minuten zuvor aktualisiert – es ist also keine fehlende Verbindung zur Verwaltung, sondern es ist schlicht nichts gesetzt |
| Anderer Browser hilft | **Nein.** Edge 150.0.4078.99 verhält sich wie Chrome 147.0.7727.117 |
| Vorübergehender Fehler einer Chrome-Version | **Nein.** Edge liegt drei Hauptversionen darüber und zeigt dasselbe |
| Fehler in der Anwendung | **Nein.** Der Verweis wird korrekt gespeichert und überlebt das Neuladen; ein frisch ausgewählter Verweis funktioniert einwandfrei |
| Speicherort der Daten (OneDrive) | **Nein.** Eine Testseite auf dem Firmenlaufwerk zeigt dasselbe Verhalten |
| Lokaler Speicher des Browsers defekt | **Nein.** localStorage und IndexedDB arbeiten normal |

Ausgelöst wurde es durch einen PC-Neustart, bei dem die im Hintergrund
bereitgelegte Browser-Aktualisierung aktiv wurde. An der Anwendung und an den
Einstellungen wurde nichts geändert.

## Was wir brauchen

Die unveränderte HTML-Datei soll statt über den Dateipfad über eine **interne
Website** ausgeliefert werden, mit einer festen Adresse, zum Beispiel:

```
https://werkstatt.scheurich.local/cockpit/
```

Anforderungen im Einzelnen:

1. **Nur statische Auslieferung.** Ein virtuelles Verzeichnis auf einem
   vorhandenen IIS genügt; es kann auf den bestehenden Ordner zeigen. Keine
   Anwendungslogik, keine Datenbank, kein Applikationspool nötig.

2. **HTTPS ist zwingend, `http://` funktioniert nicht.** Die verwendete
   Browser-Schnittstelle (File System Access API) steht ausschließlich in einem
   „sicheren Kontext" zur Verfügung. Nachgemessen:

   | Adresse | Sicherer Kontext | Datei-Schnittstelle |
   |---|---|---|
   | `http://<host>/…` | nein | **nicht vorhanden** |
   | `https://<host>/…` | ja | vorhanden |
   | `file://…` (heute) | ja | vorhanden, aber seit Chrome 147 defekt |

   Ein Zertifikat der internen CA reicht aus, sofern es auf den Clients als
   vertrauenswürdig eingestuft ist.

3. **Die Adresse muss stabil bleiben.** Der Browser knüpft die gemerkten
   Dateifreigaben an die Adresse. Ändert sie sich, müssen alle Arbeitsplätze
   ihre Datei erneut auswählen.

4. **Die Datenablage bleibt, wie sie ist.** Die beiden JSON-Dateien bleiben im
   bisherigen Ordner. Der Webserver liefert ausschließlich die HTML-Datei aus
   und hat mit den Daten nichts zu tun.

## Optional vorab: ein billiger Versuch (ungeprüft)

Da die Rechner ohnehin zentral verwaltet werden, wäre vor der Umstellung ein
kurzer Versuch möglich – Aufwand wenige Minuten:

```
FileSystemReadAskForUrls  = ["file://*"]
FileSystemWriteAskForUrls = ["file://*"]
```

**Ehrliche Einordnung:** Diese Richtlinien steuern, ob eine Seite den Zugriff
erfragen *darf*. Ob sie auch das dauerhafte Merken eines Zugriffs über einen
`file://`-Ursprung wiederherstellen, ist **nicht belegt** – wir halten es für
eher unwahrscheinlich. Wenn es klappt, ist das Thema erledigt; wenn nicht, ist
nichts verloren. Prüfen lässt es sich in einer Minute: Seite öffnen, Datei
verbinden, F5 drücken – bleibt die Verbindung, hat es gewirkt.

Die verlässliche Lösung bleibt die HTTPS-Bereitstellung.

## Falls HTTPS nicht kurzfristig möglich ist

Alternativ kann die vorhandene Adresse per Gruppenrichtlinie als
vertrauenswürdig eingestuft werden. Chrome-Richtlinie:

```
OverrideSecurityRestrictionsOnInsecureOrigin = ["http://<host>"]
```

Das ist eine Behelfslösung; die saubere Variante ist HTTPS mit internem
Zertifikat.

## Aufwand und Nutzen

Der Aufwand liegt bei einem virtuellen Verzeichnis und einem Zertifikat. Danach
verhält sich die Anwendung wieder wie vor dem Chrome-Update: einmal verbinden,
und die Verbindung überlebt Neuladen und Browser-Neustart.

Ohne diese Umstellung bleibt die Anwendung benutzbar, verlangt aber nach jedem
Neuladen der Seite ein erneutes Auswählen der Datei.
