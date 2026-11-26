# WISPX Clone — Gestión para proveedores de internet (ISP/WISP)

Aplicación web para administrar un ISP: clientes, planes, servicios, facturación mensual, pagos,
soporte, routers, OLT/ONU, WhatsApp y reportes. Multiempresa (cada empresa ve solo sus datos) y con
permisos por rol.

**Stack:** Next.js 14 (App Router, Server Actions) · PostgreSQL · Prisma · NextAuth · Tailwind.

## Módulos

| Módulo | Qué hace |
| --- | --- |
| Clientes | Alta, edición, búsqueda, estados (pendiente, activo, suspendido, cancelado), ficha con servicios, facturas, pagos y tickets |
| Planes | Catálogo de planes (velocidad y precio) |
| Zonas | Ciclos de facturación por zona (Zona 15 y Zona 30 de serie, y las que crees): factura, límite de pago y corte por día del mes, facturación automática, cortes automáticos en MikroTik por falta de pago y reconexión automática al pagar, con registro y reintentos |
| Facturación | Facturas mensuales generadas por las zonas, facturas puntuales, numeración correlativa, vencimientos, anulación, impresión |
| Pagos | Registro de pagos por factura (parciales o totales), aprobación y rechazo, la factura se marca pagada sola |
| Red | Inventario de IP, MAC y PPPoE por servicio, detección de IPs duplicadas |
| Routers | Alta de equipos (contraseña cifrada) y prueba de conexión real a la API REST de RouterOS |
| Monitoreo MikroTik | Estado en tiempo real vía API REST de RouterOS 7: CPU (y por núcleo), RAM, almacenamiento, temperatura, voltaje, uptime, tráfico por interfaz (WAN, LAN, SFP/SFP+) en vivo e histórico, sesiones PPPoE, clientes conectados y desconectados, consumo por cliente (colas simples) y alertas configurables |
| OLT/FTTH | OLTs (comunidad SNMP cifrada) y ONUs por slot/puerto asignadas a clientes |
| Soporte | Tickets con prioridad, asignación, estados y comentarios |
| WhatsApp | Configuración de WhatsApp Cloud API (Meta) y envío de prueba con plantilla |
| Reportes | Facturado vs. cobrado (12 meses), resumen por estados, mayores deudores, exportación CSV |
| Configuración | Datos de la empresa, numeración, usuarios y roles, registro de auditoría |

### Roles

| Rol | Acceso |
| --- | --- |
| Administrador | Todo |
| Gerente | Todo salvo Configuración |
| Facturación | Clientes, facturación, pagos, soporte, reportes |
| Técnico | Clientes (solo lectura), red, routers, OLT, soporte |

## Seguridad

