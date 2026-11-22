# No-IP

## Presentación

Esta integración convierte a Gladys en el **cliente de DNS dinámico** de tu cuenta **No-IP**. Tu proveedor de internet puede cambiar la dirección pública de tu casa en cualquier momento; con No-IP, un nombre de host (`casa.ddns.net`) siempre apunta a ella, para llegar a tu casa, a un NAS o a una VPN por su nombre. Gladys comprueba la dirección pública cada 5 minutos por defecto y solo pide a No-IP que actualice tus nombres si ha cambiado.

Hasta **diez nombres**: nombres de host, **grupos** de No-IP, o `all.ddnskey.com` para todos los nombres de una **DDNS Key**, que siguen la dirección **IPv4**, la dirección **IPv6** o ambas. Cada nombre se convierte en un dispositivo con sus direcciones, su estado y el número de cambios; las escenas pueden reaccionar cuando cambia la dirección pública o falla una actualización, y un widget del panel lo resume todo.

Usa el punto de acceso oficial de actualización de No-IP, el mismo que los routers y el cliente de No-IP, y sigue sus reglas: una sola petición para todos los nombres, nada se envía mientras la dirección no cambie, y parada tras cualquier error. Es una integración **cloud**: la dirección pública se lee en servicios de eco (ipify, icanhazip, ident.me), y solo se contacta con No-IP cuando un nombre debe cambiar.

## Requisitos previos

- Gladys Assistant 5.3.0 o posterior.
- Una cuenta No-IP (gratuita o de pago) con al menos un nombre de host (web de No-IP → **Dynamic DNS** → **No-IP Hostnames**).
- Recomendado: una **DDNS Key** (**Dynamic DNS** → **DDNS Keys** → **Generate DDNS Key**). Solo actualiza sus nombres, y la contraseña de tu cuenta nunca entra en Gladys. Apunta su usuario y su contraseña: la contraseña se muestra una sola vez.
- Los **nombres gratuitos** se siguen confirmando en la web de No-IP cada 30 días (No-IP envía un correo): la integración no puede hacerlo por ti.
- Para el IPv6, un nombre de host con registro AAAA (o IPv4 e IPv6) en No-IP, y una conexión IPv6 hasta el Docker de Gladys.

## Configuración

| Campo                                | Qué introducir                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Usuario                              | El usuario de la DDNS Key, o el correo electrónico (o el usuario) de tu cuenta No-IP.            |
| Contraseña                           | La contraseña de la DDNS Key, o la de tu cuenta No-IP.                                           |
| Nombres de host                      | Separados por comas, diez como máximo: `casa.ddns.net`, un nombre de grupo, o `all.ddnskey.com`. |
| Registros que actualizar             | IPv4 (A, por defecto), IPv6 (AAAA), o ambos.                                                     |
| Comprobación de la dirección pública | Cada minuto, 5 minutos (por defecto), 15 o 30 minutos.                                           |
| Idioma de los textos                 | Nombres de dispositivos, estado y resúmenes de escena. Automático sigue tu panel.                |

Pulsa **Probar la conexión**: cada nombre se envía a No-IP al momento, y la respuesta muestra, por nombre, «ya 203.0.113.7» (el acceso funciona), la nueva dirección o el error. **Diagnóstico** escribe lo que sabe la integración en la pestaña Registros, contraseña oculta.

## Uso

### Dispositivos

En **Descubrir**, crea un dispositivo por nombre:

| Función                        | Contenido                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| Dirección IPv4 (registro A)    | La dirección que No-IP confirmó para el nombre.                                    |
| Dirección IPv6 (registro AAAA) | Lo mismo para el IPv6, cuando se sigue.                                            |
| Estado de No-IP                | «Actualizado», «Esperando la primera comprobación» o el último error, en palabras. |
| Cambios de dirección           | El número de actualizaciones aplicadas por No-IP; su historial muestra cuándo.     |

### Widget del panel

**No-IP** muestra la IPv4 pública (y la IPv6), luego cada nombre con su estado, la hora de la última comprobación y un botón **Actualizar ahora**.

![El widget No-IP, todos los nombres al día, luego un grupo desconocido en la cuenta (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-no-ip/main/docs/assets/widgets.es.png)

### Escenas

Disparadores:

- **Dirección pública cambiada**: con la dirección anterior y la nueva; filtro: IPv4 o IPv6.
- **Registro actualizado**: No-IP apuntó un nombre a una nueva dirección; filtros: nombre, IPv4 o IPv6.
- **Fallo de actualización**: una vez por error, no en cada comprobación; filtros: nombre, error (acceso rechazado, nombre desconocido, cliente desactivado, cuenta bloqueada, No-IP inaccesible, dirección pública desconocida…).

Acciones:

- **Actualizar ahora**: un nombre o todos; «enviar aunque ya esté al día» envía un nombre como máximo una vez por hora (demasiadas respuestas «ya al día» bloquean el cliente). Devuelve los recuentos y un resumen. Nunca lanza un disparador.
- **Leer la dirección pública**: la IPv4 y la IPv6 públicas, para ponerlas en un mensaje.

Ejemplos:

- «Dirección pública cambiada» → enviar «Nueva dirección: {{triggerEvent.data.ip}}» a tu teléfono.
- «Fallo de actualización», error «acceso rechazado» → avisarte para revisar la DDNS Key.
- Cada mañana → «leer la dirección pública» → escribirla en un registro o un mensaje.

### Transporte

Solo cloud: la dirección pública se lee en `api.ipify.org`, `ipv4.icanhazip.com` y `v4.ident.me` (el siguiente si uno falla; sus gemelos IPv6 para el IPv6), y los nombres se envían a `dynupdate.no-ip.com` por HTTPS con tu acceso. Esos servicios solo ven la dirección de tu casa. Nada más sale de tu red.

## Solución de problemas

- **La integración se detuvo tras un error**: No-IP exige a sus clientes que dejen de enviar tras cualquier respuesta de error. Corrige la configuración (o pulsa **Probar la conexión** cuando el problema esté resuelto en No-IP): vuelve a intentarlo al momento. Un reinicio no levanta la parada.
- **Usuario o contraseña rechazados**: con una DDNS Key, el usuario es el que generó No-IP (no tu correo); con tu cuenta, el correo y la contraseña de la cuenta.
- **Nombre desconocido en esta cuenta**: el nombre de host o el grupo no existe en esta cuenta o esta DDNS Key; revisa cómo está escrito, o usa `all.ddnskey.com` con una clave. Los demás nombres se siguen actualizando.
- **Error de No-IP, reintento en 30 min**: No-IP tuvo una avería («911»); sus reglas prohíben una nueva petición antes de 30 minutos, incluso desde el botón de prueba.
- **Cliente desactivado** o **Cuenta bloqueada**: No-IP rechazó este cliente o esta cuenta; contacta con el soporte de No-IP.
- **IPv6 pública desconocida**: el Docker de Gladys no tiene acceso IPv6 a internet. Mantén solo el IPv4.
- **El nombre es correcto pero desaparece al cabo de un mes**: un nombre gratuito no se confirmó; confírmalo en la web de No-IP.
- Para informar de un problema, indica las versiones de Gladys y de la integración y las líneas del botón **Diagnóstico**.
