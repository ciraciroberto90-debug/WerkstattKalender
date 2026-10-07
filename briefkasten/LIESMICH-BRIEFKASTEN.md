# Briefkasten im Internet – einrichten in zehn Schritten

Der Briefkasten ist ein Durchgang: Das Handy wirft Foto und Begleitdatei
ein, der BTA-Dienst auf dem Werkstatt-Server holt alle 30 Sekunden ab und
löscht sofort. Nichts liegt länger als bis zum nächsten Abholen; was nach
sieben Tagen noch da ist (Server aus), räumt der Briefkasten selbst weg.

Er läuft als **Cloudflare-Worker**: kostenlos (100.000 Anfragen am Tag,
1 GB Ablage), ohne eigenen Server, eingerichtet nur mit Klicks im Browser.
Es ist ein fremder Rechner als Durchgang – aber nur unser Code
(`worker.js`) und nur Transit.

Was man braucht: eine E-Mail-Adresse für das Cloudflare-Konto, die Datei
`briefkasten/worker.js`, zwei selbst gewählte Schlüssel (je 20+ Zeichen,
z. B. aus einem Passwort-Generator):

- **Einwurf-Schlüssel** – kommt aufs Handy (Aufnahme-Zettel). Wer ihn hat,
  kann nur einwerfen, nichts lesen.
- **Abhol-Schlüssel** – kommt nur auf den Werkstatt-Server.

## Die Schritte (einer nach dem anderen, jeweils mit Kontrolle)

1. **Konto anlegen:** https://dash.cloudflare.com/sign-up → E-Mail, Kennwort,
   Bestätigungs-Mail klicken. Kontrolle: Das Dashboard öffnet sich.
2. **Worker anlegen:** links „Workers & Pages“ → „Create“ → „Create Worker“.
   Name: `bta-briefkasten`. „Deploy“. Kontrolle: Eine Adresse wie
   `https://bta-briefkasten.<konto>.workers.dev` wird angezeigt – notieren.
3. **Code einsetzen:** „Edit code“ → den gesamten Inhalt im Editor löschen →
   Inhalt von `briefkasten/worker.js` einfügen → „Deploy“ (oben rechts).
   Kontrolle: Keine rote Fehlermeldung. *Dieser Schritt wird wiederholt,
   wenn es eine neue `worker.js` gibt (Kern oder Zettel geändert) – der
   Worker trägt seit 0.2.0 den Aufnahme-Zettel in sich.*
4. **Ablage (KV) anlegen:** links „Storage & Databases“ → „KV“ → „Create
   namespace“, Name `bta-briefkasten`. Kontrolle: Der Namensraum steht in
   der Liste.
5. **Ablage mit dem Worker verbinden:** zurück zum Worker → „Settings“ →
   „Bindings“ → „Add“ → „KV Namespace“ → Variable name **`ABLAGE`**
   (genau so), Namespace `bta-briefkasten` → „Deploy“/„Save“.
   Kontrolle: Unter Bindings steht `ABLAGE`.
6. **Schlüssel hinterlegen:** „Settings“ → „Variables and Secrets“ → „Add“:
   Type **Secret**, Name **`EINWURF_SCHLUESSEL`**, Wert = dein
   Einwurf-Schlüssel. Nochmal „Add“: Name **`ABHOL_SCHLUESSEL`**, Wert =
   dein Abhol-Schlüssel. „Deploy“. Kontrolle: Beide Namen stehen in der
   Liste (Werte bleiben verborgen).
7. **Lebenszeichen prüfen:** Im Browser `https://bta-briefkasten.<konto>.workers.dev/status`
   öffnen. Erwartet: `{"dienst":"bta-briefkasten","fassung":"0.2.0"}`.
   Kommt stattdessen `KV-Namensraum ABLAGE ist nicht gebunden` → Schritt 5.
8. **Server anbinden:** Auf v-btacockpit-1 neben `einstellungen.json`
   (C:\BTA\BTA-Programm\Dienst) die Datei **`briefkasten.json`** anlegen
   (Vorlage: `server/briefkasten.beispiel.json`):
   ```json
   { "adresse": "https://bta-briefkasten.<konto>.workers.dev",
     "schluessel": "<Abhol-Schlüssel>", "standort": "scheurich", "taktSek": 30 }
   ```
   Dann die Aufgabe `BTA-Cockpit-Dienst` neu starten (Werkzeug → Wartung,
   oder Aufgabenplanung). Kontrolle: Status-Seite `http://v-btacockpit-1:8765/status`
   zeigt unter „Briefkasten“: Adresse, **erreichbar**, „0 Aufnahme(n) seit dem
   Start abgeholt“. Steht dort „nicht erreichbar“, hat der Server keinen Weg
   ins Internet (Firewall/Proxy) – dann melden, das ist der nächste Schritt.
