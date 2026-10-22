/**
 * @file packages/git-runtime/src/gitNetworkConfig.constants.ts
 * @version 1.0.0
 * @date 2026-10-22
 * @description Закрепляет общую credential, TLS и proxy политику явного сетевого Git transport.
 */
export const GIT_NETWORK_CONFIG = [
  "credential.helper=",
  "credential.username=x-access-token",
  "credential.interactive=true",
  "http.emptyAuth=false",
  "http.proactiveAuth=basic",
  "http.extraHeader=",
  "http.cookieFile=",
  "http.saveCookies=false",
  "http.proxy=",
  "http.followRedirects=false",
  "http.sslVerify=true",
  "http.lowSpeedLimit=1",
  "http.lowSpeedTime=15",
  "push.followTags=false",
  "push.recurseSubmodules=no",
  "push.pushOption=",
].flatMap((value) => ["-c", value]);
GIT_NETWORK_CONFIG.unshift("--no-replace-objects");
