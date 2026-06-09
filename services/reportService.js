const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const pool = require("../config/db");

async function generateExcelReport(signalId, signalNumber) {
  const result = await pool.query(
    `SELECT u.full_name, u.rank, u.unit, u.phone, sr.delivered_at, sr.viewed_at, sr.acknowledged_at, sr.delivery_method
     FROM signal_receipts sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.signal_id = $1`,
    [signalId],
  );
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Recipients");
  worksheet.columns = [
    { header: "Full Name", key: "full_name", width: 30 },
    { header: "Rank", key: "rank", width: 20 },
    { header: "Unit", key: "unit", width: 30 },
    { header: "Phone", key: "phone", width: 20 },
    { header: "Delivered At", key: "delivered_at", width: 25 },
    { header: "Viewed At", key: "viewed_at", width: 25 },
    { header: "Acknowledged At", key: "acknowledged_at", width: 25 },
    { header: "Delivery Method", key: "delivery_method", width: 20 },
  ];
  result.rows.forEach((row) => worksheet.addRow(row));
  return workbook;
}

async function generatePDFReport(signalId, signalNumber) {
  const result = await pool.query(
    `SELECT u.full_name, u.rank, u.unit, u.phone, sr.delivered_at, sr.viewed_at, sr.acknowledged_at, sr.delivery_method
     FROM signal_receipts sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.signal_id = $1`,
    [signalId],
  );
  const doc = new PDFDocument();
  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", () => {});
  doc.fontSize(18).text(`Signal Report - ${signalNumber}`, { align: "center" });
  doc.moveDown();
  result.rows.forEach((row) => {
    doc
      .fontSize(10)
      .text(
        `${row.full_name} (${row.rank}) - Unit: ${row.unit} - Phone: ${row.phone} - Acknowledged: ${row.acknowledged_at || "No"}`,
        { indent: 10 },
      );
    doc.moveDown(0.5);
  });
  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

module.exports = { generateExcelReport, generatePDFReport };
