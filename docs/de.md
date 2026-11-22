# No-IP

## Überblick

Diese Integration macht Gladys zum **Client für dynamisches DNS** deines **No-IP**-Kontos. Dein Internetanbieter kann die öffentliche Adresse deines Zuhauses jederzeit ändern; mit No-IP zeigt ein Hostname (`zuhause.ddns.net`) immer darauf, damit du dein Zuhause, ein NAS oder ein VPN per Namen erreichst. Gladys prüft die öffentliche Adresse standardmäßig alle 5 Minuten und bittet No-IP nur dann um eine Aktualisierung deiner Namen, wenn sie sich geändert hat.

Bis zu **zehn Namen**: Hostnamen, No-IP-**Gruppen** oder `all.ddnskey.com` für alle Hostnamen eines **DDNS Keys**, die der **IPv4**-Adresse, der **IPv6**-Adresse oder beiden folgen. Jeder Name wird ein Gerät mit seinen Adressen, seinem Status und der Zahl der Änderungen; Szenen können reagieren, wenn sich die öffentliche Adresse ändert oder eine Aktualisierung fehlschlägt, und ein Dashboard-Widget zeigt alles auf einen Blick.

Sie nutzt den offiziellen Aktualisierungsendpunkt von No-IP, denselben wie Router und der No-IP-Client, und hält sich an seine Regeln: eine Anfrage für alle Namen, nichts wird gesendet, solange die Adresse gleich bleibt, und Stopp nach jedem Fehler. Es ist eine **Cloud**-Integration: Die öffentliche Adresse wird bei Echo-Diensten gelesen (ipify, icanhazip, ident.me), und No-IP wird nur kontaktiert, wenn sich ein Name ändern muss.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein No-IP-Konto (kostenlos oder bezahlt) mit mindestens einem Hostnamen (No-IP-Website → **Dynamic DNS** → **No-IP Hostnames**).
- Empfohlen: ein **DDNS Key** (**Dynamic DNS** → **DDNS Keys** → **Generate DDNS Key**). Er aktualisiert nur seine Hostnamen, und das Passwort deines Kontos kommt nie in Gladys. Notiere seinen Benutzernamen und sein Passwort: Das Passwort wird nur einmal angezeigt.
- **Kostenlose Hostnamen** müssen weiterhin alle 30 Tage auf der No-IP-Website bestätigt werden (No-IP schickt eine E-Mail): Die Integration kann das nicht für dich tun.
- Für IPv6 ein Hostname mit AAAA-Eintrag (oder IPv4 und IPv6) bei No-IP und eine IPv6-Verbindung bis zum Docker von Gladys.

## Konfiguration

| Feld                             | Eingabe                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| Benutzername                     | Der Benutzername des DDNS Keys oder die E-Mail-Adresse (oder der Benutzername) deines No-IP-Kontos. |
| Passwort                         | Das Passwort des DDNS Keys oder deines No-IP-Kontos.                                                |
| Hostnamen                        | Durch Kommas getrennt, höchstens zehn: `zuhause.ddns.net`, ein Gruppenname oder `all.ddnskey.com`.  |
| Zu aktualisierende Einträge      | IPv4 (A, Standard), IPv6 (AAAA) oder beide.                                                         |
| Prüfung der öffentlichen Adresse | Jede Minute, alle 5 Minuten (Standard), 15 oder 30 Minuten.                                         |
| Sprache der Texte                | Gerätenamen, Status und Szenen-Zusammenfassungen. Automatisch folgt deinem Dashboard.               |

Drücke **Verbindung testen**: Jeder Name wird sofort an No-IP gesendet, und die Antwort zeigt pro Name „bereits 203.0.113.7“ (die Anmeldung funktioniert), die neue Adresse oder den Fehler. **Diagnose** schreibt, was die Integration weiß, in den Tab Protokolle, Passwort verborgen.

## Verwendung

### Geräte

Erstelle unter **Entdecken** ein Gerät pro Name:

| Funktion                    | Inhalt                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| IPv4-Adresse (A-Eintrag)    | Die Adresse, die No-IP für den Namen bestätigt hat.                          |
| IPv6-Adresse (AAAA-Eintrag) | Dasselbe für IPv6, wenn ihr gefolgt wird.                                    |
| No-IP-Status                | „Aktuell“, „Wartet auf die erste Prüfung“ oder der letzte Fehler, in Worten. |
| Adressänderungen            | Die Zahl der von No-IP übernommenen Updates; ihr Verlauf zeigt, wann.        |

