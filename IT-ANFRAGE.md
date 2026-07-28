> **Stand 28.07.2026: derzeit nicht erforderlich.**
> Das Problem ist ohne die IT gelöst – die App wird über einen kleinen
> Ausliefer-Dienst auf dem jeweiligen Arbeitsplatz bereitgestellt
> (`http://localhost:8765/`, siehe `tools/OHNE-IT-LOKALER-SERVER.md`).
> Dieses Dokument bleibt aufgehoben für den Fall, dass eine zentral verwaltete
> Lösung gewünscht wird oder auf einzelnen Rechnern keine Skripte laufen dürfen.
> Alle Messwerte darin sind unverändert gültig.

---

# Anfrage an die IT: Werkstatt-Cockpit über HTTPS bereitstellen

**Antragsteller:** Werkstattleitung
**Betrifft:** `Werkstatt_Kalender_TPM.html` auf
`\\scheudc1\PSG_Gruppe\16_Technik\01_Scheurich\02_Werkstatt\Arbeitsplanung\Werkstatt_Kalender\`
**Stand:** 28.07.2026 – alle Angaben am betroffenen Arbeitsplatz nachgemessen

---

## Worum es geht

Die Werkstatt nutzt eine selbst erstellte Web-Anwendung für Instandhaltungsplanung,
Schichtbuch und Störungserfassung. Sie besteht aus **einer einzigen HTML-Datei**:
kein Backend, keine Datenbank, keine Installation. Geöffnet wird sie bisher direkt
von der Netzwerkfreigabe, also über eine Adresse der Form

```
file://scheudc1/PSG_Gruppe/.../Werkstatt_Kalender_TPM.html
```

Ihre Daten liegen in zwei JSON-Dateien im gewohnten Ordner. Es werden keine Daten
nach außen übertragen.

## Das Problem

Seit einem Browser-Update (aktiv geworden bei einem PC-Neustart) kann die Anwendung
sich die Datei nicht mehr merken. Sie muss nach **jedem Neuladen der Seite** von Hand
neu ausgewählt werden.

Technisch: Ein Dateiverweis (`FileSystemFileHandle`), der in der IndexedDB abgelegt
und wieder ausgelesen wird, ist danach unbrauchbar – und zwar **still**. Weder
`queryPermission` noch `getFile` noch `createWritable` liefern ein Ergebnis: kein
Erfolg, keine Ablehnung, kein Fehler. Der Aufruf kehrt nicht zurück.

## Der Nachweis

Dieselbe Messung, derselbe Rechner, derselbe Browser, wenige Minuten auseinander.
Der **einzige** Unterschied ist die Adresse, unter der die Seite geöffnet wird:

| Vorgang | Seite über `file://` | Seite über `https://` |
|---|---|---|
| Datei frisch ausgewählt, öffnen | 0 ms ✓ | 9 ms ✓ |
| **Verweis über die IndexedDB zurückgeholt, öffnen** | **keine Antwort in 120 s** | **1 ms ✓** |
| Nach dem Neuladen: Rechteauskunft | keine Antwort in 120 s | `prompt` in 2 ms ✓ |
| Nach dem Neuladen: Zugriff anfordern | keine Antwort in 120 s | `granted` ✓ |
| Danach Datei öffnen | – | 3 ms ✓ |

Über HTTPS verhält sich der Browser also genau so, wie die Anwendung es erwartet:
Der Verweis überlebt, nach dem Neuladen meldet er sauber „noch nicht freigegeben",
und ein Klick des Nutzers stellt den Zugriff wieder her.

### Bereits geprüft und ausgeschlossen

Damit diese Punkte nicht ein zweites Mal untersucht werden:

| Verdacht | Ergebnis |
|---|---|
| Gruppenrichtlinie blockiert den Dateizugriff | **Nein.** `chrome://policy` meldet durchgehend „Keine Richtlinien festgelegt", auf einem in `scheurich.local` verwalteten Rechner, dessen Richtlinien Minuten zuvor aktualisiert wurden |
| Ein anderer Browser hilft | **Nein.** Edge 150.0.4078.99 verhält sich wie Chrome 147.0.7727.117 |
| Vorübergehender Fehler einer Chrome-Version | **Nein.** Edge liegt drei Hauptversionen darüber und zeigt dasselbe |
| OneDrive / Dateien nur online | **Nein.** Die Datei trägt im Explorer den grünen Haken, liegt also lokal |
| Der Speicherort | **Nein.** OneDrive, Firmenlaufwerk und lokale Platte `C:` verhalten sich identisch |
| Langsames Laufwerk | **Nein.** 120 s Frist, zweiter Versuch nach 30 s – es kommt nie eine Antwort |
| Fehler in der Anwendung | **Nein.** Der Verweis wird korrekt gespeichert; ein frisch gewählter Verweis arbeitet einwandfrei, Schreiben eingeschlossen |
| Lokaler Speicher des Browsers | **Nein.** localStorage und IndexedDB arbeiten normal |

## Was wir brauchen

Die unveränderte HTML-Datei soll statt über den Dateipfad über eine **interne
Website** ausgeliefert werden, mit einer festen Adresse, zum Beispiel:

```
https://werkstatt.scheurich.local/cockpit/
```

1. **Nur statische Auslieferung.** Ein virtuelles Verzeichnis auf einem vorhandenen
   IIS genügt; es kann auf den bestehenden Ordner zeigen. Keine Anwendungslogik,
   keine Datenbank, kein eigener Anwendungspool.

2. **HTTPS ist zwingend, `http://` funktioniert nicht.** Die verwendete
   Browser-Schnittstelle (File System Access API) steht nur in einem „sicheren
   Kontext" zur Verfügung. Nachgemessen:

   | Adresse | Sicherer Kontext | Datei-Schnittstelle |
   |---|---|---|
   | `http://<host>/…` | nein | **nicht vorhanden** |
   | `https://<host>/…` | ja | vorhanden und funktionsfähig |
   | `file://…` (heute) | ja | vorhanden, aber Verweise nicht mehr speicherbar |

   Ein Zertifikat der internen CA genügt, sofern es auf den Clients als
   vertrauenswürdig gilt.

3. **Die Adresse muss stabil bleiben.** Der Browser knüpft gemerkte Dateifreigaben
   an die Adresse. Ändert sie sich, müssen alle Arbeitsplätze ihre Datei erneut
   auswählen.

4. **Die Datenablage bleibt unverändert.** Die beiden JSON-Dateien bleiben im
   bisherigen Ordner. Der Webserver liefert ausschließlich die HTML-Datei aus und
   hat mit den Daten nichts zu tun.

## Falls HTTPS nicht kurzfristig möglich ist

Alternativ kann eine unverschlüsselte interne Adresse per Gruppenrichtlinie als
vertrauenswürdig eingestuft werden:

```
OverrideSecurityRestrictionsOnInsecureOrigin = ["http://<host>"]
```

Das ist ein Behelf; die saubere Variante ist HTTPS mit internem Zertifikat.

## Aufwand und Nutzen

Der Aufwand liegt bei einem virtuellen Verzeichnis und einem Zertifikat. Danach
verhält sich die Anwendung wieder wie vor dem Browser-Update: einmal verbinden, und
die Verbindung überlebt Neuladen und Browser-Neustart.

Für die Pflege ändert sich nichts: Eine neue Version wird weiterhin einfach als
Datei in den Ordner kopiert. Die IT wird für die Einrichtung einmalig gebraucht,
danach nicht mehr.

Ohne die Umstellung bleibt die Anwendung benutzbar, verlangt aber nach jedem
Neuladen der Seite ein erneutes Auswählen der Datei.
