export function money(value: number | string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value));
}
export function manilaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function collectionRange(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 86400000).toISOString(),
  };
}
export function paymentTime(value: string) {
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}
