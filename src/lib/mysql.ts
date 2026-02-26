/**
 * MySQL 연결 풀 (서버 전용 — API 라우트에서만 import)
 * 카페24 MySQL 호스팅 기준으로 설정
 */
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "",
  charset: "utf8mb4",
  timezone: "+09:00",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // 카페24 연결 끊김 방지
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export default pool;
