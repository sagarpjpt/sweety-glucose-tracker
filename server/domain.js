export const slots = [
  "Morning (fasting)",
  "After breakfast",
  "After lunch",
  "After dinner",
];
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= "1900-01-01"
  );
}
export function validateReading({ date, slot, value }) {
  if (!validDate(date)) return "Please choose a valid date.";
  if (date > today()) return "Date cannot be in the future.";
  if (value === undefined || value === null || value === "")
    return "Please enter a glucose value.";
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 40 ||
    value > 600
  )
    return "Value must be a whole number between 40 and 600 mg/dl.";
  if (!Number.isInteger(slot) || slot < 0 || slot > 3)
    return "Please choose one of the four time slots.";
}
export function reportRange(date, type) {
  const [year, month] = date.split("-").map(Number);
  if (type === "daily") return [date, date];
  if (type === "mtd") return [date.slice(0, 7) + "-01", date];
  const end = new Date(Date.UTC(year, month - 1, 0));
  return [
    end.toISOString().slice(0, 7) + "-01",
    end.toISOString().slice(0, 10),
  ];
}
