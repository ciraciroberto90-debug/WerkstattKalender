// Ersatz für die window.storage-API der Claude-Artifact-Umgebung.
// Gleiche Schnittstelle (async get/set), aber gespeichert wird im
// localStorage des Browsers – die Daten bleiben damit dauerhaft auf
// diesem Rechner, auch offline.
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return true;
  },
};
