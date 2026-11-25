/**
 * Capa de persistencia (PBI-5: MongoDB real con caché síncrona).
 *
 * Responsabilidad: guardar/leer datos. No contiene reglas de negocio
 * ni conoce a la capa API. La interfaz pública es 100% síncrona e
 * idéntica a la de memoria: logica.js no cambió ni una línea.
 *
 * Cómo funciona: las lecturas salen siempre de la caché en memoria
 * (Map/Set, síncronas). Si hay BBDD conectada (MONGODB_URI), cada
 * escritura además se refleja en Mongo en diferido (write-through:
 * nunca bloquea ni rompe a la lógica si Mongo falla). Al arrancar,
 * conectarDB() hidrata la caché desde las 4 colecciones.
 * Sin MONGODB_URI: modo memoria puro (tests, CI, desarrollo rápido).
 */
const { MongoClient } = require("mongodb");

/**
 * Catálogo curado de 8 cafés de especialidad (V2.0 — Descubrir Café).
 */
const CATALOGO_CAFES = [
  {
    id: "etiopia-yirgacheffe",
    nombre: "Etiopía Yirgacheffe Aricha",
    origen: "Etiopía",
    tostador: "Nomad Coffee",
    puntuacionSca: 88.5,
    cafeina: "normal",
    tipoConsumo: ["solo", "frio"],
    cafeteras: ["filtro", "prensa"],
    perfilSabor: "afrutado",
    intensidad: "suave",
    notasSabor: "Jazmín, melocotón blanco y té negro cítrico",
    descripcion: "Floral, súper limpio y delicado, perfecto para amantes de los cafés etíopes en filtro.",
  },
  {
    id: "colombia-huila-fresa",
    nombre: "Colombia Huila Finca La Fresa",
    origen: "Colombia",
    tostador: "Right Side Coffee",
    puntuacionSca: 87.5,
    cafeina: "normal",
    tipoConsumo: ["solo", "con_leche"],
    cafeteras: ["espresso", "italiana", "superautomatica"],
    perfilSabor: "afrutado",
    intensidad: "media",
    notasSabor: "Fresa silvestre, chocolate con leche y miel",
    descripcion: "Dulzor brillante y jugoso con notas a frutas rojas que brilla tanto solo como con leche.",
  },
  {
    id: "guatemala-antigua",
    nombre: "Guatemala Antigua Los Volcanes",
    origen: "Guatemala",
    tostador: "San Jorge Café",
    puntuacionSca: 86.5,
    cafeina: "normal",
    tipoConsumo: ["solo", "con_leche"],
    cafeteras: ["italiana", "espresso", "superautomatica"],
    perfilSabor: "achocolatado",
    intensidad: "media",
    notasSabor: "Cacao tostado, caramelo salado y nueces",
    descripcion: "Cuerpo redondo y equilibrado con un reconfortante sabor achocolatado clásico.",
  },
  {
    id: "brasil-cerrado",
    nombre: "Brasil Cerrado Dulce",
    origen: "Brasil",
    tostador: "Toma Café",
    puntuacionSca: 85.5,
    cafeina: "normal",
    tipoConsumo: ["con_leche", "solo"],
    cafeteras: ["italiana", "superautomatica", "espresso"],
    perfilSabor: "achocolatado",
    intensidad: "intensa",
    notasSabor: "Chocolate con leche, avellana tostada y panela",
    descripcion: "Crema densa, baja acidez y un marcado perfil a frutos secos y cacao.",
  },
  {
    id: "kenia-nyeri",
    nombre: "Kenia Nyeri Peaberry",
    origen: "Kenia",
    tostador: "Hola Coffee",
    puntuacionSca: 88.0,
    cafeina: "normal",
    tipoConsumo: ["solo", "frio"],
    cafeteras: ["filtro", "prensa"],
    perfilSabor: "afrutado",
    intensidad: "media",
    notasSabor: "Grosella negra, pomelo dulce y azúcar de caña",
    descripcion: "Acidez fosfórica vibrante y un estallido frutal inconfundible para métodos de goteo.",
  },
  {
    id: "sumatra-mandheling",
    nombre: "Sumatra Mandheling Grano de Oro",
    origen: "Indonesia (Sumatra)",
    tostador: "Syra Coffee",
    puntuacionSca: 86.0,
    cafeina: "normal",
    tipoConsumo: ["solo", "con_leche"],
    cafeteras: ["prensa", "italiana", "espresso"],
    perfilSabor: "especiado",
    intensidad: "intensa",
    notasSabor: "Cedro, especias oscuras y cacao puro",
    descripcion: "Cuerpo pesado, especiado y profundo, ideal para quienes buscan una taza contundente.",
  },
  {
    id: "costa-rica-tarrazu",
    nombre: "Costa Rica Tarrazú Anaeróbico",
    origen: "Costa Rica",
    tostador: "D-Origen Coffee Roasters",
    puntuacionSca: 87.0,
    cafeina: "normal",
    tipoConsumo: ["solo"],
    cafeteras: ["filtro", "espresso"],
    perfilSabor: "especiado",
    intensidad: "media",
    notasSabor: "Canela dulce, manzana asada y toffee",
    descripcion: "Fermentación anaeróbica elegante que aporta complejidad licorosa y canela.",
  },
  {
    id: "colombia-huila-decaf",
    nombre: "Colombia Huila Descafeinado Caña de Azúcar",
    origen: "Colombia",
    tostador: "Cafés La Mexicana Specialty",
    puntuacionSca: 86.0,
    cafeina: "descafeinado",
    tipoConsumo: ["solo", "con_leche"],
    cafeteras: ["italiana", "espresso", "superautomatica", "filtro"],
    perfilSabor: "achocolatado",
    intensidad: "media",
    notasSabor: "Panela, cacao criollo y almendra dulce",
    descripcion: "Descafeinado natural con caña de azúcar que conserva todo el sabor y dulzor del café real.",
  },
];

