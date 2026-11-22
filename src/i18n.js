// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, statuses, the widget, scene summaries,
// messages of the Configuration screen. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo, scène / Szene / escena) and of No-IP
// (hostname, groupe, DDNS Key).
// Statuses are widget values too: 40 characters at most.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  hostDeviceName: {
    en: '{hostname} (No-IP)',
    fr: '{hostname} (No-IP)',
    de: '{hostname} (No-IP)',
    es: '{hostname} (No-IP)',
  },
  featureIpv4: {
    en: 'IPv4 address (A record)',
    fr: 'Adresse IPv4 (enregistrement A)',
    de: 'IPv4-Adresse (A-Eintrag)',
    es: 'Dirección IPv4 (registro A)',
  },
  featureIpv6: {
    en: 'IPv6 address (AAAA record)',
    fr: 'Adresse IPv6 (enregistrement AAAA)',
    de: 'IPv6-Adresse (AAAA-Eintrag)',
    es: 'Dirección IPv6 (registro AAAA)',
  },
  featureStatus: {
    en: 'No-IP status',
    fr: 'État No-IP',
    de: 'No-IP-Status',
    es: 'Estado de No-IP',
  },
  featureChanges: {
    en: 'Address changes',
    fr: 'Changements d’adresse',
    de: 'Adressänderungen',
    es: 'Cambios de dirección',
  },

  // statuses of a record (widget values: 40 characters at most)
  status_ok: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Actualizado' },
  status_pending: {
    en: 'Waiting for the first check',
    fr: 'En attente de la première vérification',
    de: 'Wartet auf die erste Prüfung',
    es: 'Esperando la primera comprobación',
  },
  status_auth: {
    en: 'Username or password refused',
    fr: 'Identifiant ou mot de passe refusé',
    de: 'Benutzername oder Passwort abgelehnt',
    es: 'Usuario o contraseña rechazados',
  },
  status_nohost: {
    en: 'Name unknown to this account',
    fr: 'Nom inconnu de ce compte',
    de: 'Name in diesem Konto unbekannt',
    es: 'Nombre desconocido en esta cuenta',
  },
  status_badagent: {
    en: 'Client disabled by No-IP',
    fr: 'Client désactivé par No-IP',
    de: 'Client von No-IP deaktiviert',
    es: 'Cliente desactivado por No-IP',
  },
  status_donator: {
    en: 'Feature not in your No-IP plan',
    fr: 'Fonction absente de votre offre No-IP',
    de: 'Funktion nicht in deinem No-IP-Tarif',
    es: 'Función no incluida en tu plan No-IP',
  },
  status_abuse: {
    en: 'Account blocked by No-IP',
    fr: 'Compte bloqué par No-IP',
    de: 'Konto von No-IP gesperrt',
    es: 'Cuenta bloqueada por No-IP',
  },
  status_server: {
    en: 'No-IP error, retry in 30 min',
    fr: 'Erreur No-IP, nouvel essai dans 30 min',
    de: 'No-IP-Fehler, neuer Versuch in 30 Min.',
    es: 'Error de No-IP, reintento en 30 min',
  },
  status_network: {
    en: 'No-IP unreachable, retrying',
    fr: 'No-IP injoignable, nouvel essai',
    de: 'No-IP nicht erreichbar, neuer Versuch',
    es: 'No-IP inaccesible, reintentando',
  },
  status_no_ip: {
    en: 'Public address unknown',
    fr: 'Adresse publique inconnue',
    de: 'Öffentliche Adresse unbekannt',
    es: 'Dirección pública desconocida',
  },

  // short statuses of the widget rows (beside a long name: 16 characters at most)
  short_ok: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  short_pending: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  short_auth: {
    en: 'Login refused',
    fr: 'Accès refusé',
    de: 'Zugang abgelehnt',
    es: 'Acceso denegado',
  },
  short_nohost: { en: 'Unknown name', fr: 'Nom inconnu', de: 'Name unbekannt', es: 'Nombre ajeno' },
  short_badagent: {
    en: 'Client disabled',
    fr: 'Client désactivé',
    de: 'Client gesperrt',
    es: 'Cliente inactivo',
  },
  short_donator: {
    en: 'Paid feature',
    fr: 'Option payante',
    de: 'Bezahlfunktion',
    es: 'Función de pago',
  },
  short_abuse: { en: 'Blocked', fr: 'Bloqué', de: 'Gesperrt', es: 'Bloqueado' },
  short_server: { en: 'No-IP error', fr: 'Erreur No-IP', de: 'No-IP-Fehler', es: 'Error No-IP' },
  short_network: { en: 'Unreachable', fr: 'Injoignable', de: 'Unerreichbar', es: 'Inaccesible' },
  short_no_ip: { en: 'No address', fr: 'Sans adresse', de: 'Keine Adresse', es: 'Sin dirección' },

  // connection status
  statusNoHost: {
    en: 'Enter your No-IP username, its password and at least one hostname in the configuration.',
    fr: 'Saisissez votre identifiant No-IP, son mot de passe et au moins un nom d’hôte dans la configuration.',
    de: 'Gib in der Konfiguration deinen No-IP-Benutzernamen, sein Passwort und mindestens einen Hostnamen ein.',
    es: 'Introduce tu usuario de No-IP, su contraseña y al menos un nombre de host en la configuración.',
  },
  statusInvalid: {
    en: 'Not a hostname or a group: {names}.',
    fr: 'Ni un nom d’hôte ni un groupe : {names}.',
    de: 'Weder Hostname noch Gruppe: {names}.',
    es: 'No es un nombre de host ni un grupo: {names}.',
  },
  statusError: {
    en: '{hostname}: {error}.',
    fr: '{hostname} : {error}.',
    de: '{hostname}: {error}.',
    es: '{hostname}: {error}.',
  },
  statusStopped: {
    en: '{error}. Updates stopped until you change the settings or press "Test the connection".',
    fr: '{error}. Mises à jour arrêtées jusqu’à un changement de configuration ou « Tester la connexion ».',
    de: '{error}. Updates gestoppt, bis du die Konfiguration änderst oder „Verbindung testen“ drückst.',
    es: '{error}. Actualizaciones detenidas hasta que cambies la configuración o pulses «Probar la conexión».',
  },
  statusConnected: {
    en: '{count} name(s) up to date, public address {ip}, checked every {minutes} min.',
    fr: '{count} nom(s) à jour, adresse publique {ip}, vérifiée toutes les {minutes} min.',
    de: '{count} Name(n) aktuell, öffentliche Adresse {ip}, Prüfung alle {minutes} Min.',
    es: '{count} nombre(s) al día, dirección pública {ip}, comprobada cada {minutes} min.',
  },

  // widget
  widgetHeading: {
    en: 'Public address',
    fr: 'Adresse publique',
    de: 'Öffentliche Adresse',
    es: 'Dirección pública',
  },
  widgetNoHost: {
    en: 'No name yet: enter your No-IP account and hostnames in the configuration of the integration.',
    fr: 'Aucun nom pour l’instant : saisissez votre compte No-IP et vos noms d’hôte dans la configuration de l’intégration.',
    de: 'Noch kein Name: Gib dein No-IP-Konto und deine Hostnamen in der Konfiguration der Integration ein.',
    es: 'Aún no hay ningún nombre: introduce tu cuenta No-IP y tus nombres de host en la configuración de la integración.',
  },
  rowPublicIpv4: {
    en: 'Public IPv4',
    fr: 'IPv4 publique',
    de: 'Öffentliche IPv4',
    es: 'IPv4 pública',
  },
  rowPublicIpv6: {
    en: 'Public IPv6',
    fr: 'IPv6 publique',
    de: 'Öffentliche IPv6',
    es: 'IPv6 pública',
  },
  valueUnknown: { en: 'unknown', fr: 'inconnue', de: 'unbekannt', es: 'desconocida' },
  buttonUpdate: {
    en: 'Update now',
    fr: 'Mettre à jour',
    de: 'Jetzt aktualisieren',
    es: 'Actualizar ahora',
  },
  checkedAt: {
    en: 'Checked at {time} · No-IP',
    fr: 'Vérifié à {time} · No-IP',
    de: 'Geprüft um {time} · No-IP',
    es: 'Comprobado a las {time} · No-IP',
  },
  notChecked: {
    en: 'Not checked yet · No-IP',
    fr: 'Pas encore vérifié · No-IP',
    de: 'Noch nicht geprüft · No-IP',
    es: 'Aún sin comprobar · No-IP',
  },
  toastChecked: {
    en: 'No-IP: {updated} updated, {unchanged} already right, {failed} failed.',
    fr: 'No-IP : {updated} mis à jour, {unchanged} déjà à jour, {failed} en échec.',
    de: 'No-IP: {updated} aktualisiert, {unchanged} schon aktuell, {failed} fehlgeschlagen.',
    es: 'No-IP: {updated} actualizados, {unchanged} ya al día, {failed} con error.',
  },

  // scene summaries and configuration actions
  resultLine: {
    en: '{record}: {state}',
    fr: '{record} : {state}',
    de: '{record}: {state}',
    es: '{record}: {state}',
  },
  lineUpdated: {
    en: 'updated to {ip}',
    fr: 'mis à jour vers {ip}',
    de: 'aktualisiert auf {ip}',
    es: 'actualizado a {ip}',
  },
  lineUnchanged: {
    en: 'already {ip}',
    fr: 'déjà {ip}',
    de: 'bereits {ip}',
    es: 'ya {ip}',
  },
  summaryCheck: {
    en: 'No-IP: {updated} updated, {unchanged} already right, {failed} failed.\n{lines}',
    fr: 'No-IP : {updated} mis à jour, {unchanged} déjà à jour, {failed} en échec.\n{lines}',
    de: 'No-IP: {updated} aktualisiert, {unchanged} schon aktuell, {failed} fehlgeschlagen.\n{lines}',
    es: 'No-IP: {updated} actualizados, {unchanged} ya al día, {failed} con error.\n{lines}',
  },
  summaryPublic: {
    en: 'Public address: IPv4 {ipv4}, IPv6 {ipv6}.',
    fr: 'Adresse publique : IPv4 {ipv4}, IPv6 {ipv6}.',
    de: 'Öffentliche Adresse: IPv4 {ipv4}, IPv6 {ipv6}.',
    es: 'Dirección pública: IPv4 {ipv4}, IPv6 {ipv6}.',
  },
  testOk: {
    en: 'No-IP accepted every name:\n{lines}',
    fr: 'No-IP a accepté chaque nom :\n{lines}',
    de: 'No-IP hat jeden Namen angenommen:\n{lines}',
    es: 'No-IP aceptó cada nombre:\n{lines}',
  },
  testFailed: {
    en: 'Some names failed:\n{lines}',
    fr: 'Certains noms ont échoué :\n{lines}',
    de: 'Einige Namen sind fehlgeschlagen:\n{lines}',
    es: 'Algunos nombres han fallado:\n{lines}',
  },
  testWait: {
    en: 'No-IP was asked less than {minutes} min ago: try again later.\n{lines}',
    fr: 'No-IP a été appelé il y a moins de {minutes} min : réessayez plus tard.\n{lines}',
    de: 'No-IP wurde vor weniger als {minutes} Min. gefragt: Versuche es später erneut.\n{lines}',
    es: 'Se consultó No-IP hace menos de {minutes} min: inténtalo más tarde.\n{lines}',
  },
  diagnosticDone: {
    en: 'Diagnostic written in the logs of the integration ({count} line(s) "No-IP diagnostic"), password hidden.',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s) « No-IP diagnostic »), mot de passe masqué.',
    de: 'Diagnose in die Protokolle der Integration geschrieben ({count} Zeile(n) „No-IP diagnostic“), Passwort verborgen.',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s) «No-IP diagnostic»), contraseña oculta.',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('status_ok', 'fr'); // -> 'À jour'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

export { LANGUAGES, TEXTS, isLanguage, t, all };
