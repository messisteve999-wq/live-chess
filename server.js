const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { users: {} }; }
}
function writeDB(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DB_FILE);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, saved) {
  const [salt, expected] = String(saved || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const exp = Buffer.from(expected, "hex");
  return actual.length === exp.length && crypto.timingSafeEqual(actual, exp);
}
function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 20);
}
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();
function auth(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const username = sessions.get(token);
  if (!username) return res.status(401).json({ error: "Session expirée. Reconnecte-toi." });
  req.username = username;
  next();
}
app.post("/api/register", (req, res) => {
  const username = cleanName(req.body.username);
  const password = String(req.body.password || "");
  if (!/^[\p{L}\p{N}_ -]{3,20}$/u.test(username)) return res.status(400).json({ error: "Le nom doit contenir 3 à 20 caractères." });
  if (password.length < 6 || password.length > 128) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  const db = readDB();
  const key = username.toLocaleLowerCase();
  if (db.users[key]) return res.status(409).json({ error: "Ce nom est déjà utilisé." });
  db.users[key] = { username, passwordHash: hashPassword(password), points: 200, wins: 0, losses: 0, createdAt: new Date().toISOString() };
  writeDB(db);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, key);
  res.json({ token, user: publicUser(db.users[key]) });
});
app.post("/api/login", (req, res) => {
  const key = cleanName(req.body.username).toLocaleLowerCase();
  const password = String(req.body.password || "");
  const db = readDB();
  const user = db.users[key];
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Nom ou mot de passe incorrect." });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, key);
  res.json({ token, user: publicUser(user) });
});
app.post("/api/logout", auth, (req, res) => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  sessions.delete(token);
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => {
  const db = readDB();
  res.json({ user: publicUser(db.users[req.username]) });
});
function publicUser(u) {
  return { username: u.username, points: u.points, wins: u.wins, losses: u.losses };
}

const rooms = new Map();
const socketUsers = new Map();
function roomSnapshot(room) {
  return { code: room.code, fen: room.game.fen(), turn: room.game.turn(), players: room.players.map(p => ({ username: p.username, color: p.color })), status: room.game.isGameOver() ? (room.game.isCheckmate() ? "Échec et mat" : "Partie terminée") : "Partie en cours" };
}
function broadcastRoom(room) { io.to(room.code).emit("room:update", roomSnapshot(room)); }
io.on("connection", socket => {
  socket.on("room:create", ({ token } = {}, cb = () => {}) => {
    const username = sessions.get(String(token || ""));
    if (!username) return cb({ error: "Connecte-toi avant de créer une partie." });
    let code;
    do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
    const room = { code, game: new Chess(), players: [{ username, color: "w", socketId: socket.id }], bet: 0 };
    rooms.set(code, room);
    socket.join(code); socketUsers.set(socket.id, { username, code });
    cb({ code, state: roomSnapshot(room) }); broadcastRoom(room);
  });
  socket.on("room:join", ({ token, code } = {}, cb = () => {}) => {
    const username = sessions.get(String(token || ""));
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!username) return cb({ error: "Connecte-toi avant de rejoindre une partie." });
    if (!room) return cb({ error: "Salon introuvable ou fermé." });
    if (room.players.some(p => p.username.toLowerCase() === username.toLowerCase())) return cb({ error: "Tu es déjà dans ce salon." });
    if (room.players.length >= 2) return cb({ error: "Cette partie est complète." });
    room.players.push({ username, color: "b", socketId: socket.id });
    socket.join(code); socketUsers.set(socket.id, { username, code });
    cb({ code, state: roomSnapshot(room) }); broadcastRoom(room);
  });
  socket.on("game:move", ({ token, code, from, to, promotion } = {}, cb = () => {}) => {
    const username = sessions.get(String(token || ""));
    const room = rooms.get(String(code || "").toUpperCase());
    if (!username || !room) return cb({ error: "Session ou partie invalide." });
    const player = room.players.find(p => p.username.toLowerCase() === username.toLowerCase() && p.socketId === socket.id);
    if (!player) return cb({ error: "Tu n'es pas un joueur actif de cette partie." });
    if (room.players.length < 2) return cb({ error: "Attends qu'un adversaire rejoigne la partie." });
    if ((room.game.turn() === "w" ? "w" : "b") !== player.color) return cb({ error: "Ce n'est pas ton tour." });
    try {
      const move = room.game.move({ from, to, promotion: promotion || "q" });
      if (!move) return cb({ error: "Coup illégal." });
      cb({ ok: true });
      broadcastRoom(room);
      if (room.game.isGameOver()) {
        const winnerColor = room.game.isCheckmate() ? (room.game.turn() === "w" ? "b" : "w") : null;
        const winner = winnerColor ? room.players.find(p => p.color === winnerColor) : null;
        io.to(room.code).emit("game:finished", { result: room.game.isCheckmate() ? "checkmate" : "draw", winner: winner?.username || null, reason: room.game.isCheckmate() ? "Échec et mat" : "Nulle ou partie terminée" });
      }
    } catch { cb({ error: "Coup illégal." }); }
  });
  socket.on("disconnect", () => {
    const info = socketUsers.get(socket.id);
    socketUsers.delete(socket.id);
    if (info) {
      const room = rooms.get(info.code);
      if (room) io.to(info.code).emit("player:disconnected", { username: info.username });
    }
  });
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
server.listen(PORT, "0.0.0.0", () => console.log(`live-chess prêt : http://127.0.0.1:${PORT}`));
