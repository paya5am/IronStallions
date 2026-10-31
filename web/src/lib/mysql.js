// MySQL access for the API layer. Only server code imports this file.
// Connection settings come from environment variables (web/.env.local).
import mysql from 'mysql2/promise';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export function pool() {
  // one pool per server process (kept on globalThis so hot reload does not open new pools)
  if (!globalThis.__gymMysqlPool) {
    globalThis.__gymMysqlPool = mysql.createPool({
      host: required('MYSQL_HOST'),
      port: Number(process.env.MYSQL_PORT || 3306),
      user: required('MYSQL_USER'),
      password: process.env.MYSQL_PASSWORD || '',
      database: required('MYSQL_DATABASE'),
      connectionLimit: 10,
      dateStrings: true,      // DATE / DATETIME come back as 'YYYY-MM-DD HH:MM:SS' strings
      decimalNumbers: true,   // DECIMAL comes back as a number
      supportBigNumbers: true,
    });
  }
  return globalThis.__gymMysqlPool;
}

// Runs one SQL statement with ? placeholders and returns the rows.
export async function query(sql, params = []) {
  const [rows] = await pool().query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Calls a stored procedure.
//   inArgs  : values for the IN parameters, in order
//   outNames: names for the OUT parameters, in order
// Returns { out: {name: value}, rows: [...first result set...] }
export async function callProc(name, inArgs = [], outNames = []) {
  const conn = await pool().getConnection();
  try {
    const outVars = outNames.map((_, i) => `@o${i}`);
    const placeholders = [...inArgs.map(() => '?'), ...outVars].join(', ');
    const [result] = await conn.query(`CALL ${name}(${placeholders})`, inArgs);
    let rows = [];
    if (Array.isArray(result) && Array.isArray(result[0])) rows = result[0];
    const out = {};
    if (outNames.length) {
      const [o] = await conn.query(`SELECT ${outVars.map((v, i) => `${v} AS \`${outNames[i]}\``).join(', ')}`);
      Object.assign(out, o[0]);
    }
    return { out, rows };
  } finally {
    conn.release();
  }
}
