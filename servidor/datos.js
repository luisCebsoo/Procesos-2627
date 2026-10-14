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

class Datos {
  constructor() {
    // Caché: fuente síncrona para todas las lecturas.
    this.usuarios = new Map();
    this.eliminados = new Set();
    this.sesiones = new Map();
    // Verificaciones de email (PBI-7): token de un solo uso -> email.
    this.verificaciones = new Map();
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
}

module.exports = Datos;
