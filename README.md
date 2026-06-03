# 💧 HidroVisor

Sistema Avanzado de Monitorización Hídrica y Análisis Meteorológico Geoespacial. 

Esta plataforma web es una SPA (Single Page Application) que centraliza, procesa y representa espacialmente el estado de las reservas de agua en España y las predicciones meteorológicas en tiempo real, integrando datos del MITECO, AEMET y RainViewer.

## 🌐 ¡Prueba la aplicación desplegada en la nube!
👉 **[Acceder a HidroVisor](https://hidrovisor.onrender.com/)**

## 🛠️ Tecnologías Utilizadas

* **Frontend:** HTML5, CSS3, Vanilla JavaScript, EJS (Embedded JavaScript templates).
* **Mapas y SIG:** Leaflet.js.
* **Gráficos:** Chart.js.
* **Backend:** Node.js, Express.
* **Base de Datos:** MongoDB, Mongoose.
* **Seguridad:** JWT (JSON Web Tokens), Bcrypt.

## 📁 Estructura del Proyecto

El código está organizado siguiendo un patrón modular Cliente-Servidor (MVC):

### ⚙️ Raíz del Proyecto (Configuración y Servidor)
* `app.js` - Archivo principal. Inicializa el servidor Express, los middlewares de seguridad y gestiona las rutas.
* `.env` - Variables de entorno (puertos, credenciales, secretos JWT). *No se sube al repositorio*.
* `package.json` - Dependencias y scripts del proyecto Node.js.

### 🗄️ Backend (Lógica y Datos)
* `/models`
    * `User.js` - Esquema de Mongoose para perfiles de usuario, validación y encriptación de contraseñas.
* `/routes`
    * `index.js` - Rutas principales para renderizar las vistas.
    * `auth.js` - Endpoints de la API para login, registro y gestión de sesiones (JWT).
    * `users.js` - Endpoints para operaciones CRUD de las preferencias de los usuarios.

### 🖥️ Frontend (Interfaz de Usuario)
* `/views`
    * `index.ejs` - Plantilla principal que renderiza la SPA.
    * `/partials/` - Fragmentos de código reutilizables (como `svg_visuals.ejs` para los iconos vectoriales del mapa).

### 📂 Archivos Públicos (Client-Side)
* `/public/css`
    * `style.css` - Estilos globales, variables base y reset.
    * `style-v32.css` - Refinamientos visuales, mapas temáticos y micro-interacciones.
    * `auth.css` - Estilos específicos para el sistema de login y menús de usuario.
* `/public/js`
    * `config.js` - Estado global centralizado (almacén de datos geoespaciales).
    * `map.js` - Lógica del mapa Leaflet, capas base, marcadores dinámicos SVG y radar meteorológico.
    * `ui-v32.js` - Lógica de los mapas temáticos (coropléticos y símbolos proporcionales).
      
## 🚀 Instalación y Despliegue

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/hidrovisor.git](https://github.com/tu-usuario/hidrovisor.git)
    cd hidrovisor
    ```

2.  **Instalar las dependencias:**
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` en la raíz del proyecto y añade tus variables:
    ```env
    PORT=3000
    MONGODB_URI=tu_cadena_de_conexion_mongo
    JWT_SECRET=tu_secreto_super_seguro
    ```

4.  **Iniciar el servidor:**
    ```bash
    npm start
    ```
    La aplicación estará disponible en `http://localhost:3000`.
