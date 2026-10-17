import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

const require = createRequire(import.meta.url);

describe("mail dependency security upgrade compatibility", () => {
  it("composes mail offline and parses Korean addresses through mailparser", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const message = await transport.sendMail({
      from: '"컬피" <sender@example.test>',
      to: '"박영래" <editor@example.test>',
      subject: "보도자료 수신 점검",
      text: "외부 메일 서버에 연결하지 않는 회귀 테스트입니다.",
    });
    const parsed = await simpleParser(message.message);
    expect(parsed.subject).toBe("보도자료 수신 점검");
    expect(parsed.from?.value[0]).toMatchObject({ name: "컬피", address: "sender@example.test" });
    expect(parsed.text).toContain("회귀 테스트");
  });

  it("preserves the Nodemailer internal modules used by imapflow and mailparser", () => {
    const imapRequire = createRequire(require.resolve("imapflow"));
    const parserRequire = createRequire(require.resolve("mailparser"));
    expect(typeof imapRequire("nodemailer/lib/smtp-connection/http-proxy-client")).toBe("function");
    expect(typeof parserRequire("nodemailer/lib/addressparser")).toBe("function");
    expect(imapRequire("nodemailer/package.json").version).toBe(require("nodemailer/package.json").version);
    expect(parserRequire("nodemailer/package.json").version).toBe(require("nodemailer/package.json").version);
  });
});
