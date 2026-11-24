/**
 * @file .ai/tools/codex-request-diagnostics/src/createEphemeralCertificate.adapter.ts
 * @version 1.0.0
 * @date 2026-11-19
 * @description Создаёт временную CA→leaf цепочку с приватными ключами только в anonymous pipes/RAM.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EphemeralCertificate } from "./diagnosticRelay.types.ts";

async function openssl(args: string[], input?: Buffer): Promise<Buffer> {
  // OpenSSL STORE открывает путь ключа. Shell создаёт настоящий anonymous pipe:
  // Node stdio socket нельзя повторно открыть через /proc/self/fd/0.
  const child = input
    ? spawn(
        "sh",
        ["-c", 'cat | exec "$@"', "diagnostic-openssl", "openssl", ...args],
        { detached: true, stdio: ["pipe", "pipe", "ignore"] },
      )
    : spawn("openssl", args, {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
  const stop = () => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {}
  };
  const chunks: Buffer[] = [];
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", () =>
      reject(new Error("certificate_generation_failed")),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("certificate_generation_failed")),
    );
  });
  child.stdin?.on("error", () => {});
  if (input) child.stdin?.end(input);
  const timeout = setTimeout(stop, 10000);
  try {
    const collect = async () => {
      let bytes = 0;
      for await (const chunk of child.stdout!) {
        const copy = Buffer.from(chunk);
        bytes += copy.length;
        if (bytes > 32768) {
          stop();
          throw new Error("certificate_generation_failed");
        }
        chunks.push(copy);
      }
      return Buffer.concat(chunks);
    };
    const [result] = await Promise.all([collect(), exit]);
    return result;
  } catch {
    stop();
    throw new Error("certificate_generation_failed");
  } finally {
    clearTimeout(timeout);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function pemBlock(all: Buffer, kind: string): Buffer {
  const begin = "-----BEGIN " + kind + "-----",
    end = "-----END " + kind + "-----";
  const start = all.indexOf(begin),
    finish = all.indexOf(end, start);
  if (start < 0 || finish < start || all.indexOf(begin, start + 1) >= 0)
    throw new Error("certificate_generation_failed");
  return Buffer.from(all.subarray(start, finish + end.length));
}

/**
 * Rustls требует отдельный end-entity certificate с CA:FALSE. Ключи передаются OpenSSL через stdin/stdout;
 * временные файлы содержат только публичные CA/CSR и удаляются до возврата.
 */
export async function createEphemeralCertificate(): Promise<EphemeralCertificate> {
  const directory = await mkdtemp(join(tmpdir(), "codex-public-certificate-"));
  const sensitive: Buffer[] = [];
  let privateKey: Buffer | undefined;
  let success = false;
  try {
    const root = await openssl([
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=Codex diagnostics ephemeral CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
      "-keyout",
      "-",
      "-out",
      "-",
    ]);
    sensitive.push(root);
    const rootKey = pemBlock(root, "PRIVATE KEY");
    sensitive.push(rootKey);
    const trustCertificate = pemBlock(root, "CERTIFICATE");
    const publicRoot = join(directory, "public-ca.pem"),
      publicCsr = join(directory, "public-leaf.csr");
    await writeFile(publicRoot, trustCertificate, { flag: "wx", mode: 0o600 });
    privateKey = await openssl([
      "genpkey",
      "-algorithm",
      "EC",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
    ]);
    const csr = await openssl(
      [
        "req",
        "-new",
        "-key",
        "/proc/self/fd/0",
        "-subj",
        "/CN=chatgpt.com",
        "-addext",
        "subjectAltName=DNS:chatgpt.com,DNS:api.openai.com",
        "-addext",
        "basicConstraints=critical,CA:FALSE",
        "-addext",
        "keyUsage=critical,digitalSignature",
        "-addext",
        "extendedKeyUsage=serverAuth",
        "-out",
        "-",
      ],
      privateKey,
    );
    if (
      !csr.includes("BEGIN CERTIFICATE REQUEST") ||
      csr.includes("PRIVATE KEY")
    )
      throw new Error("certificate_generation_failed");
    await writeFile(publicCsr, csr, { flag: "wx", mode: 0o600 });
    const leaf = await openssl(
      [
        "x509",
        "-req",
        "-in",
        publicCsr,
        "-CA",
        publicRoot,
        "-CAkey",
        "/proc/self/fd/0",
        "-set_serial",
        "1",
        "-days",
        "1",
        "-sha256",
        "-copy_extensions",
        "copy",
        "-out",
        "-",
      ],
      rootKey,
    );
    if (!leaf.includes("BEGIN CERTIFICATE") || leaf.includes("PRIVATE KEY"))
      throw new Error("certificate_generation_failed");
    const certificate = Buffer.concat([
      leaf,
      Buffer.from("\n"),
      trustCertificate,
    ]);
    success = true;
    return { privateKey, certificate, trustCertificate };
  } finally {
    for (const value of sensitive) value.fill(0);
    if (!success) privateKey?.fill(0);
    await rm(directory, { recursive: true, force: true });
  }
}
