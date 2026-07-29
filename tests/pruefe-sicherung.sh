#!/bin/bash
# Prüft das Sicherungsskript - ausgeführt, nicht behauptet.
#
# Die wichtigste Prüfung ist die dritte: Eine unvollständige Datei darf NICHT
# gesichert werden. Täte sie es, würde ein Torso nach und nach die guten Stände
# aus der Rotation drängen - und die Sicherung wäre genau dann wertlos, wenn
# man sie braucht.

PWSH=/opt/pwsh/pwsh
SKRIPT=/home/user/WerkstattKalender/arbeitsplatz/cockpit-sicherung.ps1
BASIS=$(mktemp -d)
DATEN="$BASIS/daten"
SICHER="$BASIS/sicherungen"
mkdir -p "$DATEN"
ok=0; fail=0
pruef() { if [ "$2" = "ja" ]; then echo "PASS | $1"; ok=$((ok+1)); else echo "FAIL | $1   ($3)"; fail=$((fail+1)); fi; }
lauf() { $PWSH -NoProfile -File "$SKRIPT" -Ordner "$DATEN" -Ziel "$SICHER" "$@" 2>&1; }

echo "Arbeitsordner: $BASIS"
echo ""

# ---- (1) Gesunde Dateien werden gesichert ----
cat > "$DATEN/werkstatt-kalender-daten.json" <<'JSON'
{"format":"werkstatt-kalender-v1","savedAt":"2026-07-28T08:00:00.000Z","entries":[{"id":"a","date":"2026-07-01"}],"deleted":{}}
JSON
cat > "$DATEN/werkstatt-stoerungen.json" <<'JSON'
{"format":"werkstatt-stoerungen-v1","savedAt":"2026-07-28T08:00:00.000Z","entries":[{"id":"s1"}],"deleted":{}}
JSON
AUS=$(lauf)
HEUTE=$(date +%Y-%m-%d)
[ -f "$SICHER/$HEUTE/werkstatt-kalender-daten.json" ] && a=ja || a=nein
pruef "(1) Kalenderdatei gesichert" "$a" "$AUS"
[ -f "$SICHER/$HEUTE/werkstatt-stoerungen.json" ] && a=ja || a=nein
pruef "(1) Störungsdatei gesichert" "$a"

# ---- (2) Unveränderte Dateien werden nicht doppelt abgelegt ----
VORHER=$(find "$SICHER" -name "*.json" | wc -l)
lauf > /dev/null
NACHHER=$(find "$SICHER" -name "*.json" | wc -l)
[ "$VORHER" = "$NACHHER" ] && a=ja || a=nein
pruef "(2) Zweiter Lauf legt keine Dubletten an" "$a" "$VORHER → $NACHHER"

# ---- (3) DIE ENTSCHEIDENDE: Torso wird abgelehnt ----
GUT=$(cat "$SICHER/$HEUTE/werkstatt-kalender-daten.json")
head -c 60 "$DATEN/werkstatt-kalender-daten.json" > "$DATEN/tmp" && mv "$DATEN/tmp" "$DATEN/werkstatt-kalender-daten.json"
AUS=$(lauf)
echo "$AUS" | grep -q "UEBERSPRUNGEN" && a=ja || a=nein
pruef "(3) Unvollständige Datei wird abgelehnt" "$a" "$AUS"
JETZT=$(cat "$SICHER/$HEUTE/werkstatt-kalender-daten.json")
[ "$GUT" = "$JETZT" ] && a=ja || a=nein
pruef "(3) Der gute Stand bleibt unangetastet" "$a"

# ---- (4) Leere Datei wird ebenfalls abgelehnt ----
: > "$DATEN/werkstatt-stoerungen.json"
AUS=$(lauf)
echo "$AUS" | grep -q "leer" && a=ja || a=nein
pruef "(4) Leere Datei wird abgelehnt" "$a" "$AUS"

