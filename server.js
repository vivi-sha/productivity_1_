import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

import helmet from "helmet";
import crypto from "crypto";
import compression from "compression";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";

import Week from "./models/Week.js";
import User from "./models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");

// Disable helmet's built-in CSP so we can provide a nonce-based CSP per request
app.use(helmet({ contentSecurityPolicy: false }));
// Per-request CSP nonce + header. This allows us to keep a strict CSP while
// permitting necessary inline scripts by adding a nonce attribute to them.
app.use((req, res, next) => {
  try {
    const nonce = crypto.randomBytes(16).toString("base64");
    // expose to EJS templates as `cspNonce`
    res.locals.cspNonce = nonce;

    const directives = [
      "default-src 'self'",
      // allow scripts from self, CDN, and inline scripts carrying the nonce
      `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net`,
      // styles: allow self, CDN, Google Fonts and allow inline styles for small in-template styles
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data:",
      "connect-src 'self' https://cdn.jsdelivr.net",
      "font-src 'self'",
    ];

    res.setHeader('Content-Security-Policy', directives.join('; '));
  } catch (e) {
    // if nonce generation fails, continue without setting CSP (safer to fail open here)
    console.error('CSP nonce generation failed', e);
  }
  next();
});
app.use(compression());
// app.use(mongoSanitize());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// connect to db 
const MONGODB_URI = process.env.MONGODB_URI || "";
if (!MONGODB_URI) {
  console.warn("⚠️  MONGODB_URI is not set. Set it in .env");
}
mongoose
  .connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API
app.get("/api/tasks/:weekKey", async (req, res, next) => {
  try {
    const doc = await Week.findOne({ weekKey: req.params.weekKey }).lean();
    res.json(doc?.days || {});
  } catch (e) { next(e); }
});

//first updation of day task inside particular weekkey

app.post("/api/tasks/:weekKey", async (req, res, next) => {
  try {
    const { weekKey } = req.params;
    const { days } = req.body;
    if (typeof days !== "object" || Array.isArray(days)) {
      return res.status(400).json({ error: "Invalid payload: 'days' must be an object" });
    }
    const updated = await Week.findOneAndUpdate(
      { weekKey },//filter
      { days, updatedAt: new Date() },//If it exists — update it.
      { upsert: true, new: true }//If it doesn’t — create it, new i updated doc is returned
     ).lean();//Then give me the updated result as plain JSON.
    res.json({ success: true, weekKey, days: updated.days });
  } catch (e) { next(e); }
});

app.delete("/api/tasks/:weekKey/:dayIndex/:taskId", async (req, res, next) => {
  try {
    const { weekKey, dayIndex, taskId } = req.params;
    const doc = await Week.findOne({ weekKey });
    //check if doc exists and dayIndex exists
    if (!doc || !doc.days[dayIndex]) {
      return res.status(404).json({ error: "Week or day not found" });
    }
 //filters all tasks and separates all tasks from the to be deleted one
    doc.days[dayIndex] = doc.days[dayIndex].filter(t => t.id !== taskId);
  // markModified so Mongoose knows to persist changes to the mixed 'days' field
  //doc i mongoose document, markModified is mongoose method we are checking if that method exists
  if (typeof doc.markModified === 'function') doc.markModified('days');
  await doc.save();

    res.json({ success: true, days: doc.days });
  } catch (e) { next(e); }
});

app.put("/api/tasks/:weekKey/:dayIndex/:taskId", async (req, res, next) => {
  try {
    const { weekKey, dayIndex, taskId } = req.params;
    const { text, status } = req.body;

    const doc = await Week.findOne({ weekKey });
    
    if (!doc || !doc.days[dayIndex]) {
      return res.status(404).json({ error: "Week or day not found" });
    }

    const taskIndex = doc.days[dayIndex].findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: "Task not found" });
    }

  doc.days[dayIndex][taskIndex] = { id: taskId, text, status };
  // markModified so Mongoose persists updates to the mixed 'days' field
  if (typeof doc.markModified === 'function') doc.markModified('days');
  await doc.save();

    res.json({ success: true, task: doc.days[dayIndex][taskIndex] });
  } catch (e) { next(e); }
});

app.delete("/api/tasks/:weekKey", async (req, res, next) => {
  try {
    await Week.deleteOne({ weekKey: req.params.weekKey });
    res.json({ cleared: true });
  } catch (e) { next(e); }
});

// Pages (render existing ejs files if present)
import axios from "axios"; // make sure this is at the top with other imports

app.get("/", async (req, res) => {
  try {
    const response = await axios.get("https://api.api-ninjas.com/v1/quotes", {
      headers: { "X-Api-Key": process.env.API },
    });

    const data = response.data[0]; // API returns array with one quote
    res.render("index.ejs", { content: data });
  } 
  catch (error) {
    console.error(error);
    res.render("index.ejs", {
      content: { quote: "Failed to load quote 😢", author: "Unknown" },
    });
  }
});
app.get("/weekly", (req, res) => res.render("weekly"));
app.get("/login", (req, res) => res.render("login"));
app.get("/signup", (req, res) => res.render("signup"));
app.get("/report", (req, res) => res.render("report"));
app.get("/notes", (req, res) => res.render("notes"));
app.get("/pomodoro", (req, res) => res.render("pomodoro"));

// Auth endpoints: POST /signup and POST /login
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

// Signup: create user and return token
app.post('/signup', async (req, res, next) => {
  try {
    const { email, username, password } = req.body || {};
    if (!email || !username || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

    // password policy: 6+ chars, at least one letter and one number
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordPattern.test(password)) {
      return res.status(400).json({ success: false, message: 'Password does not meet requirements' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const user = new User({ email, username });
    await user.setPassword(password);
    await user.save();

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username: user.username, email: user.email });
  } catch (e) { next(e); }
});

// Login: validate and return token
app.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const ok = await user.validatePassword(password);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, username: user.username, email: user.email });
  } catch (e) { next(e); }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