/**
 * Recetario Maestro de 6 preparaciones legendarias de internet con fuentes reales (V2.0).
 */
const RECETAS_MAESTRAS = [
  {
    id: "receta-maestra-hoffmann-v60",
    nombreCafe: "V60 de James Hoffmann",
    origen: "Etiopía / Kenia",
    metodo: "V60",
    cafeGramos: 30,
    aguaGramos: 500,
    ratio: 16.7,
    tiempoSegundos: 210,
    molienda: "Media-Fina",
    notasSabor: "Claridad cristalina, extracción uniforme y acidez limpia sin amargor.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "James Hoffmann",
    usuarioEmail: "james.hoffmann@brewlab.pro",
    urlExterna: "https://www.youtube.com/watch?v=AI4ynXzkSQo",
    creadaEn: "2024-01-01T10:00:00.000Z",
  },
  {
    id: "receta-maestra-kasuya-46",
    nombreCafe: "Método 4:6 de Tetsu Kasuya",
    origen: "Centroamérica / África",
    metodo: "V60",
    cafeGramos: 20,
    aguaGramos: 300,
    ratio: 15.0,
    tiempoSegundos: 210,
    molienda: "Gruesa",
    notasSabor: "Control de acidez y dulzor en los dos primeros vertidos, fuerza en los tres últimos.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "Tetsu Kasuya",
    usuarioEmail: "tetsu.kasuya@brewlab.pro",
    urlExterna: "https://en.philocoffea.com/blogs/blog/coffee-brewing-method",
    creadaEn: "2024-01-01T10:05:00.000Z",
  },
  {
    id: "receta-maestra-wendelboe-aeropress",
    nombreCafe: "Aeropress de Tim Wendelboe",
    origen: "Kenia / Colombia",
    metodo: "Aeropress",
    cafeGramos: 14,
    aguaGramos: 200,
    ratio: 14.3,
    tiempoSegundos: 60,
    molienda: "Media-Fina",
    notasSabor: "Método directo con agitación breve y prensa suave; taza viva y transparente.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "Tim Wendelboe",
    usuarioEmail: "tim.wendelboe@brewlab.pro",
    urlExterna: "https://timwendelboe.no/brewing-guides/aeropress/",
    creadaEn: "2024-01-01T10:10:00.000Z",
  },
  {
    id: "receta-maestra-inei-espresso",
    nombreCafe: "Espresso clásico INEI",
    origen: "Blend Italiano",
    metodo: "Espresso",
    cafeGramos: 14,
    aguaGramos: 28,
    ratio: 2.0,
    tiempoSegundos: 25,
    molienda: "Fina",
    notasSabor: "Crema densa color avellana, cuerpo envolvente con toques tostados y chocolate negro.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "INEI Italia",
    usuarioEmail: "espresso.certificato@brewlab.pro",
    urlExterna: "http://www.espressoitaliano.org/en/The-Certified-Italian-Espresso.html",
    creadaEn: "2024-01-01T10:15:00.000Z",
  },
  {
    id: "receta-maestra-hoffmann-prensa",
    nombreCafe: "Prensa Francesa técnica Hoffmann",
    origen: "Brasil / Etiopía",
    metodo: "Prensa Francesa",
    cafeGramos: 30,
    aguaGramos: 500,
    ratio: 16.7,
    tiempoSegundos: 540,
    molienda: "Media",
    notasSabor: "Desespumado minucioso y reposo prolongado para una taza limpia y sin sedimentos.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "James Hoffmann",
    usuarioEmail: "james.hoffmann@brewlab.pro",
    urlExterna: "https://www.youtube.com/watch?v=st571DYYTR8",
    creadaEn: "2024-01-01T10:20:00.000Z",
  },
  {
    id: "receta-maestra-chefsteps-moka",
    nombreCafe: "Cafetera Italiana Gourmet ChefSteps",
    origen: "Guatemala / Colombia",
    metodo: "Cafetera Italiana",
    cafeGramos: 15,
    aguaGramos: 150,
    ratio: 10.0,
    tiempoSegundos: 120,
    molienda: "Fina-Media",
    notasSabor: "Agua hirviendo en el depósito inferior y corte térmico para evitar amargor quemado.",
    puntuacion: 5,
    esPublica: true,
    esMaestra: true,
    autor: "ChefSteps",
    usuarioEmail: "chefsteps@brewlab.pro",
    urlExterna: "https://www.chefsteps.com/activities/make-killer-coffee-with-a-moka-pot",
    creadaEn: "2024-01-01T10:25:00.000Z",
  },
];

