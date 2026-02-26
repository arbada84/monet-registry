/**
 * PM2 설정 — 카페24 Node.js 호스팅용
 * 카페24 호스팅 관리 > Node.js > 앱 관리에서 ecosystem.config.js를 실행 파일로 지정
 */
module.exports = {
  apps: [
    {
      name: "culturepeople-news",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // 카페24 연결 끊김 방지
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      // 로그
      output: "./logs/out.log",
      error: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
