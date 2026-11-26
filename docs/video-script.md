# Guion del video de respaldo (5 minutos, con voz)

Este video es el plan B del Demo Day. Si la demo en vivo falla, se reproduce este y se habla encima. Por eso debe mostrar todo funcionando, con calma y sin errores. La guía de la demo en vivo es [demo.md](demo.md); este guion sigue la misma estructura pero está pensado para grabarse de corrido.

| Tiempo | Escena | Qué se ve | Criterio |
|---|---|---|---|
| 0:00 a 0:30 | 1. Qué es Notch | README, logo y el nombre | Caso de uso |
| 0:30 a 1:15 | 2. Terminal: 402, pago, sello, verificación | Terminal, API pública de testnet | Demo en vivo |
| 1:15 a 2:15 | 3. Claude Desktop (MCP) | Claude Desktop sellando y verificando | Demo en vivo |
| 2:15 a 3:00 | 4. Errores | Terminal: tope, duplicado, archivo alterado, API falsa | Errores y seguridad |
| 3:00 a 3:40 | 5. Evidencia | Stellar Expert: sello y pago | Integración con Stellar |
| 3:40 a 4:25 | 6. Mainnet | Sello real de la semana, verificado, en el explorador público | Integración con Stellar |
| 4:25 a 5:00 | 7. Cierre | README, npm, repo | Pitch y README |

## Antes de grabar (15 minutos)

**Seguridad, lo primero.** El video es público. Nunca muestres ni abras en pantalla: `.env`, `.env.agent`, `.env.mainnet-*`, `claude_desktop_config.json` ni ninguna llave que empiece con `S`. Si necesitas ver una dirección, usa las públicas de este guion.

**Comprobaciones:**

- API pública de testnet arriba:

  ```bash
  curl -s https://notch-production-721b582b.up.railway.app/ | head -c 80
  ```

  Debe imprimir `{"name":"Notch","network":"stellar:testnet"...`.
- API pública de mainnet arriba:

  ```bash
  curl -s https://zestful-mercy-production-31bdd567.up.railway.app/ | head -c 80
  ```

  Debe imprimir `{"name":"Notch","network":"stellar:pubnet"...`.
- **Saldo de testnet suficiente.** La grabación gasta unos 6 sellos (0.06 USDC de prueba). En Claude Desktop pide *"Revisa mi saldo con Notch"*. Si hay menos de 0.10, recarga en https://faucet.circle.com (Stellar testnet) a la dirección que muestre. La cartera de la terminal es la de `.env`, la de Claude Desktop es `GA6EY4EA…`: revisa las dos.
- **Claude Desktop en testnet.** Debe aparecer `notch-testnet` con tres herramientas. Si no, Cmd+Q y abrirlo otra vez.
- **Terminal limpia**, en la carpeta del repo, letra grande (mínimo 18 pt), tema oscuro, y con la API apuntada a la pública:

  ```bash
  cd ~/Documents/notch
  export API_URL=https://notch-production-721b582b.up.railway.app
  clear
  ```
