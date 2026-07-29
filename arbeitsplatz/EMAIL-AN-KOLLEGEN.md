# E-Mail an die Kollegen

Zwei Fassungen: eine für den geteilten OneDrive-Ordner (empfohlen, weil nichts
heruntergeladen werden muss) und eine für den Fall, dass das Paket doch als
Datei verschickt oder verlinkt wird.

Vorher **einmal** von dir zu erledigen: den Ordner `Cockpit` aus
`Werkstatt-Cockpit-Start.zip` entpacken und in den geteilten OneDrive-Ordner
legen — dorthin, wo `werkstatt-kalender-daten.json` liegt. Ab dann
synchronisiert OneDrive ihn auf alle Rechner.

---

## Fassung A — Paket liegt im geteilten OneDrive-Ordner

> **Betreff: Werkstatt-Cockpit – einmalig einrichten (3 Minuten)**
>
> Hallo zusammen,
>
> das Werkstatt-Cockpit wird ab sofort anders geöffnet. Der Grund: Ein
> Chrome-Update hat dafür gesorgt, dass sich der Browser die Verbindung zu
> unseren Daten nicht mehr merkt. Mit der neuen Startweise funktioniert
> wieder alles wie vorher.
>
> **Das ist einmalig zu tun, danach nie wieder.** Im Anhang liegt dasselbe auf
> einer Seite mit Bildern: `Werkstatt-Cockpit-Einrichtung.pdf`.
>
> **1.** Im Explorer den OneDrive-Ordner der Werkstatt öffnen — denselben, in
> dem `werkstatt-kalender-daten.json` liegt. Dort gibt es jetzt einen Ordner
> **`Cockpit`**.
>
> **2.** In diesem Ordner **`Verknuepfung anlegen.cmd`** doppelklicken.
> Auf die Frage nach dem automatischen Start bitte **`ja`** eintippen und
> Enter drücken.
>
> **3.** Auf dem Desktop liegt jetzt **„Werkstatt-Cockpit"**. Doppelklick
> darauf. Es öffnet sich ein kleines schwarzes Fenster (das gehört dazu und
> muss offen bleiben) und danach das Cockpit im Browser.
>
> **4.** Oben rechts auf das **Ordner-Symbol** klicken →
> **`werkstatt-kalender-daten.json`** auswählen.
>
> **5.** In den Reiter **Störungen** wechseln → dort ebenfalls verbinden →
> **`werkstatt-stoerungen.json`** auswählen.
>
> **6.** Auf das **Zahnrad** klicken und den eigenen **Namen** eintragen.
> Der wird gebraucht, damit im Verlauf steht, wer etwas geändert hat.
>
> Fertig. Ab morgen startet das Cockpit beim Anmelden von allein.
>
> **Zwei Dinge noch:**
>
> - Das schwarze Fenster nicht schließen, solange ihr arbeitet. Minimieren ist
>   in Ordnung.
> - Nach einem Neustart des Rechners erscheint oben eine Leiste mit
>   **„Jetzt verbinden"** — ein Klick, fertig. Die Datei muss **nicht** neu
>   herausgesucht werden.
>
> Wenn etwas klemmt: Im Ordner `Cockpit` liegt **`Selbsttest.cmd`**. Doppelklick,
> und der Bericht landet automatisch in der Zwischenablage — den schickt ihr mir
> einfach.
>
> Die alte Verknüpfung zum Cockpit bitte vom Desktop löschen, damit niemand
> aus Versehen die alte Variante öffnet.
>
> Viele Grüße
> Roberto

---

## Fassung B — Paket wird verschickt oder verlinkt

Nur nötig, wenn der OneDrive-Weg nicht geht. Schritt 1 und 2 werden ersetzt:

> **1.** Die angehängte Datei **`Werkstatt-Cockpit-Start.zip`** speichern.
>
> **2.** Rechtsklick darauf → **„Alle extrahieren…"** → als Ziel den
> **Desktop** wählen → Extrahieren. Es entsteht ein Ordner `Cockpit`.
>
> **3.** In diesem Ordner **`Verknuepfung anlegen.cmd`** doppelklicken.
> Auf die Frage nach dem automatischen Start **`ja`** eintippen.

Ab hier weiter wie in Fassung A ab Schritt 3.

> **Achtung:** Viele Mailsysteme blockieren ZIP-Dateien, die Skripte enthalten.
> Kommt die Mail nicht an oder fehlt der Anhang, ist genau das der Grund –
> dann bleibt nur der OneDrive-Weg.

---

## Was danach dauerhaft gilt

| Anlass | Was die Kollegen tun müssen |
|---|---|
| Neue Programmversion | **nichts** – die App wird aus dem Netzwerkordner geladen |
| Verbesserte Startskripte | **nichts** – OneDrive verteilt sie von allein |
| Rechner neu gestartet | einmal auf „Jetzt verbinden" klicken |
| Neuer Rechner / neuer Kollege | diese E-Mail noch einmal schicken |

## Was du vorher selbst prüfen solltest

Führ die drei Schritte **einmal auf deinem eigenen Rechner** durch, bevor die
Mail rausgeht — mit dem Paket aus dem OneDrive-Ordner, nicht mit deinem
bisherigen lokalen. So merkst du sofort, ob die Verknüpfung dort richtig
angelegt wird, und die Kollegen bekommen eine Anleitung, die nachweislich
funktioniert hat.
