/**
 * @file src/components/admin/media/reference/useMediaReferenceWorkbench.hook.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Состояние сеанса и обработчики интерактивного макета медиатеки.
 * @see documentation/specifications/media-management-references.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Asset,
  LibraryContext,
  Profile,
  ProfileVariant,
  Purpose,
  ScrollPosition,
  Section,
} from "./MediaReference.types";
import type { MediaReferenceWorkbenchProps } from "./MediaReferenceWorkbench.types";
import {
  defaultLibrary,
  demoAssets,
  demoProcessing,
  demoProfiles,
} from "./mediaReference.fixtures";
import { useMediaReferenceFiles } from "./useMediaReferenceFiles.hook";

/** Координирует локальные изменения; ограниченный сценарий проверяется и в обработчиках. */
export function useMediaReferenceWorkbench(
  props: MediaReferenceWorkbenchProps,
) {
  const [theme, setTheme] = useState(props.initialTheme ?? "light");
  const [scenario, setScenario] = useState(props.initialScenario ?? "normal");
  const denied = scenario === "denied";
  const local = useMediaReferenceFiles(denied);
  const [section, setSection] = useState<Section>("library");
  const [library, setLibrary] = useState<LibraryContext>({ ...defaultLibrary });
  const [pickerLibrary, setPickerLibrary] = useState<LibraryContext>({
    ...defaultLibrary,
  });
  const [overrides, setOverrides] = useState<Record<string, Partial<Asset>>>(
    {},
  );
  const [failedPreviews, setFailedPreviews] = useState<Set<string>>(new Set());
  const [detailsID, setDetailsID] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState("info");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingID, setPendingID] = useState<string | null>(null);
  const [blockID, setBlockID] = useState<string | null>(null);
  const [blockAlt, setBlockAlt] = useState("");
  const [blockCaption, setBlockCaption] = useState("");
  const [profile, setProfile] = useState<Purpose>("Фото товара");
  const [profiles, setProfiles] = useState(demoProfiles);
  const [appliedProfiles, setAppliedProfiles] = useState(demoProfiles);
  const [processing, setProcessing] = useState(demoProcessing);
  const [notice, setNotice] = useState({ text: "", revision: 0 });
  const [sequential, setSequential] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);
  const scrollPositions = useRef<ScrollPosition[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // DOM-ссылки принадлежат hook: модель отдаёт только привязки и события.
  const attachContainer = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element;
  }, []);
  const attachDetailsHeading = useCallback(
    (element: HTMLHeadingElement | null) => {
      detailsHeadingRef.current = element;
    },
    [],
  );
  const attachUploadInput = useCallback((element: HTMLInputElement | null) => {
    uploadInputRef.current = element;
  }, []);
  const attachSearchInput = useCallback((element: HTMLInputElement | null) => {
    searchRef.current = element;
  }, []);
  const assets = [...local.assets, ...demoAssets].map((asset) => ({
    ...asset,
    ...overrides[asset.id],
    previewError: asset.previewError || failedPreviews.has(asset.id),
  }));
  const details =
    scenario === "normal" || scenario === "denied"
      ? assets.find((asset) => asset.id === detailsID)
      : undefined;
  const block = assets.find((asset) => asset.id === blockID);
  const pending = assets.find((asset) => asset.id === pendingID);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSequential(entry.contentRect.width < 1100),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (detailsID && section === "library" && sequential)
      detailsHeadingRef.current?.focus();
  }, [detailsID, section, sequential]);

  function announce(text: string) {
    setNotice((current) => ({ text, revision: current.revision + 1 }));
  }
  function openFilePicker() {
    if (!denied) uploadInputRef.current?.click();
  }
  function focusPickerSearch() {
    searchRef.current?.focus();
  }
  function previewError(id: string) {
    setFailedPreviews((current) => new Set([...current, id]));
  }
  function changeLibrary(picker: boolean, patch: Partial<LibraryContext>) {
    const setter = picker ? setPickerLibrary : setLibrary;
    setter((current) => ({
      ...current,
      ...patch,
      page:
        patch.page ??
        (Object.keys(patch).some((key) => key !== "view") ? 1 : current.page),
    }));
  }
  function libraryResults(picker: boolean, excludedID?: string) {
    const context = picker ? pickerLibrary : library;
    const filtered = (scenario === "empty" ? [] : assets)
      .filter(
        (asset) =>
          asset.id !== excludedID &&
          asset.name
            .toLocaleLowerCase("ru")
            .includes(context.search.trim().toLocaleLowerCase("ru")) &&
          (!context.kind || asset.kind === context.kind) &&
          (!context.purpose || asset.purpose === context.purpose) &&
          (context.folder === "Все материалы" ||
            asset.folder === context.folder),
      )
      .sort((a, b) =>
        context.sort === "name"
          ? a.name.localeCompare(b.name, "ru")
          : b.date.localeCompare(a.date),
      );
    const pages = Math.max(1, Math.ceil(filtered.length / 12));
    const page = Math.min(context.page, pages);
    return {
      total: filtered.length,
      pages,
      page,
      items: filtered.slice((page - 1) * 12, page * 12),
    };
  }
  function closeDetails() {
    setDetailsID(null);
    // Карточка остаётся смонтированной вместе с контекстом и позицией прокрутки.
    requestAnimationFrame(() => {
      scrollPositions.current.forEach(({ element, top, left }) => {
        element.scrollTop = top;
        element.scrollLeft = left;
      });
      if (originRef.current?.isConnected)
        originRef.current.focus({ preventScroll: true });
    });
  }
  function selectAsset(
    id: string,
    picker: boolean,
    element: HTMLButtonElement,
  ) {
    if (picker) {
      if (!denied) setPendingID(id);
      return;
    }
    originRef.current = element;
    scrollPositions.current = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      scrollPositions.current.push({
        element: ancestor,
        top: ancestor.scrollTop,
        left: ancestor.scrollLeft,
      });
      ancestor = ancestor.parentElement;
    }
    setDetailsID(id);
    setDetailsTab("info");
  }
  function editAsset(
    id: string,
    patch: Partial<Pick<Asset, "alt" | "caption" | "purpose">>,
  ) {
    if (denied) return;
    setOverrides((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
    announce("Изменено в макете");
  }
  function addFiles(files: File[]) {
    if (denied || !local.add(files)) return;
    setScenario("normal");
    setLibrary({ ...defaultLibrary });
    announce("Добавлен в макет — не отправлен");
  }
  function removeFile(id: string) {
    if (denied) return;
    local.remove(id);
    if (detailsID === id) closeDetails();
    if (blockID === id) setBlockID(null);
    if (pendingID === id) setPendingID(null);
    setOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFailedPreviews((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    // Ограничиваем сохранённую страницу каждого независимого контекста после удаления.
    setLibrary((current) => ({
      ...current,
      page: Math.min(current.page, libraryResults(false, id).pages),
    }));
    setPickerLibrary((current) => ({
      ...current,
      page: Math.min(current.page, libraryResults(true, id).pages),
    }));
    announce("Удалено из макета");
  }
  function changeDialog(open: boolean) {
    if (open && denied) return;
    setPendingID(blockID);
    setDialogOpen(open);
  }
  function confirmImage() {
    if (
      denied ||
      scenario === "empty" ||
      scenario === "loading" ||
      scenario === "error" ||
      pending?.kind !== "image"
    )
      return;
    setBlockID(pending.id);
    setDialogOpen(false);
    announce("Изображение выбрано в примере");
  }
  function editBlock(field: "alt" | "caption", value: string) {
    if (denied) return;
    if (field === "alt") setBlockAlt(value);
    else setBlockCaption(value);
    announce("Изменено в макете");
  }
  function removeBlock() {
    if (denied) return;
    setBlockID(null);
    setPendingID(null);
    announce("Изображение убрано из примера");
  }
  function profileErrors(variant: ProfileVariant) {
    return {
      width:
        !/^\d+$/.test(variant.width) ||
        !Number.isSafeInteger(Number(variant.width)) ||
        Number(variant.width) <= 0
          ? "Укажите положительную ширину"
          : "",
      quality:
        !/^\d+$/.test(variant.quality) ||
        Number(variant.quality) < 1 ||
        Number(variant.quality) > 100
          ? "Введите качество от 1 до 100"
          : "",
    };
  }
  function editProfile(
    size: keyof Profile,
    field: keyof ProfileVariant,
    value: string,
  ) {
    if (denied) return;
    const variant = { ...profiles[profile][size], [field]: value };
    setProfiles((current) => ({
      ...current,
      [profile]: { ...current[profile], [size]: variant },
    }));
    const errors = profileErrors(variant);
    if (
      !errors.width &&
      !errors.quality &&
      ["WebP", "AVIF", "JPEG"].includes(variant.format)
    ) {
      setAppliedProfiles((current) => ({
        ...current,
        [profile]: { ...current[profile], [size]: variant },
      }));
      announce("Изменено в макете");
    }
  }
  function resetProfile() {
    if (denied) return;
    setProfiles((current) => ({
      ...current,
      [profile]: demoProfiles[profile],
    }));
    setAppliedProfiles((current) => ({
      ...current,
      [profile]: demoProfiles[profile],
    }));
    announce("Параметры примера сброшены");
  }
  function retryProcessing(id: string) {
    if (denied) return;
    setProcessing((current) =>
      current.map((row) =>
        row.id === id && row.status === "Ошибка"
          ? { ...row, status: "В очереди" }
          : row,
      ),
    );
    announce("Состояние примера изменено");
  }
  return {
    theme,
    setTheme,
    scenario,
    setScenario,
    denied,
    section,
    setSection,
    assets,
    library,
    pickerLibrary,
    changeLibrary,
    libraryResults,
    details,
    detailsTab,
    setDetailsTab,
    selectAsset,
    closeDetails,
    editAsset,
    addFiles,
    removeFile,
    previewError,
    dialogOpen,
    changeDialog,
    pending,
    block,
    confirmImage,
    blockAlt,
    blockCaption,
    editBlock,
    removeBlock,
    profile,
    setProfile,
    profiles,
    appliedProfiles,
    profileErrors,
    editProfile,
    resetProfile,
    processing,
    retryProcessing,
    notice,
    sequential,
    attachContainer,
    attachDetailsHeading,
    attachSearchInput,
    attachUploadInput,
    openFilePicker,
    focusPickerSearch,
  };
}