- **Pestañas del navegador, en este orden:** el README del repo, Stellar Expert testnet (vacía), Stellar Expert mainnet (https://stellar.expert/explorer/public).
- **Archivos nuevos** (un hash solo se sella una vez, así que crea archivos distintos cada vez que grabes):

  ```bash
  echo "Reporte trimestral, borrador $(date +%s)" > report.txt
  echo "Contrato borrador $(date +%s)" > contract.txt && echo "$PWD/contract.txt"
  echo "Segundo reporte $(date +%s)" > report2.txt
  ```
- **Cómo grabar:** Cmd+Shift+5 en el Mac, "Grabar pantalla completa", con micrófono. Cierra notificaciones (modo No molestar). Resolución 1080p. Haz una prueba de 10 segundos y escúchala antes de grabar.

Si te equivocas en una escena, no pares: haz una pausa de dos segundos, repite la frase y después recortas.

## Escena 1. Qué es Notch (0:00 a 0:30)

**En pantalla:** el README, con el logo y el título. Baja hasta "Por qué se llama Notch".

**Di:**

> "Los agentes de IA ya entregan reportes y contratos. Si alguien pregunta si un documento existía antes de una fecha, o si lo editaron después, la única prueba son los registros de quien lo hizo."
>
> "Notch es un servicio de sellos de tiempo que cobra por uso. Un agente calcula la huella del documento, paga un centavo de dólar con x402 y Notch la ancla en una transacción de Stellar. No hay cuentas, ni llaves de API, ni suscripción."
>
> "El nombre es una muesca: el corte que se hacía en un palo para dejar constancia de algo. Permanente, prueba que algo estuvo ahí y no dice qué era."

## Escena 2. Terminal: 402, pago, sello, verificación (0:30 a 1:15)

**En pantalla:** la terminal. Ejecuta uno a uno y espera a cada resultado.

```bash
curl -i -X POST $API_URL/stamp -H 'content-type: application/json' \
  -d "{\"hash\":\"$(shasum -a 256 report.txt | cut -d' ' -f1)\"}" | head -1
```

**Di:** "Sin pagar, la API responde 402, pago requerido, y dice cuánto cobra: un centavo."

```bash
npm run stamp -- report.txt
```

**Di mientras corre:** "El agente calcula la huella en mi máquina, el archivo nunca sale. Pregunta el precio, comprueba que va a pagar a la cuenta correcta, revisa su saldo y su tope, paga con x402 y recibe el sello."

Cuando termine, copia el `tx` del sello:

```bash
npm run verify -- report.txt <tx del sello>
```

**Di:** "Y la verificación es gratis y se hace directo en Stellar: este archivo existía a más tardar en esta fecha."

## Escena 3. Claude Desktop con MCP (1:15 a 2:15)

**En pantalla:** Claude Desktop, conversación nueva.

**Di:** "Un agente normalmente es un asistente de IA, así que Notch también es una herramienta para Claude."

Escribe, uno a uno:

1. *"Revisa mi saldo con Notch"*
2. *"Sella con Notch este archivo: /ruta/completa/contract.txt"* (acepta el permiso si lo pide)
3. *"Verifica con Notch ese archivo"*

**Di:** "Mi cartera paga desde mi propia máquina. El servidor nunca ve mi llave, y mi agente solo paga a la cuenta en la que confía."

Si hay tiempo, enseña la herramienta del paquete: "Y se instala sin clonar nada: es el paquete `notch-mcp` en npm."

## Escena 4. Errores (2:15 a 3:00)

Todos estos casos se probaron contra la red real. Muestra los cuatro, rápido.

**Tope de gasto.** El agente se niega antes de firmar:

```bash
SPEND_CAP='$0.005' npm run stamp -- report2.txt
```

Esperado: `The API charges more than the cap ($0.005). Nothing was signed or sent.`

**Duplicado.** El mismo archivo, sin cobro:

```bash
npm run stamp -- report.txt
```

Esperado: `Already stamped, nothing was charged`.

**Archivo alterado.** Cambia un carácter y verifica:

```bash
echo "editado" >> report.txt
npm run verify -- report.txt <tx del sello>
```

Esperado: `INVALID: the memo does not match this hash`.

**API falsa.**

```bash
API_URL=https://evil.example.com npm run stamp -- report2.txt
```

Esperado: `For an API outside this machine, set EXPECTED_PAYEE...`.

**Di:** "El agente no cobra dos veces, no gasta más de su tope, detecta un archivo alterado y se niega a hablar con un servidor en el que no confía."

## Escena 5. Evidencia (3:00 a 3:40)

**En pantalla:** abre en Stellar Expert (testnet) el enlace `Stamp:` y luego el `Paid:` de la escena 2.

**Di:** "El memo de esta transacción es la huella del archivo, y la fecha es el cierre del ledger. Aquí está el pago: 0.01 USDC del agente a la cuenta de cobro. Todo se puede comprobar en Stellar Expert, sin confiar en Notch."

## Escena 6. Mainnet (3:40 a 4:25)

**En pantalla:** la terminal y, después, Stellar Expert en la red pública.

**Di:** "Hasta aquí fue testnet. Notch también funciona en mainnet, con dinero real. Esta es la API de producción y estos son sellos reales que hicimos esta semana."

Verifica, gratis, un sello real de mainnet que ya existe:

```bash
STELLAR_NETWORK=pubnet npm run verify -- ~/Documents/notch-prueba/contrato.txt 58f705888ae777f27cc2d7a5835dd00631be346c905e256b9dfe89e3b539b6c5
```

Esperado: `VALID: this file existed no later than 2026-11-26T00:50:04Z`.

Abre ese sello en el explorador público:
https://stellar.expert/explorer/public/tx/58f705888ae777f27cc2d7a5835dd00631be346c905e256b9dfe89e3b539b6c5

**Di:** "El mismo flujo, con USDC real. La cuenta que cobra es mía, la dirección está publicada en el README, y cada usuario paga con su propia cartera."

**Opcional, un sello real nuevo en vivo (cuesta 0.01 USDC reales).** Solo si tienes ganas de mostrarlo. El comando lee la secreta de un archivo y no la muestra, pero no abras ese archivo en pantalla:

```bash
echo "Sello real $(date +%s)" > real.txt
STELLAR_NETWORK=pubnet NOTCH_ALLOW_MAINNET=1 SOROBAN_RPC_URL=https://soroban-rpc.mainnet.stellar.gateway.fm API_URL=https://zestful-mercy-production-31bdd567.up.railway.app node --env-file=.env.mainnet-agent partes/josecadenax/src/agent.js real.txt
```

## Escena 7. Cierre (4:25 a 5:00)

**En pantalla:** el README, con los badges de las dos APIs, y la página del paquete en npm: https://www.npmjs.com/package/notch-mcp

**Di:**

> "Hoy Notch funciona en la red de pruebas y en la principal, tiene un servidor para Claude que se instala con un solo comando y ochenta y seis pruebas automáticas en verde. El agente paga solo a la cuenta que conoce, con un tope por sello, y nunca cobra dos veces. Gracias."

## Después de grabar

1. Mira el video completo una vez, con audio. Comprueba que no se vea ninguna llave ni ningún archivo `.env`.
2. Guárdalo con el nombre `notch-demo-respaldo-voz.mp4` y haz una copia en un pendrive y en tu nube, por si falla internet el viernes.
3. Si quieres incluirlo en el repo, avísame y lo recorto, lo comprimo y lo enlazo en el README. Pesa más que el GIF actual, así que quizá convenga subirlo como enlace en vez de dentro del repositorio.

## Si algo falla mientras grabas

| Ves | Haz esto |
|---|---|
| `The API did not answer` | Revisa la URL pública. Si Railway está caído, espera un minuto y repite la escena |
| `INSUFFICIENT_BALANCE` | Recarga USDC de prueba en https://faucet.circle.com (Stellar testnet) |
| `Already stamped` en una escena nueva | Crea un archivo nuevo, ese hash ya se selló |
| Claude Desktop no muestra `notch-testnet` | Cmd+Q y abrirlo de nuevo |
| 502 o timeout del facilitador | Espera unos segundos y repite. Un 502 nunca se cobra |
| Se ve una llave en pantalla | Para, borra la grabación y empieza otra vez. No la compartas |
