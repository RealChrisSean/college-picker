import mysql from "mysql2/promise";
import fs from "fs";

const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: {
    ca: fs.readFileSync(process.env.TIDB_SSL_CA || "/etc/ssl/cert.pem"),
  },
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 10000, // 10s connection timeout
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // keepalive every 10s to prevent cold starts
});

export default pool;