- Contraseñas con bcrypt; política de mínimo 10 caracteres con letras y números.
- Máximo 5 intentos de login fallidos por correo cada 15 minutos.
- Sesión JWT de 8 horas; desactivar un usuario o cambiarle el rol aplica en la siguiente petición.
- Credenciales de equipos y token de WhatsApp cifrados con AES-256-GCM (`ENCRYPTION_KEY`).
- Toda consulta filtra por empresa; las acciones verifican permisos en el servidor.
- Registro de auditoría de las acciones importantes.
- Cabeceras de seguridad (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Las variables de entorno se validan al arrancar.

## Monitoreo MikroTik

Funciona con **RouterOS 7.1 o superior** a través de su API REST oficial. Toda la comunicación con el
router se hace desde el servidor; el navegador nunca recibe credenciales.

### Preparar cada MikroTik

1. Crea un usuario **de solo lectura** para el sistema:
   ```
   /user group add name=monitoreo policy=read,api,rest-api
   /user add name=wispx group=monitoreo password=CONTRASEÑA-LARGA address=IP-DEL-SERVIDOR
   ```
2. Activa la API REST. Recomendado HTTPS, con un certificado asignado:
   ```
   /certificate add name=rest common-name=router key-usage=key-cert-sign,tls-server
   /certificate sign rest
   /ip service set www-ssl certificate=rest disabled=no address=IP-DEL-SERVIDOR/32
   ```
   Si usas HTTP (puerto 80), la contraseña viaja sin cifrar: úsalo solo en una red de gestión privada.
3. **No expongas** `www`/`www-ssl` a internet: limita `address=` a la IP del servidor.
4. En WISPX, registra el router en **Routers** (IP, puerto 443 u 80, HTTPS sí/no, usuario y contraseña) y
   pulsa **Probar conexión**: muestra modelo, versión de RouterOS y tiempo activo.

### Cómo funciona

- Un **recolector en segundo plano** (arranca con el servidor) consulta cada router según el intervalo
  configurado (60 s por defecto), con un máximo de 4 routers a la vez y nunca dos consultas simultáneas al
  mismo router (RouterOS atiende las peticiones de un usuario de una en una). Guarda el historial y evalúa
  las alertas.
- Las pantallas se actualizan solas sin recargar la página y se pausan cuando la pestaña está oculta. El
  tráfico en vivo usa `monitor-traffic` con una caché corta: varias pestañas abiertas no multiplican las
  consultas al router.
- El cliente REST **solo permite lecturas** (GET y `monitor-traffic`); cualquier otra operación se rechaza
  en el código antes de llegar al router. No desconecta ni modifica a ningún cliente.
- La **WAN** se detecta sola por la ruta por defecto la primera vez; en la tabla de interfaces puedes marcar
  WAN/LAN, qué interfaces guardan historial y cuáles generan alerta si se caen (los SFP con enlace la
  activan por defecto).
- **Clientes ISP:** se cruzan los servicios del sistema (usuario PPPoE o IP) con las sesiones activas del
  router (`/ppp/active`), la tabla ARP (IP estática/DHCP) y las colas simples (consumo por cliente).
- Datos que dependen del modelo (temperatura, voltaje, CPU por núcleo, PPP, colas) se muestran como
  "No disponible" cuando el equipo no los informa.
- **Alertas:** router sin conexión, CPU, RAM, temperatura y tiempo de respuesta por encima del límite,
  WAN o SFP caídos. Límites e intervalos en **Monitoreo → Ajustes y alertas**. Se resuelven solas al
  normalizarse.
- Con varias instancias de la app, deja el recolector activo solo en una: `MONITORING_ENABLED=false` en las demás.

## Zonas: facturación y cortes automáticos

Cada cliente pertenece a una zona (obligatorio al crearlo; se cambia desde su ficha). Una zona define:

| Campo | Zona 15 | Zona 30 |
| --- | --- | --- |
| Día de factura | 15 | 30 (en febrero, el último día) |
| Límite de pago | 15 | 30 |
| Día de corte | 20 | 5 del mes siguiente |
| Gracia | 5 días | 5 días |

Las fechas se calculan por día del mes, no sumando días: la factura del 30-nov se corta el 5-dic y la
del 30-dic el 5-ene. Si el día de pago o de corte es menor que el anterior, cae en el mes siguiente.

**Tareas programadas** (cada minuto, en el servidor, sin que nadie abra el panel):

1. **Facturación:** cuando llega el día y la hora de factura de una zona, se emite una factura por cada
   servicio activo de sus clientes activos, con el precio actual del plan. Un periodo ya facturado nunca
   se repite (restricción en la base de datos + comprobación de periodo cubierto). Un servicio instalado
   después del inicio del ciclo se factura desde el siguiente. Si el sistema arranca a mitad de un ciclo
   cuyo corte ya pasó, ese ciclo no se factura (evita cortes inmediatos al ponerlo en marcha).
2. **Vencimientos:** las facturas impagas pasan a "vencida" tras el límite de pago.
3. **Cortes:** en la fecha y hora de corte, los clientes con facturas impagas (por defecto 1) se suspenden,
   salvo los marcados como *exentos de corte*. Se vuelve a comprobar el pago justo antes de tocar el router.
4. **Reconexión:** al registrar o aprobar un pago, si ya no queda deuda que justifique el corte, el cliente
   se reconecta en el acto. Los cortes **manuales** nunca se revierten solos.
5. **Cola de acciones en el router:** si el MikroTik no responde, el corte o la reconexión queda pendiente y
   se reintenta (1, 2, 5, 10, 15, 30 min… hasta 12 veces). Los errores permanentes (usuario PPPoE
   inexistente, sin permisos) quedan como *fallidos* con botón "Reintentar". Todo queda en
   **Zonas → Registro de cortes**.

Un bloqueo en la base de datos garantiza que, con varias instancias, solo una ejecute estas tareas.
`JOBS_ENABLED=false` las desactiva en una instancia.

### Cómo se corta en el MikroTik

| Tipo de servicio | Corte | Reconexión |
| --- | --- | --- |
| PPPoE (con "Usuario PPPoE") | Se deshabilita el usuario en `/ppp secret` y se cierra su sesión activa | Se vuelve a habilitar (el cliente se reconecta solo) |
| IP estática / DHCP (con IP) | Se agrega la IP a la address-list `morosos` | Se quita de la lista |

Para que la address-list corte de verdad, el router debe tener una regla que la bloquee, por ejemplo:
```
/ip firewall filter add chain=forward src-address-list=morosos action=drop comment="WISPX: clientes cortados"
```
El nombre de la lista se puede cambiar por router (campo `suspendList`).

El usuario del MikroTik necesita, además de `read,api,rest-api`, la política **write** para aplicar cortes.
El código solo permite estas escrituras: habilitar/deshabilitar un usuario PPP, cerrar una sesión PPP y
agregar/quitar una IP de la address-list; cualquier otra operación se rechaza antes de llegar al router.

## Desarrollo local

Requisitos: Node 20+, Docker.

```bash
cp .env.example .env          # y completa NEXTAUTH_SECRET, ENCRYPTION_KEY y SETUP_ADMIN_PASSWORD
docker compose up -d postgres # Postgres en el puerto 5434
npm install
npm run db:deploy             # aplica las migraciones
npm run setup                 # crea la empresa y el primer administrador (SETUP_* del .env)
npm run dev                   # http://localhost:3010
```

Comandos útiles:

| Comando | Para qué |
| --- | --- |
| `npm run db:migrate -- --name <cambio>` | Crear una migración tras modificar `prisma/schema.prisma` |
| `npm run db:studio` | Explorar la base de datos |
| `npm run reset-password` | Cambiar la contraseña de un usuario desde la terminal (se escribe oculta) |
| `npm test` | Tests unitarios |
| `npm run typecheck` / `npm run lint` | Revisión estática |

Si alguna vez aparece `Cannot read properties of undefined (reading 'call')`, hay dos servidores
usando la misma carpeta `.next`: deja uno solo, borra `.next` y vuelve a arrancar.

## Producción

1. En el servidor, copia el proyecto y crea `.env.production` a partir de `.env.production.example`.
   Genera `NEXTAUTH_SECRET` y `ENCRYPTION_KEY` con
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   **Guarda `ENCRYPTION_KEY` en un lugar seguro:** sin ella no se pueden leer las credenciales guardadas.
2. Construye y arranca (aplica las migraciones automáticamente):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```
3. Crea la empresa y el primer administrador (una sola vez):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate npm run setup
   ```
   Después borra `SETUP_ADMIN_PASSWORD` de `.env.production`.
4. Pon un proxy con HTTPS delante del puerto 3000. Ejemplo con Caddy (`/etc/caddy/Caddyfile`):
   ```
   isp.tudominio.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```
5. Comprueba: `curl https://isp.tudominio.com/api/health` → `{"status":"ok"}`.

**Actualizar a una versión nueva:** `git pull` y repetir el paso 2.

**Copias de seguridad** (programarlas a diario, guardar fuera del servidor):
```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U wispx wispx | gzip > backup-$(date +%F).sql.gz
```

## Límites conocidos

- **MikroTik:** corta y reconecta clientes existentes, pero no crea usuarios PPPoE, colas ni reglas de
  firewall (la regla que bloquea la lista `morosos` se crea a mano una vez). Las alertas y avisos de corte
  se ven en el panel; aún no se envían por WhatsApp o correo.
- **RouterOS 6** no tiene API REST: esos equipos no se pueden monitorear (la app lo indica al probar la conexión).
- **OLT:** el inventario de ONUs es manual; no hay lectura por SNMP ni aprovisionamiento automático.
- **WhatsApp:** hay configuración y envío de prueba; los recordatorios automáticos de pago necesitan
  plantillas aprobadas por Meta y aún no están programados.
- **Facturación electrónica (SRI):** las facturas son documentos internos, no comprobantes
  electrónicos autorizados.
- **Varias instancias:** el límite de intentos de login es en memoria; con más de una instancia de la
  app hay que moverlo a Redis.
- Entre un cambio de zona y el primer ciclo de la zona nueva puede quedar un tramo sin facturar (no se
  prorratea); nunca se factura dos veces el mismo periodo.
- Las facturas puntuales (creadas a mano) no generan cortes.
