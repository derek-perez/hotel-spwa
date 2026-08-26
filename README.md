# Hotel Posada Cocomacan — SPWA

Single Page Web Application móvil-first para **Hotel Posada Cocomacan**, en el corazón de Dolores Hidalgo, Cuna de la Independencia Nacional.

## Stack

- HTML5 semántico
- Tailwind CSS (CDN)
- Vanilla JavaScript (ES6+)
- [Lucide Icons](https://lucide.dev/)

## Estructura

```
index.html        Marcado semántico de todas las secciones
styles.css         Estilos personalizados (paleta, animaciones, componentes)
script.js          Lógica de la SPWA: render dinámico + motor de reservas por WhatsApp
hotel-data.json    Fuente única de datos: habitaciones, tarifas, amenidades, ubicación
public/images/     Fotografías del hotel
```

Todo el contenido (habitaciones, tarifas, amenidades, políticas, ubicación) se consume dinámicamente desde `hotel-data.json`.

## Cómo ejecutar localmente

El sitio usa `fetch()` para cargar `hotel-data.json`, por lo que debe servirse con un servidor HTTP local (abrir `index.html` con doble clic falla por CORS de `file://`):

```bash
npx serve .
```

o cualquier otro servidor estático (Live Server, `python -m http.server`, etc.).

## Reservas por WhatsApp

El widget de reserva rápida y cada tarjeta de habitación generan un enlace a WhatsApp con un mensaje pre-llenado (fechas, habitación/huéspedes) hacia el número de contacto del hotel definido en `hotel-data.json`.
