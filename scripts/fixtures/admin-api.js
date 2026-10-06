// Isolated component-test data. Never imported by src/ or production builds.
const residents = Array.from({ length: 27 }, (_, i) => ({
  id: `r${i}`,
  user_id: `u${i}`,
  first_name: `Resident${i}`,
  last_name: `Test${i}`,
  tracking_number: `TEST-${i}`,
  residential_address: "Test address",
  birth_date: "2000-01-01",
  sex: "Male",
  civil_status: "Single",
  status: i % 3 === 0 ? "pending_review" : "verified",
  updated_at: `2026-10-${String(1 + (i % 6)).padStart(2, "0")}T00:00:00Z`,
  submitted_at: "2026-10-01T00:00:00Z",
  search_text: `Resident${i} Test${i} TEST-${i} Test address`,
}));
const appointments = Array.from({ length: 25 }, (_, i) => ({
  id: `a${i}`,
  resident_id: `r${i}`,
  residents: residents[i],
  status: i % 2 ? "confirmed" : "pending",
  service_type: "certificate_of_residency",
  service_purpose: "low_income",
  fee: 30,
  appointment_date: "2026-10-07",
  appointment_time: "09:00:00",
  created_at: "2026-10-01T00:00:00Z",
  service_label: "Certificate of Residency",
  search_text: `Resident${i} Low Income`,
}));
const announcements = Array.from({ length: 9 }, (_, i) => ({
  id: `n${i}`,
  title: `Announcement ${i}`,
  message: "Long test announcement ".repeat(30),
  priority: "info",
  audience: "all",
  is_published: true,
  archived: i === 8,
  expires_at: null,
  image_path: `test/${i}.jpg`,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  published_at: "2026-10-01T00:00:00Z",
  archived_at: i === 8 ? "2026-10-02T00:00:00Z" : null,
}));
window.__requests = [];
window.__signed = [];
const session = { user: { id: "admin", email: "admin@test.invalid" } };
function from(table) {
  let filters = [],
    orders = [],
    range,
    limit,
    head = false,
    operation = "select",
    values;
  const q = {
    select(_columns, options) {
      head = Boolean(options?.head);
      return q;
    },
    eq(key, value) {
      filters.push([key, value]);
      return q;
    },
    in(key, value) {
      filters.push([key, value]);
      return q;
    },
    ilike(key, value) {
      filters.push([key, value]);
      return q;
    },
    order(key, options) {
      orders.push([key, options?.ascending !== false]);
      return q;
    },
    range(from, to) {
      range = [from, to];
      return q;
    },
    limit(value) {
      limit = value;
      return q;
    },
    update(value) {
      operation = "update";
      values = value;
      return q;
    },
    single() {
      return run(true);
    },
    maybeSingle() {
      return run(true);
    },
    then(resolve, reject) {
      return run(false).then(resolve, reject);
    },
  };
  async function run(single) {
    window.__requests.push({ table, filters, orders, range, head, operation });
    if (table === "admin_profiles")
      return {
        data: {
          id: "profile",
          user_id: "admin",
          full_name: "Test Admin",
          is_active: true,
        },
        error: null,
      };
    let rows = table.includes("announcement")
      ? announcements
      : table.includes("service") || table === "appointments"
        ? appointments
        : residents;
    rows = rows.filter((row) =>
      filters.every(([key, value]) =>
        Array.isArray(value)
          ? value.includes(row[key])
          : typeof value === "string" && value.startsWith("%")
            ? String(row[key] ?? "")
                .toLowerCase()
                .includes(value.slice(1, -1).toLowerCase())
            : row[key] === value,
      ),
    );
    if (operation === "update")
      rows.forEach((row) => Object.assign(row, values));
    const count = rows.length;
    rows = [...rows].sort((a, b) => {
      for (const [key, ascending] of orders) {
        const c = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
        if (c) return ascending ? c : -c;
      }
      return 0;
    });
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (limit) rows = rows.slice(0, limit);
    return {
      data: head
        ? null
        : single
          ? (rows[0] ?? null)
          : rows.map((row) => ({ ...row })),
      count,
      error: null,
    };
  }
  return q;
}
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from,
  rpc: async (name) => ({
    error: null,
    data:
      name === "admin_census_analytics"
        ? {
            total: 18,
            excluded: 9,
            age: [{ label: "Adults", count: 18 }],
            gender: [{ label: "Male", count: 18 }],
            civil: [{ label: "Single", count: 18 }],
            education: [{ label: "College", count: 18 }],
          }
        : {
            stats: { total: 27, verified: 18, pending: 9, rejected: 0 },
            appointments: {
              total: 25,
              today: 0,
              completedToday: 0,
              pending: 13,
            },
            announcements: { active: 8, archived: 1, published: 8 },
            recentResidents: residents.slice(0, 5),
          },
  }),
  storage: {
    from: () => ({
      createSignedUrl: async (path) => {
        window.__signed.push(path);
        return {
          data: { signedUrl: `https://test.invalid/${path}` },
          error: null,
        };
      },
    }),
  },
};