9. **Handy einrichten (mobile Daten reichen, kein WLAN, keine Datei):**
   Am Handy in Chrome `https://bta-briefkasten.<konto>.workers.dev/zettel`
   öffnen – der Briefkasten liefert den Zettel selbst aus und der Zettel
   trägt seine Adresse von allein ein. **Ohne Tippen:** Der Werkstattleiter
   gibt einen Einrichtungs-Link (oder QR-Code) weiter:
   `…/zettel#kuerzel=RC&schluessel=<Einwurf-Schlüssel>` – Kürzel und
   Schlüssel werden übernommen, der Teil hinter `#` verlässt das Handy nie
   und verschwindet sofort aus der Adresszeile. Danach Chrome-Menü ⋮ →
   „Zum Startbildschirm hinzufügen“ → der Zettel liegt als Symbol neben den
   Apps. Kontrolle: ⚙ → „Verbindung zum Briefkasten prüfen“ → grün
   „Briefkasten erreichbar (Fassung 0.2.0)“.
10. **Die Probe:** Am Handy ein Foto mit Notiz „Probe Briefkasten“ →
    „Einwerfen“. Erwartet: grün „Eingeworfen“. Binnen einer Minute steht die
    Aufnahme am PC im Reiter Aufnahme (Quelle „Briefkasten“), und die
    Status-Seite zählt „1 Aufnahme(n) abgeholt“, „im Briefkasten liegen 0“.

## Wenn etwas hakt

| Was zu sehen ist | Grund | Abhilfe |
|---|---|---|
| Zettel: „Der Briefkasten weist den Einwurf-Schlüssel ab“ | Schlüssel am Handy ≠ Secret `EINWURF_SCHLUESSEL` | Schritt 6 und 9 vergleichen (Leerzeichen!) |
| Status-Seite: „weist den Abhol-Schlüssel ab (401)“ | `briefkasten.json` ≠ Secret `ABHOL_SCHLUESSEL` | Schritt 6 und 8 vergleichen, Dienst neu starten |
| Status-Seite: „antwortet nicht (Frist)“ / „nicht erreichbar“ | Server kommt nicht ins Internet (Firewall, Proxy) | im Server-Browser `/status` des Workers öffnen; geht es dort, aber nicht im Dienst, läuft ein Proxy – dann bitte melden |
| Aufnahmen bleiben „im Briefkasten liegen N“ | Dienst holt nicht ab (gestoppt?) | Aufgabe prüfen, Protokoll `dienst-<Datum>.log` lesen |
| Zettel zeigt „⏳ wartet auf Netz“ | Handy ohne Internet | wartet auf dem Handy, geht von selbst raus (auch nach Schließen der Seite, beim nächsten Öffnen) |

## Was der Briefkasten speichert – und was nicht

Je Einwurf: das eingedampfte Bild (200–400 kB) und die Begleitdatei (Zeit,
Kürzel, Anlage, Ziel, Notiz) – bis zum Abholen, höchstens sieben Tage.
Keine Namen von Kollegen außer dem Kürzel, kein Bestand, keine Verläufe.
Der Briefkasten kennt den Werkstatt-Server nicht; der Server meldet sich
bei ihm, nie umgekehrt.

## Für die Entwicklung

- `kern.js` – die Logik (Wege, Schlüssel, Fristen), ohne HTTP und ohne Ablage
- `briefkasten.js` – als Node-Programm (Ablage = Ordner), für Prüfstand und Eigenbetrieb
- `worker.js` – Cloudflare-Worker (Ablage = KV); entsteht aus kern.js **und** `handy/aufnahme-zettel.html` (eingebettet, Weg `/zettel`): `node briefkasten/worker-bauen.js` (`--pruefen` im Prüfstand). Nach jeder Änderung an Kern oder Zettel neu bauen **und** im Dashboard neu einfügen (Schritt 3).
- Prüfstand: `node --no-warnings tests/server/pruefe-briefkasten.js`
