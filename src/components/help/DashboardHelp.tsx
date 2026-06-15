"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  ADMIN_HELP_GENERAL,
  ADMIN_HELP_SECTIONS,
  getAdminHelpPage,
  resolveAdminHelpPageKey,
  type AdminHelpSectionKey,
} from "@/content/help/admin";
import { HelpContentBody, HelpGeneralBody } from "./HelpContentBody";

function HelpIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`dashboard-help-picker-chevron${open ? " dashboard-help-picker-chevron--open" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function DashboardHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [section, setSection] = useState<AdminHelpSectionKey>("inicio");
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentPageKey = resolveAdminHelpPageKey(pathname);

  const activeSection =
    ADMIN_HELP_SECTIONS.find((s) => s.key === section) ?? ADMIN_HELP_SECTIONS[0];

  const selectSection = useCallback((key: AdminHelpSectionKey) => {
    setSection(key);
    setSectionsOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      setSection(currentPageKey);
      setSectionsOpen(false);
    }
  }, [open, currentPageKey]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSectionsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sectionsOpen) {
        setSectionsOpen(false);
        e.stopPropagation();
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, sectionsOpen]);

  useEffect(() => {
    if (!sectionsOpen) return;
    const handlePickerOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setSectionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePickerOutside);
    return () => document.removeEventListener("mousedown", handlePickerOutside);
  }, [sectionsOpen]);

  const contentTitle =
    section === "general" ? ADMIN_HELP_GENERAL.title : getAdminHelpPage(section).title;

  return (
    <div className="dashboard-help" ref={containerRef}>
      <button
        type="button"
        className="dashboard-help-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Ayuda"
        title="Ayuda"
      >
        <HelpIcon />
      </button>

      {open ? (
        <>
          <div
            className="dashboard-help-backdrop"
            onClick={() => {
              setOpen(false);
              setSectionsOpen(false);
            }}
            aria-hidden
          />
          <div
            className="dashboard-help-panel"
            role="dialog"
            aria-label="Centro de ayuda"
            aria-modal="false"
          >
          <header className="dashboard-help-header">
            <div className="dashboard-help-header-top">
              <div>
                <h3 className="dashboard-help-title">Centro de ayuda</h3>
                <p className="dashboard-help-subtitle">Administrador</p>
              </div>
            </div>

            <div className="dashboard-help-picker" ref={pickerRef}>
              <button
                type="button"
                id="dashboard-help-picker-trigger"
                className="dashboard-help-picker-trigger"
                onClick={() => setSectionsOpen((v) => !v)}
                aria-expanded={sectionsOpen}
                aria-haspopup="listbox"
                aria-controls="dashboard-help-picker-list"
              >
                <span className="dashboard-help-picker-trigger-label">Tema de ayuda</span>
                <span className="dashboard-help-picker-trigger-value">
                  <span>{activeSection.label}</span>
                  <ChevronIcon open={sectionsOpen} />
                </span>
              </button>

              {sectionsOpen ? (
                <ul
                  id="dashboard-help-picker-list"
                  className="dashboard-help-picker-menu"
                  role="listbox"
                  aria-labelledby="dashboard-help-picker-trigger"
                >
                  {ADMIN_HELP_SECTIONS.map((item) => {
                    const isActive = section === item.key;
                    const isCurrentPage = item.key === currentPageKey;
                    return (
                      <li key={item.key} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`dashboard-help-picker-option${
                            isActive ? " dashboard-help-picker-option--active" : ""
                          }`}
                          onClick={() => selectSection(item.key)}
                        >
                          <span className="dashboard-help-picker-option-label">{item.label}</span>
                          {isCurrentPage ? (
                            <span className="dashboard-help-picker-option-badge">Actual</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </header>

          <div className="dashboard-help-body">
            <div className="dashboard-help-tabpanel">
              <h4 className="dashboard-help-page-title">{contentTitle}</h4>
              {section === "general" ? (
                <HelpGeneralBody general={ADMIN_HELP_GENERAL} />
              ) : (
                <HelpContentBody content={getAdminHelpPage(section)} />
              )}
            </div>
          </div>

          <footer className="dashboard-help-footer">
            <span className="dashboard-help-footer-hint">
              {section === currentPageKey
                ? `Coincide con tu pantalla: ${activeSection.label}`
                : `Consultando: ${activeSection.label}`}
            </span>
          </footer>
        </div>
        </>
      ) : null}
    </div>
  );
}
