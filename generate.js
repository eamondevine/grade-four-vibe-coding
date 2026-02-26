const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");
const QRCode = require("qrcode");

// ─── Config ───────────────────────────────────────────
const BASE_URL =
  "https://eamondevine.github.io/grade-four-vibe-coding/students";
const CSV_FILE = "students.csv";
const TEMPLATE_FILE = "template.html";
const STUDENTS_DIR = "students";
const QRCODES_DIR = "qrcodes";

// ─── CSV Column Names (must match your Google Form exactly) ───
const COL_NAME = "What is your name?";
const COL_CLASS = "What is your class number?";
const COL_SEAT = "What is your seat number?";
const COL_AGE = "How old are you?";
const COL_FOOD = "What's your favorite food?";
const COL_GAME = "What's your favorite game?";
const COL_SHOW = "What's your favorite show?";
const COL_JOB = "What is your dream job?";
const COL_SUBJECT = "What's your favorite school subject?";

// ─── Helpers ──────────────────────────────────────────

// Converts "John Smith" → "john-smith"
function slugify(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

// Converts "John Smith" → "john-smith.jpg"
function photoFilename(name) {
  return `${slugify(name)}.jpg`;
}

// Parse CSV respecting quoted fields including multiline quoted fields
function parseCSV(text) {
  const fields = tokenizeCSV(text);
  if (fields.length === 0) return [];

  const headers = fields[0].map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < fields.length; i++) {
    const values = fields[i];
    if (values.every((v) => !v.trim())) continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// Tokenizes entire CSV text into array of rows, each row an array of fields
function tokenizeCSV(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if (char === "\r" && next === "\n" && !inQuotes) {
      row.push(current);
      current = "";
      rows.push(row);
      row = [];
      i += 2;
      continue;
    } else if (char === "\n" && !inQuotes) {
      row.push(current);
      current = "";
      rows.push(row);
      row = [];
    } else {
      current += char;
    }
    i++;
  }

  // Push last field and row
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

// ─── Duplicate Detection ──────────────────────────────
function uniqueKey(row) {
  return `${row[COL_NAME]}|${row[COL_CLASS]}|${row[COL_SEAT]}`.toLowerCase();
}

// ─── QR Code Generator ───────────────────────────────
async function generateQRCode(studentName, url) {
  const slug = slugify(studentName);
  const outputPath = path.join(QRCODES_DIR, `${slug}_qrcode.png`);

  // Canvas size
  const canvasWidth = 400;
  const qrSize = 340;
  const labelHeight = 60;
  const canvasHeight = qrSize + labelHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Generate QR code onto a temp canvas
  const qrCanvas = createCanvas(qrSize, qrSize);
  await QRCode.toCanvas(qrCanvas, url, {
    width: qrSize,
    margin: 2,
    color: { dark: "#2d2d2d", light: "#ffffff" },
  });

  // Draw QR onto main canvas centered
  const qrX = (canvasWidth - qrSize) / 2;
  ctx.drawImage(qrCanvas, qrX, 0);

  // Draw student name below QR
  ctx.fillStyle = "#2d2d2d";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(studentName, canvasWidth / 2, qrSize + 42);

  // Save to file
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ✅ QR code saved: ${outputPath}`);
}

// ─── Main ─────────────────────────────────────────────
async function generate() {
  // Read template
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`❌ Template file not found: ${TEMPLATE_FILE}`);
    process.exit(1);
  }
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");

  // Read CSV
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ CSV file not found: ${CSV_FILE}`);
    process.exit(1);
  }
  const csvText = fs.readFileSync(CSV_FILE, "utf8");
  const rows = parseCSV(csvText);

  // DEBUG — remove after fixing
  console.log("📋 Headers found:");
  if (rows.length > 0)
    Object.keys(rows[0]).forEach((h) => console.log(" ", JSON.stringify(h)));
  console.log("📋 First row values:", rows[0]);

  fs.mkdirSync(STUDENTS_DIR, { recursive: true });
  fs.mkdirSync(QRCODES_DIR, { recursive: true });

  // Track seen keys for duplicate detection
  const seen = new Set();
  let generated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[COL_NAME];

    if (!name) {
      console.warn("⚠️  Skipping row with empty name.");
      skipped++;
      continue;
    }

    // Duplicate check
    const key = uniqueKey(row);
    if (seen.has(key)) {
      console.warn(
        `⚠️  Duplicate detected, skipping: ${name} (class ${row[COL_CLASS]}, seat ${row[COL_SEAT]})`,
      );
      skipped++;
      continue;
    }
    seen.add(key);

    const slug = slugify(name);
    const studentURL = `${BASE_URL}/${slug}`;

    console.log(`\n📄 Generating: ${name}`);

    // Fill template
    let html = template
      .replaceAll("{{STUDENT_NAME}}", name)
      .replaceAll("{{PHOTO_FILENAME}}", photoFilename(name))
      .replaceAll("{{CLASS_NUMBER}}", row[COL_CLASS] || "")
      .replaceAll("{{SEAT_NUMBER}}", row[COL_SEAT] || "")
      .replaceAll("{{AGE}}", row[COL_AGE] || "")
      .replaceAll("{{FOOD}}", row[COL_FOOD] || "")
      .replaceAll("{{GAME}}", row[COL_GAME] || "")
      .replaceAll("{{SHOW}}", row[COL_SHOW] || "")
      .replaceAll("{{JOB}}", row[COL_JOB] || "")
      .replaceAll("{{SUBJECT}}", row[COL_SUBJECT] || "");

    // Write HTML file
    const studentDir = path.join(STUDENTS_DIR, slug);
    fs.mkdirSync(studentDir, { recursive: true });
    const htmlPath = path.join(studentDir, "index.html");
    fs.writeFileSync(htmlPath, html, "utf8");
    console.log(`  ✅ HTML saved: ${htmlPath}`);

    // Generate QR code
    await generateQRCode(name, studentURL);

    generated++;
  }

  console.log(`\n🎉 Done! Generated: ${generated} | Skipped: ${skipped}`);
}

generate();