### Dashboard-Widget

**No-IP** zeigt die öffentliche IPv4 (und IPv6), dann jeden Namen mit seinem Status, die Zeit der letzten Prüfung und einen Knopf **Jetzt aktualisieren**.

![Das No-IP-Widget, alle Namen aktuell, dann eine dem Konto unbekannte Gruppe (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-no-ip/main/docs/assets/widgets.de.png)

### Szenen

Auslöser:

- **Öffentliche Adresse geändert**: mit der vorherigen und der neuen Adresse; Filter: IPv4 oder IPv6.
- **Eintrag aktualisiert**: No-IP hat einen Namen auf eine neue Adresse gerichtet; Filter: Name, IPv4 oder IPv6.
- **Aktualisierung fehlgeschlagen**: einmal pro Fehler, nicht bei jeder Prüfung; Filter: Name, Fehler (Anmeldung abgelehnt, unbekannter Name, Client deaktiviert, Konto gesperrt, No-IP nicht erreichbar, öffentliche Adresse unbekannt…).

Aktionen:

- **Jetzt aktualisieren**: ein Name oder alle; „auch senden, wenn schon aktuell“ sendet einen Namen höchstens einmal pro Stunde (zu viele Antworten „schon aktuell“ führen zur Sperre). Gibt die Zählungen und eine Zusammenfassung aus. Löst nie einen Auslöser aus.
- **Öffentliche Adresse lesen**: die öffentliche IPv4 und IPv6, für eine Nachricht.

Beispiele:

- „Öffentliche Adresse geändert“ → „Neue Adresse: {{triggerEvent.data.ip}}“ an dein Handy senden.
- „Aktualisierung fehlgeschlagen“, Fehler „Anmeldung abgelehnt“ → dich daran erinnern, den DDNS Key zu prüfen.
- Jeden Morgen → „öffentliche Adresse lesen“ → in ein Protokoll oder eine Nachricht schreiben.

### Transport

Nur Cloud: Die öffentliche Adresse wird bei `api.ipify.org`, `ipv4.icanhazip.com` und `v4.ident.me` gelesen (der nächste, wenn einer ausfällt; ihre IPv6-Zwillinge für IPv6), und die Namen werden per HTTPS mit deiner Anmeldung an `dynupdate.no-ip.com` gesendet. Diese Dienste sehen nur die Adresse deines Zuhauses. Nichts anderes verlässt dein Netzwerk.

## Fehlerbehebung

- **Die Integration hat nach einem Fehler gestoppt**: No-IP verlangt von seinen Clients, nach jeder Fehlerantwort nichts mehr zu senden. Korrigiere die Konfiguration (oder drücke **Verbindung testen**, sobald das Problem bei No-IP behoben ist): Sie versucht es sofort erneut. Ein Neustart hebt den Stopp nicht auf.
- **Benutzername oder Passwort abgelehnt**: Mit einem DDNS Key ist der Benutzername der von No-IP erzeugte (nicht deine E-Mail-Adresse); mit deinem Konto die E-Mail-Adresse und das Kontopasswort.
- **Name in diesem Konto unbekannt**: Der Hostname oder die Gruppe existiert in diesem Konto oder DDNS Key nicht; prüfe die Schreibweise oder nutze `all.ddnskey.com` mit einem Key. Die anderen Namen werden weiter aktualisiert.
- **No-IP-Fehler, neuer Versuch in 30 Min.**: No-IP hatte eine Störung („911“); seine Regeln verbieten eine neue Anfrage vor 30 Minuten, auch über den Testknopf.
- **Client deaktiviert** oder **Konto gesperrt**: No-IP hat diesen Client oder dieses Konto abgelehnt; wende dich an den No-IP-Support.
- **Öffentliche IPv6 unbekannt**: Der Docker von Gladys hat keinen IPv6-Zugang zum Internet. Behalte nur IPv4.
- **Der Name stimmt, verschwindet aber nach einem Monat**: Ein kostenloser Hostname wurde nicht bestätigt; bestätige ihn auf der No-IP-Website.
- Gib bei einem Problem die Versionen von Gladys und der Integration und die Zeilen des Knopfs **Diagnose** an.