# ---- (5) Nach der Reparatur wird wieder gesichert ----
cat > "$DATEN/werkstatt-kalender-daten.json" <<'JSON'
{"format":"werkstatt-kalender-v1","savedAt":"2026-07-29T08:00:00.000Z","entries":[{"id":"a"},{"id":"b"}],"deleted":{}}
JSON
AUS=$(lauf)
echo "$AUS" | grep -q "gesichert" && a=ja || a=nein
pruef "(5) Nach der Reparatur wird wieder gesichert" "$a" "$AUS"
ANZ=$(find "$SICHER/$HEUTE" -name "werkstatt-kalender-daten*.json" | wc -l)
[ "$ANZ" -ge 2 ] && a=ja || a=nein
pruef "(5) Beide Stände desselben Tages bleiben erhalten" "$a" "$ANZ Dateien"

# ---- (6) Rotation entfernt alte Stände ----
mkdir -p "$SICHER/2020-01-01" && echo '{"entries":[]}' > "$SICHER/2020-01-01/alt.json"
lauf -Tage 30 > /dev/null
[ -d "$SICHER/2020-01-01" ] && a=nein || a=ja
pruef "(6) Stände älter als die Aufbewahrung werden entfernt" "$a"
[ -d "$SICHER/$HEUTE" ] && a=ja || a=nein
pruef "(6) Der heutige Stand bleibt" "$a"

# ---- (7) Gründliche Prüfung erkennt gültige Klammern mit kaputtem Inhalt ----
# Nachgestellte Kommas akzeptiert PowerShell (der Browser nicht) - deshalb ein
# Fall, den beide ablehnen: ein Feld ohne Wert.
echo '{"entries": [ {"id": } ] }' > "$DATEN/werkstatt-kalender-daten.json"
AUS=$(lauf -Gruendlich)
echo "$AUS" | grep -q "kein gueltiges JSON" && a=ja || a=nein
pruef "(7) -Gruendlich erkennt kaputtes JSON trotz passender Klammern" "$a" "$AUS"

# ---- (8) Nicht erreichbarer Ordner ----
AUS=$($PWSH -NoProfile -File "$SKRIPT" -Ordner "$BASIS/gibtsnicht" -Ziel "$SICHER" -Leise 2>&1; echo "rc=$?")
echo "$AUS" | grep -q "rc=1" && a=ja || a=nein
pruef "(8) Fehlender Datenordner endet mit Fehlercode" "$a" "$AUS"


# ---- (9) Ausweichen, wenn im Datenordner nichts angelegt werden kann ----
# Das ist bei gesperrten Freigaben der Regelfall, nicht die Ausnahme: Wo keine
# Skripte erlaubt sind, darf oft auch kein Ordner angelegt werden. Erzwungen
# wird das hier, indem statt des Ordners eine DATEI namens "Sicherungen" liegt.
B2=$(mktemp -d); D2="$B2/daten"; mkdir -p "$D2"
printf '{"entries":[{"id":"x"}]}' > "$D2/werkstatt-kalender-daten.json"
: > "$D2/Sicherungen"
AUS=$(HOME="$B2" USERPROFILE= $PWSH -NoProfile -File "$SKRIPT" -Ordner "$D2" 2>&1)
echo "$AUS" | grep -q "lokal gesichert" && a=ja || a=nein
pruef "(9) Ausweichen wird angekündigt" "$a" "$(echo "$AUS" | head -3 | tr '\n' ' ')"
[ -f "$B2/Cockpit-Sicherungen/$(date +%Y-%m-%d)/werkstatt-kalender-daten.json" ] && a=ja || a=nein
pruef "(9) Die Sicherung landet trotzdem - nur lokal" "$a" "$(find "$B2/Cockpit-Sicherungen" -name '*.json' 2>/dev/null | head -1)"
rm -rf "$B2"

rm -rf "$BASIS"
echo ""
echo "Sicherung: $ok/$((ok+fail))"
[ "$fail" -eq 0 ] || exit 1
