import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ===== CLEAN URL ROUTES (without .html extensions) =====

// Home page
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Team page
app.get("/team", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/team.html"));
});

// Adoption pages - clean URLs
app.get("/adopt/home-study", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/home-study.html"));
});

app.get("/adopt/intake-form", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/intake-form.html"));
});


app.get("/adopt/agency-profiles", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/agency-profiles.html"));
});

app.get("/adopt/matching", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/matching.html"));
});



// Generic .html redirect for root-level files
app.get(/^\/([a-zA-Z0-9\-]+)\.html$/, (req, res) => {
  const base = req.params[0];
  if (base === "index") {
    res.redirect(301, "/home");
  } else {
    res.redirect(301, `/${base}`);
  }
});

// Generic .html redirect for subfolders (e.g. /adopt/whatever.html)
app.get(/^\/(.+)\/([a-zA-Z0-9\-]+)\.html$/, (req, res) => {
  // e.g. /adopt/home-study.html -> /adopt/home-study
  const folder = req.params[0];
  const page = req.params[1];
  res.redirect(301, `/${folder}/${page}`);
});

app.get("/adopt/matching.html", (req, res) => {
  res.redirect(301, "/adopt/matching");
});

// Root route redirects to /home
app.get("/", (req, res) => {
  res.redirect("/home");
});


// Fallback to serve index.html for any undefined routes (SPA fallback),
// but serve team.html for /team and anchor links like /team#contact
app.get(/^\/team(\/)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/team.html"));
});

app.get(/^\/(?!adopt\/).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`HavenLink running at http://localhost:${PORT}`);
});