class Datos {
  constructor() {
    // Caché: fuente síncrona para todas las lecturas.
    this.usuarios = new Map();
    this.eliminados = new Set();
    this.sesiones = new Map();
    // Verificaciones de email (PBI-7): token de un solo uso -> email.
    this.verificaciones = new Map();
    // Códigos OAuth de un solo uso (solo memoria, caducan en segundos): código -> { sesion, expira }.
    this.codigosOAuth = new Map();
    // Bolsas de café (PBI-9): id -> bolsa.
    this.bolsas = new Map();
    // Diario de extracciones (PBI-10): id -> extracción.
    this.extracciones = new Map();
    // Catálogo curado de cafés (V2.0): id -> café.
    this.catalogo = CATALOGO_CAFES.map((c) => ({ ...c }));
    // Recetas maestras de internet (V2.0): id -> receta.
    this.recetasMaestras = RECETAS_MAESTRAS.map((r) => ({ ...r }));
    // null = modo memoria (sin Mongo).
    this.db = null;
    this._client = null;
    // Escrituras en vuelo hacia Mongo (para poder esperarlas al cerrar).
    this._vuelos = new Set();
  }

  /**
   * Conecta a MongoDB e hidrata la caché. Se llama una vez al arrancar.
   * Sin uri: no hace nada (modo memoria). Devuelve true si conectó.
   */
  async conectarDB(uri) {
    if (!uri) {
      return false;
    }
    const client = new MongoClient(uri);
    await client.connect();
    this._client = client;
    this.usarBD(client.db());
    await this.cargar();
    return true;
  }

  /** Inyecta una BBDD (real o stub de tests) y la marca como activa. */
  usarBD(db) {
    this.db = db;
  }

  /** Hidrata la caché desde las colecciones (tras conectar). */
  async cargar() {
    const sinId = (doc) => {
      const copia = { ...doc };
      delete copia._id;
      return copia;
    };
    for (const u of await this.db.collection("usuarios").find({}).toArray()) {
      const limpio = sinId(u);
      this.usuarios.set(limpio.email, limpio);
    }
    for (const e of await this.db.collection("eliminados").find({}).toArray()) {
      this.eliminados.add(e.email);
    }
    for (const s of await this.db.collection("sesiones").find({}).toArray()) {
      this.sesiones.set(s.token, s.email);
    }
    for (const v of await this.db.collection("verificaciones").find({}).toArray()) {
      this.verificaciones.set(v.token, v.email);
    }
    for (const b of await this.db.collection("bolsas").find({}).toArray()) {
      const limpia = sinId(b);
      this.bolsas.set(limpia.id, limpia);
    }
    for (const ext of await this.db.collection("extracciones").find({}).toArray()) {
      const limpia = sinId(ext);
      this.extracciones.set(limpia.id, limpia);
    }
  }

  async cerrarDB() {
    if (this._client) {
      await this._client.close();
      this._client = null;
      this.db = null;
    }
  }

