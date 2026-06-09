const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // لتقديم الواجهة الأمامية

// -------------------- قاعدة البيانات --------------------
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error(err.message);
  else console.log('✅ متصل بقاعدة بيانات SQLite');
});

// إنشاء الجداول
db.serialize(() => {
  // المستخدمين
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT
  )`);
  // الموظفين
  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    salary REAL,
    role TEXT
  )`);
  // الرواتب
  db.run(`CREATE TABLE IF NOT EXISTS payrolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId INTEGER,
    employeeName TEXT,
    month TEXT,
    baseSalary REAL,
    bonus REAL,
    total REAL
  )`);
  // الأصناف
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    code TEXT UNIQUE,
    price REAL,
    cost REAL
  )`);
  // الفروع
  db.run(`CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
  )`);
  // المخزون (stock)
  db.run(`CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branchId INTEGER,
    itemCode TEXT,
    qty INTEGER
  )`);
  // العملاء
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    debt REAL,
    points INTEGER
  )`);
  // المبيعات
  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    itemName TEXT,
    code TEXT,
    qty INTEGER,
    price REAL,
    subtotal REAL,
    discount REAL,
    tax REAL,
    total REAL,
    type TEXT,
    customerId INTEGER,
    branchId INTEGER,
    currency TEXT
  )`);
  // القيود اليومية (محاسبة)
  db.run(`CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    description TEXT,
    debitAccount TEXT,
    creditAccount TEXT,
    amount REAL
  )`);
  // العروض
  db.run(`CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    value REAL,
    minBill REAL,
    productCode TEXT
  )`);
  // الموردون
  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    company TEXT
  )`);
  // المشتريات (مسودات وفواتير)
  db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplierId INTEGER,
    supplierName TEXT,
    total REAL,
    date TEXT,
    converted INTEGER DEFAULT 0
  )`);
  // خطط التقسيط
  db.run(`CREATE TABLE IF NOT EXISTS installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerId INTEGER,
    customerName TEXT,
    totalAmount REAL,
    months INTEGER,
    installmentAmount REAL,
    remaining REAL
  )`);
  // المرتجعات
  db.run(`CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saleId INTEGER,
    reason TEXT,
    date TEXT,
    amount REAL
  )`);
  // سجل النشاط
  db.run(`CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    details TEXT,
    time TEXT
  )`);

  // إضافة بيانات افتراضية للمستخدمين
  db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`, 
        ['admin', 'admin123', 'admin', 'المدير العام']);
      db.run(`INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`, 
        ['cashier', 'cash123', 'cashier', 'الكاشير']);
    }
  });
  // إضافة فرع افتراضي
  db.get(`SELECT * FROM branches WHERE id = 1`, (err, row) => {
    if (!row) db.run(`INSERT INTO branches (id, name) VALUES (1, 'الفرع الرئيسي')`);
  });
});

// -------------------- واجهات API --------------------
// 1. تسجيل الدخول
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
    if (user) res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
    else res.status(401).json({ success: false, message: 'بيانات دخول خاطئة' });
  });
});

// 2. الأصناف (CRUD)
app.get('/api/items', (req, res) => {
  db.all(`SELECT * FROM items`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/items', (req, res) => {
  const { name, code, price, cost } = req.body;
  db.run(`INSERT INTO items (name, code, price, cost) VALUES (?, ?, ?, ?)`, [name, code, price, cost], function(err) {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ id: this.lastID });
  });
});
app.put('/api/items/:id', (req, res) => {
  const { name, code, price, cost } = req.body;
  db.run(`UPDATE items SET name=?, code=?, price=?, cost=? WHERE id=?`, [name, code, price, cost, req.params.id], (err) => {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ updated: true });
  });
});
app.delete('/api/items/:id', (req, res) => {
  db.run(`DELETE FROM items WHERE id=?`, [req.params.id], (err) => { res.json({ deleted: true }); });
});

