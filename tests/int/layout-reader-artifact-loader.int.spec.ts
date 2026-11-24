// @vitest-environment node
/**
 * @file tests/int/layout-reader-artifact-loader.int.spec.ts
 * @version 1.0.0
 * @date 2026-11-21
 * @description Проверяет offline factory extraction, запрет startup/imports и ограничение compiled исполнения.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { describe, expect, it } from "vitest";
import {
  createWebpackArtifactLoader,
  extractWebpackFactories,
  observeWebpackFactory,
} from "../../scripts/runtime/layout-reader/webpackArtifactLoader.adapter.mjs";
import { sha256 } from "../../scripts/runtime/layout-reader/readLayoutReaderArtifact.adapter.mjs";

const file = (source: string, side = "server") => ({
  source,
  side,
  path: `${side}/fixture.js`,
  hash: sha256(source),
});

describe("Offline artifact loader", () => {
  it("наблюдает local binding без изменения original statements и function body", () => {
    const source =
      'exports.modules={11:(m,e,r)=>{const offset=1;function read(v){return v.layout.localId+offset}e.ordinary=true}};throw Error("startup");';
    const factory = extractWebpackFactories(file(source))[0];
    const observed = observeWebpackFactory(factory);
    const insertionOffsetUtf16 = observed.insertionOffsetUtf16!;
    expect(
      observed.source.slice(0, insertionOffsetUtf16) +
        observed.source.slice(
          insertionOffsetUtf16 + observed.insertionText.length,
        ),
    ).toBe(factory.source);
    expect(observed.lexicalNames).toContain("read");
    const loader = createWebpackArtifactLoader([file(source)], "server");
    const captures = loader.capturesFor(loader.factories.get("11"));
    loader.bind("read", captures.read);
    expect(
      loader.evaluate("Function.prototype.toString.call(__probe.read)"),
    ).toBe("function read(v){return v.layout.localId+offset}");
  });

  it("принимает inline function только с доказанными factory/global free bindings", () => {
    const body =
      'function(a){return {availability:"compiled",runtimeBuildId:a.runtimeBuildId,settingsSchema:a.settingsSchema,layoutCatalog:a.layoutCatalog,flag}}';
    const factory = extractWebpackFactories(
      file(
        `exports.modules={1:(m,e)=>{const flag=1;function owner(){return (${body})}}};`,
      ),
    )[0];
    const observed = observeWebpackFactory(factory);
    expect(observed.inlineFunctions).toHaveLength(1);
    expect(observed.inlineFunctions[0].source).toBe(body);
    expect(observed.inlineFunctions[0].proof.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "flag", kind: "factory-binding" }),
      ]),
    );
    const shadowed = extractWebpackFactories(
      file(
        `exports.modules={1:(m,e)=>{const flag=1;function owner(flag){return (${body})}}};`,
      ),
    )[0];
    expect(observeWebpackFactory(shadowed).inlineFunctions).toEqual([]);
    const lexicalThis = extractWebpackFactories(
      file(
        `exports.modules={1:(m,e)=>{function owner(){return (${body.replace(",flag", ",flag:this.flag")})}}};`,
      ),
    )[0];
    expect(observeWebpackFactory(lexicalThis).inlineFunctions).toEqual([]);
  });

  it("сохраняет original effective strictness, включая inherited file directive", () => {
    const body =
      'function(){"desiredAssignment";"expectedCatalogHash";"PLAN_EXPIRED";"REPLAY_CONFLICT";const value=Object.freeze({v:1});value.v=2;return value.v;}';
    const source = `"use strict";exports.modules={1:(m)=>{class Service{method(){return (${body})()}}m.exports=Service;}};`;
    const loader = createWebpackArtifactLoader([file(source)], "server");
    const factory = loader.factories.get("1");
    expect(factory.effectiveStrict).toBe(true);
    loader.bind("Service", loader.exportsFor(factory));
    expect(() => loader.evaluate("new __probe.Service().method()")).toThrow();
    const observed = observeWebpackFactory(factory);
    expect(observed.inlineFunctions).toHaveLength(1);
    loader.bind(
      "inline",
      loader.capturesFor(factory)[observed.inlineFunctions[0].name],
    );
    expect(() => loader.evaluate("__probe.inline()")).toThrow();
    const sloppy = extractWebpackFactories(
      file(source.replace('"use strict";', "")),
    )[0];
    expect(observeWebpackFactory(sloppy).inlineFunctions).toEqual([]);
  });

  it("не принимает parenthesized или escaped literal за strict directive", () => {
    for (const prefix of ['("use strict");', '"use\\x20strict";']) {
      const factory = extractWebpackFactories(
        file(`${prefix}exports.modules={1:(m)=>{m.exports=true}};`),
      )[0];
      expect(factory.effectiveStrict).toBe(false);
    }
  });

  it("отказывает forbidden lexical/meta constructs также в default parameters", () => {
    for (const value of ["this", "new.target", "arguments[0]", "eval('1')"]) {
      const factory = extractWebpackFactories(
        file(
          `exports.modules={1:(m)=>{function owner(){return function(a=${value}){"desiredAssignment";"expectedCatalogHash";"PLAN_EXPIRED";"REPLAY_CONFLICT";return a}}}};`,
        ),
      )[0];
      expect(observeWebpackFactory(factory).inlineFunctions).toEqual([]);
    }
  });

  it("отказывает повторному module ID внутри одного файла до исполнения", () => {
    expect(() =>
      extractWebpackFactories(
        file('exports.modules={1:()=>"old"};exports.modules={1:()=>"new"};'),
      ),
    ).toThrow(/Duplicate/);
  });

  it("извлекает original factories, не выполняя startup и runtime callback", () => {
    const source =
      "exports.modules={11:(m,e,r)=>{r.d(e,{read:()=>read});function read(v){return v.layout.localId}}};process.exit(99);";
    const loader = createWebpackArtifactLoader([file(source)], "server");
    const exported = loader.exportsFor(loader.factories.get("11"));
    loader.bind("read", exported.read);
    loader.setJSON("value", { layout: { localId: "default" } });
    expect(loader.evaluate("__probe.read(__probe.value)")).toBe("default");
    expect(loader.evidence().executedFactories).toHaveLength(1);
  });

  it("регистрирует browser push без выполнения callback и относит input к VM realm", () => {
    const source =
      '(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[2],{7:(m,e)=>{e.same=v=>Object.getPrototypeOf(v)===Object.prototype}},()=>{throw Error("startup") }]);';
    const loader = createWebpackArtifactLoader(
      [file(source, "client")],
      "client",
    );
    loader.bind("same", loader.exportsFor(loader.factories.get("7")).same);
    loader.setJSON("value", { localId: "default" });
    expect(loader.evaluate("__probe.same(__probe.value)")).toBe(true);
  });

  it("не допускает внешний fs/net/Payload и dynamic runtime loading", () => {
    for (const source of [
      'exports.modules={1:(m)=>{m.exports=require("node:fs")}};',
      "exports.modules={1:(m,e,r)=>{m.exports=r(777)}};",
      "exports.modules={1:(m,e,r)=>{r.e(2)}};",
    ]) {
      const loader = createWebpackArtifactLoader([file(source)], "server");
      expect(() => loader.exportsFor(loader.factories.get("1"))).toThrow(
        /denied/i,
      );
    }
  });

  it("отказывает conflicting module identities вместо смешивания build contexts", () => {
    expect(() =>
      createWebpackArtifactLoader(
        [
          file('exports.modules={1:(m)=>{m.exports="a"}};'),
          file('exports.modules={1:(m)=>{m.exports="b"}};'),
        ],
        "server",
      ),
    ).toThrow(/Conflicting/);
  });

  it("прерывает бесконечное исполнение выбранной factory", () => {
    const loader = createWebpackArtifactLoader(
      [file("exports.modules={1:()=>{while(true){}}};")],
      "server",
    );
    expect(() => loader.exportsFor(loader.factories.get("1"))).toThrow(
      /timed out/,
    );
  });

  it("ограничивает также queued VM microtasks", () => {
    const loader = createWebpackArtifactLoader(
      [
        file(
          "exports.modules={1:()=>{Promise.resolve().then(()=>{while(true){}})}};",
        ),
      ],
      "server",
    );
    expect(() => loader.exportsFor(loader.factories.get("1"))).toThrow(
      /timed out/,
    );
  });

  it("не считает произвольный nested object webpack registry", () => {
    expect(
      extractWebpackFactories(file('const fixture={1:()=>"value"};')),
    ).toEqual([]);
  });
});
