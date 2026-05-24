export type SmtpConfigSource = "env" | "override" | "db" | "default" | "missing";

export interface SafeSmtpStatus {
  configured: boolean;
  missing: Array<"host" | "user" | "pass" | "senderEmail">;
  source: {
    host: SmtpConfigSource;
    port: SmtpConfigSource;
    secure: SmtpConfigSource;
    user: SmtpConfigSource;
    pass: SmtpConfigSource;
    senderName: SmtpConfigSource;
    senderEmail: SmtpConfigSource;
    replyToEmail: SmtpConfigSource;
  };
  env: {
    hasHost: boolean;
    hasPort: boolean;
    hasUser: boolean;
    hasPass: boolean;
    hasSecure: boolean;
    hasSenderName: boolean;
    hasSenderEmail: boolean;
    hasReplyToEmail: boolean;
  };
  stored: {
    hasHost: boolean;
    hasUser: boolean;
    hasPass: boolean;
    hasSenderEmail: boolean;
  };
}