// 3. الفروع والمخزون
app.get('/api/branches', (req, res) => {
  db.all(`SELECT * FROM branches`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/branches', (req, res) => {
  const { name } = req.body;
  db.run(`INSERT INTO branches (name) VALUES (?)`, [name], function(err) {
    if (err) res.status(400).json({ error: err.message });
    else res.json({ id: this.lastID });
  });
});
app.get('/api/stock', (req, res) => {
  const branchId = req.query.branchId || 1;
  db.all(`SELECT * FROM stock WHERE branchId = ?`, [branchId], (err, rows) => { res.json(rows); });
});
app.post('/api/transfer-stock', (req, res) => {
  const { fromBranch, toBranch, itemCode, qty } = req.body;
  db.run(`UPDATE stock SET qty = qty - ? WHERE branchId = ? AND itemCode = ?`, [qty, fromBranch, itemCode]);
  db.run(`UPDATE stock SET qty = qty + ? WHERE branchId = ? AND itemCode = ?`, [qty, toBranch, itemCode]);
  res.json({ success: true });
});

// 4. العملاء
app.get('/api/customers', (req, res) => {
  db.all(`SELECT * FROM customers`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/customers', (req, res) => {
  const { name, phone, debt, points } = req.body;
  db.run(`INSERT INTO customers (name, phone, debt, points) VALUES (?, ?, ?, ?)`, [name, phone, debt || 0, points || 0], function(err) {
    res.json({ id: this.lastID });
  });
});
app.put('/api/customers/:id', (req, res) => {
  const { name, phone, debt, points } = req.body;
  db.run(`UPDATE customers SET name=?, phone=?, debt=?, points=? WHERE id=?`, [name, phone, debt, points, req.params.id], () => res.json({ updated: true }));
});

// 5. المبيعات (مع حساب تلقائي للضريبة والخصم)
app.post('/api/sales', (req, res) => {
  const sale = req.body;
  db.run(`INSERT INTO sales (date, itemName, code, qty, price, subtotal, discount, tax, total, type, customerId, branchId, currency)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [sale.date, sale.itemName, sale.code, sale.qty, sale.price, sale.subtotal, sale.discount, sale.tax, sale.total, sale.type, sale.customerId, sale.branchId, sale.currency], function(err) {
      if (err) res.status(400).json({ error: err.message });
      else {
        // تحديث المخزون
        db.run(`UPDATE stock SET qty = qty - ? WHERE branchId = ? AND itemCode = ?`, [sale.qty, sale.branchId, sale.code]);
        // قيد محاسبي
        const debitAccount = (sale.type === 'cash') ? '1010' : '1100';
        db.run(`INSERT INTO journal_entries (date, description, debitAccount, creditAccount, amount) VALUES (?,?,?,?,?)`,
          [sale.date, `بيع ${sale.itemName}`, debitAccount, '4010', sale.total]);
        res.json({ id: this.lastID });
      }
    });
});
app.get('/api/sales', (req, res) => {
  db.all(`SELECT * FROM sales ORDER BY id DESC LIMIT 100`, [], (err, rows) => { res.json(rows); });
});

// 6. الموظفين والرواتب
app.get('/api/employees', (req, res) => {
  db.all(`SELECT * FROM employees`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/employees', (req, res) => {
  const { name, salary, role } = req.body;
  db.run(`INSERT INTO employees (name, salary, role) VALUES (?, ?, ?)`, [name, salary, role], function(err) {
    res.json({ id: this.lastID });
  });
});
app.post('/api/payroll', (req, res) => {
  const { employeeId, employeeName, month, baseSalary, bonus, total } = req.body;
  db.run(`INSERT INTO payrolls (employeeId, employeeName, month, baseSalary, bonus, total) VALUES (?,?,?,?,?,?)`,
    [employeeId, employeeName, month, baseSalary, bonus, total], function(err) {
      db.run(`INSERT INTO journal_entries (date, description, debitAccount, creditAccount, amount) VALUES (?,?,?,?,?)`,
        [new Date().toISOString().slice(0,10), `راتب ${employeeName}`, '6010', '1010', total]);
      res.json({ id: this.lastID });
    });
});

// 7. العروض
app.get('/api/offers', (req, res) => {
  db.all(`SELECT * FROM offers`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/offers', (req, res) => {
  const { type, value, minBill, productCode } = req.body;
  db.run(`INSERT INTO offers (type, value, minBill, productCode) VALUES (?,?,?,?)`, [type, value, minBill, productCode], function() {
    res.json({ id: this.lastID });
  });
});
app.delete('/api/offers/:id', (req, res) => {
  db.run(`DELETE FROM offers WHERE id=?`, [req.params.id], () => res.json({ deleted: true }));
});

// 8. الموردون والمشتريات (مسودات)
app.get('/api/suppliers', (req, res) => {
  db.all(`SELECT * FROM suppliers`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/suppliers', (req, res) => {
  const { name, phone, company } = req.body;
  db.run(`INSERT INTO suppliers (name, phone, company) VALUES (?,?,?)`, [name, phone, company], function() {
    res.json({ id: this.lastID });
  });
});
app.post('/api/purchase-draft', (req, res) => {
  const { supplierId, supplierName, total } = req.body;
  db.run(`INSERT INTO purchase_orders (supplierId, supplierName, total, date, converted) VALUES (?,?,?,?,0)`,
    [supplierId, supplierName, total, new Date().toISOString().slice(0,10)], function() {
      res.json({ id: this.lastID });
    });
});
app.get('/api/purchase-drafts', (req, res) => {
  db.all(`SELECT * FROM purchase_orders WHERE converted = 0`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/convert-draft/:id', (req, res) => {
  db.run(`UPDATE purchase_orders SET converted = 1 WHERE id = ?`, [req.params.id]);
  res.json({ success: true });
});

// 9. التقسيط
app.post('/api/installments', (req, res) => {
  const { customerId, customerName, totalAmount, months, installmentAmount, remaining } = req.body;
  db.run(`INSERT INTO installments (customerId, customerName, totalAmount, months, installmentAmount, remaining) VALUES (?,?,?,?,?,?)`,
    [customerId, customerName, totalAmount, months, installmentAmount, remaining], function() {
      res.json({ id: this.lastID });
    });
});
app.get('/api/installments', (req, res) => {
  db.all(`SELECT * FROM installments`, [], (err, rows) => { res.json(rows); });
});

// 10. تسديد الديون
app.post('/api/pay-debt', (req, res) => {
  const { customerId, amount } = req.body;
  db.run(`UPDATE customers SET debt = debt - ? WHERE id = ?`, [amount, customerId]);
  db.run(`INSERT INTO journal_entries (date, description, debitAccount, creditAccount, amount) VALUES (?,?,?,?,?)`,
    [new Date().toISOString().slice(0,10), 'سداد دين عميل', '1010', '1100', amount]);
  res.json({ success: true });
});

// 11. المرتجعات
app.post('/api/returns', (req, res) => {
  const { saleId, reason, amount, itemCode, branchId, qty } = req.body;
  db.run(`INSERT INTO returns (saleId, reason, date, amount) VALUES (?,?,?,?)`, [saleId, reason, new Date().toISOString(), amount]);
  db.run(`UPDATE stock SET qty = qty + ? WHERE branchId = ? AND itemCode = ?`, [qty, branchId, itemCode]);
  db.run(`UPDATE sales SET type = 'returned' WHERE id = ?`, [saleId]);
  db.run(`INSERT INTO journal_entries (date, description, debitAccount, creditAccount, amount) VALUES (?,?,?,?,?)`,
    [new Date().toISOString().slice(0,10), 'مرتجع بيع', '4010', '1010', amount]);
  res.json({ success: true });
});

// 12. القيود اليومية والميزان
app.get('/api/journal', (req, res) => {
  db.all(`SELECT * FROM journal_entries ORDER BY id DESC`, [], (err, rows) => { res.json(rows); });
});
app.get('/api/trial-balance', (req, res) => {
  db.all(`SELECT debitAccount, SUM(amount) as totalDebit, creditAccount, SUM(amount) as totalCredit FROM journal_entries GROUP BY debitAccount, creditAccount`, [], (err, rows) => {
    res.json(rows);
  });
});

// 13. إحصائيات لوحة القيادة
app.get('/api/dashboard-stats', (req, res) => {
  db.get(`SELECT SUM(total) as totalSales FROM sales`, [], (err, saleRow) => {
    db.get(`SELECT SUM(debt) as totalDebts FROM customers`, [], (err, debtRow) => {
      db.all(`SELECT s.qty, i.name FROM stock s JOIN items i ON s.itemCode = i.code WHERE s.qty < 5`, [], (err, lowStock) => {
        res.json({ totalSales: saleRow?.totalSales || 0, totalDebts: debtRow?.totalDebts || 0, lowStockCount: lowStock.length });
      });
    });
  });
});

// -------------------- تقديم الواجهة الأمامية --------------------
// نرسل ملف HTML كامل يتصل بهذه الـ API
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// إنشاء مجلد public ووضع ملف HTML بداخله (سيتم إنشاؤه تلقائياً)
const fs = require('fs');
if (!fs.existsSync('./public')) fs.mkdirSync('./public');
fs.writeFileSync('./public/index.html', getFrontendHTML(), 'utf8');

// بدء الخادم
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});

// --------------------------------------------------------------
// دالة لتوليد الواجهة الأمامية الكاملة (المعدلة لاستدعاء API)
// --------------------------------------------------------------
function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>نظام غسق ERP – النسخة الحقيقية (API)</title>
  <style>
    * { box-sizing: border-box; font-family: Tahoma, sans-serif; }
    body { margin: 0; background: #eef3f8; }
    header { background: #1f4e79; color: white; padding: 15px; text-align: center; font-size: 22px; }
    .container { display: flex; }
    aside { width: 250px; background: #12263a; color: white; padding: 15px; }
    aside button { display: block; width: 100%; margin-bottom: 8px; padding: 10px; background: #1d3d58; color: white; border: none; border-radius: 8px; cursor: pointer; }
    main { flex: 1; padding: 20px; }
    .card { background: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
    button { background: #1f4e79; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    input, select { padding: 6px; border-radius: 6px; border: 1px solid #ccc; width: 100%; }
    .kpis { display: flex; gap: 15px; margin-bottom: 20px; }
    .kpi { background: white; padding: 15px; border-radius: 12px; flex: 1; text-align: center; }
  </style>
</head>
<body>
<header>غسق ERP – النسخة الخادمية الحقيقية (API + SQLite)</header>
<div class="container">
  <aside>
    <h3>القائمة</h3>
    <button onclick="showSection('dashboard')">📊 لوحة القيادة</button>
    <button onclick="showSection('pos')">🛒 نقطة البيع</button>
    <button onclick="showSection('inventory')">📦 المخزون</button>
    <button onclick="showSection('customers')">👥 العملاء</button>
    <button onclick="showSection('employees')">👔 الموظفين</button>
    <button onclick="showSection('accounting')">📒 المحاسبة</button>
    <button onclick="showSection('reports')">📈 التقارير</button>
  </aside>
  <main>
    <div id="dashboard" class="section"></div>
    <div id="pos" class="section" style="display:none"></div>
    <div id="inventory" class="section" style="display:none"></div>
    <div id="customers" class="section" style="display:none"></div>
    <div id="employees" class="section" style="display:none"></div>
    <div id="accounting" class="section" style="display:none"></div>
    <div id="reports" class="section" style="display:none"></div>
  </main>
</div>

<script>
  const API_BASE = '';
  let currentUser = { role: 'admin' }; // تبسيطاً سندخل كمدير

  async function fetchAPI(url, options = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    return res.json();
  }

  // عرض الأقسام
  function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(sectionId).style.display = 'block';
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'pos') loadPos();
    if (sectionId === 'inventory') loadInventory();
    if (sectionId === 'customers') loadCustomers();
    if (sectionId === 'employees') loadEmployees();
    if (sectionId === 'accounting') loadAccounting();
    if (sectionId === 'reports') loadReports();
  }

  async function loadDashboard() {
    const stats = await fetchAPI('/api/dashboard-stats');
    document.getElementById('dashboard').innerHTML = \`
      <div class="kpis">
        <div class="kpi"><h4>المبيعات</h4><div>\${stats.totalSales}</div></div>
        <div class="kpi"><h4>الديون</h4><div>\${stats.totalDebts}</div></div>
        <div class="kpi"><h4>مخزون منخفض</h4><div>\${stats.lowStockCount}</div></div>
      </div>
      <div class="card"><h3>مرحباً بك في النظام الخادمي الحقيقي</h3><p>جميع البيانات محفوظة في SQLite ويتم الوصول إليها عبر API</p></div>
    \`;
  }

  async function loadPos() {
    const items = await fetchAPI('/api/items');
    const customers = await fetchAPI('/api/customers');
    const branches = await fetchAPI('/api/branches');
    document.getElementById('pos').innerHTML = \`
      <div class="card">
        <h3>نقطة البيع</h3>
        <select id="posItem"><option value="">اختر صنف</option>\${items.map(i => `<option value="\${i.code}" data-price="\${i.price}">\${i.name}</option>`).join('')}</select>
        <input type="number" id="posQty" placeholder="الكمية" value="1">
        <select id="posCustomer"><option value="">بدون عميل</option>\${customers.map(c => `<option value="\${c.id}">\${c.name}</option>`).join('')}</select>
        <select id="posBranch">\${branches.map(b => `<option value="\${b.id}">\${b.name}</option>`).join('')}</select>
        <button onclick="processSale()">إتمام البيع</button>
      </div>
    \`;
    document.getElementById('posItem').onchange = () => {};
  }

  window.processSale = async () => {
    const itemCode = document.getElementById('posItem').value;
    const item = (await fetchAPI('/api/items')).find(i => i.code === itemCode);
    const qty = parseInt(document.getElementById('posQty').value);
    const customerId = document.getElementById('posCustomer').value || null;
    const branchId = document.getElementById('posBranch').value;
    if (!item) return alert('اختر صنفاً');
    const subtotal = qty * item.price;
    const tax = subtotal * 0.15;
    const total = subtotal + tax;
    const sale = {
      date: new Date().toISOString(), itemName: item.name, code: item.code, qty, price: item.price,
      subtotal, discount: 0, tax, total, type: 'cash', customerId, branchId, currency: 'SAR'
    };
    await fetchAPI('/api/sales', { method: 'POST', body: JSON.stringify(sale) });
    alert('تم البيع بنجاح');
    loadPos();
  };

  async function loadInventory() {
    const items = await fetchAPI('/api/items');
    const stock = await fetchAPI('/api/stock?branchId=1');
    document.getElementById('inventory').innerHTML = \`
      <div class="card">
        <h3>المخزون</h3>
        <table><thead><tr><th>الاسم</th><th>الكود</th><th>السعر</th><th>الكمية</th></tr></thead><tbody>
          \${items.map(i => { const s = stock.find(st => st.itemCode === i.code); return \`<tr><td>\${i.name}</td><td>\${i.code}</td><td>\${i.price}</td><td>\${s ? s.qty : 0}</td></tr>\`; }).join('')}
        </tbody></table>
        <button onclick="addItem()">إضافة صنف</button>
      </div>
    \`;
  }
  window.addItem = async () => {
    const name = prompt('اسم الصنف');
    const code = prompt('الكود');
    const price = parseFloat(prompt('السعر'));
    if (name && code && price) {
      await fetchAPI('/api/items', { method: 'POST', body: JSON.stringify({ name, code, price, cost: price*0.7 }) });
      loadInventory();
    }
  };

  async function loadCustomers() {
    const customers = await fetchAPI('/api/customers');
    document.getElementById('customers').innerHTML = \`
      <div class="card"><h3>العملاء</h3><table><thead><tr><th>الاسم</th><th>الهاتف</th><th>الدين</th></tr></thead><tbody>
        \${customers.map(c => \`<tr><td>\${c.name}</td><td>\${c.phone}</td><td>\${c.debt}</td></tr>\`).join('')}
      </tbody></table><button onclick="addCustomer()">إضافة عميل</button></div>
    \`;
  }
  window.addCustomer = async () => {
    const name = prompt('اسم العميل');
    const phone = prompt('الهاتف');
    if (name) await fetchAPI('/api/customers', { method: 'POST', body: JSON.stringify({ name, phone, debt: 0, points: 0 }) });
    loadCustomers();
  };

  async function loadEmployees() {
    const employees = await fetchAPI('/api/employees');
    document.getElementById('employees').innerHTML = \`
      <div class="card"><h3>الموظفين</h3><table><thead><tr><th>الاسم</th><th>الراتب</th><th>الدور</th></tr></thead><tbody>
        \${employees.map(e => \`<tr><td>\${e.name}</td><td>\${e.salary}</td><td>\${e.role}</td></tr>\`).join('')}
      </tbody></table><button onclick="addEmployee()">إضافة موظف</button></div>
    \`;
  }
  window.addEmployee = async () => {
    const name = prompt('الاسم');
    const salary = parseFloat(prompt('الراتب'));
    const role = prompt('الدور (cashier/accountant/stock/admin)');
    if (name && salary) await fetchAPI('/api/employees', { method: 'POST', body: JSON.stringify({ name, salary, role }) });
    loadEmployees();
  };

  async function loadAccounting() {
    const journal = await fetchAPI('/api/journal');
    document.getElementById('accounting').innerHTML = \`
      <div class="card"><h3>دفتر اليومية</h3><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>المبلغ</th></tr></thead><tbody>
        \${journal.map(j => \`<tr><td>\${j.date}</td><td>\${j.description}</td><td>\${j.debitAccount}</td><td>\${j.creditAccount}</td><td>\${j.amount}</td></tr>\`).join('')}
      </tbody></table></div>
    \`;
  }

  async function loadReports() {
    const sales = await fetchAPI('/api/sales');
    document.getElementById('reports').innerHTML = \`
      <div class="card"><h3>المبيعات</h3><table><thead><tr><th>التاريخ</th><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead><tbody>
        \${sales.map(s => \`<tr><td>\${s.date}</td><td>\${s.itemName}</td><td>\${s.qty}</td><td>\${s.total}</td></tr>\`).join('')}
      </tbody></table></div>
    \`;
  }

  // بدء التشغيل
  showSection('dashboard');
</script>
</body>
</html>`;
}
