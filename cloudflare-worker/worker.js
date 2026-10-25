// @ts-nocheck

// worker.ts
import { neon } from "@neondatabase/serverless";
var DEFAULT_DATABASE_URL = "postgresql://neondb_owner:npg_SYCptsnG2r9U@ep-sparkling-fire-ayctdt0t-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Neon-Connection-String"
};
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}
function successResponse(data, extra = {}) {
  const count = Array.isArray(data) ? data.length : void 0;
  return jsonResponse({
    status: "success",
    data,
    ...count !== void 0 ? { count } : {},
    ...extra
  });
}
function errorResponse(message, status = 500, details = null, pathInfo) {
  console.error(`\u274C [Cloudflare Worker Error] [${status}] ${message}`, { details, path: pathInfo });
  return jsonResponse({
    status: "error",
    message,
    error: message,
    details: details?.message || (typeof details === "string" ? details : details ? JSON.stringify(details) : null),
    code: details?.code || null,
    path: pathInfo || null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }, status);
}
function safeParseJson(str, fallback) {
  if (typeof str !== "string") return str ?? fallback;
  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === "string" && fallback && typeof fallback === "object") {
      try {
        return JSON.parse(parsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return fallback;
  }
}
function getDefaultPermissionsForRole(role) {
  const technicianPermissions = [
    "CAN_VIEW_DASHBOARD",
    "CAN_CREATE_ORDERS",
    "CAN_EDIT_OWN_ORDERS",
    "CAN_VIEW_SERVICE_HISTORY",
    "CAN_VIEW_APPOINTMENTS_OVERVIEW",
    "CAN_LOG_EXPENSES"
  ];
  const salesAgentPermissions = [
    "CAN_VIEW_DASHBOARD",
    "CAN_CREATE_ORDERS",
    "CAN_EDIT_OWN_ORDERS",
    "CAN_VIEW_SERVICE_HISTORY",
    "CAN_VIEW_CUSTOMER_HISTORY",
    "CAN_VIEW_RETENTION_DASHBOARD",
    "CAN_VIEW_SERVICE_REQUESTS",
    "CAN_LOG_EXPENSES"
  ];
  const managerPermissions = [
    ...technicianPermissions,
    "CAN_ASSIGN_ORDERS",
    "CAN_EDIT_ANY_ORDER",
    "CAN_DELETE_ORDERS",
    "CAN_VIEW_ANALYTICS",
    "CAN_VIEW_LIVE_MAP",
    "CAN_VIEW_CUSTOMER_HISTORY",
    "CAN_VIEW_RETENTION_DASHBOARD",
    "CAN_MANAGE_BOOKKEEPING",
    "CAN_VIEW_PROFIT_LOSS",
    "CAN_MANAGE_USERS",
    "CAN_MANAGE_SUBSCRIPTIONS",
    "CAN_MANAGE_PLANS",
    "CAN_MANAGE_ADDONS",
    "CAN_MANAGE_SERVICES",
    "CAN_VIEW_SERVICE_REQUESTS",
    "CAN_VIEW_TRASH",
    "CAN_MANAGE_SPEND_CATEGORIES"
  ];
  const adminPermissions = [
    ...managerPermissions,
    "CAN_MANAGE_PRICING",
    "CAN_EDIT_SETTINGS",
    "CAN_MANAGE_ADMINS"
  ];
  switch (role) {
    case "admin":
      return adminPermissions;
    case "manager":
      return managerPermissions;
    case "agent":
    case "sales_agent":
      return salesAgentPermissions;
    case "technician":
      return technicianPermissions;
    default:
      return salesAgentPermissions;
  }
}
function getSql(env) {
  const dbUrl = env && env.DATABASE_URL || DEFAULT_DATABASE_URL;
  return neon(dbUrl);
}
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    const reqStart = Date.now();
    const clientOrigin = request.headers.get("Origin") || "same-origin";
    console.log(`\u{1F4E1} [Worker] ${method} ${path} from ${clientOrigin}`);
    if (path === "/" || path === "") {
      return jsonResponse({
        status: "online",
        service: "A Big Engine Edge Backend (Cloudflare Workers)",
        database: "Connected (Neon PostgreSQL)",
        endpoints: {
          health: "/api/health",
          neonHealth: "/api/neon/health",
          neonDiagnostics: "/api/neon/diagnostics",
          orders: "/api/neon/orders",
          leads: "/api/neon/leads",
          users: "/api/neon/users",
          customers: "/api/neon/customers",
          inventory: "/api/neon/inventory",
          carDatabase: "/api/neon/car-database"
        },
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (path === "/api/health") {
      return jsonResponse({
        status: "ok",
        service: "A Big Engine Edge Worker (Cloudflare)",
        databaseConfigured: Boolean(env?.DATABASE_URL),
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (path === "/api/neon/health") {
      const start = Date.now();
      try {
        const sql = getSql(env);
        const rows = await sql`SELECT NOW() as server_time, version()`;
        const latencyMs = Date.now() - start;
        const row = rows[0] || {};
        return jsonResponse({
          status: "ok",
          connected: true,
          backend: "Cloudflare Workers (Edge)",
          version: row?.version || "PostgreSQL",
          serverTime: row?.server_time || (/* @__PURE__ */ new Date()).toISOString(),
          latencyMs,
          bandwidthSaver: true
        });
      } catch (err) {
        return jsonResponse({
          status: "error",
          connected: false,
          backend: "Cloudflare Workers (Edge)",
          latencyMs: Date.now() - start,
          error: err.message,
          bandwidthSaver: true
        }, 500);
      }
    }
    if (path === "/api/neon/diagnostics") {
      const start = Date.now();
      try {
        const sql = getSql(env);
        const [healthRow, orderCount, userCount, leadCount, custCount, invCount] = await Promise.all([
          sql`SELECT NOW() as server_time, version()`,
          sql`SELECT COUNT(*)::int as c FROM service_orders`,
          sql`SELECT COUNT(*)::int as c FROM app_users`,
          sql`SELECT COUNT(*)::int as c FROM service_requests`,
          sql`SELECT COUNT(*)::int as c FROM customers`,
          sql`SELECT COUNT(*)::int as c FROM inventory_items`
        ]);
        const latencyMs = Date.now() - start;
        return jsonResponse({
          status: "ok",
          connected: true,
          backend: "Cloudflare Workers (Edge Gateway)",
          colo: request.cf?.colo || "EDGE",
          country: request.cf?.country || "GLOBAL",
          clientOrigin,
          latencyMs,
          counts: {
            serviceOrders: orderCount[0]?.c || 0,
            appUsers: userCount[0]?.c || 0,
            serviceRequests: leadCount[0]?.c || 0,
            customers: custCount[0]?.c || 0,
            inventoryItems: invCount[0]?.c || 0
          },
          serverTime: healthRow[0]?.server_time || (/* @__PURE__ */ new Date()).toISOString(),
          version: healthRow[0]?.version || "PostgreSQL"
        });
      } catch (err) {
        return jsonResponse({
          status: "error",
          connected: false,
          error: err.message,
          stack: err.stack,
          code: err.code,
          latencyMs: Date.now() - start
        }, 500);
      }
    }
    if (path === "/api/neon/auth/login" && method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const username = body.username;
        const password = body.password;
        if (!username || !password) {
          return errorResponse("Username and password are required", 400);
        }
        const rawInput = String(username).trim();
        const cleanInput = rawInput.toLowerCase();
        const cleanPass = String(password).trim();
        const sql = getSql(env);
        const rows = await sql`
          SELECT * FROM app_users 
          WHERE username = ${rawInput} OR LOWER(username) = ${cleanInput} OR email = ${rawInput} OR LOWER(email) = ${cleanInput}
          ORDER BY CASE 
            WHEN username = ${rawInput} THEN 0 
            WHEN LOWER(username) = ${cleanInput} THEN 1 
            WHEN email = ${rawInput} THEN 2 
            ELSE 3 
          END
        `;
        let authenticatedUser = null;
        if (rows.length > 0) {
          let dbUser = rows.find((r) => {
            const dbPass2 = String(r.password || "").trim();
            return dbPass2 === cleanPass || r.password === password;
          });
          if (!dbUser) {
            dbUser = rows.find((r) => r.username === rawInput || r.email === rawInput) || rows[0];
          }
          const dbPass = String(dbUser.password || "").trim();
          if (dbPass === cleanPass || dbUser.password === password) {
            if (dbUser.is_active === false) {
              return errorResponse("Account is deactivated. Please contact your administrator.", 403);
            }
            const raw = safeParseJson(dbUser.raw_data, {});
            let role = dbUser.role || raw.role || "agent";
            if (role === "sales_agent") role = "agent";
            let parsedPerms = safeParseJson(dbUser.permissions, safeParseJson(raw.permissions, []));
            if (!Array.isArray(parsedPerms) || parsedPerms.length === 0) {
              parsedPerms = getDefaultPermissionsForRole(role);
            }
            const parsedSpecs = safeParseJson(dbUser.specialties, safeParseJson(raw.specialties, []));
            const parsedAttendanceHistory = safeParseJson(raw.attendanceHistory, []);
            const parsedNotificationPreferences = safeParseJson(raw.notificationPreferences, {
              enabled: { assigned: true, reminder: true, queued: true, completed: true, manual: true, overdue: true },
              sound: "default",
              vibration: true
            });
            authenticatedUser = {
              ...raw,
              username: dbUser.username,
              email: dbUser.email || raw.email || "",
              name: dbUser.name || raw.name || dbUser.username,
              role,
              phone: dbUser.phone || raw.phone || "",
              agentCategory: dbUser.agent_category || raw.agentCategory || "SALES_AGENT",
              specialties: Array.isArray(parsedSpecs) ? parsedSpecs : [],
              assignedHub: dbUser.assigned_hub || raw.assignedHub || "",
              permissions: parsedPerms,
              attendanceHistory: Array.isArray(parsedAttendanceHistory) ? parsedAttendanceHistory : [],
              notificationPreferences: parsedNotificationPreferences,
              isActive: dbUser.is_active ?? true
            };
          }
        }
        if (!authenticatedUser) {
          const colRes = await sql`SELECT data FROM app_synced_collections WHERE collection_name = 'users' LIMIT 1`;
          if (colRes.length > 0 && Array.isArray(colRes[0].data)) {
            const userObj = colRes[0].data.find((u) => {
              if (!u) return false;
              const uName = String(u.username || "").trim();
              const uEmail = String(u.email || "").trim();
              return uName === rawInput || uName.toLowerCase() === cleanInput || uEmail !== "" && (uEmail === rawInput || uEmail.toLowerCase() === cleanInput);
            });
            if (userObj) {
              const uPass = String(userObj.password || "").trim();
              if (uPass === cleanPass || userObj.password === password) {
                authenticatedUser = userObj;
              }
            }
          }
        }
        if (authenticatedUser) {
          return jsonResponse({
            status: "success",
            user: authenticatedUser,
            token: `neon_edge_token_${Date.now()}`
          });
        }
        return errorResponse("Invalid username or password", 401);
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }
    if (path === "/api/neon/users") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const rows = await sql`SELECT * FROM app_users ORDER BY username ASC`;
          const users = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              username: r.username,
              email: r.email || raw.email || "",
              name: r.name || raw.name || r.username,
              role: r.role || raw.role || "sales_agent",
              phone: r.phone || raw.phone || "",
              agentCategory: r.agent_category || raw.agentCategory || "SALES_AGENT",
              specialties: safeParseJson(r.specialties, raw.specialties || []),
              assignedHub: r.assigned_hub || raw.assignedHub || "",
              permissions: safeParseJson(r.permissions, raw.permissions || []),
              isActive: r.is_active ?? true,
              updatedAt: r.updated_at
            };
          });
          return successResponse(users);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const u of list) {
            if (!u || !u.username) continue;
            const uname = String(u.username).trim();
            const email = String(u.email || "").trim();
            const name = String(u.name || uname);
            const role = String(u.role || "sales_agent");
            const phone = String(u.phone || "");
            const pass = String(u.password || "password123");
            const agentCat = String(u.agentCategory || "SALES_AGENT");
            const hub = String(u.assignedHub || "");
            const perms = JSON.stringify(Array.isArray(u.permissions) ? u.permissions : getDefaultPermissionsForRole(role));
            const specs = JSON.stringify(Array.isArray(u.specialties) ? u.specialties : []);
            const isActive = u.isActive ?? true;
            const raw = JSON.stringify(u);
            await sql`
              INSERT INTO app_users (username, email, name, role, phone, password, agent_category, specialties, assigned_hub, permissions, is_active, raw_data, updated_at)
              VALUES (${uname}, ${email}, ${name}, ${role}, ${phone}, ${pass}, ${agentCat}, ${specs}, ${hub}, ${perms}, ${isActive}, ${raw}, NOW())
              ON CONFLICT (username) DO UPDATE SET
                email = EXCLUDED.email,
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                phone = EXCLUDED.phone,
                password = CASE WHEN EXCLUDED.password <> '' THEN EXCLUDED.password ELSE app_users.password END,
                agent_category = EXCLUDED.agent_category,
                specialties = EXCLUDED.specialties,
                assigned_hub = EXCLUDED.assigned_hub,
                permissions = EXCLUDED.permissions,
                is_active = EXCLUDED.is_active,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    // Helper to group multi-line items from Neon "orders" table by order_id into cohesive Service objects
    function transformNeonWebsiteOrders(rawRows) {
      const groups = new Map();
      for (const r of rawRows) {
        const oid = String(r.order_id || r.id || "").trim();
        if (!oid) continue;
        if (!groups.has(oid)) groups.set(oid, []);
        groups.get(oid).push(r);
      }

      const result = [];
      for (const [orderId, items] of groups.entries()) {
        const primary = items[0];
        const slotRow = items.find((i) => i.booking_date || i.booking_time) || primary;
        const carRow = items.find((i) => i.car_at_order_brand || i.car_at_order_model || i.car_at_order_reg_no) || primary;

        const fullName = String(primary.user_name || "").trim();
        let firstName = fullName;
        let lastName = "";
        if (fullName && fullName.toLowerCase() !== "customer") {
          const parts = fullName.split(/\s+/);
          firstName = parts[0] || "Customer";
          lastName = parts.slice(1).join(" ") || "";
        } else {
          firstName = "Customer";
        }

        const carBrand = String(carRow.car_at_order_brand || "").trim();
        const carModelName = String(carRow.car_at_order_model || "").trim();
        const carVersion = String(carRow.car_at_order_version || "").trim();
        const carNumber = String(carRow.car_at_order_reg_no || "").trim() || "Pending Reg";
        const carBrandModel = [carBrand, carModelName].filter(Boolean).join(" ") || "Vehicle";
        const tag = String(carRow.car_at_order_tag || "").trim();

        const serviceSelection = [];
        items.forEach((i) => {
          const name = String(i.item_name || "").trim();
          if (name && !serviceSelection.includes(name)) serviceSelection.push(name);
        });
        if (serviceSelection.length === 0 && primary.service_types) {
          String(primary.service_types).split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => {
            if (!serviceSelection.includes(s)) serviceSelection.push(s);
          });
        }

        const websiteOrderItems = items.map((i) => ({
          id: i.id,
          orderId: i.order_id,
          itemName: i.item_name || "",
          itemThumbnailSrc: i.item_thumbnail_src || "",
          itemQuantity: parseInt(i.item_quantity, 10) || 1,
          itemPrice: parseFloat(i.item_price) || 0,
          bookingDate: i.booking_date || null,
          bookingTime: i.booking_time || null,
          itemAddons: i.item_addons || [],
          carBrand: i.car_at_order_brand || "",
          carModel: i.car_at_order_model || "",
          carVersion: i.car_at_order_version || "",
          carTag: i.car_at_order_tag || "",
          carRegNo: i.car_at_order_reg_no || "",
          carColour: i.car_at_order_colour || "",
          hubId: i.hub_id || null
        }));

        const rawStatus = String(primary.status || "Placed").trim();
        let status = "Queued";
        if (rawStatus.toLowerCase() === "placed") status = "Queued";
        else if (rawStatus.toLowerCase().includes("pending")) status = "Draft";
        else if (rawStatus.toLowerCase() === "confirmed" || rawStatus.toLowerCase() === "assigned") status = "Assigned";
        else if (rawStatus.toLowerCase().includes("progress")) status = "In Progress";
        else if (rawStatus.toLowerCase().includes("complete")) status = "Completed";
        else if (rawStatus.toLowerCase().includes("cancel")) status = "Cancelled";
        else status = rawStatus;

        const payMethod = String(primary.payment_method || "").trim();
        const isPaid = payMethod.toLowerCase().includes("paid") || payMethod.toLowerCase().includes("instant") || payMethod.toLowerCase().includes("online");
        const paymentMode = payMethod.toLowerCase().includes("cash") ? "Cash" : "Online";
        const totalAmount = parseFloat(primary.total_amount) || items.reduce((sum, i) => sum + (parseFloat(i.item_price) || 0) * (parseInt(i.item_quantity, 10) || 1), 0);
        const orderDateIso = primary.order_date ? new Date(primary.order_date).toISOString() : new Date().toISOString();

        result.push({
          id: orderId,
          submissionId: orderId,
          appointmentId: orderId,
          websiteOrderId: orderId,
          timestamp: orderDateIso,
          createdAt: orderDateIso,
          updatedAt: orderDateIso,
          customerFirstName: firstName,
          customerLastName: lastName,
          mobileNumber: String(primary.user_mobile || "").trim(),
          streetAddress: String(primary.shipping_address || "").trim(),
          carNumber,
          carBrandModel,
          carBrand,
          carModelName,
          carVersion,
          vehicleCategoryTag: tag || "Crossover",
          serviceSelection,
          serviceTypes: primary.service_types || "",
          websiteOrderItems,
          grandTotal: totalAmount,
          status,
          scheduledDate: slotRow.booking_date || "",
          scheduledTime: slotRow.booking_time || "",
          paymentMode,
          paymentStatus: isPaid ? "Completed" : "Pending",
          paymentMethod: payMethod,
          paymentNotes: payMethod,
          razorpayPaymentId: primary.razorpay_payment_id || "",
          hubId: primary.hub_id || items.find((i) => i.hub_id)?.hub_id || "",
          isWebsiteOrder: true,
          source: "Website"
        });
      }
      return result;
    }

    if (path === "/api/neon/website-orders") {
      const sql = getSql(env);
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
        const webRows = await sql`SELECT * FROM orders ORDER BY order_date DESC, id ASC LIMIT ${limit}`;
        const orders = transformNeonWebsiteOrders(webRows);
        return successResponse(orders, { rawRowsCount: webRows.length });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }

    if (path === "/api/neon/orders") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const status = url.searchParams.get("status");
          const search = (url.searchParams.get("q") || url.searchParams.get("search") || "").trim().toLowerCase();

          // 1. Fetch website orders from "orders" table
          let websiteOrders = [];
          try {
            const webRows = await sql`SELECT * FROM orders ORDER BY order_date DESC, id ASC`;
            websiteOrders = transformNeonWebsiteOrders(webRows);
          } catch (webErr) {
            console.warn("Notice querying orders table in worker:", webErr.message);
          }

          // 2. Fetch admin service_orders
          let serviceOrderRows = [];
          try {
            serviceOrderRows = await sql`SELECT * FROM service_orders ORDER BY created_at DESC`;
          } catch (sErr) {
            console.warn("Notice querying service_orders in worker:", sErr.message);
          }

          // 3. Map service_orders
          const serviceOrdersMap = new Map();
          for (const r of serviceOrderRows) {
            const raw = safeParseJson(r.raw_data, {});
            const so = {
              ...raw,
              id: r.id,
              appointmentId: r.appointment_id || raw.appointmentId || r.id,
              submissionId: r.submission_id || raw.submissionId || r.id,
              customerFirstName: r.customer_first_name || raw.customerFirstName || "",
              customerLastName: r.customer_last_name || raw.customerLastName || "",
              mobileNumber: r.mobile_number || raw.mobileNumber || "",
              customerEmail: r.customer_email || raw.customerEmail || "",
              carNumber: r.car_number || raw.carNumber || "",
              carBrandModel: r.car_brand_model || raw.carBrandModel || "",
              streetAddress: r.street_address || raw.streetAddress || "",
              serviceSelection: safeParseJson(r.service_selection, raw.serviceSelection || []),
              grandTotal: parseFloat(r.grand_total) || raw.grandTotal || 0,
              status: r.status || raw.status || "Draft",
              assignedMechanic: r.assigned_mechanic || raw.assignedMechanic || "",
              assignedTo: r.assigned_mechanic || raw.assignedTo || "",
              updatedAt: r.updated_at,
              createdAt: r.created_at
            };
            serviceOrdersMap.set(String(so.id), so);
            if (so.appointmentId) serviceOrdersMap.set(String(so.appointmentId), so);
            if (so.submissionId) serviceOrdersMap.set(String(so.submissionId), so);
          }

          // 4. Merge website orders with admin overrides
          const mergedMap = new Map();
          for (const wOrder of websiteOrders) {
            const orderKey = String(wOrder.id);
            const adminOverride = serviceOrdersMap.get(orderKey);
            if (adminOverride) {
              mergedMap.set(orderKey, {
                ...wOrder,
                ...adminOverride,
                websiteOrderId: wOrder.websiteOrderId,
                websiteOrderItems: wOrder.websiteOrderItems,
                serviceTypes: wOrder.serviceTypes,
                paymentMethod: wOrder.paymentMethod,
                razorpayPaymentId: wOrder.razorpayPaymentId,
                isWebsiteOrder: true,
                status: adminOverride.status || wOrder.status,
                assignedMechanic: adminOverride.assignedMechanic || adminOverride.assignedTo || "",
                assignedTo: adminOverride.assignedTo || adminOverride.assignedMechanic || ""
              });
            } else {
              mergedMap.set(orderKey, wOrder);
            }
          }

          // Add purely internal orders
          for (const [key, so] of serviceOrdersMap.entries()) {
            if (!mergedMap.has(key) && !mergedMap.has(String(so.id))) {
              mergedMap.set(String(so.id), so);
            }
          }

          let allOrders = Array.from(mergedMap.values());

          if (status && status !== "ALL") {
            const filterLower = status.toLowerCase();
            allOrders = allOrders.filter((o) => String(o.status || "").toLowerCase() === filterLower);
          }

          if (search) {
            allOrders = allOrders.filter((o) => {
              const fullSearchTarget = `${o.customerFirstName} ${o.customerLastName} ${o.mobileNumber} ${o.carNumber} ${o.id}`.toLowerCase();
              return fullSearchTarget.includes(search);
            });
          }

          allOrders.sort((a, b) => {
            const tA = new Date(a.createdAt || a.timestamp || 0).getTime();
            const tB = new Date(b.createdAt || b.timestamp || 0).getTime();
            return tB - tA;
          });

          return successResponse(allOrders.slice(0, limit), { total: allOrders.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const order of list) {
            if (!order) continue;
            const id = String(order.submissionId || order.appointmentId || order.id || order.orderId || `ORD_${Date.now()}_${Math.random()}`);
            const apptId = String(order.appointmentId || order.submissionId || id);
            const subId = String(order.submissionId || order.appointmentId || id);
            const firstName = order.customerFirstName || order.firstName || (order.userName ? order.userName.split(" ")[0] : "") || order.customerName || "";
            const lastName = order.customerLastName || order.lastName || (order.userName ? order.userName.split(" ").slice(1).join(" ") : "") || "";
            const phone = String(order.mobileNumber || order.customerPhone || order.mobile || order.userId || "");
            const email = order.customerEmail || order.email || "";
            const carNumber = order.carNumber || order.carRegNo || "";
            const carBrandModel = order.carBrandModel || `${order.carBrand || ""} ${order.carModel || ""}`.trim();
            const address = order.streetAddress || order.address || order.location || "";
            const serviceSelection = JSON.stringify(Array.isArray(order.serviceSelection) ? order.serviceSelection : []);
            const grandTotal = parseFloat(order.grandTotal) || 0;
            const status = order.status || "Draft";
            const assignedMechanic = order.assignedMechanic || order.mechanic || "";
            const raw = JSON.stringify(order);
            await sql`
              INSERT INTO service_orders (
                id, appointment_id, submission_id, customer_first_name, customer_last_name, 
                mobile_number, customer_email, car_number, car_brand_model, 
                street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
              ) VALUES (
                ${id}, ${apptId}, ${subId}, ${firstName}, ${lastName}, 
                ${phone}, ${email}, ${carNumber}, ${carBrandModel}, 
                ${address}, ${serviceSelection}, ${grandTotal}, ${status}, ${assignedMechanic}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                appointment_id = EXCLUDED.appointment_id,
                submission_id = EXCLUDED.submission_id,
                customer_first_name = EXCLUDED.customer_first_name,
                customer_last_name = EXCLUDED.customer_last_name,
                mobile_number = EXCLUDED.mobile_number,
                customer_email = EXCLUDED.customer_email,
                car_number = EXCLUDED.car_number,
                car_brand_model = EXCLUDED.car_brand_model,
                street_address = EXCLUDED.street_address,
                service_selection = EXCLUDED.service_selection,
                grand_total = EXCLUDED.grand_total,
                status = EXCLUDED.status,
                assigned_mechanic = EXCLUDED.assigned_mechanic,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/orders/")) {
      const id = decodeURIComponent(path.replace("/api/neon/orders/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM service_orders WHERE id = ${id} OR appointment_id = ${id} OR submission_id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "PUT") {
        try {
          const order = await request.json();
          const apptId = String(order.appointmentId || order.submissionId || id);
          const subId = String(order.submissionId || order.appointmentId || id);
          const firstName = order.customerFirstName || order.firstName || "";
          const lastName = order.customerLastName || order.lastName || "";
          const phone = String(order.mobileNumber || order.customerPhone || "");
          const email = order.customerEmail || order.email || "";
          const carNumber = order.carNumber || order.carRegNo || "";
          const carBrandModel = order.carBrandModel || `${order.carBrand || ""} ${order.carModel || ""}`.trim();
          const address = order.streetAddress || order.address || "";
          const serviceSelection = JSON.stringify(Array.isArray(order.serviceSelection) ? order.serviceSelection : []);
          const grandTotal = parseFloat(order.grandTotal) || 0;
          const status = order.status || "Draft";
          const assignedMechanic = order.assignedMechanic || "";
          const raw = JSON.stringify(order);
          await sql`
            INSERT INTO service_orders (
              id, appointment_id, submission_id, customer_first_name, customer_last_name, 
              mobile_number, customer_email, car_number, car_brand_model, 
              street_address, service_selection, grand_total, status, assigned_mechanic, raw_data, updated_at
            ) VALUES (
              ${id}, ${apptId}, ${subId}, ${firstName}, ${lastName}, 
              ${phone}, ${email}, ${carNumber}, ${carBrandModel}, 
              ${address}, ${serviceSelection}, ${grandTotal}, ${status}, ${assignedMechanic}, ${raw}, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
              appointment_id = EXCLUDED.appointment_id,
              submission_id = EXCLUDED.submission_id,
              customer_first_name = EXCLUDED.customer_first_name,
              customer_last_name = EXCLUDED.customer_last_name,
              mobile_number = EXCLUDED.mobile_number,
              customer_email = EXCLUDED.customer_email,
              car_number = EXCLUDED.car_number,
              car_brand_model = EXCLUDED.car_brand_model,
              street_address = EXCLUDED.street_address,
              service_selection = EXCLUDED.service_selection,
              grand_total = EXCLUDED.grand_total,
              status = EXCLUDED.status,
              assigned_mechanic = EXCLUDED.assigned_mechanic,
              raw_data = EXCLUDED.raw_data,
              updated_at = NOW()
          `;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/leads") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const status = url.searchParams.get("status");
          let rows;
          if (status && status !== "ALL") {
            rows = await sql`SELECT * FROM service_requests WHERE LOWER(status) = LOWER(${status}) ORDER BY created_at DESC LIMIT ${limit}`;
          } else {
            rows = await sql`SELECT * FROM service_requests ORDER BY created_at DESC LIMIT ${limit}`;
          }
          const leads = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              customerName: r.customer_name || raw.customerName || "",
              customerPhone: r.customer_phone || raw.customerPhone || "",
              carRegNo: r.car_reg_no || raw.carRegNo || "",
              carBrand: r.car_brand || raw.carBrand || "",
              carModel: r.car_model || raw.carModel || "",
              requestedService: r.requested_service || raw.requestedService || "",
              leadSource: r.lead_source || raw.leadSource || "Manual",
              status: r.status || raw.status || "NEW_LEAD",
              totalAmount: parseFloat(r.total_amount) || raw.totalAmount || 0,
              assignedAgent: r.assigned_agent || raw.assignedAgent || "",
              updatedAt: r.updated_at,
              createdAt: r.created_at
            };
          });
          return successResponse(leads);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const req of list) {
            if (!req) continue;
            const id = String(req.id || `REQ_${Date.now()}_${Math.random()}`);
            const custName = req.customerName || req.name || "";
            const custPhone = String(req.customerPhone || req.mobileNumber || req.phone || "");
            const carRegNo = req.carRegNo || req.carNumber || "";
            const carBrand = req.carBrand || "";
            const carModel = req.carModel || "";
            const reqService = req.requestedService || req.service || "";
            const leadSource = req.leadSource || req.source || "Manual";
            const status = req.status || "NEW_LEAD";
            const totalAmount = parseFloat(req.totalAmount) || 0;
            const assignedAgent = req.assignedAgent || req.agent || "";
            const raw = JSON.stringify(req);
            await sql`
              INSERT INTO service_requests (
                id, customer_name, customer_phone, car_reg_no, car_brand, car_model,
                requested_service, lead_source, status, total_amount, assigned_agent, raw_data, updated_at
              ) VALUES (
                ${id}, ${custName}, ${custPhone}, ${carRegNo}, ${carBrand}, ${carModel},
                ${reqService}, ${leadSource}, ${status}, ${totalAmount}, ${assignedAgent}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                car_reg_no = EXCLUDED.car_reg_no,
                car_brand = EXCLUDED.car_brand,
                car_model = EXCLUDED.car_model,
                requested_service = EXCLUDED.requested_service,
                lead_source = EXCLUDED.lead_source,
                status = EXCLUDED.status,
                total_amount = EXCLUDED.total_amount,
                assigned_agent = EXCLUDED.assigned_agent,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/leads/")) {
      const id = decodeURIComponent(path.replace("/api/neon/leads/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM service_requests WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/customers") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const rows = await sql`SELECT * FROM customers ORDER BY updated_at DESC LIMIT ${limit}`;
          const customers = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              firstName: r.first_name || raw.firstName || "",
              lastName: r.last_name || raw.lastName || "",
              mobileNumber: r.mobile_number || raw.mobileNumber || "",
              customerEmail: r.customer_email || raw.customerEmail || "",
              streetAddress: r.street_address || raw.streetAddress || "",
              latitude: r.latitude || raw.latitude || "",
              longitude: r.longitude || raw.longitude || "",
              savedVehicles: safeParseJson(r.saved_vehicles, raw.savedVehicles || []),
              totalSpent: parseFloat(r.total_spent) || raw.totalSpent || 0,
              totalOrders: parseInt(r.total_orders, 10) || raw.totalOrders || 0,
              lastServiceDate: r.last_service_date || raw.lastServiceDate,
              notes: r.notes || raw.notes || "",
              updatedAt: r.updated_at
            };
          });
          return successResponse(customers);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const c of list) {
            if (!c) continue;
            const id = String(c.id || c.mobileNumber || `CUST_${Date.now()}_${Math.random()}`);
            const firstName = c.firstName || "";
            const lastName = c.lastName || "";
            const phone = String(c.mobileNumber || c.phone || "");
            const email = c.customerEmail || c.email || "";
            const address = c.streetAddress || c.address || "";
            const lat = String(c.latitude || "");
            const lng = String(c.longitude || "");
            const savedVehicles = JSON.stringify(Array.isArray(c.savedVehicles) ? c.savedVehicles : []);
            const totalSpent = parseFloat(c.totalSpent) || 0;
            const totalOrders = parseInt(c.totalOrders, 10) || 0;
            const notes = c.notes || "";
            const raw = JSON.stringify(c);
            await sql`
              INSERT INTO customers (
                id, first_name, last_name, mobile_number, customer_email, street_address,
                latitude, longitude, saved_vehicles, total_spent, total_orders, notes, raw_data, updated_at
              ) VALUES (
                ${id}, ${firstName}, ${lastName}, ${phone}, ${email}, ${address},
                ${lat}, ${lng}, ${savedVehicles}, ${totalSpent}, ${totalOrders}, ${notes}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                mobile_number = EXCLUDED.mobile_number,
                customer_email = EXCLUDED.customer_email,
                street_address = EXCLUDED.street_address,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                saved_vehicles = EXCLUDED.saved_vehicles,
                total_spent = EXCLUDED.total_spent,
                total_orders = EXCLUDED.total_orders,
                notes = EXCLUDED.notes,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/customers/")) {
      const id = decodeURIComponent(path.replace("/api/neon/customers/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM customers WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/customer/lookup") {
      const sql = getSql(env);
      try {
        const phone = (url.searchParams.get("phone") || "").trim();
        const carNumber = (url.searchParams.get("carNumber") || url.searchParams.get("carRegNo") || "").trim();
        if (!phone && !carNumber) {
          return errorResponse("Phone number or Car number is required", 400);
        }
        let customer = null;
        if (phone) {
          const custRows = await sql`SELECT * FROM customers WHERE mobile_number LIKE ${`%${phone.slice(-10)}%`} LIMIT 1`;
          if (custRows.length > 0) {
            customer = safeParseJson(custRows[0].raw_data, custRows[0]);
          }
        }
        if (!customer && (phone || carNumber)) {
          const orderRows = await sql`
            SELECT * FROM service_orders 
            WHERE (${phone ? `mobile_number LIKE '%${phone.slice(-10)}%'` : "FALSE"} 
               OR ${carNumber ? `LOWER(car_number) = LOWER('${carNumber}')` : "FALSE"})
            ORDER BY created_at DESC LIMIT 1
          `;
          if (orderRows.length > 0) {
            const o = orderRows[0];
            customer = {
              firstName: o.customer_first_name,
              lastName: o.customer_last_name,
              mobileNumber: o.mobile_number,
              customerEmail: o.customer_email,
              streetAddress: o.street_address,
              savedVehicles: [{ carNumber: o.car_number, brandModel: o.car_brand_model }]
            };
          }
        }
        return jsonResponse({ status: "success", found: !!customer, data: customer });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }
    if (path === "/api/neon/inventory") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const rows = await sql`SELECT * FROM inventory_items ORDER BY name ASC LIMIT ${limit}`;
          const items = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              sku: r.sku || raw.sku || "",
              name: r.name || raw.name || "",
              category: r.category || raw.category || "General",
              brand: r.brand || raw.brand || "",
              unitCost: parseFloat(r.unit_cost) || raw.unitCost || 0,
              sellingPrice: parseFloat(r.selling_price) || raw.sellingPrice || 0,
              quantityInStock: parseFloat(r.quantity_in_stock) ?? raw.quantityInStock ?? 0,
              minStockAlert: parseFloat(r.min_stock_alert) || raw.minStockAlert || 5,
              unitOfMeasure: r.unit_of_measure || raw.unitOfMeasure || "piece",
              location: r.location || raw.location || "",
              compatibleCars: safeParseJson(r.compatible_cars, raw.compatibleCars || []),
              updatedAt: r.updated_at
            };
          });
          return successResponse(items);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const item of list) {
            if (!item) continue;
            const id = String(item.id || item.sku || `INV_${Date.now()}_${Math.random()}`);
            const sku = item.sku ? String(item.sku).trim() : null;
            const name = String(item.name || "Unnamed Item");
            const category = String(item.category || "General");
            const brand = String(item.brand || "");
            const unitCost = parseFloat(item.unitCost) || 0;
            const sellingPrice = parseFloat(item.sellingPrice) || 0;
            const qty = parseFloat(item.quantityInStock ?? item.quantity) || 0;
            const minAlert = parseFloat(item.minStockAlert) || 5;
            const uom = String(item.unitOfMeasure || "piece");
            const location = String(item.location || "");
            const cars = JSON.stringify(item.compatibleCars || []);
            const raw = JSON.stringify(item);
            await sql`
              INSERT INTO inventory_items (
                id, sku, name, category, brand, unit_cost, selling_price, quantity_in_stock,
                min_stock_alert, unit_of_measure, location, compatible_cars, raw_data, updated_at
              ) VALUES (
                ${id}, ${sku}, ${name}, ${category}, ${brand}, ${unitCost}, ${sellingPrice}, ${qty},
                ${minAlert}, ${uom}, ${location}, ${cars}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                sku = EXCLUDED.sku,
                name = EXCLUDED.name,
                category = EXCLUDED.category,
                brand = EXCLUDED.brand,
                unit_cost = EXCLUDED.unit_cost,
                selling_price = EXCLUDED.selling_price,
                quantity_in_stock = EXCLUDED.quantity_in_stock,
                min_stock_alert = EXCLUDED.min_stock_alert,
                unit_of_measure = EXCLUDED.unit_of_measure,
                location = EXCLUDED.location,
                compatible_cars = EXCLUDED.compatible_cars,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/inventory/")) {
      const id = decodeURIComponent(path.replace("/api/neon/inventory/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM inventory_items WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/expenses") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const category = url.searchParams.get("category");
          let rows;
          if (category && category !== "ALL") {
            rows = await sql`SELECT * FROM expense_records WHERE LOWER(category) = LOWER(${category}) ORDER BY expense_date DESC LIMIT ${limit}`;
          } else {
            rows = await sql`SELECT * FROM expense_records ORDER BY expense_date DESC LIMIT ${limit}`;
          }
          const expenses = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              title: r.title || raw.title || "",
              category: r.category || raw.category || "General",
              amount: parseFloat(r.amount) || raw.amount || 0,
              expenseDate: r.expense_date || raw.expenseDate || "",
              paymentMode: r.payment_mode || raw.paymentMode || "",
              recordedBy: r.recorded_by || raw.recordedBy || "",
              receiptUrl: r.receipt_url || raw.receiptUrl || "",
              notes: r.notes || raw.notes || "",
              updatedAt: r.updated_at
            };
          });
          return successResponse(expenses);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const exp of list) {
            if (!exp) continue;
            const id = String(exp.id || `EXP_${Date.now()}_${Math.random()}`);
            const title = exp.title || "Untitled Expense";
            const category = exp.category || "General";
            const amount = parseFloat(exp.amount) || 0;
            const expDate = exp.expenseDate || exp.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
            const paymentMode = exp.paymentMode || "Cash";
            const recordedBy = exp.recordedBy || "";
            const receiptUrl = exp.receiptUrl || "";
            const notes = exp.notes || "";
            const raw = JSON.stringify(exp);
            await sql`
              INSERT INTO expense_records (
                id, title, category, amount, expense_date, payment_mode, recorded_by, receipt_url, notes, raw_data, updated_at
              ) VALUES (
                ${id}, ${title}, ${category}, ${amount}, ${expDate}, ${paymentMode}, ${recordedBy}, ${receiptUrl}, ${notes}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                category = EXCLUDED.category,
                amount = EXCLUDED.amount,
                expense_date = EXCLUDED.expense_date,
                payment_mode = EXCLUDED.payment_mode,
                recorded_by = EXCLUDED.recorded_by,
                receipt_url = EXCLUDED.receipt_url,
                notes = EXCLUDED.notes,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/expenses/")) {
      const id = decodeURIComponent(path.replace("/api/neon/expenses/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM expense_records WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/warranties") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000", 10), 5e4);
          const rows = await sql`SELECT * FROM warranties ORDER BY start_date DESC LIMIT ${limit}`;
          const warranties = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              orderId: r.order_id || raw.orderId || "",
              customerName: r.customer_name || raw.customerName || "",
              customerPhone: r.customer_phone || raw.customerPhone || "",
              carNumber: r.car_number || raw.carNumber || "",
              serviceOrPart: r.service_or_part || raw.serviceOrPart || "",
              warrantyPeriodMonths: r.warranty_period_months ?? raw.warrantyPeriodMonths ?? 12,
              startDate: r.start_date || raw.startDate || "",
              expiryDate: r.expiry_date || raw.expiryDate || "",
              terms: r.terms || raw.terms || "",
              status: r.status || raw.status || "Active",
              updatedAt: r.updated_at
            };
          });
          return successResponse(warranties);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const w of list) {
            if (!w) continue;
            const id = String(w.id || `WAR_${Date.now()}_${Math.random()}`);
            const orderId = w.orderId || "";
            const custName = w.customerName || "";
            const custPhone = w.customerPhone || "";
            const carNumber = w.carNumber || "";
            const serviceOrPart = w.serviceOrPart || "";
            const periodMonths = parseInt(w.warrantyPeriodMonths, 10) || 12;
            const startDate = w.startDate || "";
            const expiryDate = w.expiryDate || "";
            const terms = w.terms || "";
            const status = w.status || "Active";
            const raw = JSON.stringify(w);
            await sql`
              INSERT INTO warranties (
                id, order_id, customer_name, customer_phone, car_number, service_or_part,
                warranty_period_months, start_date, expiry_date, terms, status, raw_data, updated_at
              ) VALUES (
                ${id}, ${orderId}, ${custName}, ${custPhone}, ${carNumber}, ${serviceOrPart},
                ${periodMonths}, ${startDate}, ${expiryDate}, ${terms}, ${status}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                order_id = EXCLUDED.order_id,
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                car_number = EXCLUDED.car_number,
                service_or_part = EXCLUDED.service_or_part,
                warranty_period_months = EXCLUDED.warranty_period_months,
                start_date = EXCLUDED.start_date,
                expiry_date = EXCLUDED.expiry_date,
                terms = EXCLUDED.terms,
                status = EXCLUDED.status,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/warranties/")) {
      const id = decodeURIComponent(path.replace("/api/neon/warranties/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM warranties WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/notifications") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 1e4);
          const targetUser = url.searchParams.get("targetUser");
          let rows;
          if (targetUser && targetUser !== "ALL") {
            rows = await sql`SELECT * FROM app_notifications WHERE target_user_id = ${targetUser} OR target_user_id IS NULL ORDER BY created_at DESC LIMIT ${limit}`;
          } else {
            rows = await sql`SELECT * FROM app_notifications ORDER BY created_at DESC LIMIT ${limit}`;
          }
          const notifs = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              targetUserId: r.target_user_id || raw.targetUserId || "",
              title: r.title || raw.title || "",
              message: r.message || raw.message || "",
              notificationType: r.notification_type || raw.notificationType || "INFO",
              isRead: r.is_read ?? raw.isRead ?? false,
              link: r.link || raw.link || "",
              createdAt: r.created_at
            };
          });
          return successResponse(notifs);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const notif of list) {
            if (!notif) continue;
            const id = String(notif.id || `NOTIF_${Date.now()}_${Math.random()}`);
            const target = notif.targetUserId || null;
            const title = notif.title || "";
            const msg = notif.message || "";
            const type = notif.notificationType || notif.type || "INFO";
            const isRead = Boolean(notif.isRead);
            const link = notif.link || null;
            const raw = JSON.stringify(notif);
            await sql`
              INSERT INTO app_notifications (id, target_user_id, title, message, notification_type, is_read, link, raw_data, created_at)
              VALUES (${id}, ${target}, ${title}, ${msg}, ${type}, ${isRead}, ${link}, ${raw}, NOW())
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                message = EXCLUDED.message,
                notification_type = EXCLUDED.notification_type,
                is_read = EXCLUDED.is_read,
                link = EXCLUDED.link,
                raw_data = EXCLUDED.raw_data
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/notifications/mark-read" && method === "POST") {
      const sql = getSql(env);
      try {
        const body = await request.json().catch(() => ({}));
        const target = body.targetUserId;
        if (target) {
          await sql`UPDATE app_notifications SET is_read = true WHERE target_user_id = ${target}`;
        } else {
          await sql`UPDATE app_notifications SET is_read = true`;
        }
        return jsonResponse({ status: "success", message: "Notifications marked as read" });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }
    if (path.startsWith("/api/neon/notifications/")) {
      const id = decodeURIComponent(path.replace("/api/neon/notifications/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM app_notifications WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/car-database" || path === "/api/neon/cars") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "5000", 10), 5e4);
          const brand = url.searchParams.get("brand");
          let rows;
          if (brand && brand !== "ALL") {
            rows = await sql`SELECT * FROM car_database WHERE LOWER(brand) = LOWER(${brand}) ORDER BY brand ASC, model ASC LIMIT ${limit}`;
          } else {
            rows = await sql`SELECT * FROM car_database ORDER BY brand ASC, model ASC LIMIT ${limit}`;
          }
          const cars = rows.map((r) => {
            const raw = safeParseJson(r.raw_data, {});
            return {
              ...raw,
              id: r.id,
              brand: r.brand,
              logo: r.logo || raw.logo || "",
              model: r.model,
              image: r.image || raw.image || "",
              version: r.version || raw.version || "",
              yearRange: r.year_range || raw.yearRange || "",
              fuelType: r.fuel_type || raw.fuelType || "",
              frontTyresSpec: r.front_tyres_spec || raw.frontTyresSpec || "",
              frontTyresWidth: r.front_tyres_width || raw.frontTyresWidth || "",
              frontTyresProfile: r.front_tyres_profile || raw.frontTyresProfile || "",
              frontTyresRadius: r.front_tyres_radius || raw.frontTyresRadius || "",
              rearTyresSpec: r.rear_tyres_spec || raw.rearTyresSpec || "",
              rearTyresWidth: r.rear_tyres_width || raw.rearTyresWidth || "",
              rearTyresProfile: r.rear_tyres_profile || raw.rearTyresProfile || "",
              rearTyresRadius: r.rear_tyres_radius || raw.rearTyresRadius || "",
              tag: r.tag || raw.tag || "Hatch",
              updatedAt: r.updated_at
            };
          });
          return successResponse(cars);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const car of list) {
            if (!car) continue;
            const brand = String(car.brand || "").trim();
            const model = String(car.model || "").trim();
            if (!brand || !model) continue;
            const id = String(car.id || `${brand}_${model}_${car.version || ""}`.replace(/\s+/g, "_"));
            const logo = car.logo || "";
            const image = car.image || "";
            const version = car.version || "";
            const yearRange = car.yearRange || car.year || "";
            const fuelType = car.fuelType || "";
            const fSpec = car.frontTyresSpec || "";
            const fWidth = car.frontTyresWidth || "";
            const fProfile = car.frontTyresProfile || "";
            const fRadius = car.frontTyresRadius || "";
            const rSpec = car.rearTyresSpec || "";
            const rWidth = car.rearTyresWidth || "";
            const rProfile = car.rearTyresProfile || "";
            const rRadius = car.rearTyresRadius || "";
            const tag = car.tag || "Hatch";
            const raw = JSON.stringify(car);
            await sql`
              INSERT INTO car_database (
                id, brand, logo, model, image, version, year_range, fuel_type,
                front_tyres_spec, front_tyres_width, front_tyres_profile, front_tyres_radius,
                rear_tyres_spec, rear_tyres_width, rear_tyres_profile, rear_tyres_radius,
                tag, raw_data, updated_at
              ) VALUES (
                ${id}, ${brand}, ${logo}, ${model}, ${image}, ${version}, ${yearRange}, ${fuelType},
                ${fSpec}, ${fWidth}, ${fProfile}, ${fRadius},
                ${rSpec}, ${rWidth}, ${rProfile}, ${rRadius},
                ${tag}, ${raw}, NOW()
              )
              ON CONFLICT (id) DO UPDATE SET
                brand = EXCLUDED.brand,
                logo = EXCLUDED.logo,
                model = EXCLUDED.model,
                image = EXCLUDED.image,
                version = EXCLUDED.version,
                year_range = EXCLUDED.year_range,
                fuel_type = EXCLUDED.fuel_type,
                front_tyres_spec = EXCLUDED.front_tyres_spec,
                front_tyres_width = EXCLUDED.front_tyres_width,
                front_tyres_profile = EXCLUDED.front_tyres_profile,
                front_tyres_radius = EXCLUDED.front_tyres_radius,
                rear_tyres_spec = EXCLUDED.rear_tyres_spec,
                rear_tyres_width = EXCLUDED.rear_tyres_width,
                rear_tyres_profile = EXCLUDED.rear_tyres_profile,
                rear_tyres_radius = EXCLUDED.rear_tyres_radius,
                tag = EXCLUDED.tag,
                raw_data = EXCLUDED.raw_data,
                updated_at = NOW()
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/car-database/")) {
      const id = decodeURIComponent(path.replace("/api/neon/car-database/", ""));
      const sql = getSql(env);
      if (method === "DELETE") {
        try {
          await sql`DELETE FROM car_database WHERE id = ${id}`;
          return jsonResponse({ status: "success", id });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/audit-logs") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 5e3);
          const rows = await sql`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ${limit}`;
          const logs = rows.map((r) => safeParseJson(r.raw_data, r));
          return successResponse(logs);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const l of list) {
            if (!l) continue;
            const id = String(l.id || `LOG_${Date.now()}_${Math.random()}`);
            const action = l.action || "UNKNOWN";
            const userId = l.userId || null;
            const userName = l.userName || null;
            const details = l.details || "";
            const raw = JSON.stringify(l);
            await sql`
              INSERT INTO audit_logs (id, action, user_id, user_name, details, raw_data, timestamp, created_at)
              VALUES (${id}, ${action}, ${userId}, ${userName}, ${details}, ${raw}, NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/inventory-movements") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 5e3);
          const rows = await sql`SELECT * FROM inventory_movements ORDER BY timestamp DESC LIMIT ${limit}`;
          const movements = rows.map((r) => safeParseJson(r.raw_data, r));
          return successResponse(movements);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const m of list) {
            if (!m) continue;
            const id = String(m.id || `MVT_${Date.now()}_${Math.random()}`);
            const itemId = String(m.itemId || "");
            const itemName = m.itemName || "";
            const type = m.type || "CONSUMPTION";
            const qty = parseFloat(m.quantity ?? m.change) || 0;
            const prevStock = parseFloat(m.previousStock) || 0;
            const newStock = parseFloat(m.newStock) || 0;
            const reason = m.reason || "";
            const recBy = m.recordedBy || m.createdBy || "";
            const raw = JSON.stringify(m);
            await sql`
              INSERT INTO inventory_movements (id, item_id, item_name, type, quantity, previous_stock, new_stock, reason, recorded_by, raw_data, timestamp, created_at)
              VALUES (${id}, ${itemId}, ${itemName}, ${type}, ${qty}, ${prevStock}, ${newStock}, ${reason}, ${recBy}, ${raw}, NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/location-history") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const limit = Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 5e3);
          const userId = url.searchParams.get("userId");
          let rows;
          if (userId) {
            rows = await sql`SELECT * FROM location_history WHERE user_id = ${userId} ORDER BY timestamp DESC LIMIT ${limit}`;
          } else {
            rows = await sql`SELECT * FROM location_history ORDER BY timestamp DESC LIMIT ${limit}`;
          }
          const history = rows.map((r) => safeParseJson(r.raw_data, r));
          return successResponse(history);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const list = Array.isArray(body) ? body : [body];
          for (const loc of list) {
            if (!loc) continue;
            const id = String(loc.historyId || loc.id || `LOC_${Date.now()}_${Math.random()}`);
            const userId = loc.userId || null;
            const userName = loc.userName || null;
            const lat = parseFloat(loc.latitude) || 0;
            const lng = parseFloat(loc.longitude) || 0;
            const speed = parseFloat(loc.speed) || 0;
            const heading = parseFloat(loc.heading) || 0;
            const accuracy = parseFloat(loc.accuracy) || 0;
            const battery = parseFloat(loc.batteryLevel) || 0;
            const raw = JSON.stringify(loc);
            await sql`
              INSERT INTO location_history (history_id, user_id, user_name, latitude, longitude, speed, heading, accuracy, battery_level, raw_data, timestamp, created_at)
              VALUES (${id}, ${userId}, ${userName}, ${lat}, ${lng}, ${speed}, ${heading}, ${accuracy}, ${battery}, ${raw}, NOW(), NOW())
              ON CONFLICT (history_id) DO NOTHING
            `;
          }
          return jsonResponse({ status: "success", savedCount: list.length });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/settings") {
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const rows = await sql`SELECT data FROM app_synced_collections WHERE collection_name = 'settings' LIMIT 1`;
          if (rows.length > 0 && rows[0].data) {
            return jsonResponse({ status: "success", data: rows[0].data });
          }
          return jsonResponse({ status: "success", data: {} });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const jsonVal = JSON.stringify(body);
          await sql`
            INSERT INTO app_synced_collections (collection_name, data, updated_at)
            VALUES ('settings', ${jsonVal}, NOW())
            ON CONFLICT (collection_name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
          `;
          return jsonResponse({ status: "success" });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path.startsWith("/api/neon/collection/")) {
      const colName = decodeURIComponent(path.replace("/api/neon/collection/", ""));
      const sql = getSql(env);
      if (method === "GET") {
        try {
          const rows = await sql`SELECT data FROM app_synced_collections WHERE collection_name = ${colName} LIMIT 1`;
          if (rows.length > 0 && rows[0].data) {
            const data = Array.isArray(rows[0].data) ? rows[0].data : [];
            return successResponse(data);
          }
          return successResponse([]);
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
      if (method === "POST") {
        try {
          const body = await request.json();
          const jsonVal = JSON.stringify(body);
          await sql`
            INSERT INTO app_synced_collections (collection_name, data, updated_at)
            VALUES (${colName}, ${jsonVal}, NOW())
            ON CONFLICT (collection_name) DO UPDATE SET
              data = EXCLUDED.data,
              updated_at = NOW()
          `;
          return jsonResponse({ status: "success", collection: colName });
        } catch (err) {
          return errorResponse(err.message, 500);
        }
      }
    }
    if (path === "/api/neon/sync/status") {
      const sql = getSql(env);
      try {
        const rows = await sql`SELECT * FROM neon_sheet_sync_metadata ORDER BY updated_at DESC`;
        return successResponse(rows);
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }
    if (path === "/api/neon/disaster-recovery/config") {
      return jsonResponse({
        status: "success",
        disasterRecoveryActive: false,
        message: "Disaster Recovery is in STANDBY. Neon PostgreSQL & Cloudflare Workers is the primary SSOT."
      });
    }
    if (path === "/api/proxy" || path === "/api/google-sheets-proxy" || path === "/api/google-drive-proxy" || path === "/api/proxy-upload") {
      try {
        let targetUrl = "";
        let payload = {};
        let action = url.searchParams.get("action");
        if (method === "POST") {
          const bodyText = await request.text();
          if (bodyText) {
            try {
              const bodyJson = JSON.parse(bodyText);
              targetUrl = bodyJson.sheetsUrl || bodyJson.uploadUrl || bodyJson.targetUrl || "";
              payload = bodyJson.payload || bodyJson;
              if (payload.action) action = payload.action;
            } catch {
              targetUrl = url.searchParams.get("sheetsUrl") || url.searchParams.get("targetUrl") || "";
            }
          }
        } else {
          targetUrl = url.searchParams.get("sheetsUrl") || url.searchParams.get("targetUrl") || "";
        }
        if (!targetUrl || !targetUrl.startsWith("http")) {
          return errorResponse("Missing or invalid sheetsUrl in proxy request", 400);
        }
        if (method === "POST" && payload && Object.keys(payload).length > 0) {
          const postUrl = new URL(targetUrl);
          if (action) postUrl.searchParams.set("action", action);
          const gasRes = await fetch(postUrl.toString(), {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            redirect: "follow"
          });
          const text = await gasRes.text();
          return new Response(text, {
            status: gasRes.status,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        } else {
          const getUrl = new URL(targetUrl);
          for (const [k, v] of url.searchParams.entries()) {
            if (k !== "sheetsUrl" && k !== "targetUrl" && k !== "uploadUrl") {
              getUrl.searchParams.set(k, v);
            }
          }
          const gasRes = await fetch(getUrl.toString(), {
            method: "GET",
            redirect: "follow"
          });
          const text = await gasRes.text();
          return new Response(text, {
            status: gasRes.status,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
          });
        }
      } catch (err) {
        return errorResponse(`Proxy request failed: ${err.message}`, 502);
      }
    }
    if (path.startsWith("/api/") && env.BACKEND_URL) {
      try {
        const backendUrl = new URL(path + url.search, env.BACKEND_URL);
        const backendReq = new Request(backendUrl.toString(), request);
        const res = await fetch(backendReq);
        const resHeaders = new Headers(res.headers);
        for (const [k, v] of Object.entries(CORS_HEADERS)) {
          resHeaders.set(k, v);
        }
        return new Response(res.body, {
          status: res.status,
          headers: resHeaders
        });
      } catch (proxyErr) {
        return errorResponse(`Backend forward error: ${proxyErr.message}`, 502);
      }
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", {
      status: 404,
      headers: CORS_HEADERS
    });
  }
};
export {
  worker_default as default
};
