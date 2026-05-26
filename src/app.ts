import express from "express";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Route to serve index.html as /home
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Route to serve team.html as /team
app.get("/team", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/team.html"));
});

// Root route redirects to /home
app.get("/", (req, res) => {
  res.redirect("/home");
});

// Fallback to serve index.html for any undefined routes (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`HavenLink running at http://localhost:${PORT}`);
});