  // Escritura en diferido: refleja en Mongo sin bloquear a la lógica.
  // Se registran en vuelo para que sincronizar() pueda esperarlas.
  diferido(promesa, coleccion) {
    if (!this.db) {
      return;
    }
    const registrada = promesa.catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "fallo persistencia", coleccion, detalle: err.message }))
    );
    this._vuelos.add(registrada);
    registrada.finally(() => this._vuelos.delete(registrada));
  }

  // Espera a que terminen las escrituras pendientes (antes de cerrar).
  async sincronizar() {
    await Promise.allSettled([...this._vuelos]);
  }

  persistir(coleccion, filtro, doc) {
    if (!this.db) {
      return;
    }
    this.diferido(this.db.collection(coleccion).replaceOne(filtro, doc, { upsert: true }), coleccion);
  }

  borrarDe(coleccion, filtro) {
    if (!this.db) {
      return;
    }
    this.diferido(this.db.collection(coleccion).deleteOne(filtro), coleccion);
  }

  guardarUsuario(usuario) {
    const copia = { ...usuario };
    this.usuarios.set(copia.email, copia);
    this.persistir("usuarios", { email: copia.email }, copia);
  }

  buscarPorEmail(email) {
    return this.usuarios.get(email) || null;
  }

  listarUsuarios() {
    return [...this.usuarios.values()];
  }

  eliminarUsuario(email) {
    const ok = this.usuarios.delete(email);
    this.borrarDe("usuarios", { email });
    return ok;
  }

  marcarEliminado(email) {
    this.eliminados.add(email);
    this.persistir("eliminados", { email }, { email });
  }

  fueEliminado(email) {
    return this.eliminados.has(email);
  }

  guardarSesion(token, email) {
    this.sesiones.set(token, email);
    this.persistir("sesiones", { token }, { token, email });
  }

  buscarSesion(token) {
    return this.sesiones.get(token) || null;
  }

  eliminarSesion(token) {
    const ok = this.sesiones.delete(token);
    this.borrarDe("sesiones", { token });
    return ok;
  }

  guardarVerificacion(token, email) {
    this.verificaciones.set(token, email);
    this.persistir("verificaciones", { token }, { token, email });
  }

  buscarVerificacion(token) {
    return this.verificaciones.get(token) || null;
  }

  eliminarVerificacion(token) {
    const ok = this.verificaciones.delete(token);
    this.borrarDe("verificaciones", { token });
    return ok;
  }

  // — Códigos OAuth de un solo uso —

  guardarCodigoOAuth(codigo, registro) {
    this.codigosOAuth.set(codigo, registro);
  }

  // Devuelve el registro y lo borra: solo se puede leer una vez.
  consumirCodigoOAuth(codigo) {
    const registro = this.codigosOAuth.get(codigo) || null;
    this.codigosOAuth.delete(codigo);
    return registro;
  }

  // — Bolsas de café (PBI-9) —

  guardarBolsa(bolsa) {
    const copia = { ...bolsa };
    this.bolsas.set(copia.id, copia);
    this.persistir("bolsas", { id: copia.id }, copia);
  }

  buscarBolsa(id) {
    return this.bolsas.get(id) || null;
  }

  listarBolsasPorUsuario(usuarioEmail) {
    return [...this.bolsas.values()].filter(
      (b) => b.usuarioEmail === usuarioEmail
    );
  }

  eliminarBolsa(id) {
    const ok = this.bolsas.delete(id);
    this.borrarDe("bolsas", { id });
    return ok;
  }

  // — Diario de extracciones (PBI-10) —

  guardarExtraccion(extraccion) {
    const copia = { ...extraccion };
    this.extracciones.set(copia.id, copia);
    this.persistir("extracciones", { id: copia.id }, copia);
  }

  buscarExtraccion(id) {
    return this.extracciones.get(id) || null;
  }

  listarExtraccionesPorUsuario(usuarioEmail) {
    return [...this.extracciones.values()].filter(
      (e) => e.usuarioEmail === usuarioEmail
    );
  }

  listarExtraccionesPorBolsa(bolsaId) {
    return [...this.extracciones.values()].filter(
      (e) => e.bolsaId === bolsaId
    );
  }

  eliminarExtraccion(id) {
    const ok = this.extracciones.delete(id);
    this.borrarDe("extracciones", { id });
    return ok;
  }

  // — Consultas globales y comunitarias (PBI-11) —

  listarExtraccionesPublicas() {
    return [...this.extracciones.values()].filter((e) => e.esPublica === true);
  }

  listarTodasExtracciones() {
    return [...this.extracciones.values()];
  }

  listarTodasBolsas() {
    return [...this.bolsas.values()];
  }

  // — Catálogo y Recetas Maestras (V2.0) —

  listarCatalogo() {
    return this.catalogo.map((c) => ({ ...c }));
  }

  buscarEnCatalogo(id) {
    const cafe = this.catalogo.find((c) => c.id === id);
    return cafe ? { ...cafe } : null;
  }

  listarRecetasMaestras() {
    return this.recetasMaestras.map((r) => ({ ...r }));
  }

  buscarRecetaMaestra(id) {
    const receta = this.recetasMaestras.find((r) => r.id === id);
    return receta ? { ...receta } : null;
  }
}

module.exports = Datos;
