import express from "express";
import path from "path";
import nodemailer from "nodemailer";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "havenlink.org@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "",
  },
});

// Partnership form submission endpoint
app.post("/api/partnership-request", async (req, res) => {
  try {
    const {
      org_name,
      org_type,
      description,
      contact_name,
      contact_title,
      contact_email,
      contact_phone,
      website,
      location,
      states,
      experience,
      licensing,
      message,
    } = req.body;

    // Validate required fields
    if (!org_name || !contact_name || !contact_email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create email content
    const emailContent = `
New Partnership Request from HavenLink

Organization Information:
- Organization Name: ${org_name}
- Organization Type: ${org_type}
- Description: ${description}
- Primary Location: ${location}
- States Served: ${states}
- Years of Experience: ${experience}
- Licensing Status: ${licensing}
- Website: ${website || "Not provided"}

Contact Information:
- Name: ${contact_name}
- Title: ${contact_title}
- Email: ${contact_email}
- Phone: ${contact_phone}

Additional Information:
${message || "No additional information provided"}
    `;

    // Send email to HavenLink
    const mailOptions = {
      from: process.env.EMAIL_USER || "havenlink.org@gmail.com",
      to: "havenlink.org@gmail.com",
      subject: `Partnership Request: ${org_name}`,
      text: emailContent,
    };

    await transporter.sendMail(mailOptions);

    // Send confirmation email to the organization
    const confirmationEmail = {
      from: process.env.EMAIL_USER || "havenlink.org@gmail.com",
      to: contact_email,
      subject: "Partnership Request Received - HavenLink",
      text: `Hello ${contact_name},

Thank you for submitting your partnership request to HavenLink! We've received your information and our partnership team will review it shortly.

We aim to respond to all partnership inquiries within 3-5 business days. If you have any questions in the meantime, feel free to reach out.

Best regards,
The HavenLink Team
havenlink.org@gmail.com
      `,
    };

    await transporter.sendMail(confirmationEmail);

    res.json({
      success: true,
      message: "Partnership request submitted successfully!",
    });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({
      error: "Failed to submit partnership request. Please try again or contact us directly at havenlink.org@gmail.com",
    });
  }
});

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