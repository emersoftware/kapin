"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";

interface DropdownMenuProps {
  children: React.ReactNode;
  trigger?: React.ReactNode;
}

export function DropdownMenu({ children, trigger }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
      >
        {trigger || <MoreVertical className="h-5 w-5 text-neutral-600" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div
            className="py-1"
            onClick={() => setIsOpen(false)}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface DropdownMenuItemProps {
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  variant?: "default" | "danger";
  disabled?: boolean;
}

export function DropdownMenuItem({
  onClick,
  children,
  variant = "default",
  disabled = false
}: DropdownMenuItemProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onClick) {
          onClick(e);
        }
      }}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
        variant === "danger"
          ? "text-red-600 hover:bg-red-50 disabled:text-red-300"
          : "text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-300"
      } disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
